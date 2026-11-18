// The published scrub shape (Phase 8), shared by the scrub job and the browser. Types only.
import type { Category, LearnType, QuizQuestion, Stat, Topic } from './enums.js';

/** One outbound link of a published story. */
export interface PublishedLink { url: string; sourceKey: string; sourceTitle: string; discussionUrl: string | null; mediaUrl: string | null }

/** The only story fields that ever leave the scrub (Phase 8 published field list). */
export interface PublishedStory {
  key: string;
  date: string;
  title: string;
  links: PublishedLink[];
  sourceKeys: string[];
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

