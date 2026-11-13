/** A monogram for a source: its first letter in a topic-colored circle. No favicons, which would be an outbound call (rule 7). */
export function SourceMark({ title, color }: { title: string; color: string }) {
  const letter = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return (
    <span aria-hidden className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-[-0.2em] text-[0.6rem] font-bold text-white" style={{ background: color }}>
      {letter}
    </span>
  );
}
