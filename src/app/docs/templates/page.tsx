'use client';

import Link from 'next/link';
import { FlameIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { copyToClipboard } from '@/lib/clipboard';

const TEMPLATES = [
  { name: 'Article', code: `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\n\\title{Title}\n\\author{Author}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\n\n\\end{document}` },
  { name: 'IEEE Conference', code: `\\documentclass[conference]{IEEEtran}\n\\usepackage{amsmath,graphicx}\n\n\\title{Paper Title}\n\\author{Author Name}\n\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nAbstract text.\n\\end{abstract}\n\n\\section{Introduction}\n\n\\bibliographystyle{IEEEtran}\n\\bibliography{refs}\n\\end{document}` },
  { name: 'Beamer Slides', code: `\\documentclass{beamer}\n\\usetheme{Madrid}\n\n\\title{Presentation Title}\n\\author{Author}\n\\date{\\today}\n\n\\begin{document}\n\\frame{\\titlepage}\n\n\\begin{frame}{Outline}\n\\tableofcontents\n\\end{frame}\n\n\\section{Introduction}\n\\begin{frame}{Introduction}\nContent here.\n\\end{frame}\n\n\\end{document}` },
  { name: 'Letter', code: `\\documentclass{letter}\n\\signature{Your Name}\n\\address{Your Address}\n\n\\begin{document}\n\\begin{letter}{Recipient}\n\\opening{Dear Sir/Madam,}\n\nLetter body.\n\n\\closing{Sincerely,}\n\\end{letter}\n\\end{document}` },
  { name: 'Thesis', code: `\\documentclass[12pt]{report}\n\\usepackage[utf8]{inputenc}\n\\usepackage{graphicx,amsmath,hyperref}\n\n\\title{Thesis Title}\n\\author{Author Name}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\\tableofcontents\n\n\\chapter{Introduction}\n\n\\chapter{Literature Review}\n\n\\chapter{Methodology}\n\n\\chapter{Results}\n\n\\chapter{Conclusion}\n\n\\bibliography{refs}\n\\bibliographystyle{plain}\n\\end{document}` },
  { name: 'CV', code: `\\documentclass[11pt]{article}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{enumitem}\n\n\\begin{document}\n\\begin{center}\n{\\Large\\textbf{Your Name}}\\\\\nvspace{4pt}\nemail@example.com | (123) 456-7890\n\\end{center}\n\n\\section*{Education}\n\\textbf{University Name} \\hfill 2020--2024\\\\\nB.S. in Computer Science\n\n\\section*{Experience}\n\\textbf{Company} \\hfill 2024--Present\\\\\nSoftware Engineer\n\n\\end{document}` },
];

export default function TemplateDocsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(name: string, code: string) {
    const ok = await copyToClipboard(code);
    if (ok) { setCopied(name); setTimeout(() => setCopied(null), 2000); }
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">Docs</Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Templates</span>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">LaTeX Templates</h1>
        <p className="mt-2 text-muted-foreground">Copy-paste starter templates for common document types.</p>

        <div className="mt-8 space-y-6">
          {TEMPLATES.map(t => (
            <div key={t.name} className="rounded-xl border">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <h2 className="font-semibold">{t.name}</h2>
                <button onClick={() => copy(t.name, t.code)}
                  aria-label={`Copy ${t.name} template`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {copied === t.name ? <><CheckIcon className="size-3 text-green-500" /> Copied!</> : <><CopyIcon className="size-3" /> Copy</>}
                </button>
              </div>
              <pre className="overflow-x-auto bg-muted/30 p-4 font-mono text-xs leading-relaxed">{t.code}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
