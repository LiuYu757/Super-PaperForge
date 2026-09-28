import { StreamLanguage, type StreamParser } from '@codemirror/language';

/**
 * Simple LaTeX stream parser for CodeMirror 6.
 * Provides syntax highlighting for LaTeX commands, math mode,
 * comments, environments, and braces.
 */
const latexParser: StreamParser<{ mathMode: boolean; verbatim: boolean }> = {
  startState() {
    return { mathMode: false, verbatim: false };
  },

  token(stream, state) {
    // Verbatim mode
    if (state.verbatim) {
      if (stream.match(/\\end\{(?:verbatim|lstlisting)\}/)) {
        state.verbatim = false;
        return 'keyword';
      }
      stream.next();
      return 'string';
    }

    // Comments
    if (stream.match('%')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Math mode delimiters
    if (stream.match('$$')) {
      state.mathMode = !state.mathMode;
      return 'operator';
    }
    if (stream.match('$')) {
      state.mathMode = !state.mathMode;
      return 'operator';
    }
    if (stream.match(/\\\[/)) {
      state.mathMode = true;
      return 'operator';
    }
    if (stream.match(/\\\]/)) {
      state.mathMode = false;
      return 'operator';
    }

    // In math mode
    if (state.mathMode) {
      if (stream.match(/\\[a-zA-Z]+/)) {
        return 'variableName';
      }
      if (stream.match(/[_^]/)) {
        return 'operator';
      }
      if (stream.match(/[{}()\[\]]/)) {
        return 'bracket';
      }
      if (stream.match(/[0-9]+/)) {
        return 'number';
      }
      stream.next();
      return 'variableName.special';
    }

    // Verbatim environments
    if (stream.match(/\\begin\{(?:verbatim|lstlisting)\}/)) {
      state.verbatim = true;
      return 'keyword';
    }

    // Environment commands
    if (stream.match(/\\(?:begin|end)\{[a-zA-Z*]+\}/)) {
      return 'keyword';
    }

    // Section commands
    if (stream.match(/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*/)) {
      return 'heading';
    }
    if (stream.match(/\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(?=[{\s])/)) {
      return 'heading';
    }

    // Document structure
    if (stream.match(/\\(?:documentclass|usepackage|input|include|bibliography|bibliographystyle)(?=[\[{])/)) {
      return 'keyword';
    }

    // Text formatting commands
    if (stream.match(/\\(?:textbf|textit|texttt|textsc|emph|underline|textsl)(?=\{)/)) {
      return 'keyword';
    }

    // References
    if (stream.match(/\\(?:label|ref|eqref|cite|pageref|footnote|href|url|autoref|cref)(?=\{)/)) {
      return 'link';
    }

    // Definition commands
    if (stream.match(/\\(?:newcommand|renewcommand|newenvironment|def|let|setlength|newlength)(?=[\[{\\])/)) {
      return 'keyword';
    }

    // General LaTeX commands
    if (stream.match(/\\[a-zA-Z@]+/)) {
      return 'atom';
    }

    // Escaped characters
    if (stream.match(/\\[^a-zA-Z]/)) {
      return 'escape';
    }

    // Braces
    if (stream.match(/[{}]/)) {
      return 'bracket';
    }

    // Optional arguments
    if (stream.match(/[\[\]]/)) {
      return 'meta';
    }

    // Numbers
    if (stream.match(/[0-9]+(?:\.[0-9]+)?/)) {
      return 'number';
    }

    // Skip other characters
    stream.next();
    return null;
  },
};

/**
 * LaTeX language support for CodeMirror 6.
 */
export const latexLanguage = StreamLanguage.define(latexParser);

/**
 * BibTeX stream parser for .bib files.
 * Highlights entry types, field names, keys, and string values.
 */
const bibtexParser: StreamParser<{ inEntry: boolean }> = {
  startState() {
    return { inEntry: false };
  },
  token(stream, state) {
    // Comments
    if (stream.match('%')) {
      stream.skipToEnd();
      return 'comment';
    }
    // Entry types (@article, @book, etc.)
    if (stream.match(/@[a-zA-Z]+/)) {
      state.inEntry = true;
      return 'keyword';
    }
    if (state.inEntry) {
      // Citation key (first word after opening brace)
      if (stream.match(/\{([^,}\s]+)/)) {
        return 'variableName.definition';
      }
      // Field names
      if (stream.match(/[a-zA-Z]+(?=\s*=)/)) {
        return 'propertyName';
      }
      // Assignment
      if (stream.match('=')) {
        return 'operator';
      }
      // Strings
      if (stream.match(/\{[^}]*\}/)) {
        return 'string';
      }
      if (stream.match(/"[^"]*"/)) {
        return 'string';
      }
      // Numbers
      if (stream.match(/[0-9]+/)) {
        return 'number';
      }
      // Closing brace
      if (stream.match('}')) {
        state.inEntry = false;
        return 'bracket';
      }
    }
    // Braces
    if (stream.match(/[{}]/)) {
      return 'bracket';
    }
    stream.next();
    return null;
  },
};

/**
 * BibTeX language support for CodeMirror 6.
 */
export const bibtexLanguage = StreamLanguage.define(bibtexParser);

/**
 * Get the appropriate language support for a file path.
 */
export function getLanguageForFile(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'bib':
    case 'bst':
      return bibtexLanguage;
    default:
      return latexLanguage;
  }
}
