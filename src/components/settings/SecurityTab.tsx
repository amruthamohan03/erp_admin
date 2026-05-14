'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SecurityTab() {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (next.length < 6) {
      setMessage({ kind: 'err', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (next !== confirm) {
      setMessage({ kind: 'err', text: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      const r = await fetch('/api/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const j = await r.json();
      if (j.success) {
        setMessage({ kind: 'ok', text: 'Password updated.' });
        setCurrent('');
        setNext('');
        setConfirm('');
      } else {
        setMessage({ kind: 'err', text: j.message ?? 'Something went wrong.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Change your password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {message && (
            <p
              className={
                message.kind === 'ok'
                  ? 'text-sm text-emerald-600 dark:text-emerald-400'
                  : 'text-sm text-destructive'
              }
            >
              {message.text}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
