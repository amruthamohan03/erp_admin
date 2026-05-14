'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, User as UserIcon, Settings } from 'lucide-react';
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

interface Me {
  id: number;
  username: string;
  full_name: string;
  role_name: string;
  profile_image: string | null;
}

export default function Topbar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => j.success && setMe(j.data))
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const initials = (me?.full_name || me?.username || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="text-sm text-muted-foreground">Welcome back</div>

      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />

        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="ms-2 h-10 gap-3 px-2">
                <Avatar className="h-8 w-8">
                  {me.profile_image && <AvatarImage src={me.profile_image} alt={me.full_name} />}
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden text-start leading-tight sm:block">
                  <div className="text-sm font-medium" translate="no">{me.full_name}</div>
                  <div className="text-xs text-muted-foreground">{me.role_name}</div>
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
