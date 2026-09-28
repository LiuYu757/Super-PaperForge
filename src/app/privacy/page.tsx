import type { Metadata } from 'next';
import Link from 'next/link';
import { FlameIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'PaperForge privacy policy — how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
      </nav>
      <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-6 py-16">
        <h1>Privacy Policy</h1>
        <p className="lead">Last updated: March 28, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly: name, email address, institution, and documents you create. We also collect usage data including IP addresses, browser type, and pages visited.</p>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to provide the PaperForge service, compile LaTeX documents, enable collaboration, send service notifications, and improve our platform.</p>

        <h2>3. Data Storage & Security</h2>
        <p>Documents are stored encrypted in our infrastructure. OAuth tokens and Git credentials are encrypted with AES-256-GCM. All data is transmitted over HTTPS with TLS 1.3.</p>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal information. We may share data with service providers (hosting, email) necessary to operate PaperForge, or when required by law.</p>

        <h2>5. Your Rights</h2>
        <p>You can access, export (ZIP download), or delete your data at any time from your account settings. For account deletion, contact support@paperforge.dev.</p>

        <h2>6. Cookies</h2>
        <p>We use essential cookies for authentication (httpOnly, secure, sameSite). We do not use tracking cookies or third-party analytics.</p>

        <h2>7. Contact</h2>
        <p>Questions about this policy? Email <a href="mailto:privacy@paperforge.dev">privacy@paperforge.dev</a>.</p>
      </article>
    </div>
  );
}
