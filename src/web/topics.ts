export const TOPIC_LABEL: Record<string, string> = {
  ai: 'AI', 'dev-tools': 'Dev Tools', security: 'Security', infra: 'Infra & Data', industry: 'Industry', research: 'Research', other: 'Other',
};
export const TOPIC_ORDER = ['ai', 'dev-tools', 'security', 'infra', 'industry', 'research', 'other'];
export const topicColor = (t: string) => `var(--topic-${TOPIC_LABEL[t] ? t : 'other'})`;
