// §B.4 shared enums and pure helpers, importable by the server and the browser (no runtime deps).
export const SOURCE_TYPES = ['news', 'podcast', 'video', 'blog', 'community'] as const;
export const SOURCE_KINDS = ['rss', 'hn'] as const;
export const CATEGORIES = ['model', 'tool', 'headline', 'video', 'long-read', 'podcast'] as const;
export const HIGHLIGHT_SECTIONS = ['models', 'tools', 'headlines', 'watch'] as const;
export const MORE_SECTIONS = ['long-reads', 'podcasts', 'videos', 'other'] as const;
export const DIGEST_KINDS = ['daily', 'catchup', 'missed'] as const;
export const DIGEST_STATUSES = ['running', 'done', 'failed'] as const;
export const LEARN_TYPES = ['concept', 'quickstart'] as const;
export const ERROR_CODES = ['auth', 'llm', 'unknown'] as const;
export const TOPICS = ['ai', 'dev-tools', 'security', 'infra', 'industry', 'research', 'other'] as const;


export type SourceType = (typeof SOURCE_TYPES)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Category = (typeof CATEGORIES)[number];
export type HighlightSection = (typeof HIGHLIGHT_SECTIONS)[number];
export type MoreSection = (typeof MORE_SECTIONS)[number];
export type DigestKind = (typeof DIGEST_KINDS)[number];
export type DigestStatus = (typeof DIGEST_STATUSES)[number];
export type LearnType = (typeof LEARN_TYPES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type Topic = (typeof TOPICS)[number];

export interface Stat { label: string; value: string; sourceUrl: string }
export interface QuizQuestion { q: string; choices: string[]; answerIndex: number }

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
