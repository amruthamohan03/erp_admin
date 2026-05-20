'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import DashboardShell from '@/components/layout/DashboardShell';

interface SettingsForm {
  project_name: string;
  app_title: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  accent_color: string;
  sidebar_bg: string;
  sidebar_fg: string;
}

const DEFAULTS: SettingsForm = {
  project_name: 'ERP Admin',
  app_title: 'ERP Admin',
  tagline: 'Management Console',
  logo_url: '',
  favicon_url: '',
  primary_color: '#2563eb',
  accent_color: '#2563eb',
  sidebar_bg: '#0f172a',
  sidebar_fg: '#e2e8f0',
};

export default function ApplicationSettingsPage() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  // Start false so SSR + first client render agree (no `disabled` attribute
  // on inputs). The effect flips it to true while the fetch is in flight.
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/application-settings')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setForm({
            project_name: j.data.project_name ?? '',
            app_title: j.data.app_title ?? '',
            tagline: j.data.tagline ?? '',
            logo_url: j.data.logo_url ?? '',
            favicon_url: j.data.favicon_url ?? '',
            primary_color: j.data.primary_color ?? DEFAULTS.primary_color,
            accent_color: j.data.accent_color ?? DEFAULTS.accent_color,
            sidebar_bg: j.data.sidebar_bg ?? DEFAULTS.sidebar_bg,
            sidebar_fg: j.data.sidebar_fg ?? DEFAULTS.sidebar_fg,
          });
        }
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      project_name: form.project_name.trim(),
      app_title: form.app_title.trim(),
      tagline: form.tagline.trim() || null,
      logo_url: form.logo_url.trim() || null,
      favicon_url: form.favicon_url.trim() || null,
      primary_color: form.primary_color,
      accent_color: form.accent_color,
      sidebar_bg: form.sidebar_bg,
      sidebar_fg: form.sidebar_fg,
    };

    try {
      const res = await fetch('/api/application-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Save failed');
        return;
      }
      setNotice('Saved — refresh the page to see the new branding.');
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setForm(DEFAULTS);
    setNotice(null);
  }

  return (
    <DashboardShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary-600" />
            Application Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Branding and color palette shown across the app. Stored as a
            single row in <code>application_settings_t</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="btn-secondary"
            disabled={saving}
          >
            <RotateCcw className="h-4 w-4" /> Reset defaults
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-200">
          {notice}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Branding */}
        <section className="card p-6 lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-slate-900">Branding</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Project Name *</label>
              <input
                className="input"
                value={form.project_name}
                onChange={(e) =>
                  setForm({ ...form, project_name: e.target.value })
                }
                disabled={loading}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Shown in the sidebar header.
              </p>
            </div>
            <div>
              <label className="label">Browser Tab Title *</label>
              <input
                className="input"
                value={form.app_title}
                onChange={(e) =>
                  setForm({ ...form, app_title: e.target.value })
                }
                disabled={loading}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Shown in the browser tab and used in metadata.
              </p>
            </div>
          </div>

          <div>
            <label className="label">Tagline</label>
            <input
              className="input"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              disabled={loading}
              placeholder="Management Console"
            />
            <p className="text-xs text-slate-500 mt-1">
              Optional subtitle under the project name.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FileField
              label="Logo"
              kind="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hint="PNG, JPG, WebP or SVG. Max 1 MB."
              value={form.logo_url}
              onChange={(url) => setForm({ ...form, logo_url: url })}
              disabled={loading}
              onError={setError}
              onNotice={setNotice}
            />
            <FileField
              label="Favicon"
              kind="favicon"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
              hint="ICO, PNG or SVG. Max 256 KB."
              value={form.favicon_url}
              onChange={(url) => setForm({ ...form, favicon_url: url })}
              disabled={loading}
              onError={setError}
              onNotice={setNotice}
            />
          </div>
        </section>

        {/* Live preview */}
        <aside className="card p-6 space-y-3">
          <h2 className="font-semibold text-slate-900">Preview</h2>
          <div
            className="rounded-md p-4 flex items-center gap-3"
            style={{
              background: form.sidebar_bg,
              color: form.sidebar_fg,
            }}
          >
            {form.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_url}
                alt=""
                className="h-9 w-9 rounded object-contain bg-white/10 p-1"
              />
            )}
            <div className="min-w-0">
              <div className="font-semibold truncate">{form.project_name}</div>
              {form.tagline && (
                <div className="text-xs opacity-70 truncate">
                  {form.tagline}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <span
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: form.primary_color }}
            >
              Primary
            </span>
            <span
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: form.accent_color }}
            >
              Accent
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Changes apply across the app after saving and reloading.
          </p>
        </aside>

        {/* Palette */}
        <section className="card p-6 lg:col-span-3 space-y-4">
          <h2 className="font-semibold text-slate-900">Color Palette</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <ColorField
              label="Primary"
              hint="Buttons, links, focus rings"
              value={form.primary_color}
              onChange={(v) => setForm({ ...form, primary_color: v })}
              disabled={loading}
            />
            <ColorField
              label="Accent"
              hint="Subtle highlights"
              value={form.accent_color}
              onChange={(v) => setForm({ ...form, accent_color: v })}
              disabled={loading}
            />
            <ColorField
              label="Sidebar Background"
              hint="Left nav surface"
              value={form.sidebar_bg}
              onChange={(v) => setForm({ ...form, sidebar_bg: v })}
              disabled={loading}
            />
            <ColorField
              label="Sidebar Text"
              hint="Default sidebar text color"
              value={form.sidebar_fg}
              onChange={(v) => setForm({ ...form, sidebar_fg: v })}
              disabled={loading}
            />
          </div>
        </section>

        <div className="lg:col-span-3 flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving || loading}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </DashboardShell>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-12 rounded border border-slate-300 bg-white p-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <input
          className="input flex-1 font-mono text-sm uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="#000000"
          maxLength={7}
        />
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function FileField({
  label,
  kind,
  accept,
  hint,
  value,
  onChange,
  disabled,
  onError,
  onNotice,
}: {
  label: string;
  kind: 'logo' | 'favicon';
  accept: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onError: (msg: string | null) => void;
  onNotice: (msg: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `/api/application-settings/branding?kind=${kind}`,
        { method: 'POST', body: fd },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        onError(json.message || 'Upload failed');
        return;
      }
      onChange(json.data[kind === 'logo' ? 'logo_url' : 'favicon_url']);
      onNotice(`${label} uploaded. Refresh to see it everywhere.`);
    } catch {
      onError('Network error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleClear() {
    if (!value) return;
    if (!confirm(`Remove the current ${label.toLowerCase()}?`)) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await fetch(
        `/api/application-settings/branding?kind=${kind}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        onError(json.message || 'Failed to remove file');
        return;
      }
      onChange('');
      onNotice(`${label} removed.`);
    } catch {
      onError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={label}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">
              None
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={disabled || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-secondary"
              disabled={disabled || busy}
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Uploading…' : value ? 'Replace' : 'Browse'}
            </button>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="btn-secondary text-red-600 hover:text-red-700"
                disabled={disabled || busy}
                title={`Remove ${label}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {value && (
            <code className="text-xs text-slate-500 truncate">{value}</code>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
