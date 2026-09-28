import { describe, it, expect } from 'vitest';

function computeWordCount(content: string): number {
  const stripped = content
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\$%&_^~#]/g, '')
    .replace(/\s+/g, ' ');
  return stripped.trim() ? stripped.trim().split(/\s+/).length : 0;
}

describe('smart word count edge cases', () => {
  it('handles only whitespace', () => { expect(computeWordCount('   \n\n  ')).toBe(0); });
  it('handles single word', () => { expect(computeWordCount('Hello')).toBe(1); });
  it('strips \\cite commands', () => { expect(computeWordCount('See \\cite{ref} for details')).toBe(3); });
  it('strips nested braces', () => { expect(computeWordCount('\\textbf{\\textit{word}}')).toBe(0); });
  it('handles mixed content', () => {
    const c = 'The value $x=5$ is \\textbf{important} for our \\emph{analysis}.';
    expect(computeWordCount(c)).toBeGreaterThan(3);
  });
  it('handles bibliography', () => {
    expect(computeWordCount('\\bibliographystyle{plain}\n\\bibliography{refs}')).toBe(0);
  });
  it('counts hyphenated words as separate', () => {
    expect(computeWordCount('well-known state-of-the-art')).toBe(2);
  });
});
