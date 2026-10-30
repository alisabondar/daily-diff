import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { digests, stories, storyItems } from '../src/db/schema.js';
import { FakeLlm } from '../src/llm/fake.js';
import { runS3 } from '../src/pipeline/s3-group.js';
import { ctx, seedDigest, seedItem, seedSource, testDb } from './helpers.js';

function storiesWithItems(db: ReturnType<typeof testDb>) {
  return db.select().from(stories).all().map((s) => ({
    title: s.title,
    itemIds: db.select().from(storyItems).where(eq(storyItems.storyId, s.id)).all().map((r) => r.itemId).sort((a, b) => a - b),
  }));
}

test('post-validation: unknown ids dropped, duplicates keep first, missing ids become single stories, empty stories dropped', async () => {
  const db = testDb();
  const d = seedDigest(db);
  const src = seedSource(db, { title: 'Blog' });
  const [a, b, c, missing] = [1, 2, 3, 4].map(() => seedItem(db, src.id));
  const fake = new FakeLlm({
    group: () => ({
      stories: [
        { title: 'AB release', itemIds: [a!.id, b!.id, 9999] },
        { title: 'B again plus C', itemIds: [b!.id, c!.id] },
        { title: 'Only unknown', itemIds: [8888] },
      ],
    }),
  });
  await runS3(ctx(db, fake));
  expect(storiesWithItems(db)).toEqual([
    { title: 'AB release', itemIds: [a!.id, b!.id] },
    { title: 'B again plus C', itemIds: [c!.id] },
    { title: missing!.title, itemIds: [missing!.id] },
  ]);
  const after = db.select().from(digests).where(eq(digests.id, d.id)).get()!;
  expect(after).toMatchObject({ stage: 3, inputTokens: 10, outputTokens: 5 });
  expect(fake.calls[0]!.tier).toBe('fast');
  expect(fake.calls[0]!.prompt).toContain(`${a!.id} | Blog | ${a!.title} | ${a!.excerpt}`);
});

test('1,200 items produce 3 calls', async () => {
  const db = testDb();
  seedDigest(db);
  const src = seedSource(db);
  for (let i = 0; i < 1200; i++) seedItem(db, src.id);
  const fake = new FakeLlm({ group: () => ({ stories: [] }) });
  await runS3(ctx(db, fake));
  expect(fake.calls).toHaveLength(3);
  expect(db.select().from(stories).all()).toHaveLength(1200);
});

test('re-running S3 replaces the previous stories', async () => {
  const db = testDb();
  seedDigest(db);
  const src = seedSource(db);
  seedItem(db, src.id);
  const fake = new FakeLlm({ group: () => ({ stories: [] }) });
  await runS3(ctx(db, fake));
  await runS3(ctx(db, fake));
  expect(db.select().from(stories).all()).toHaveLength(1);
});

test('only items in the digest window are grouped', async () => {
  const db = testDb();
  seedDigest(db, { windowStart: 5000, windowEnd: 9000 });
  const src = seedSource(db);
  seedItem(db, src.id, { fetchedAt: 100 });
  const inside = seedItem(db, src.id, { fetchedAt: 6000 });
  const fake = new FakeLlm({ group: () => ({ stories: [] }) });
  await runS3(ctx(db, fake));
  expect(storiesWithItems(db)).toEqual([{ title: inside.title, itemIds: [inside.id] }]);
});
