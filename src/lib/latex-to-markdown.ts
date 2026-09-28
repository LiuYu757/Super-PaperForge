/**
 * Convert LaTeX source to readable Markdown.
 * Handles common document elements for sharing with non-LaTeX users.
 */
export function latexToMarkdown(latex: string): string {
  let md = latex;

  // Remove preamble (everything before \begin{document})
  const docStart = md.indexOf('\\begin{document}');
  if (docStart !== -1) {
    md = md.slice(docStart + '\\begin{document}'.length);
  }
  md = md.replace(/\\end\{document\}[\s\S]*$/, '');

  // Comments
  md = md.replace(/%.*$/gm, '');

  // Title, author, date
  md = md.replace(/\\maketitle/g, '');

  // Sections → Markdown headings
  md = md.replace(/\\chapter\*?\{([^}]+)\}/g, '# $1');
  md = md.replace(/\\section\*?\{([^}]+)\}/g, '## $1');
  md = md.replace(/\\subsection\*?\{([^}]+)\}/g, '### $1');
  md = md.replace(/\\subsubsection\*?\{([^}]+)\}/g, '#### $1');
  md = md.replace(/\\paragraph\*?\{([^}]+)\}/g, '**$1**');

  // Text formatting
  md = md.replace(/\\textbf\{([^}]+)\}/g, '**$1**');
  md = md.replace(/\\textit\{([^}]+)\}/g, '*$1*');
  md = md.replace(/\\emph\{([^}]+)\}/g, '*$1*');
  md = md.replace(/\\underline\{([^}]+)\}/g, '$1');
  md = md.replace(/\\texttt\{([^}]+)\}/g, '`$1`');
  md = md.replace(/\\textsc\{([^}]+)\}/g, '$1');

  // Math → keep as-is (Markdown supports $...$)
  // Display math
  md = md.replace(/\\\[/g, '\n$$\n');
  md = md.replace(/\\\]/g, '\n$$\n');
  md = md.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, '\n$$\n$1\n$$\n');
  md = md.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, '\n$$\n$1\n$$\n');

  // Lists
  md = md.replace(/\\begin\{itemize\}/g, '');
  md = md.replace(/\\end\{itemize\}/g, '');
  md = md.replace(/\\begin\{enumerate\}/g, '');
  md = md.replace(/\\end\{enumerate\}/g, '');
  md = md.replace(/\\item\s*/g, '- ');

  // Figures
  md = md.replace(/\\begin\{figure\}[\s\S]*?\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}[\s\S]*?\\caption\{([^}]+)\}[\s\S]*?\\end\{figure\}/g, '![$2]($1)');

  // Tables (simplified)
  md = md.replace(/\\begin\{table\}[\s\S]*?\\end\{table\}/g, '[Table]');

  // References
  md = md.replace(/\\cite(?:\[[^\]]*\])?\{([^}]+)\}/g, '[$1]');
  md = md.replace(/\\ref\{([^}]+)\}/g, '[$1]');
  md = md.replace(/\\label\{[^}]+\}/g, '');

  // Links
  md = md.replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '[$2]($1)');
  md = md.replace(/\\url\{([^}]+)\}/g, '$1');

  // Footnotes
  md = md.replace(/\\footnote\{([^}]+)\}/g, ' ($1)');

  // Remove remaining commands
  md = md.replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?\{([^}]*)\}/g, '$1');
  md = md.replace(/\\[a-zA-Z]+/g, '');

  // Clean up special characters
  md = md.replace(/[{}]/g, '');
  md = md.replace(/~/g, ' ');
  md = md.replace(/\\\\/g, '\n');
  md = md.replace(/\\&/g, '&');
  md = md.replace(/\\\$/g, '$');

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}
