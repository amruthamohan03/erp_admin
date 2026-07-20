'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Save, Settings as SettingsIcon } from 'lucide-react';

// /settings/application — app-wide branding admin. Ports main's
// screen onto this branch. The singleton row on
// application_settings_master_t drives project name, colors,
// logo, favicon, footer text; the Topbar reads project_name on
// every mount.
//
// Reset defaults just repopulates the form state from DEFAULTS;
// nothing is persisted until the operator hits Save.

interface Settings {
  project_name: string;
  app_title: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_fg: string;
  footer_text: string;
}

const DEFAULTS: Settings = {
  project_name: 'ERP Admin',
  app_title: 'ERP Admin',
  tagline: 'Management Console',
  logo_url: '',
  favicon_url: '',
  primary_color: '#2563eb',
  accent_color: '#2563eb',
  sidebar_bg: '#0f172a',
  sidebar_fg: '#e2e8f0',
  footer_text: '© {year} ERP Admin · All rights reserved.',
};

export default function ApplicationSettingsPage() {
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/application-settings');
        const json = await res.json();
        if (json.ok) {
          setForm({
            project_name: json.data.project_name ?? '',
            app_title: json.data.app_title ?? '',
            tagline: json.data.tagline ?? '',
            logo_url: json.data.logo_url ?? '',
            favicon_url: json.data.favicon_url ?? '',
            primary_color: json.data.primary_color ?? DEFAULTS.primary_color,
            accent_color: json.data.accent_color ?? DEFAULTS.accent_color,
            sidebar_bg: json.data.sidebar_bg ?? DEFAULTS.sidebar_bg,
            sidebar_fg: json.data.sidebar_fg ?? DEFAULTS.sidebar_fg,
            footer_text: json.data.footer_text ?? '',
          });
        }
      } catch {
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const res = await fetch('/api/v1/application-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: form.project_name.trim(),
          app_title: form.app_title.trim(),
          tagline: form.tagline.trim() || null,
          logo_url: form.logo_url.trim() || null,
          favicon_url: form.favicon_url.trim() || null,
          primary_color: form.primary_color,
          accent_color: form.accent_color,
          sidebar_bg: form.sidebar_bg,
          sidebar_fg: form.sidebar_fg,
          footer_text: form.footer_text.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || 'Save failed');
        return;
      }
      setNotice('Saved. Reload the page to see the new branding.');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-20 justify-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary-600" />
          Application Settings
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
          {notice}
        </div>
      )}

      <form onSubmit={save} className="space-y-6">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Identity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Project name *</label>
              <input
                className="input"
                value={form.project_name}
                onChange={(e) => set('project_name', e.target.value)}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Shown in the topbar in place of &quot;Welcome back&quot;.
              </p>
            </div>
            <div>
              <label className="label">App title *</label>
              <input
                className="input"
                value={form.app_title}
                onChange={(e) => set('app_title', e.target.value)}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Browser tab title (fallback when the page has no own title).
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label">Tagline</label>
              <input
                className="input"
                value={form.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                placeholder="Management Console"
              />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input
                className="input"
                value={form.logo_url}
                onChange={(e) => set('logo_url', e.target.value)}
                placeholder="/branding/logo.png"
              />
            </div>
            <div>
              <label className="label">Favicon URL</label>
              <input
                className="input"
                value={form.favicon_url}
                onChange={(e) => set('favicon_url', e.target.value)}
                placeholder="/branding/favicon.ico"
              />
            </div>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Colors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ColorField
              label="Primary"
              value={form.primary_color}
              onChange={(v) => set('primary_color', v)}
            />
            <ColorField
              label="Accent"
              value={form.accent_color}
              onChange={(v) => set('accent_color', v)}
            />
            <ColorField
              label="Sidebar background"
              value={form.sidebar_bg}
              onChange={(v) => set('sidebar_bg', v)}
            />
            <ColorField
              label="Sidebar foreground"
              value={form.sidebar_fg}
              onChange={(v) => set('sidebar_fg', v)}
            />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Footer</h2>
          <div>
            <label className="label">Footer text</label>
            <input
              className="input"
              value={form.footer_text}
              onChange={(e) => set('footer_text', e.target.value)}
              placeholder="© {year} My Company · All rights reserved."
            />
            <p className="text-xs text-slate-500 mt-1">
              <code>{'{year}'}</code> expands to the current year at render
              time.
            </p>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setForm(DEFAULTS);
              setNotice('Defaults loaded — click Save to persist.');
            }}
          >
            <RotateCcw className="h-4 w-4" /> Reset defaults
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </form>
    </>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 rounded border border-slate-200 cursor-pointer"
        />
        <input
          className="input font-mono text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          maxLength={7}
        />
      </div>
    </div>
  );
}
