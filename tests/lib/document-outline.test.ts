import { describe, it, expect } from 'vitest';

// Inline the parser since it's in a component file
function parseOutline(content: string) {
  const items: Array<{ level: number; title: string; line: number }> = [];
  const lines = content.split('\n');
  const sectionRegex = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]+)\}/;
  const levelMap: Record<string, number> = {
    part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5,
  };
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(sectionRegex);
    if (match) {
      items.push({
        level: levelMap[match[1]] ?? 2,
        title: match[2].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').trim(),
        line: i + 1,
      });
    }
  }
  return items;
}

describe('parseOutline', () => {
  it('extracts sections from LaTeX source', () => {
    const content = `\\documentclass{article}
\\begin{document}
\\section{Introduction}
Some text here.
\\subsection{Background}
More text.
\\section{Methods}
\\subsection{Data Collection}
\\subsubsection{Surveys}
\\section{Conclusion}
\\end{document}`;

    const outline = parseOutline(content);
    expect(outline).toHaveLength(6);
    expect(outline[0]).toEqual({ level: 2, title: 'Introduction', line: 3 });
    expect(outline[1]).toEqual({ level: 3, title: 'Background', line: 5 });
    expect(outline[2]).toEqual({ level: 2, title: 'Methods', line: 7 });
    expect(outline[3]).toEqual({ level: 3, title: 'Data Collection', line: 8 });
    expect(outline[4]).toEqual({ level: 4, title: 'Surveys', line: 9 });
    expect(outline[5]).toEqual({ level: 2, title: 'Conclusion', line: 10 });
  });

  it('handles starred sections', () => {
    const content = `\\section*{Acknowledgments}`;
    const outline = parseOutline(content);
    expect(outline).toHaveLength(1);
    expect(outline[0].title).toBe('Acknowledgments');
  });

  it('handles chapters', () => {
    const content = `\\chapter{Literature Review}
\\section{Prior Work}`;
    const outline = parseOutline(content);
    expect(outline).toHaveLength(2);
    expect(outline[0].level).toBe(1);
    expect(outline[1].level).toBe(2);
  });

  it('captures title up to first closing brace', () => {
    const content = `\\section{Analysis of Results}`;
    const outline = parseOutline(content);
    expect(outline[0].title).toBe('Analysis of Results');
  });

  it('returns empty for content without sections', () => {
    const content = `Hello world. No sections here.`;
    const outline = parseOutline(content);
    expect(outline).toHaveLength(0);
  });

  it('handles paragraphs', () => {
    const content = `\\paragraph{A Detailed Point}`;
    const outline = parseOutline(content);
    expect(outline).toHaveLength(1);
    expect(outline[0].level).toBe(5);
  });
});
