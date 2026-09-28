import { type Completion } from '@codemirror/autocomplete';

/**
 * LaTeX snippet templates that expand common patterns.
 * These appear in autocomplete with a "snippet" type badge.
 */
export const LATEX_SNIPPETS: Completion[] = [
  {
    label: 'fig',
    type: 'text',
    detail: 'Figure environment',
    boost: 10,
    apply: `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=0.8\\textwidth]{filename}
  \\caption{Caption text}
  \\label{fig:label}
\\end{figure}`,
  },
  {
    label: 'tab',
    type: 'text',
    detail: 'Table environment',
    boost: 10,
    apply: `\\begin{table}[htbp]
  \\centering
  \\caption{Caption text}
  \\label{tab:label}
  \\begin{tabular}{lcc}
    \\hline
    Column 1 & Column 2 & Column 3 \\\\
    \\hline
    Data 1 & Data 2 & Data 3 \\\\
    \\hline
  \\end{tabular}
\\end{table}`,
  },
  {
    label: 'eq',
    type: 'text',
    detail: 'Equation environment',
    boost: 10,
    apply: `\\begin{equation}

  \\label{eq:label}
\\end{equation}`,
  },
  {
    label: 'align',
    type: 'text',
    detail: 'Align environment',
    boost: 10,
    apply: `\\begin{align}
  a &= b + c \\\\
  d &= e + f
  \\label{eq:align}
\\end{align}`,
  },
  {
    label: 'enum',
    type: 'text',
    detail: 'Numbered list',
    boost: 10,
    apply: `\\begin{enumerate}
  \\item First item
  \\item Second item
  \\item Third item
\\end{enumerate}`,
  },
  {
    label: 'item',
    type: 'text',
    detail: 'Bullet list',
    boost: 10,
    apply: `\\begin{itemize}
  \\item First item
  \\item Second item
  \\item Third item
\\end{itemize}`,
  },
  {
    label: 'frame',
    type: 'text',
    detail: 'Beamer frame',
    boost: 10,
    apply: `\\begin{frame}{Frame Title}
  Content here
\\end{frame}`,
  },
  {
    label: 'lst',
    type: 'text',
    detail: 'Code listing',
    boost: 10,
    apply: `\\begin{lstlisting}[language=Python, caption=Caption]

\\end{lstlisting}`,
  },
  {
    label: 'minipage',
    type: 'text',
    detail: 'Two-column minipage',
    boost: 10,
    apply: `\\begin{minipage}[t]{0.48\\textwidth}
  Left content
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
  Right content
\\end{minipage}`,
  },
  {
    label: 'thm',
    type: 'text',
    detail: 'Theorem environment',
    boost: 10,
    apply: `\\begin{theorem}
  Statement of the theorem.
\\end{theorem}

\\begin{proof}
  Proof goes here.
\\end{proof}`,
  },
  {
    label: 'abs',
    type: 'text',
    detail: 'Abstract',
    boost: 10,
    apply: `\\begin{abstract}
  Your abstract text here.
\\end{abstract}`,
  },
  {
    label: 'doc',
    type: 'text',
    detail: 'Document template',
    boost: 10,
    apply: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Title}
\\author{Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}


\\section{Conclusion}


\\end{document}`,
  },
  // ── Math environments ─────────────────────────
  {
    label: 'multline',
    type: 'text',
    detail: 'Multi-line equation',
    boost: 10,
    apply: `\\begin{multline}
  first\\_line \\\\
  = second\\_line
  \\label{eq:multline}
\\end{multline}`,
  },
  {
    label: 'gather',
    type: 'text',
    detail: 'Gathered equations (centered)',
    boost: 10,
    apply: `\\begin{gather}
  a = b + c \\\\
  d = e + f
  \\label{eq:gather}
\\end{gather}`,
  },
  {
    label: 'cases',
    type: 'text',
    detail: 'Piecewise function',
    boost: 10,
    apply: `\\begin{equation}
  f(x) = \\begin{cases}
    a & \\text{if } x > 0 \\\\
    b & \\text{otherwise}
  \\end{cases}
  \\label{eq:cases}
\\end{equation}`,
  },
  {
    label: 'matrix',
    type: 'text',
    detail: 'Matrix',
    boost: 10,
    apply: `\\begin{equation}
  \\begin{bmatrix}
    a & b \\\\
    c & d
  \\end{bmatrix}
  \\label{eq:matrix}
\\end{equation}`,
  },
  // ── Document structure ────────────────────────
  {
    label: 'sec',
    type: 'text',
    detail: 'Section with label',
    boost: 10,
    apply: `\\section{Section Title}
\\label{sec:label}`,
  },
  {
    label: 'subsec',
    type: 'text',
    detail: 'Subsection with label',
    boost: 10,
    apply: `\\subsection{Subsection Title}
\\label{subsec:label}`,
  },
  {
    label: 'chap',
    type: 'text',
    detail: 'Chapter (books/reports)',
    boost: 10,
    apply: `\\chapter{Chapter Title}
\\label{chap:label}`,
  },
  // ── References & Citations ────────────────────
  {
    label: 'bib',
    type: 'text',
    detail: 'Bibliography section',
    boost: 10,
    apply: `\\bibliographystyle{plain}
\\bibliography{references}`,
  },
  {
    label: 'bibentry',
    type: 'text',
    detail: 'BibTeX article entry',
    boost: 10,
    apply: `@article{key,
  author  = {Author Name},
  title   = {Article Title},
  journal = {Journal Name},
  year    = {2024},
  volume  = {1},
  pages   = {1--10},
  doi     = {},
}`,
  },
  // ── Algorithms ────────────────────────────────
  {
    label: 'algo',
    type: 'text',
    detail: 'Algorithm pseudocode',
    boost: 10,
    apply: `\\begin{algorithm}[htbp]
  \\caption{Algorithm Name}
  \\label{alg:label}
  \\begin{algorithmic}[1]
    \\Require Input
    \\Ensure Output
    \\State Initialize
    \\For{$i = 1$ to $n$}
      \\State Process
    \\EndFor
    \\Return Result
  \\end{algorithmic}
\\end{algorithm}`,
  },
  // ── TikZ / Diagrams ──────────────────────────
  {
    label: 'tikz',
    type: 'text',
    detail: 'TikZ figure',
    boost: 10,
    apply: `\\begin{figure}[htbp]
  \\centering
  \\begin{tikzpicture}
    \\draw (0,0) -- (4,0) -- (4,3) -- cycle;
  \\end{tikzpicture}
  \\caption{TikZ diagram}
  \\label{fig:tikz}
\\end{figure}`,
  },
  // ── Common blocks ─────────────────────────────
  {
    label: 'href',
    type: 'text',
    detail: 'Hyperlink',
    boost: 10,
    apply: `\\href{https://example.com}{Link Text}`,
  },
  {
    label: 'footnote',
    type: 'text',
    detail: 'Footnote',
    boost: 10,
    apply: `\\footnote{Footnote text here.}`,
  },
  {
    label: 'citep',
    type: 'text',
    detail: 'Citation with page range',
    boost: 10,
    apply: `\\cite[p.~]{key}`,
  },
  {
    label: 'subfig',
    type: 'text',
    detail: 'Side-by-side subfigures',
    boost: 10,
    apply: `\\begin{figure}[htbp]
  \\centering
  \\begin{subfigure}[b]{0.48\\textwidth}
    \\centering
    \\includegraphics[width=\\textwidth]{fig1}
    \\caption{First}
    \\label{fig:sub1}
  \\end{subfigure}
  \\hfill
  \\begin{subfigure}[b]{0.48\\textwidth}
    \\centering
    \\includegraphics[width=\\textwidth]{fig2}
    \\caption{Second}
    \\label{fig:sub2}
  \\end{subfigure}
  \\caption{Both figures}
  \\label{fig:both}
\\end{figure}`,
  },
];
