// Records docs/demo.gif: clicks through a running Daily Diff and encodes the frames as a GIF.
// Playwright, gifenc and pngjs are NOT project dependencies. Install them in a scratch folder:
//   mkdir -p /tmp/dd-demo && cd /tmp/dd-demo && npm init -y && npm i playwright gifenc pngjs && npx playwright install chromium
// Then, with the app running (npm start):
//   DEMO_DEPS=/tmp/dd-demo node scripts/record-demo.mjs [http://127.0.0.1:4242]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const deps = process.env.DEMO_DEPS;
if (!deps) throw new Error('Set DEMO_DEPS to the folder where playwright, gifenc and pngjs are installed.');
const require = createRequire(`${deps}/`);
const { chromium } = require('playwright');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
const { PNG } = require('pngjs');

const BASE = process.argv[2] ?? 'http://127.0.0.1:4242';
const W = 1000, H = 640, FPS = 8;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, colorScheme: 'light' });
const frames = [];
const shoot = async (seconds) => {
  for (let i = 0; i < Math.round(seconds * FPS); i++) {
    frames.push(PNG.sync.read(await page.screenshot()));
    await page.waitForTimeout(1000 / FPS / 2);
  }
};
const scroll = async (px, seconds) => {
  const steps = Math.round(seconds * FPS);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await shoot(1 / FPS);
  }
};

// Today: the front page, then down to More by topic
await page.goto(`${BASE}/#/`);
await page.waitForSelector('h1');
await page.waitForTimeout(500);
await shoot(2.5);
await scroll(1400, 3);
await shoot(1);
// Learn something new
const learn = page.locator('#sec-learn summary');
if (await learn.count()) {
  await learn.scrollIntoViewIfNeeded();
  await shoot(0.6);
  await learn.click();
  await page.waitForTimeout(300);
  await shoot(2);
}
// Archive: search past stories
await page.goto(`${BASE}/#/archive`);
await page.waitForSelector('input[type=search]');
await shoot(0.8);
await page.locator('input[type=search]').pressSequentially('claude', { delay: 120 });
await page.waitForTimeout(600);
await shoot(2.5);
// Sources
await page.goto(`${BASE}/#/sources`);
await page.waitForTimeout(600);
await shoot(2);
await browser.close();

const gif = GIFEncoder();
for (const f of frames) {
  const palette = quantize(f.data, 128);
  gif.writeFrame(applyPalette(f.data, palette), f.width, f.height, { palette, delay: 1000 / FPS });
}
gif.finish();
writeFileSync('docs/demo.gif', gif.bytes());
console.log(`docs/demo.gif: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(1)} MB`);
