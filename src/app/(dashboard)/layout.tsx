import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;
  try {
    const { auth } = await import('@/lib/auth');
    session = await auth();
  } catch {
    // Auth failed — redirect to login
  }

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
