'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import {
  FlameIcon,
  SunIcon,
  MoonIcon,
  MenuIcon,
  SettingsIcon,
  KeyboardIcon,
  HelpCircleIcon,
  LogOutIcon,
  UserIcon,
  ChevronDownIcon,
  FolderOpenIcon,
  LayoutTemplateIcon,
  BookOpenIcon,
  CreditCardIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiLocale } from '@/lib/ui-locale';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';

/* ────────────────────────── nav links ────────────────────────── */

const navLinks = [
  { href: '/projects', label: 'Projects', icon: FolderOpenIcon },
  { href: '/templates', label: 'Templates', icon: LayoutTemplateIcon },
  { href: '/billing', label: 'Billing', icon: CreditCardIcon },
  { href: '/docs', label: 'Docs', icon: BookOpenIcon },
] as const;

/* ────────────────────────── breadcrumb map ────────────────────── */

function useBreadcrumbs() {
  const { t } = useUiLocale();
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const labelMap: Record<string, string> = {
    projects: 'Projects',
    templates: 'Templates',
    billing: 'Billing',
    settings: 'Settings',
    editor: 'Editor',
    admin: 'Admin',
  };

  return segments.map((seg, i) => ({
    label: labelMap[seg] ? t(labelMap[seg]) : decodeURIComponent(seg),
    href: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
  }));
}

/* ────────────────────────── component ────────────────────────── */

export function Navbar() {
  const { locale, setLocale, t } = useUiLocale();
  const { data: session } = useSession();
  const user = session?.user;
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const breadcrumbs = useBreadcrumbs();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* ── Logo ──────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-bold text-lg tracking-tight transition-opacity hover:opacity-80"
        >
          <FlameIcon className="size-5 text-orange-500" />
          <span>PaperForge</span>
        </Link>

        {/* ── Desktop nav links ─────────────────────────────── */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map(({ href, label }) => {
            const isActive =
              pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                {t(label)}
              </Link>
            );
          })}
        </nav>

        {/* ── Breadcrumb (desktop) ──────────────────────────── */}
        {breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="hidden items-center gap-1 text-sm text-muted-foreground md:flex"
          >
            <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
            {breadcrumbs.map(({ label, href, isLast }, i) => (
              <span key={href} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRightIcon className="size-3 text-muted-foreground/40" />
                )}
                {isLast ? (
                  <span className="font-medium text-foreground">{label}</span>
                ) : (
                  <Link
                    href={href}
                    className="transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* ── Spacer ────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Theme toggle ──────────────────────────────────── */}
        <button type="button" className="shrink-0 rounded-md px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')} aria-label={t('Language')} title={t('Language')}>
          {locale === 'en' ? '中文' : 'EN'}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="shrink-0"
        >
          <SunIcon className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </Button>

        {/* ── User menu (desktop) ───────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger className="hidden cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:flex">
            <Avatar size="sm">
              {user?.image && (
                <AvatarImage src={user.image} alt={user.name ?? 'User'} />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline-block">
              {user?.name ?? 'User'}
            </span>
            <ChevronDownIcon className="hidden size-3.5 text-muted-foreground lg:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  {user?.image && (
                    <AvatarImage src={user.image} alt={user.name ?? 'User'} />
                  )}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {user?.name ?? 'User'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.assign('/settings')} className="cursor-pointer">
              <SettingsIcon className="mr-2" />
              {t('Settings')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.assign('/docs/getting-started')} className="cursor-pointer">
              <KeyboardIcon className="mr-2" />
              {t('Keyboard Shortcuts')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.assign('/docs')} className="cursor-pointer">
              <HelpCircleIcon className="mr-2" />
              {t('Help')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.assign('/settings')} className="cursor-pointer">
              <UserIcon className="mr-2" />
              {t('Profile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="cursor-pointer"
            >
              <LogOutIcon className="mr-2" />
              {t('Sign out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── Mobile hamburger ──────────────────────────────── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                aria-label="Open menu"
              />
            }
          >
            <MenuIcon className="size-5" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2 text-base font-bold">
                <FlameIcon className="size-4 text-orange-500" />
                PaperForge
              </SheetTitle>
            </SheetHeader>

            {/* mobile user info */}
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Avatar size="sm">
                {user?.image && (
                  <AvatarImage src={user.image} alt={user.name ?? 'User'} />
                )}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {user?.name ?? 'User'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </div>

            {/* mobile nav links */}
            <nav className="flex flex-col gap-1 p-3">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const isActive =
                  pathname.startsWith(href);
                return (
                  <SheetClose key={href} render={<span />}>
                    <Link
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                      {t(label)}
                    </Link>
                  </SheetClose>
                );
              })}
            </nav>

            {/* mobile menu actions */}
            <div className="mt-auto border-t p-3">
              <div className="flex flex-col gap-1">
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <SettingsIcon className="size-4" />
                  {t('Settings')}
                </Link>
                <Link
                  href="/docs/getting-started"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <KeyboardIcon className="size-4" />
                  {t('Keyboard Shortcuts')}
                </Link>
                <Link
                  href="/docs"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <HelpCircleIcon className="size-4" />
                  {t('Help')}
                </Link>
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <SunIcon className="size-4 dark:hidden" />
                  <MoonIcon className="hidden size-4 dark:block" />
                  {t('Toggle Theme')}
                </button>
              </div>
              <div className="my-2 h-px bg-border" />
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOutIcon className="size-4" />
                {t('Sign out')}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Breadcrumb bar (mobile) ───────────────────────── */}
      {breadcrumbs.length > 0 && (
        <div className="border-t border-border/30 px-4 py-1.5 md:hidden">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumbs.map(({ label, href, isLast }, i) => (
              <span key={href} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRightIcon className="size-3 text-muted-foreground/40" />
                )}
                {isLast ? (
                  <span className="font-medium text-foreground">{label}</span>
                ) : (
                  <Link
                    href={href}
                    className="transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
