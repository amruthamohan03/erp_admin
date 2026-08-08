'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useSidebar } from '@/components/layout/SidebarProvider';
import { useBranding } from '@/lib/hooks/useBranding';

interface Me {
  id: number;
  username: string;
  full_name: string;
  role_name: string;
  profile_image: string | null;
}

export default function Topbar() {
  const [me, setMe] = useState<Me | null>(null);
  const branding = useBranding();
  const { toggleMobile, collapsed, toggleCollapsed } = useSidebar();

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => r.json())
      .then((j) => j.ok && setMe(j.data))
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const initials = (me?.full_name || me?.username || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="bg-brand-gradient sticky top-0 z-30 flex h-14 items-center justify-between gap-2 px-3 text-white shadow-md sm:h-16 sm:px-6">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        {/* Opens the drawer below `lg`; from `lg` the sidebar is docked and this
            same slot becomes the rail toggle instead. */}
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Open navigation"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/15 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/15 lg:inline-flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 rtl:-scale-x-100" />
          ) : (
            <PanelLeftClose className="h-5 w-5 rtl:-scale-x-100" />
          )}
        </button>

        {/* The sidebar carries the identity from `lg` up, so the header only needs
            to name the app on the breakpoints where the sidebar is hidden. */}
        <div className="flex min-w-0 flex-col leading-tight lg:hidden">
          <span className="truncate text-sm font-semibold tracking-wide">
            {branding.project_name}
          </span>
          {branding.tagline && (
            <span className="hidden truncate text-xs text-white/70 sm:inline">
              {branding.tagline}
            </span>
          )}
        </div>
      </div>

      {/* Controls read as white glass on the gradient; their dropdowns still open
          on the themed popover. */}
      <div className="flex shrink-0 items-center gap-1 [&_button]:text-white [&_button:hover]:bg-white/15 [&_button:hover]:text-white">
        <LanguageSwitcher />
        <ThemeToggle />

        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="ms-1 h-10 gap-2 px-1.5 sm:ms-2 sm:gap-3 sm:px-2">
                <Avatar className="h-8 w-8 ring-2 ring-white/40">
                  {me.profile_image && <AvatarImage src={me.profile_image} alt={me.full_name} />}
                  <AvatarFallback className="bg-white/20 text-xs text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden text-start leading-tight md:block">
                  <div className="max-w-[12rem] truncate text-sm font-medium" translate="no">
                    {me.full_name}
                  </div>
                  <div className="truncate text-xs text-white/70">{me.role_name}</div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span translate="no">{me.full_name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{me.role_name}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <UserIcon className="me-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="me-2 h-4 w-4" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="me-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
