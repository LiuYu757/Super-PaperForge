import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { AppProviders } from "./providers";
import { getAppBaseUrl } from "@/lib/app-url";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: 'swap',
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "PaperForge - Open-Source Collaborative LaTeX Editor",
    template: "%s | PaperForge",
  },
  description:
    "Write, collaborate, and publish LaTeX documents in your browser. Real-time co-authoring, instant PDF preview, Git integration, and unlimited collaborators - free and open-source.",
  keywords: [
    "LaTeX editor",
    "collaborative LaTeX",
    "online LaTeX editor",
    "Overleaf alternative",
    "open source LaTeX",
    "academic writing",
    "research collaboration",
    "PDF preview",
    "real-time collaboration",
    "self-hosted LaTeX",
    "LaTeX compiler online",
    "scientific writing tool",
  ],
  authors: [{ name: "PaperForge Team" }],
  creator: "PaperForge",
  publisher: "PaperForge",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "PaperForge",
    title: "PaperForge - Open-Source Collaborative LaTeX Editor",
    description:
      "Write, collaborate, and publish LaTeX documents in your browser. Free, open-source Overleaf alternative with unlimited collaborators.",
  },
  twitter: {
    card: "summary_large_image",
    title: "PaperForge - Open-Source Collaborative LaTeX Editor",
    description:
      "Free, open-source Overleaf alternative. Real-time collaboration, Git integration, instant PDF preview.",
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PaperForge',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AppProviders>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to main content
          </a>
          <div id="main-content">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
