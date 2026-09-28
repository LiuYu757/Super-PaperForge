import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { LATEX_SNIPPETS } from './latex-snippets';

const LATEX_COMMANDS: Completion[] = [
  // Document structure
  { label: '\\documentclass', type: 'keyword', detail: 'Document class', apply: '\\documentclass{article}' },
  { label: '\\usepackage', type: 'keyword', detail: 'Import package', apply: '\\usepackage{$0}' },
  { label: '\\begin', type: 'keyword', detail: 'Begin environment', apply: '\\begin{$0}\n\n\\end{$0}' },
  { label: '\\end', type: 'keyword', detail: 'End environment', apply: '\\end{$0}' },
  { label: '\\title', type: 'keyword', detail: 'Document title', apply: '\\title{$0}' },
  { label: '\\author', type: 'keyword', detail: 'Author name', apply: '\\author{$0}' },
  { label: '\\date', type: 'keyword', detail: 'Date', apply: '\\date{\\today}' },
  { label: '\\maketitle', type: 'keyword', detail: 'Render title' },

  // Sections
  { label: '\\section', type: 'function', detail: 'Section heading', apply: '\\section{$0}' },
  { label: '\\subsection', type: 'function', detail: 'Subsection', apply: '\\subsection{$0}' },
  { label: '\\subsubsection', type: 'function', detail: 'Sub-subsection', apply: '\\subsubsection{$0}' },
  { label: '\\paragraph', type: 'function', detail: 'Paragraph heading', apply: '\\paragraph{$0}' },
  { label: '\\chapter', type: 'function', detail: 'Chapter heading', apply: '\\chapter{$0}' },

  // Text formatting
  { label: '\\textbf', type: 'function', detail: 'Bold text', apply: '\\textbf{$0}' },
  { label: '\\textit', type: 'function', detail: 'Italic text', apply: '\\textit{$0}' },
  { label: '\\underline', type: 'function', detail: 'Underlined text', apply: '\\underline{$0}' },
  { label: '\\emph', type: 'function', detail: 'Emphasized text', apply: '\\emph{$0}' },
  { label: '\\texttt', type: 'function', detail: 'Monospace text', apply: '\\texttt{$0}' },
  { label: '\\textsc', type: 'function', detail: 'Small caps', apply: '\\textsc{$0}' },

  // Math
  { label: '\\frac', type: 'function', detail: 'Fraction', apply: '\\frac{$0}{$1}' },
  { label: '\\sqrt', type: 'function', detail: 'Square root', apply: '\\sqrt{$0}' },
  { label: '\\sum', type: 'variable', detail: 'Summation', apply: '\\sum_{$0}^{$1}' },
  { label: '\\int', type: 'variable', detail: 'Integral', apply: '\\int_{$0}^{$1}' },
  { label: '\\lim', type: 'variable', detail: 'Limit', apply: '\\lim_{$0}' },
  { label: '\\infty', type: 'variable', detail: 'Infinity symbol' },
  { label: '\\partial', type: 'variable', detail: 'Partial derivative' },
  { label: '\\nabla', type: 'variable', detail: 'Nabla/gradient' },
  { label: '\\alpha', type: 'variable', detail: 'Greek alpha' },
  { label: '\\beta', type: 'variable', detail: 'Greek beta' },
  { label: '\\gamma', type: 'variable', detail: 'Greek gamma' },
  { label: '\\delta', type: 'variable', detail: 'Greek delta' },
  { label: '\\epsilon', type: 'variable', detail: 'Greek epsilon' },
  { label: '\\lambda', type: 'variable', detail: 'Greek lambda' },
  { label: '\\mu', type: 'variable', detail: 'Greek mu' },
  { label: '\\pi', type: 'variable', detail: 'Greek pi' },
  { label: '\\sigma', type: 'variable', detail: 'Greek sigma' },
  { label: '\\theta', type: 'variable', detail: 'Greek theta' },
  { label: '\\omega', type: 'variable', detail: 'Greek omega' },
  { label: '\\mathbb', type: 'function', detail: 'Blackboard bold', apply: '\\mathbb{$0}' },
  { label: '\\mathcal', type: 'function', detail: 'Calligraphic', apply: '\\mathcal{$0}' },

  // References
  { label: '\\label', type: 'function', detail: 'Set label', apply: '\\label{$0}' },
  { label: '\\ref', type: 'function', detail: 'Reference', apply: '\\ref{$0}' },
  { label: '\\cite', type: 'function', detail: 'Citation', apply: '\\cite{$0}' },
  { label: '\\bibliography', type: 'keyword', detail: 'Bibliography file', apply: '\\bibliography{$0}' },
  { label: '\\bibliographystyle', type: 'keyword', detail: 'Bibliography style', apply: '\\bibliographystyle{plain}' },
  { label: '\\footnote', type: 'function', detail: 'Footnote', apply: '\\footnote{$0}' },

  // Figures & Tables
  { label: '\\includegraphics', type: 'function', detail: 'Insert image', apply: '\\includegraphics[width=0.8\\textwidth]{$0}' },
  { label: '\\caption', type: 'function', detail: 'Figure/table caption', apply: '\\caption{$0}' },
  { label: '\\centering', type: 'keyword', detail: 'Center content' },

  // Lists
  { label: '\\item', type: 'keyword', detail: 'List item' },

  // Spacing
  { label: '\\hspace', type: 'function', detail: 'Horizontal space', apply: '\\hspace{$0}' },
  { label: '\\vspace', type: 'function', detail: 'Vertical space', apply: '\\vspace{$0}' },
  { label: '\\newpage', type: 'keyword', detail: 'Page break' },
  { label: '\\linebreak', type: 'keyword', detail: 'Line break' },

  // Hyperlinks
  { label: '\\href', type: 'function', detail: 'Hyperlink', apply: '\\href{$0}{$1}' },
  { label: '\\url', type: 'function', detail: 'URL', apply: '\\url{$0}' },

  // Math functions
  { label: '\\sin', type: 'variable', detail: 'Sine function' },
  { label: '\\cos', type: 'variable', detail: 'Cosine function' },
  { label: '\\tan', type: 'variable', detail: 'Tangent function' },
  { label: '\\log', type: 'variable', detail: 'Logarithm' },
  { label: '\\ln', type: 'variable', detail: 'Natural logarithm' },
  { label: '\\exp', type: 'variable', detail: 'Exponential' },
  { label: '\\det', type: 'variable', detail: 'Determinant' },
  { label: '\\min', type: 'variable', detail: 'Minimum' },
  { label: '\\max', type: 'variable', detail: 'Maximum' },
  { label: '\\sup', type: 'variable', detail: 'Supremum' },
  { label: '\\inf', type: 'variable', detail: 'Infimum' },
  { label: '\\prod', type: 'variable', detail: 'Product', apply: '\\prod_{$0}^{$1}' },
  { label: '\\binom', type: 'function', detail: 'Binomial coefficient', apply: '\\binom{$0}{$1}' },

  // Missing Greek letters
  { label: '\\phi', type: 'variable', detail: 'Greek phi' },
  { label: '\\psi', type: 'variable', detail: 'Greek psi' },
  { label: '\\rho', type: 'variable', detail: 'Greek rho' },
  { label: '\\tau', type: 'variable', detail: 'Greek tau' },
  { label: '\\chi', type: 'variable', detail: 'Greek chi' },
  { label: '\\eta', type: 'variable', detail: 'Greek eta' },
  { label: '\\zeta', type: 'variable', detail: 'Greek zeta' },
  { label: '\\kappa', type: 'variable', detail: 'Greek kappa' },
  { label: '\\nu', type: 'variable', detail: 'Greek nu' },
  { label: '\\xi', type: 'variable', detail: 'Greek xi' },
  { label: '\\iota', type: 'variable', detail: 'Greek iota' },
  { label: '\\Gamma', type: 'variable', detail: 'Capital Gamma' },
  { label: '\\Delta', type: 'variable', detail: 'Capital Delta' },
  { label: '\\Theta', type: 'variable', detail: 'Capital Theta' },
  { label: '\\Lambda', type: 'variable', detail: 'Capital Lambda' },
  { label: '\\Sigma', type: 'variable', detail: 'Capital Sigma' },
  { label: '\\Omega', type: 'variable', detail: 'Capital Omega' },
  { label: '\\Phi', type: 'variable', detail: 'Capital Phi' },
  { label: '\\Psi', type: 'variable', detail: 'Capital Psi' },
  { label: '\\Pi', type: 'variable', detail: 'Capital Pi' },

  // Math symbols & operators
  { label: '\\leq', type: 'variable', detail: 'Less than or equal' },
  { label: '\\geq', type: 'variable', detail: 'Greater than or equal' },
  { label: '\\neq', type: 'variable', detail: 'Not equal' },
  { label: '\\approx', type: 'variable', detail: 'Approximately equal' },
  { label: '\\equiv', type: 'variable', detail: 'Equivalent' },
  { label: '\\subset', type: 'variable', detail: 'Subset' },
  { label: '\\supset', type: 'variable', detail: 'Superset' },
  { label: '\\in', type: 'variable', detail: 'Element of' },
  { label: '\\cup', type: 'variable', detail: 'Union' },
  { label: '\\cap', type: 'variable', detail: 'Intersection' },
  { label: '\\forall', type: 'variable', detail: 'For all' },
  { label: '\\exists', type: 'variable', detail: 'Exists' },
  { label: '\\rightarrow', type: 'variable', detail: 'Right arrow' },
  { label: '\\leftarrow', type: 'variable', detail: 'Left arrow' },
  { label: '\\Rightarrow', type: 'variable', detail: 'Double right arrow' },
  { label: '\\Leftrightarrow', type: 'variable', detail: 'Double bidirectional' },
  { label: '\\cdot', type: 'variable', detail: 'Center dot' },
  { label: '\\times', type: 'variable', detail: 'Multiplication' },
  { label: '\\div', type: 'variable', detail: 'Division' },
  { label: '\\pm', type: 'variable', detail: 'Plus-minus' },
  { label: '\\ldots', type: 'variable', detail: 'Horizontal dots' },
  { label: '\\cdots', type: 'variable', detail: 'Center dots' },
  { label: '\\vdots', type: 'variable', detail: 'Vertical dots' },
  { label: '\\ddots', type: 'variable', detail: 'Diagonal dots' },

  // Meta-programming / Definitions
  { label: '\\newcommand', type: 'keyword', detail: 'Define new command', apply: '\\newcommand{\\$0}[1]{$1}' },
  { label: '\\renewcommand', type: 'keyword', detail: 'Redefine command', apply: '\\renewcommand{\\$0}{$1}' },
  { label: '\\newenvironment', type: 'keyword', detail: 'Define new environment', apply: '\\newenvironment{$0}{$1}{$2}' },
  { label: '\\input', type: 'keyword', detail: 'Include file', apply: '\\input{$0}' },
  { label: '\\include', type: 'keyword', detail: 'Include chapter', apply: '\\include{$0}' },

  // Tables
  { label: '\\hline', type: 'keyword', detail: 'Horizontal line' },
  { label: '\\cline', type: 'function', detail: 'Partial horizontal line', apply: '\\cline{$0-$1}' },
  { label: '\\multicolumn', type: 'function', detail: 'Span columns', apply: '\\multicolumn{$0}{c}{$1}' },
  { label: '\\multirow', type: 'function', detail: 'Span rows', apply: '\\multirow{$0}{*}{$1}' },
  { label: '\\toprule', type: 'keyword', detail: 'booktabs top rule' },
  { label: '\\midrule', type: 'keyword', detail: 'booktabs mid rule' },
  { label: '\\bottomrule', type: 'keyword', detail: 'booktabs bottom rule' },

  // References (modern)
  { label: '\\pageref', type: 'function', detail: 'Page reference', apply: '\\pageref{$0}' },
  { label: '\\eqref', type: 'function', detail: 'Equation reference', apply: '\\eqref{$0}' },
  { label: '\\autoref', type: 'function', detail: 'Auto-typed reference', apply: '\\autoref{$0}' },
  { label: '\\cref', type: 'function', detail: 'cleveref reference', apply: '\\cref{$0}' },

  // Page layout
  { label: '\\setlength', type: 'function', detail: 'Set length', apply: '\\setlength{\\$0}{$1}' },
  { label: '\\geometry', type: 'function', detail: 'Page geometry', apply: '\\geometry{margin=$0}' },
  { label: '\\pagestyle', type: 'function', detail: 'Page style', apply: '\\pagestyle{$0}' },
  { label: '\\thispagestyle', type: 'function', detail: 'This page style', apply: '\\thispagestyle{$0}' },

  // Colors
  { label: '\\textcolor', type: 'function', detail: 'Colored text', apply: '\\textcolor{$0}{$1}' },
  { label: '\\colorbox', type: 'function', detail: 'Color background', apply: '\\colorbox{$0}{$1}' },
];

