import { HIGHLIGHT_SECTION_FOR, HIGHLIGHT_SECTIONS, MORE_SECTIONS, moreSectionFor, type HighlightSection, type MoreSection } from '../../shared/enums.js';
import type { PublishedStory } from '../../shared/published.js';
import type { LocalState } from './local.js';

export type ViewSettings = Pick<LocalState, 'packs' | 'disabledSources' | 'topics' | 'keywords' | 'highlightsCap' | 'relevanceThreshold' | 'feedback'>;
export interface RankedStory extends PublishedStory { rank: number }
export interface View {
  highlights: { section: HighlightSection; stories: RankedStory[] }[];
  more: { section: MoreSection; stories: RankedStory[] }[];
}

/** score + 2 per matching topic + 1 per keyword hit − 3 when "Less like this" was given for the same topic or first source. */
export function rankOf(story: PublishedStory, s: ViewSettings): number {
  const text = `${story.title} ${story.summary ?? ''}`.toLowerCase();
  const topic = s.topics.includes(story.topic) ? 2 : 0;
  const keyword = s.keywords.some((k) => k.trim() && text.includes(k.trim().toLowerCase())) ? 1 : 0;
  const first = story.sourceKeys[0] ?? null;
  const less = s.feedback.some((f) => f.topic === story.topic || (f.sourceKey !== null && f.sourceKey === first)) ? 3 : 0;
  return story.score + topic + keyword - less;
}

/** The front page shows at most this many stories; the rest are on the All stories page. */
export const FRONT_PAGE_MAX = 30;

/** Every story in the viewer's packs and enabled sources, ranked, ignoring the relevance threshold (the All stories page). */
export function rankAll(stories: PublishedStory[], s: ViewSettings): RankedStory[] {
  const disabled = new Set(s.disabledSources);
  return stories
    .filter((x) => x.pack !== null && s.packs.includes(x.pack) && x.sourceKeys.some((k) => !disabled.has(k)))
    .map((x): RankedStory => ({ ...x, rank: rankOf(x, s) }))
    .sort((a, b) => b.rank - a.rank || b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** One viewer's filtered and ranked view of a day's scrub (Phase 8, step 37). */
export function rankView(stories: PublishedStory[], s: ViewSettings): View {
  const ranked = rankAll(stories, s).filter((x) => x.rank >= s.relevanceThreshold).slice(0, FRONT_PAGE_MAX);

  const picked = new Set(ranked.filter((x) => x.category && HIGHLIGHT_SECTION_FOR[x.category]).slice(0, s.highlightsCap).map((x) => x.key));
  const highlights = HIGHLIGHT_SECTIONS.map((section) => ({
    section,
    stories: ranked.filter((x) => picked.has(x.key) && HIGHLIGHT_SECTION_FOR[x.category!] === section),
  })).filter((g) => g.stories.length > 0);
  const more = MORE_SECTIONS.map((section) => ({
    section,
    stories: ranked.filter((x) => !picked.has(x.key) && moreSectionFor(x.category) === section),
  })).filter((g) => g.stories.length > 0);
  return { highlights, more };
}
