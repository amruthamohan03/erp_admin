'use client';

import * as React from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MeProfile } from './SettingsView';

export default function ProfileTab({
  me,
  onChange,
}: {
  me: MeProfile;
  onChange: () => Promise<void> | void;
}) {
  const [fullName, setFullName] = React.useState(me.full_name);
  const [email, setEmail] = React.useState(me.email);
  const [mobile, setMobile] = React.useState(me.mobile ?? '');
  const [bio, setBio] = React.useState(me.bio ?? '');
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, mobile: mobile || null, bio: bio || null }),
      });
      await onChange();
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch('/api/me/avatar', { method: 'POST', body: fd });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    try {
      await fetch('/api/me/avatar', { method: 'DELETE' });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  const initials = (me.full_name || me.username || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal information.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {me.profile_image && <AvatarImage src={me.profile_image} alt={me.full_name} />}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="text-sm font-medium">Profile picture</div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="me-2 h-4 w-4" />
                  Upload
                </Button>
                {me.profile_image && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={removeAvatar}
                  >
                    <Trash2 className="me-2 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG or WEBP up to 2 MB.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile">Mobile</Label>
              <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description shown on your profile."
              rows={3}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
