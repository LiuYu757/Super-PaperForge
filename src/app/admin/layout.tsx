import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  LayoutDashboardIcon,
  UsersIcon,
  LayoutTemplateIcon,
  ClipboardListIcon,
  CpuIcon,
  ArrowLeftIcon,
  ShieldIcon,
  FlameIcon,
} from 'lucide-react';

const NAV_LINKS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/templates', label: 'Templates', icon: LayoutTemplateIcon },
  { href: '/admin/audit-log', label: 'Audit Log', icon: ClipboardListIcon },
  { href: '/admin/workers', label: 'Workers', icon: CpuIcon },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session = null;
  try {
    session = await auth();
  } catch {
    redirect('/login');
  }
  const userRole = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) {
    redirect('/login');
  }
  if (userRole !== 'admin') {
    redirect('/projects');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-orange-500/10">
            <FlameIcon className="size-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">PaperForge</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldIcon className="size-2.5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Management
          </p>
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-1 border-t p-2">
          <Link
            href="/projects"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
