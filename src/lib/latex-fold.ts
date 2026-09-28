import { foldService } from '@codemirror/language';

/**
 * LaTeX fold service for CodeMirror.
 * Enables folding of \begin{env}...\end{env} blocks and
 * multi-line comments.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const latexFoldService = foldService.of((state, lineStart, _lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;

  // Fold \begin{env}...\end{env}
  const beginMatch = text.match(/\\begin\{([^}]+)\}/);
  if (beginMatch) {
    const envName = beginMatch[1];
    const endPattern = `\\end{${envName}}`;

    // Search forward for matching \end
    let depth = 1;
    let pos = line.to + 1;

    while (pos < state.doc.length && depth > 0) {
      const nextLine = state.doc.lineAt(pos);
      if (nextLine.text.includes(`\\begin{${envName}}`)) depth++;
      if (nextLine.text.includes(endPattern)) {
        depth--;
        if (depth === 0) {
          // Fold from end of \begin line to start of \end line
          return { from: line.to, to: nextLine.from - 1 };
        }
      }
      pos = nextLine.to + 1;
    }
  }

  // Fold section blocks (from one \section to the next)
  const sectionMatch = text.match(/\\(section|subsection|subsubsection|chapter|part)\*?\{/);
  if (sectionMatch) {
    const level = sectionMatch[1];
    const sameOrHigher = new RegExp(
      `\\\\(${level === 'subsubsection' ? 'part|chapter|section|subsection|subsubsection'
        : level === 'subsection' ? 'part|chapter|section|subsection'
        : level === 'section' ? 'part|chapter|section'
        : level === 'chapter' ? 'part|chapter'
        : 'part'})\\*?\\{`
    );

    let pos = line.to + 1;
    let lastValidEnd = line.to;

    while (pos < state.doc.length) {
      const nextLine = state.doc.lineAt(pos);
      if (sameOrHigher.test(nextLine.text) || nextLine.text.includes('\\end{document}')) {
        break;
      }
      lastValidEnd = nextLine.to;
      pos = nextLine.to + 1;
    }

    if (lastValidEnd > line.to) {
      return { from: line.to, to: lastValidEnd };
    }
  }

  return null;
});
