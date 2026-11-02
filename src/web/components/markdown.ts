export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'h'; level: 1 | 2 | 3; children: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'code'; text: string };

const BLOCK_START = /^(#{1,3} |- |\d+\. |```)/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) code.push(lines[i]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      i++;
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(' ') as 1 | 2 | 3;
      blocks.push({ type: 'h', level, children: parseInline(line.slice(level + 1).trim()) });
      i++;
    } else if (/^(- |\d+\. )/.test(line)) {
      const type = line.startsWith('- ') ? 'ul' : 'ol';
      const marker = type === 'ul' ? /^- / : /^\d+\. /;
      const items: Inline[][] = [];
      for (; i < lines.length && marker.test(lines[i]!); i++) items.push(parseInline(lines[i]!.replace(marker, '').trim()));
      blocks.push({ type, items });
    } else if (line.trim() === '') {
      i++;
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i]!.trim() !== '' && !BLOCK_START.test(lines[i]!); i++) para.push(lines[i]!.trim());
      blocks.push({ type: 'p', children: parseInline(para.join(' ')) });
    }
  }
  return blocks;
}

function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (t: string) => {
    const last = out[out.length - 1];
    if (last?.type === 'text') last.text += t;
    else out.push({ type: 'text', text: t });
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) out.push({ type: 'code', text: m[1]! });
    else if ((m = rest.match(/^\*\*(.+?)\*\*/))) out.push({ type: 'strong', children: parseInline(m[1]!) });
    else if ((m = rest.match(/^\*([^*]+)\*/))) out.push({ type: 'em', children: parseInline(m[1]!) });
    else if ((m = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/))) out.push({ type: 'link', href: m[2]!, children: parseInline(m[1]!) });
    else {
      text(s[i]!);
      i++;
      continue;
    }
    i += m[0].length;
  }
  return out;
}
