import { describe, it, expect } from 'vitest';

/**
 * Editor keyboard shortcuts verification.
 * Tests that the wrapSelection helper logic works correctly.
 */

function wrapSelection(text: string, from: number, to: number, prefix: string, suffix: string) {
  const selected = text.slice(from, to);
  const wrapped = `${prefix}${selected}${suffix}`;
  return text.slice(0, from) + wrapped + text.slice(to);
}

describe('wrapSelection logic', () => {
  it('wraps selected text with prefix/suffix', () => {
    const result = wrapSelection('Hello world', 6, 11, '\\textbf{', '}');
    expect(result).toBe('Hello \\textbf{world}');
  });

  it('inserts empty wrapper at cursor position', () => {
    const result = wrapSelection('Hello ', 6, 6, '\\textit{', '}');
    expect(result).toBe('Hello \\textit{}');
  });

  it('wraps with math delimiters', () => {
    const result = wrapSelection('E = mc^2', 0, 8, '$', '$');
    expect(result).toBe('$E = mc^2$');
  });

  it('wraps multiword selection', () => {
    const result = wrapSelection('This is important text here', 8, 22, '\\underline{', '}');
    expect(result).toBe('This is \\underline{important text} here');
  });

  it('handles empty document', () => {
    const result = wrapSelection('', 0, 0, '\\textbf{', '}');
    expect(result).toBe('\\textbf{}');
  });

  it('preserves text before and after', () => {
    const result = wrapSelection('aaa bbb ccc', 4, 7, '[', ']');
    expect(result).toBe('aaa [bbb] ccc');
  });
});