const LATEX_ENVIRONMENTS: Completion[] = [
  { label: 'document', type: 'type', detail: 'Document body' },
  { label: 'figure', type: 'type', detail: 'Float figure' },
  { label: 'table', type: 'type', detail: 'Float table' },
  { label: 'tabular', type: 'type', detail: 'Table content' },
  { label: 'equation', type: 'type', detail: 'Numbered equation' },
  { label: 'equation*', type: 'type', detail: 'Unnumbered equation' },
  { label: 'align', type: 'type', detail: 'Aligned equations' },
  { label: 'align*', type: 'type', detail: 'Aligned (unnumbered)' },
  { label: 'itemize', type: 'type', detail: 'Bullet list' },
  { label: 'enumerate', type: 'type', detail: 'Numbered list' },
  { label: 'description', type: 'type', detail: 'Description list' },
  { label: 'abstract', type: 'type', detail: 'Abstract' },
  { label: 'verbatim', type: 'type', detail: 'Verbatim text' },
  { label: 'lstlisting', type: 'type', detail: 'Code listing' },
  { label: 'minipage', type: 'type', detail: 'Mini page' },
  { label: 'center', type: 'type', detail: 'Centered content' },
  { label: 'theorem', type: 'type', detail: 'Theorem' },
  { label: 'proof', type: 'type', detail: 'Proof' },
  { label: 'lemma', type: 'type', detail: 'Lemma' },
];

