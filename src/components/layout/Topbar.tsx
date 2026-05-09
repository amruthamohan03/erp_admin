'use client';

import { useEffect, useState } from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';

interface Me {
  id: number;
  username: string;
  full_name: string;
  role_name: string;
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

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
      <div className="text-sm text-slate-500">Welcome back</div>
      <div className="flex items-center gap-4">
        {me && (
          <div className="flex items-center gap-2 text-sm">
            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
              <UserIcon className="h-4 w-4 text-primary-600" />
            </div>
            <div className="leading-tight">
              <div className="font-medium text-slate-900">{me.full_name}</div>
              <div className="text-xs text-slate-500">{me.role_name}</div>
            </div>
          </div>
        )}
        <button onClick={logout} className="btn-secondary">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </header>
  );
}
