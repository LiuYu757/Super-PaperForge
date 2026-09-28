import type { Metadata } from 'next';
import Link from 'next/link';
import { FlameIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Getting Started',
  description: 'Get started with PaperForge in 5 minutes — create your first LaTeX project, collaborate, and compile to PDF.',
};

export default function GettingStartedPage() {
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
        <span className="text-sm font-medium">Getting Started</span>
      </nav>
      <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-6 py-16">
        <h1>Getting Started with PaperForge</h1>

        <h2>1. Create an Account</h2>
        <p>Visit <a href="/register">/register</a> to create a free account. You can sign up with email/password or use Google/GitHub OAuth.</p>

        <h2>2. Create Your First Project</h2>
        <p>Click <strong>&ldquo;New Project&rdquo;</strong> on the dashboard. Choose a name and LaTeX compiler (pdflatex, xelatex, or lualatex).</p>

        <h2>3. Write LaTeX</h2>
        <p>The editor supports:</p>
        <ul>
          <li><strong>70+ autocomplete commands</strong> — type <code>\</code> to see suggestions</li>
          <li><strong>12 snippet templates</strong> — type <code>fig</code>, <code>tab</code>, <code>eq</code> for quick environments</li>
          <li><strong>Inline linting</strong> — unclosed braces and mismatched environments shown in the gutter</li>
          <li><strong>Code folding</strong> — collapse environments and sections</li>
          <li><strong>22 keyboard shortcuts</strong> — Ctrl+B for bold, Ctrl+I for italic, and more</li>
        </ul>

        <h2>4. Compile &amp; Preview</h2>
        <p>Press <kbd>Ctrl+Enter</kbd> or click <strong>Compile</strong>. The PDF appears in the right panel. Auto-compile triggers 2 seconds after you stop typing.</p>

        <h2>5. Collaborate</h2>
        <p>Invite team members via the <strong>Share</strong> button. Multiple people can edit simultaneously — changes merge in real-time using CRDT technology.</p>

        <h2>6. Export</h2>
        <ul>
          <li><strong>PDF</strong> — download compiled output</li>
          <li><strong>DOCX</strong> — Word format via Pandoc</li>
          <li><strong>ZIP</strong> — download entire project</li>
        </ul>

        <h2>7. Version History &amp; Git</h2>
        <p>Every save is a git commit. Create named versions like &ldquo;Draft 1&rdquo; or &ldquo;Submitted to IEEE&rdquo;. Push to GitHub, GitLab, or Bitbucket.</p>

        <h2>Keyboard Shortcuts Quick Reference</h2>
        <table>
          <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
          <tbody>
            <tr><td><kbd>Ctrl+S</kbd></td><td>Save</td></tr>
            <tr><td><kbd>Ctrl+Enter</kbd></td><td>Compile</td></tr>
            <tr><td><kbd>Ctrl+K</kbd></td><td>Command Palette</td></tr>
            <tr><td><kbd>Ctrl+B/I/U</kbd></td><td>Bold / Italic / Underline</td></tr>
            <tr><td><kbd>Ctrl+/</kbd></td><td>Toggle Comment</td></tr>
            <tr><td><kbd>Ctrl+Shift+F</kbd></td><td>Find in Project</td></tr>
            <tr><td><kbd>Ctrl+G</kbd></td><td>Go to Line</td></tr>
          </tbody>
        </table>

        <p>For the full list, see <a href="/docs">Documentation</a> or press the keyboard icon in the editor toolbar.</p>
      </article>
    </div>
  );
}