const BIBTEX_ENTRIES: Completion[] = [
  { label: '@article', type: 'type', detail: 'Journal article', apply: '@article{key,\n  author = {},\n  title = {},\n  journal = {},\n  year = {},\n  volume = {},\n  pages = {},\n}' },
  { label: '@inproceedings', type: 'type', detail: 'Conference paper', apply: '@inproceedings{key,\n  author = {},\n  title = {},\n  booktitle = {},\n  year = {},\n  pages = {},\n}' },
  { label: '@book', type: 'type', detail: 'Book', apply: '@book{key,\n  author = {},\n  title = {},\n  publisher = {},\n  year = {},\n}' },
  { label: '@misc', type: 'type', detail: 'Miscellaneous', apply: '@misc{key,\n  author = {},\n  title = {},\n  year = {},\n  howpublished = {},\n}' },
  { label: '@phdthesis', type: 'type', detail: 'PhD thesis', apply: '@phdthesis{key,\n  author = {},\n  title = {},\n  school = {},\n  year = {},\n}' },
  { label: '@techreport', type: 'type', detail: 'Technical report', apply: '@techreport{key,\n  author = {},\n  title = {},\n  institution = {},\n  year = {},\n}' },
  { label: '@online', type: 'type', detail: 'Online resource', apply: '@online{key,\n  author = {},\n  title = {},\n  url = {},\n  year = {},\n  urldate = {},\n}' },
];

