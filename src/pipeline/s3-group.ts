import { eq, inArray } from 'drizzle-orm';
import { sources, stories, storyItems } from '../db/schema.js';
import { GROUP_SYSTEM, GroupSchema, groupPrompt } from '../prompts/group.js';
import { callLlm, finishStage, newUsage, type StageCtx } from './context.js';
import { windowItems } from './s2-store.js';

export const GROUP_CHUNK = 500;

/** S3: groups window items into stories (fast tier, ≤500 items per call), then validates the grouping in code. */
export async function runS3(ctx: StageCtx): Promise<void> {
  const { db, digest } = ctx;
  const items = windowItems(db, digest);
  const sourceIds = [...new Set(items.map((i) => i.sourceId))];
  const titles = new Map(
    sourceIds.length ? db.select({ id: sources.id, title: sources.title }).from(sources).where(inArray(sources.id, sourceIds)).all().map((s) => [s.id, s.title]) : [],
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const usage = newUsage();

  const proposed: { title: string; itemIds: number[] }[] = [];
  for (let i = 0; i < items.length; i += GROUP_CHUNK) {
    const chunk = items.slice(i, i + GROUP_CHUNK).map((item) => ({ item, sourceTitle: titles.get(item.sourceId) ?? '' }));
    const out = await callLlm(ctx, { tier: 'fast', task: 'group', system: GROUP_SYSTEM, prompt: groupPrompt(chunk), schema: GroupSchema }, usage);
    proposed.push(...out.stories);
  }

  const assigned = new Set<number>();
  const final: { title: string; itemIds: number[] }[] = [];
  for (const s of proposed) {
    const ids = s.itemIds.filter((id) => byId.has(id) && !assigned.has(id));
    ids.forEach((id) => assigned.add(id));
    if (ids.length) final.push({ title: s.title, itemIds: ids });
  }
  for (const item of items) {
    if (!assigned.has(item.id)) final.push({ title: item.title, itemIds: [item.id] });
  }

  db.transaction((tx) => {
    tx.delete(stories).where(eq(stories.digestId, digest.id)).run();
    for (const s of final) {
      const { id } = tx.insert(stories).values({ digestId: digest.id, title: s.title }).returning({ id: stories.id }).get();
      tx.insert(storyItems).values(s.itemIds.map((itemId) => ({ storyId: id, itemId }))).run();
    }
    finishStage(tx, digest.id, 3, usage);
  });
}
