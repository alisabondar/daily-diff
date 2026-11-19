import type { Topic } from '../../shared/enums.js';

export interface PackDefaults { id: string; defaultEnabled: boolean; topics: Topic[] }

/** The packs onboarding pre-ticks for the topics a new user picked. */
export function defaultPacksFor(packs: PackDefaults[], topics: Topic[]): string[] {
  if (topics.length === 0) return packs.filter((p) => p.defaultEnabled).map((p) => p.id);
  return packs.filter((p) => (p.topics.length ? p.topics.some((t) => topics.includes(t)) : p.defaultEnabled)).map((p) => p.id);
}
