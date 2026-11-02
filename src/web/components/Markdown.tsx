import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from './markdown.ts';

// Renders the AST as React elements, so all text is escaped; no raw HTML is ever injected.
function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'code':
        return <code key={i} className="rounded bg-neutral-100 px-1 text-sm dark:bg-neutral-800">{n.text}</code>;
      case 'strong':
        return <strong key={i}>{inline(n.children)}</strong>;
      case 'em':
        return <em key={i}>{inline(n.children)}</em>;
      case 'link':
        return <a key={i} href={n.href} target="_blank" rel="noreferrer" className="underline">{inline(n.children)}</a>;
    }
  });
}

const HEADING = { 1: 'text-xl', 2: 'text-lg', 3: 'text-base' } as const;

export function Markdown({ src }: { src: string }) {
  return (
    <div className="space-y-3">
      {parseMarkdown(src).map((b, i) => {
        switch (b.type) {
          case 'p':
            return <p key={i}>{inline(b.children)}</p>;
          case 'h': {
            const H = `h${b.level}` as const;
            return <H key={i} className={`${HEADING[b.level]} font-semibold`}>{inline(b.children)}</H>;
          }
          case 'ul':
          case 'ol': {
            const L = b.type;
            return (
              <L key={i} className={`${L === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-6`}>
                {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
              </L>
            );
          }
          case 'code':
            return <pre key={i} className="overflow-x-auto rounded bg-neutral-100 p-3 text-sm dark:bg-neutral-800"><code>{b.text}</code></pre>;
        }
      })}
    </div>
  );
}
