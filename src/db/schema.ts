import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

// §B.4 shared enums
export const SOURCE_TYPES = ['news', 'podcast', 'video', 'blog', 'community'] as const;
export const SOURCE_KINDS = ['rss', 'hn'] as const;
export const CATEGORIES = ['model', 'tool', 'headline', 'video', 'long-read', 'podcast'] as const;
export const HIGHLIGHT_SECTIONS = ['models', 'tools', 'headlines', 'watch'] as const;
export const MORE_SECTIONS = ['long-reads', 'podcasts', 'videos', 'other'] as const;
export const DIGEST_KINDS = ['daily', 'catchup'] as const;
export const DIGEST_STATUSES = ['running', 'done', 'failed'] as const;
export const LEARN_TYPES = ['concept', 'quickstart'] as const;
export const ERROR_CODES = ['auth', 'llm', 'unknown'] as const;
export const TOPICS = ['ai', 'dev-tools', 'security', 'infra', 'industry', 'research', 'other'] as const;

export const SourceType = z.enum(SOURCE_TYPES);
export const SourceKind = z.enum(SOURCE_KINDS);
export const Category = z.enum(CATEGORIES);
export const HighlightSection = z.enum(HIGHLIGHT_SECTIONS);
export const MoreSection = z.enum(MORE_SECTIONS);
export const DigestKind = z.enum(DIGEST_KINDS);
export const DigestStatus = z.enum(DIGEST_STATUSES);
export const LearnType = z.enum(LEARN_TYPES);
export const ErrorCode = z.enum(ERROR_CODES);
export const Topic = z.enum(TOPICS);

export type SourceType = z.infer<typeof SourceType>;
export type SourceKind = z.infer<typeof SourceKind>;
export type Category = z.infer<typeof Category>;
export type HighlightSection = z.infer<typeof HighlightSection>;
export type MoreSection = z.infer<typeof MoreSection>;
export type DigestKind = z.infer<typeof DigestKind>;
export type DigestStatus = z.infer<typeof DigestStatus>;
export type LearnType = z.infer<typeof LearnType>;
export type ErrorCode = z.infer<typeof ErrorCode>;
export type Topic = z.infer<typeof Topic>;

export interface Stat { label: string; value: string; sourceUrl: string }
export interface QuizQuestion { q: string; choices: string[]; answerIndex: number }

const now = () => Date.now();

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: SOURCE_KINDS }).notNull(),
  type: text('type', { enum: SOURCE_TYPES }).notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  feedUrl: text('feed_url').notNull().unique(),
  hnTags: text('hn_tags', { enum: ['front_page', 'show_hn'] }),
  pack: text('pack'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastFetchedAt: integer('last_fetched_at'),
  lastStatus: text('last_status', { enum: ['ok', 'error'] }),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: integer('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  author: text('author'),
  excerpt: text('excerpt').notNull(),
  content: text('content').notNull(),
  mediaUrl: text('media_url'),
  discussionUrl: text('discussion_url'),
  hnId: integer('hn_id'),
  publishedAt: integer('published_at').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

export const digests = sqliteTable('digests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  kind: text('kind', { enum: DIGEST_KINDS }).notNull(),
  windowStart: integer('window_start').notNull(),
  windowEnd: integer('window_end').notNull(),
  status: text('status', { enum: DIGEST_STATUSES }).notNull(),
  stage: integer('stage').notNull().default(0),
  isRaw: integer('is_raw', { mode: 'boolean' }).notNull().default(false),
  errorCode: text('error_code', { enum: ERROR_CODES }),
  errorMessage: text('error_message'),
  failedSourceIds: text('failed_source_ids', { mode: 'json' }).$type<number[]>().notNull().default(sql`'[]'`),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at').notNull().$defaultFn(now),
  completedAt: integer('completed_at'),
});

export const stories = sqliteTable('stories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  digestId: integer('digest_id').notNull().references(() => digests.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category', { enum: CATEGORIES }),
  topic: text('topic', { enum: TOPICS }),
  score: integer('score'),
  summary: text('summary'),
  stats: text('stats', { mode: 'json' }).$type<Stat[]>(),
  pros: text('pros', { mode: 'json' }).$type<string[]>(),
  cons: text('cons', { mode: 'json' }).$type<string[]>(),
  community: text('community'),
});

export const storyItems = sqliteTable(
  'story_items',
  {
    storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
    itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.itemId] })],
);

export const digestEntries = sqliteTable(
  'digest_entries',
  {
    digestId: integer('digest_id').notNull().references(() => digests.id, { onDelete: 'cascade' }),
    storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
    tab: text('tab', { enum: ['highlights', 'more'] }).notNull(),
    section: text('section').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [primaryKey({ columns: [t.digestId, t.storyId] })],
);

export const learnItems = sqliteTable('learn_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  digestId: integer('digest_id').notNull().references(() => digests.id, { onDelete: 'cascade' }),
  type: text('type', { enum: LEARN_TYPES }).notNull(),
  conceptKey: text('concept_key'),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  quiz: text('quiz', { mode: 'json' }).$type<QuizQuestion[]>(),
  relatedStoryId: integer('related_story_id').references(() => stories.id, { onDelete: 'cascade' }),
  sourceRef: text('source_ref').notNull(),
});

export const favorites = sqliteTable('favorites', {
  storyId: integer('story_id').primaryKey().references(() => stories.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

export const favoriteTags = sqliteTable(
  'favorite_tags',
  {
    storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.tag] })],
);

export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  storyId: integer('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['less_like_this'] }).notNull(),
  createdAt: integer('created_at').notNull().$defaultFn(now),
});

// §B.4 category → section mapping
export const HIGHLIGHT_SECTION_FOR: Partial<Record<Category, HighlightSection>> = {
  model: 'models', tool: 'tools', headline: 'headlines', video: 'watch',
};
export function moreSectionFor(category: Category | null): MoreSection {
  if (category === 'long-read') return 'long-reads';
  if (category === 'podcast') return 'podcasts';
  if (category === 'video') return 'videos';
  return 'other';
}

/** Step 25: one row per local day the user finished the digest or the quiz. */
export const reads = sqliteTable('reads', {
  date: text('date').primaryKey(),
  finishedAt: integer('finished_at'),
  quizCorrect: integer('quiz_correct'),
  quizTotal: integer('quiz_total'),
});
