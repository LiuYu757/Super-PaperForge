import type { Metadata } from 'next';
import Link from 'next/link';
import { FlameIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'PaperForge terms of service — usage policies and conditions.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
      </nav>
      <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-6 py-16">
        <h1>Terms of Service</h1>
        <p className="lead">Last updated: March 28, 2026</p>

        <h2>1. Acceptance</h2>
        <p>By using PaperForge, you agree to these terms. If you do not agree, do not use the service.</p>

        <h2>2. Service Description</h2>
        <p>PaperForge is a collaborative LaTeX editor that provides real-time document editing, PDF compilation, version history, and Git integration.</p>

        <h2>3. User Accounts</h2>
        <p>You are responsible for maintaining the security of your account. You must provide accurate information and may not share credentials.</p>

        <h2>4. Acceptable Use</h2>
        <p>You may not use PaperForge to store malicious code, violate intellectual property rights, distribute spam, or perform unauthorized access attempts.</p>

        <h2>5. Content Ownership</h2>
        <p>You retain all rights to documents you create. PaperForge does not claim ownership of your content. We may access content only to provide the service or comply with legal requirements.</p>

        <h2>6. Service Availability</h2>
        <p>We strive for 99.9% uptime but do not guarantee uninterrupted service. Planned maintenance will be announced in advance.</p>

        <h2>7. Limitation of Liability</h2>
        <p>PaperForge is provided &ldquo;as is&rdquo; without warranty. We are not liable for data loss, service interruptions, or compilation errors beyond our control.</p>

        <h2>8. Termination</h2>
        <p>Either party may terminate the agreement at any time. Upon termination, you may export your data within 30 days.</p>

        <h2>9. Changes</h2>
        <p>We may update these terms with 30 days notice. Continued use constitutes acceptance.</p>

        <h2>10. Contact</h2>
        <p>Questions? Email <a href="mailto:legal@paperforge.dev">legal@paperforge.dev</a>.</p>
      </article>
    </div>
  );
}
