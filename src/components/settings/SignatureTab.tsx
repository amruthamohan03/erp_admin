'use client';

import * as React from 'react';
import Image from 'next/image';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MeProfile } from './SettingsView';

export default function SignatureTab({
  me,
  onChange,
}: {
  me: MeProfile;
  onChange: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch('/api/me/signature', { method: 'POST', body: fd });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch('/api/me/signature', { method: 'DELETE' });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signature</CardTitle>
        <CardDescription>Used on approvals and documents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-2">Current signature</div>
          <div className="flex h-40 w-full max-w-md items-center justify-center rounded-md border bg-muted/30 p-4">
            {me.signature_image ? (
              <Image
                src={me.signature_image}
                alt="Signature"
                width={400}
                height={140}
                className="max-h-full w-auto object-contain dark:invert"
                unoptimized
              />
            ) : (
              <span className="text-sm text-muted-foreground">No signature uploaded yet.</span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          PNG with transparent background works best.
        </p>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="me-2 h-4 w-4" />
            Upload
          </Button>
          {me.signature_image && (
            <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
              <Trash2 className="me-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
