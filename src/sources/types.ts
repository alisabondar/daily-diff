import type { sources } from '../db/schema.js';

export type Source = typeof sources.$inferSelect;

export interface RawItem {
  sourceId: number;
  url: string;
  title: string;
  author: string | null;
  excerpt: string;
  content: string;
  mediaUrl: string | null;
  discussionUrl: string | null;
  hnId: number | null;
  publishedAt: number | null;
}

export interface FetchOpts { fetchFn?: typeof fetch; timeoutMs?: number }
