import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { digests, learnItems, type Category, type LearnType, type QuizQuestion, type Stat, type Topic } from '../db/schema.js';
import { loadStories, type StoryItem } from '../pipeline/context.js';
import { readMinutes } from '../server/stories.js';
import { canonicalUrl } from '../sources/normalize.js';
import { isRedditFeed } from '../sources/rss.js';

/** One outbound link of a published story. */
export interface PublishedLink { url: string; sourceId: number; sourceTitle: string; discussionUrl: string | null; mediaUrl: string | null }

/** The only story fields that ever leave the scrub (Phase 8 published field list). */
export interface PublishedStory {
  key: string;
  date: string;
  title: string;
  links: PublishedLink[];
  sourceIds: number[];
  pack: string | null;
  category: Category | null;
  topic: Topic;
  score: number;
  summary: string | null;
  stats: Stat[] | null;
  pros: string[] | null;
  cons: string[] | null;
  readMinutes: number;
  publishedAt: number;
}

export interface PublishedLearn { position: number; type: LearnType; conceptKey: string | null; title: string; bodyMd: string; quiz: QuizQuestion[] | null; relatedStoryKey: string | null; sourceRef: string }

export interface PublishedScrub { date: string; windowStart: number; windowEnd: number; stories: PublishedStory[]; learn: PublishedLearn[] }

/** Stable story id across runs: the first 16 hex chars of sha256(canonicalUrl(url)). */
export function storyKey(url: string): string {
  return createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 16);
}

const isRedditUrl = (u: string | null) => !!u && /(^|\.)reddit\.com$/.test(new URL(u).hostname);
const isRedditItem = (i: StoryItem) => (i.source.kind === 'rss' && isRedditFeed(i.source.feedUrl)) || isRedditUrl(i.url);

/** Builds the published shape of one digest. Every field is set explicitly; database rows are never spread. */
export function toPublished(db: Db, digestId: number, { allowReddit = false }: { allowReddit?: boolean } = {}): PublishedScrub {
  const digest = db.select().from(digests).where(eq(digests.id, digestId)).get();
  if (!digest) throw new Error(`No digest ${digestId}`);
  const keyById = new Map<number, string>();
  const out: PublishedStory[] = [];
  for (const s of loadStories(db, digestId)) {
    const touchesReddit = s.items.some((i) => isRedditItem(i) || isRedditUrl(i.discussionUrl));
    const its = allowReddit ? s.items : s.items.filter((i) => !isRedditItem(i));
    if (its.length === 0) continue;
    const first = its[0]!;
    const key = storyKey(first.url);
    keyById.set(s.id, key);
    const stripped = !allowReddit && touchesReddit;
    out.push({
      key,
      date: digest.date,
      title: s.title,
      links: its.map((i) => ({
        url: i.url,
        sourceId: i.source.id,
        sourceTitle: i.source.title,
        discussionUrl: !allowReddit && isRedditUrl(i.discussionUrl) ? null : i.discussionUrl,
        mediaUrl: i.mediaUrl,
      })),
      sourceIds: [...new Set(its.map((i) => i.source.id))],
      pack: first.source.pack,
      category: s.category,
      topic: s.topic ?? 'other',
      score: s.score ?? 0,
      summary: s.summary,
      stats: s.stats,
      pros: stripped ? null : s.pros,
      cons: stripped ? null : s.cons,
      readMinutes: readMinutes(its.map((i) => i.content)),
      publishedAt: Math.min(...its.map((i) => i.publishedAt)),
    });
  }
  const learn = db.select().from(learnItems).where(eq(learnItems.digestId, digestId)).orderBy(asc(learnItems.id)).all();
  return {
    date: digest.date,
    windowStart: digest.windowStart,
    windowEnd: digest.windowEnd,
    stories: out,
    learn: learn.map((l, position) => ({
      position,
      type: l.type,
      conceptKey: l.conceptKey,
      title: l.title,
      bodyMd: l.bodyMd,
      quiz: l.quiz,
      relatedStoryKey: l.relatedStoryId === null ? null : (keyById.get(l.relatedStoryId) ?? null),
      sourceRef: l.sourceRef,
    })),
  };
}
