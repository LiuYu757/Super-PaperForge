'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { NavigationProgress } from '@/components/shared/navigation-progress';
import { UiLocaleProvider } from '@/lib/ui-locale';

const CommandPalette = dynamic(
  () => import('@/components/shared/command-palette').then((m) => m.CommandPalette),
  { ssr: false }
);

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath="/api/v1/auth">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <UiLocaleProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          {children}
          <CommandPalette />
          <Toaster />
        </UiLocaleProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
