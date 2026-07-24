'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, User as UserIcon, Settings, LayoutGrid } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between px-6 text-white shadow-md bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700 dark:from-indigo-700 dark:via-violet-800 dark:to-purple-900">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
          <LayoutGrid className="h-5 w-5" />
        </span>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-semibold tracking-wide truncate">
            {branding?.project_name ?? 'ERP Admin'}
          </span>
          {branding?.tagline && (
            <span className="hidden md:inline text-xs text-white/70 truncate">
              {branding.tagline}
            </span>
          )}
        </div>
      </div>

      {/* Controls read as white glass on the gradient; their dropdowns still open
          on the themed popover. */}
      <div className="flex items-center gap-1 [&_button]:text-white [&_button:hover]:bg-white/15 [&_button:hover]:text-white">
        <LanguageSwitcher />
        <ThemeToggle />

        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="ms-2 h-10 gap-3 px-2">
                <Avatar className="h-8 w-8 ring-2 ring-white/40">
                  {me.profile_image && <AvatarImage src={me.profile_image} alt={me.full_name} />}
                  <AvatarFallback className="text-xs bg-white/20 text-white">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden text-start leading-tight sm:block">
                  <div className="text-sm font-medium" translate="no">{me.full_name}</div>
                  <div className="text-xs text-white/70">{me.role_name}</div>
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

