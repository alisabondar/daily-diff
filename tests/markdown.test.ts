import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/web/components/markdown.js';

const t = (text: string) => ({ type: 'text', text });

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and joins soft-wrapped lines', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'p', children: [t('one two')] },
      { type: 'p', children: [t('three')] },
    ]);
  });

  it('parses each heading level', () => {
    expect(parseMarkdown('# A\n## B\n### C')).toEqual([
      { type: 'h', level: 1, children: [t('A')] },
      { type: 'h', level: 2, children: [t('B')] },
      { type: 'h', level: 3, children: [t('C')] },
    ]);
  });

  it('parses bullet lists', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([{ type: 'ul', items: [[t('a')], [t('b')]] }]);
  });

  it('parses numbered lists', () => {
    expect(parseMarkdown('1. a\n2. b')).toEqual([{ type: 'ol', items: [[t('a')], [t('b')]] }]);
  });

  it('keeps fenced code verbatim, including markdown syntax inside it', () => {
    expect(parseMarkdown('```ts\nconst a = **1**;\n\n# no\n```\nafter')).toEqual([
      { type: 'code', text: 'const a = **1**;\n\n# no' },
      { type: 'p', children: [t('after')] },
    ]);
  });

  it('parses inline code without formatting its contents', () => {
    expect(parseMarkdown('run `npm *i*` now')).toEqual([
      { type: 'p', children: [t('run '), { type: 'code', text: 'npm *i*' }, t(' now')] },
    ]);
  });

  it('parses bold and italic', () => {
    expect(parseMarkdown('**b** and *i*')).toEqual([
      { type: 'p', children: [{ type: 'strong', children: [t('b')] }, t(' and '), { type: 'em', children: [t('i')] }] },
    ]);
  });

  it('parses links with formatted text', () => {
    expect(parseMarkdown('see [the **docs**](https://example.com/a)')).toEqual([
      { type: 'p', children: [t('see '), { type: 'link', href: 'https://example.com/a', children: [t('the '), { type: 'strong', children: [t('docs')] }] }] },
    ]);
  });

  it('leaves links with a non-http(s) href as plain text', () => {
    expect(parseMarkdown('[x](javascript:alert(1))')).toEqual([{ type: 'p', children: [t('[x](javascript:alert(1))')] }]);
  });

  it('keeps <script> as text', () => {
    expect(parseMarkdown('<script>alert(1)</script>')).toEqual([{ type: 'p', children: [t('<script>alert(1)</script>')] }]);
  });

  it('formats list items and headings inline', () => {
    expect(parseMarkdown('## Use `x`\n- **y**')).toEqual([
      { type: 'h', level: 2, children: [t('Use '), { type: 'code', text: 'x' }] },
      { type: 'ul', items: [[{ type: 'strong', children: [t('y')] }]] },
    ]);
  });
});
