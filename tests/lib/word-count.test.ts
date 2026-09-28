import { describe, it, expect } from 'vitest';

// Inline the smart word count logic from editor-status-bar
function computeWordCount(content: string): number {
  const stripped = content
    .replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ')
    .replace(/[{}\\$%&_^~#]/g, '')
    .replace(/\s+/g, ' ');
  return stripped.trim() ? stripped.trim().split(/\s+/).length : 0;
}

describe('smart word count', () => {
  it('counts plain text words', () => {
    expect(computeWordCount('Hello world this is a test')).toBe(6);
  });

  it('strips LaTeX commands with arguments', () => {
    // \textbf{bold} is fully stripped (command + arg), leaving "This is text"
    expect(computeWordCount('This is \\textbf{bold} text')).toBe(3);
  });

  it('strips section commands with arguments', () => {
    expect(computeWordCount('\\section{Introduction} This is the intro')).toBe(4);
  });

  it('strips math mode characters', () => {
    // $ signs stripped, E mc are counted as words
    const count = computeWordCount('The formula $E = mc^2$ is famous');
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('handles empty content', () => {
    expect(computeWordCount('')).toBe(0);
  });

  it('handles LaTeX-only content', () => {
    expect(computeWordCount('\\documentclass{article}\\usepackage{amsmath}')).toBe(0);
  });

  it('handles multiline content', () => {
    const content = `\\section{Intro}
This is paragraph one.

This is paragraph two with five words.`;
    expect(computeWordCount(content)).toBe(11);
  });

  it('strips percent comments indicator', () => {
    // The % character is stripped but the words after it still count
    // since we only strip the character, not comment lines
    expect(computeWordCount('Hello % comment')).toBe(2);
  });

  it('handles complex LaTeX document', () => {
    const content = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\begin{document}
\\title{My Paper}
\\maketitle
\\section{Introduction}
This paper presents our findings on the topic.
We found three important results.
\\section{Conclusion}
In conclusion the results are significant.
\\end{document}`;
    const count = computeWordCount(content);
    // Should count actual text words, not LaTeX commands
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(25);
  });
});