/**
 * LaTeX autocompletion source for CodeMirror.
 * Triggers on backslash for commands, after \\begin{ for environments,
 * and after @ for BibTeX entry types.
 */
export function latexCompletionSource(context: CompletionContext) {
  // Match \command patterns
  const cmdMatch = context.matchBefore(/\\[a-zA-Z]*/);
  if (cmdMatch) {
    return {
      from: cmdMatch.from,
      options: LATEX_COMMANDS,
      validFor: /^\\[a-zA-Z]*$/,
    };
  }

  // Match environment names after \begin{ or \end{
  const envMatch = context.matchBefore(/\\(?:begin|end)\{[a-zA-Z*]*/);
  if (envMatch) {
    const bracePos = envMatch.text.indexOf('{');
    return {
      from: envMatch.from + bracePos + 1,
      options: LATEX_ENVIRONMENTS,
      validFor: /^[a-zA-Z*]*$/,
    };
  }

  // Match BibTeX entry types after @
  const bibMatch = context.matchBefore(/@[a-zA-Z]*/);
  if (bibMatch) {
    return {
      from: bibMatch.from,
      options: BIBTEX_ENTRIES,
      validFor: /^@[a-zA-Z]*$/,
    };
  }

  // Match snippet abbreviations (plain text at start of line or after whitespace)
  const snippetMatch = context.matchBefore(/(?:^|\s)[a-z]+/);
  if (snippetMatch && !context.matchBefore(/\\[a-zA-Z]*/)) {
    const wordStart = snippetMatch.text.search(/[a-z]/);
    return {
      from: snippetMatch.from + wordStart,
      options: LATEX_SNIPPETS,
      validFor: /^[a-z]*$/,
    };
  }

  return null;
}
