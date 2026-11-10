// Records docs/demo.gif: clicks through a running Daily Diff and encodes a smooth GIF.
// Playwright, gifenc and jpeg-js are NOT project dependencies. Install them in a scratch folder:
//   mkdir -p /tmp/dd-demo && cd /tmp/dd-demo && npm init -y && npm i playwright gifenc jpeg-js && npx playwright install chromium
// Then, with the app running (npm start):
//   DEMO_DEPS=/tmp/dd-demo node scripts/record-demo.mjs [http://127.0.0.1:4242]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const deps = process.env.DEMO_DEPS;
if (!deps) throw new Error('Set DEMO_DEPS to the folder where playwright, gifenc and jpeg-js are installed.');
const require = createRequire(`${deps}/`);
const { chromium } = require('playwright');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const jpeg = require('jpeg-js');

const BASE = process.argv[2] ?? 'http://127.0.0.1:4242';
const W = 800, H = 500;
const MIN_FRAME_MS = 66; // cap at ~15 fps (keeps the GIF under GitHub's 10 MB image limit)

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: 'light' });
await page.goto(`${BASE}/#/`);
await page.waitForSelector('h1');
await page.waitForTimeout(800);

// Chrome's screencast pushes a frame (with a timestamp) whenever the page repaints.
const cdp = await page.context().newCDPSession(page);
const raw = [];
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  raw.push({ data, t: metadata.timestamp * 1000 });
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H });

const wait = (ms) => page.waitForTimeout(ms);
const smoothScroll = async (top, ms) => {
  await page.evaluate(([top, ms]) => new Promise((done) => {
    const from = scrollY, start = performance.now();
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      scrollTo(0, from + (top - from) * ease(p));
      p < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [top, ms]);
};
const nav = async (label) => {
  await smoothScroll(0, 500);
  await page.getByRole('link', { name: label, exact: true }).click();
  await wait(900);
};

const removeDemoFavorite = () => page.evaluate(async () => {
  const favs = await (await fetch('/api/favorites')).json();
  for (const st of favs.stories) if (st.favorite?.tags.includes('to-read')) await fetch(`/api/favorites/${st.id}`, { method: 'DELETE' });
});
try {
// Today: save the top story with a tag (it shows up under Favorites later)
await wait(1800);
const top = page.locator('article').first();
await top.getByRole('button', { name: /Save/ }).click();
await wait(500);
await page.getByPlaceholder('Add a tag (optional)').pressSequentially('to-read', { delay: 120 });
await page.keyboard.press('Enter');
await wait(400);
await page.locator('.absolute').getByRole('button', { name: 'Save', exact: true }).click();
await wait(1000);
// ...then all the way down the front page
await smoothScroll(await page.evaluate(() => document.body.scrollHeight - innerHeight), 5000);
await wait(1000);
// Open Learn something new and read through it
const learn = page.locator('#sec-learn summary');
if (await learn.count()) {
  await learn.click();
  await wait(800);
  const [learnEnd, distance] = await page.evaluate(() => [document.body.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight - scrollY]);
  await smoothScroll(learnEnd, Math.min(9000, Math.max(3000, distance * 3)));
  await wait(1200);
}
// Archive: search past stories
await nav('Archive');
await page.locator('input[type=search]').pressSequentially('claude', { delay: 140 });
await wait(2400);
// Favorites: the story saved above, with its tag
await nav('Favorites');
await wait(2200);
// Sources
await nav('Sources');
await wait(1800);
} finally {
  // Leave the user's data as it was: remove the favorite the demo created.
  await removeDemoFavorite();
}
await cdp.send('Page.stopScreencast');
const end = raw.at(-1).t + 1200;
await browser.close();

// Keep at most one frame per MIN_FRAME_MS; each frame lasts until the next kept one.
const kept = [];
for (const f of raw) if (!kept.length || f.t - kept.at(-1).t >= MIN_FRAME_MS) kept.push(f);
const frames = kept.map((f) => jpeg.decode(Buffer.from(f.data, 'base64'), { useTArray: true }));

// One shared palette (sampled across the clip) keeps colors steady from frame to frame.
const sample = new Uint8Array(frames.filter((_, i) => i % Math.ceil(frames.length / 12) === 0).flatMap((f) => [...f.data]));
const palette = quantize(sample, 128);
const gif = GIFEncoder();
frames.forEach((f, i) => {
  const delay = Math.max(MIN_FRAME_MS, (kept[i + 1]?.t ?? end) - kept[i].t);
  gif.writeFrame(applyPalette(f.data, palette), f.width, f.height, { palette: i === 0 ? palette : undefined, delay });
});
gif.finish();
writeFileSync('docs/demo.gif', gif.bytes());
console.log(`docs/demo.gif: ${frames.length} frames (${raw.length} captured), ${((end - kept[0].t) / 1000).toFixed(1)}s, ${(gif.bytes().length / 1e6).toFixed(1)} MB`);
