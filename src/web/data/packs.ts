// The pack list, bundled at build time from src/packs, so onboarding needs no backend call.
// (The source catalog with stable keys comes from the scrub after onboarding.)
interface PackFile { id: string; name: string; emoji: string; defaultEnabled: boolean; sources: { feedUrl: string; kind: string }[] }

const files = import.meta.glob<PackFile>('../../packs/*.json', { eager: true, import: 'default' });
const isReddit = (s: { feedUrl: string; kind: string }) => s.kind === 'rss' && /^https:\/\/(www\.)?reddit\.com\//.test(s.feedUrl);

export interface PackInfo { id: string; name: string; emoji: string; defaultEnabled: boolean; sourceCount: number }

/** Packs in the shared scrub (the shared scrub has no Reddit, so those sources don't count). books.json isn't a pack. */
export const PACKS: PackInfo[] = Object.values(files)
  .filter((p): p is PackFile => !Array.isArray(p) && typeof p?.id === 'string')
  .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, defaultEnabled: p.defaultEnabled, sourceCount: p.sources.filter((s) => !isReddit(s)).length }))
  .filter((p) => p.sourceCount > 0)
  .sort((a, b) => a.name.localeCompare(b.name));
