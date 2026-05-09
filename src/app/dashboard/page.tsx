'use client';

import { useEffect, useState } from 'react';
import { Users, Shield, UserCheck } from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';

interface Stats {
  users: number;
  roles: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ users: 0, roles: 0 });

  useEffect(() => {
    Promise.all([
      fetch('/api/users?pageSize=1').then((r) => r.json()),
      fetch('/api/roles').then((r) => r.json()),
    ])
      .then(([u, r]) => {
        setStats({
          users: u.success ? u.data.total : 0,
          roles: r.success ? r.data.length : 0,
        });
      })
      .catch(() => {});
  }, []);

  const cards = [
    { title: 'Total Users', value: stats.users, icon: Users, color: 'bg-blue-500' },
    { title: 'Active Roles', value: stats.roles, icon: Shield, color: 'bg-emerald-500' },
    { title: 'System Status', value: 'Online', icon: UserCheck, color: 'bg-amber-500' },
  ];

  return (
    <DashboardShell>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="card p-6 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-lg ${c.color} flex items-center justify-center text-white`}>
              <c.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500">{c.title}</div>
              <div className="text-2xl font-bold text-slate-900">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Getting started</h2>
        <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
          <li>Manage users on the Users page (create / edit / disable).</li>
          <li>Manage roles and permissions on the Roles page.</li>
          <li>API endpoints: <code className="bg-slate-100 px-1 rounded">/api/users</code> and <code className="bg-slate-100 px-1 rounded">/api/roles</code>.</li>
        </ul>
      </div>
    </DashboardShell>
  );
}
