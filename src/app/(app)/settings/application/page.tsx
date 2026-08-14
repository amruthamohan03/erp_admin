'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { BRANDING_DEFAULTS } from '@/lib/branding';
import { safeFetchJson } from '@/lib/safeFetch';
import { summarizeZodError } from '@/lib/validation/messages';
import { applicationSettingsUpdateSchema } from '@/schemas/application-settings';
import ResultDialog, { type SaveResult } from '@/components/ui/ResultDialog';

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
  footer_text: string;
}

// Mirrors the shipped defaults rather than restating them, so "Reset to defaults"
// can never drift from the column defaults and the server-side palette (§4.10).
// The form models absent values as '' where the DTO uses null.
const DEFAULTS: SettingsForm = {
  project_name: BRANDING_DEFAULTS.project_name,
  app_title: BRANDING_DEFAULTS.app_title,
  tagline: BRANDING_DEFAULTS.tagline ?? '',
  logo_url: BRANDING_DEFAULTS.logo_url ?? '',
  favicon_url: BRANDING_DEFAULTS.favicon_url ?? '',
  primary_color: BRANDING_DEFAULTS.primary_color,
  accent_color: BRANDING_DEFAULTS.accent_color,
  sidebar_bg: BRANDING_DEFAULTS.sidebar_bg,
  sidebar_fg: BRANDING_DEFAULTS.sidebar_fg,
  footer_text: BRANDING_DEFAULTS.footer_text ?? '',
};

/** The shape the API takes, built from the form's '' -> null convention. */
function toPayload(form: SettingsForm) {
  return {
    project_name: form.project_name.trim(),
    app_title: form.app_title.trim(),
    tagline: form.tagline.trim() || null,
    logo_url: form.logo_url.trim() || null,
    favicon_url: form.favicon_url.trim() || null,
    primary_color: form.primary_color.trim().toLowerCase(),
    accent_color: form.accent_color.trim().toLowerCase(),
    sidebar_bg: form.sidebar_bg.trim().toLowerCase(),
    sidebar_fg: form.sidebar_fg.trim().toLowerCase(),
    footer_text: form.footer_text.trim() || null,
  };
}

export default function ApplicationSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  // Inputs render disabled until the initial fetch settles. SSR and the
  // first client render both start `true`, so the `disabled` attribute
  // agrees — no hydration mismatch — and the fetch's `finally` clears it.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  /** Per-field messages, shown under the input and used to mark it (§4.18). */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Stored URLs whose file is gone from disk — reported by the GET's meta. */
  const [missingFiles, setMissingFiles] = useState<{ logo: boolean; favicon: boolean }>({
    logo: false,
    favicon: false,
  });

  useEffect(() => {
    // Read the envelope directly here rather than through safeFetchJson: this is
    // the one call that needs `meta`, which the helper drops.
    fetch('/api/v1/application-settings')
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) {
          setResult({
            status: 'error',
            title: 'Not loaded',
            message: j?.error?.message || 'The application settings could not be loaded.',
          });
          return;
        }
        const d = j.data;
        setForm({
          project_name: d.project_name ?? '',
          app_title: d.app_title ?? '',
          tagline: d.tagline ?? '',
          logo_url: d.logo_url ?? '',
          favicon_url: d.favicon_url ?? '',
          primary_color: d.primary_color ?? DEFAULTS.primary_color,
          accent_color: d.accent_color ?? DEFAULTS.accent_color,
          sidebar_bg: d.sidebar_bg ?? DEFAULTS.sidebar_bg,
          sidebar_fg: d.sidebar_fg ?? DEFAULTS.sidebar_fg,
          footer_text: d.footer_text ?? '',
        });
        setMissingFiles({
          logo: !!j.meta?.logo_file_missing,
          favicon: !!j.meta?.favicon_file_missing,
        });
      })
      .catch((err: unknown) =>
        setResult({
          status: 'error',
          title: 'Not loaded',
          message: 'The application settings could not be loaded.',
          detail: (err as Error)?.message,
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear the field's error the moment the user acts on it — a message that
    // outlives the problem trains people to ignore messages.
    setFieldErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // The same schema the route parses, run here first (§4.10) — the operator
    // gets the message without a round trip, and the wording is identical
    // because both sides format it through summarizeZodError.
    const parsed = applicationSettingsUpdateSchema.safeParse(toPayload(form));
    if (!parsed.success) {
      const { message, fields } = summarizeZodError(parsed.error);
      setFieldErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      setResult({ status: 'error', title: 'Not saved', message });
      return;
    }

    setSaving(true);
    setFieldErrors({});

    const res = await safeFetchJson('/api/v1/application-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    setSaving(false);

    if (!res.ok) {
      if (res.fieldMessages) {
        setFieldErrors(
          Object.fromEntries(Object.entries(res.fieldMessages).map(([k, v]) => [k, v[0]])),
        );
      } else if (res.field) {
        setFieldErrors({ [res.field]: res.message });
      }
      setResult({ status: 'error', title: 'Not saved', message: res.message, detail: res.detail });
      return;
    }

    setResult({
      status: 'success',
      title: 'Saved',
      message: 'The branding has been updated and is now applied across the app.',
    });
  }

  // §4.22 — OK is what moves the page. The palette and the favicon are inlined by
  // the server-rendered root layout, so a refresh is what repaints them.
  function dismissResult() {
    const wasSuccess = result?.status === 'success';
    setResult(null);
    if (wasSuccess) router.refresh();
  }

  function resetDefaults() {
    setForm(DEFAULTS);
    setFieldErrors({});
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary-600" />
            Application Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Branding and color palette shown across the app. Stored as a
            single row in <code>application_settings_master_t</code>.
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

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Branding */}
        <section className="card p-6 lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-foreground">Branding</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Project Name"
              required
              value={form.project_name}
              onChange={(v) => set('project_name', v)}
              disabled={loading}
              maxLength={100}
              error={fieldErrors.project_name}
              hint="Shown in the sidebar header."
            />
            <TextField
              label="Browser Tab Title"
              required
              value={form.app_title}
              onChange={(v) => set('app_title', v)}
              disabled={loading}
              maxLength={100}
              error={fieldErrors.app_title}
              hint="Shown in the browser tab and used in metadata."
            />
          </div>

          <TextField
            label="Tagline"
            value={form.tagline}
            onChange={(v) => set('tagline', v)}
            disabled={loading}
            maxLength={255}
            placeholder="Management Console"
            error={fieldErrors.tagline}
            hint="Optional subtitle under the project name."
          />

          <TextField
            label="Footer Text"
            value={form.footer_text}
            onChange={(v) => set('footer_text', v)}
            disabled={loading}
            maxLength={2000}
            placeholder="© {year} Your Company · All rights reserved."
            error={fieldErrors.footer_text}
            hint="Shown across the bottom of every authenticated page. Use {year} to insert the current year."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FileField
              label="Logo"
              kind="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hint="PNG, JPG, WebP or SVG. Max 1 MB."
              value={form.logo_url}
              fileMissing={missingFiles.logo}
              onChange={(url) => {
                set('logo_url', url);
                setMissingFiles((m) => ({ ...m, logo: false }));
              }}
              disabled={loading}
              onResult={setResult}
            />
            <FileField
              label="Favicon"
              kind="favicon"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
              hint="ICO, PNG or SVG. Max 256 KB. Square images look best — 32×32 or 64×64."
              value={form.favicon_url}
              fileMissing={missingFiles.favicon}
              onChange={(url) => {
                set('favicon_url', url);
                setMissingFiles((m) => ({ ...m, favicon: false }));
              }}
              disabled={loading}
              onResult={setResult}
            />
          </div>
        </section>

        {/* Live preview */}
        <aside className="card p-6 space-y-3">
          <h2 className="font-semibold text-foreground">Preview</h2>
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
          <p className="text-xs text-muted-foreground">
            Changes apply across the app after saving and reloading.
          </p>
        </aside>

        {/* Palette */}
        <section className="card p-6 lg:col-span-3 space-y-4">
          <h2 className="font-semibold text-foreground">Color Palette</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <ColorField
              label="Primary"
              hint="Buttons, links, focus rings"
              value={form.primary_color}
              onChange={(v) => set('primary_color', v)}
              disabled={loading}
              error={fieldErrors.primary_color}
            />
            <ColorField
              label="Accent"
              hint="Subtle highlights"
              value={form.accent_color}
              onChange={(v) => set('accent_color', v)}
              disabled={loading}
              error={fieldErrors.accent_color}
            />
            <ColorField
              label="Sidebar Background"
              hint="Left nav surface"
              value={form.sidebar_bg}
              onChange={(v) => set('sidebar_bg', v)}
              disabled={loading}
              error={fieldErrors.sidebar_bg}
            />
            <ColorField
              label="Sidebar Text"
              hint="Default sidebar text color"
              value={form.sidebar_fg}
              onChange={(v) => set('sidebar_fg', v)}
              disabled={loading}
              error={fieldErrors.sidebar_fg}
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

      <ResultDialog result={result} onDismiss={dismissResult} />
    </>
  );
}

/** One line of red under an input, paired with `aria-invalid` on the control. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive mt-1" role="alert">
      {message}
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  required,
  maxLength,
  placeholder,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label className={required ? 'label required' : 'label'}>{label}</label>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
      />
      <FieldError message={error} />
      {hint && !error && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  // The native colour swatch only accepts `#rrggbb`; feeding it a half-typed
  // value makes it silently snap to black, which reads as the field resetting
  // itself while the user types. Hold the last valid colour instead.
  const swatch = useMemo(() => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'), [value]);
  const malformed = value.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <div>
      <label className="label required">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-12 rounded border border-input bg-white p-1"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} color picker`}
        />
        <input
          className="input flex-1 font-mono text-sm uppercase"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          placeholder="#000000"
          maxLength={7}
          aria-label={`${label} hex value`}
          aria-invalid={error || malformed ? true : undefined}
        />
      </div>
      <FieldError
        message={error ?? (malformed ? 'Enter a 6-digit hex colour, e.g. #2563eb.' : undefined)}
      />
      {hint && !error && !malformed && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}

/** Client-side guard rails, so an obviously wrong file never leaves the browser. */
const FILE_RULES: Record<'logo' | 'favicon', { maxBytes: number; exts: string[]; accepts: string }> = {
  logo: { maxBytes: 1024 * 1024, exts: ['.png', '.jpg', '.jpeg', '.webp', '.svg'], accepts: 'PNG, JPG, WebP or SVG' },
  favicon: { maxBytes: 256 * 1024, exts: ['.ico', '.png', '.svg'], accepts: 'ICO, PNG or SVG' },
};

function FileField({
  label,
  kind,
  accept,
  hint,
  value,
  fileMissing,
  onChange,
  disabled,
  onResult,
}: {
  label: string;
  kind: 'logo' | 'favicon';
  accept: string;
  hint?: string;
  value: string;
  fileMissing?: boolean;
  onChange: (url: string) => void;
  disabled?: boolean;
  onResult: (r: SaveResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Track *which* URL failed to render rather than a boolean, so replacing the
  // image clears the warning on its own — no effect needed to reset it.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = !!value && brokenUrl === value;

  async function handleFile(file: File) {
    const rules = FILE_RULES[kind];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    // Same two checks the server makes, phrased the same way. Catching them here
    // saves an upload of a file that was never going to be accepted, and the
    // server still enforces both — this is convenience, not the guarantee.
    if (!rules.exts.includes(ext)) {
      onResult({
        status: 'error',
        title: 'Not uploaded',
        message: `${label} must be ${rules.accepts} — "${file.name}" is ${ext || 'an unrecognised format'}.`,
      });
      return;
    }
    if (file.size > rules.maxBytes) {
      const asKb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
      onResult({
        status: 'error',
        title: 'Not uploaded',
        message: `${label} is ${asKb(file.size)} — the limit is ${asKb(rules.maxBytes)}. Choose a smaller file.`,
      });
      return;
    }

    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await safeFetchJson<Record<string, string>>(
      `/api/v1/application-settings/branding?kind=${kind}`,
      { method: 'POST', body: fd },
    );
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';

    if (!res.ok) {
      onResult({ status: 'error', title: 'Not uploaded', message: res.message, detail: res.detail });
      return;
    }

    onChange(res.data[kind === 'logo' ? 'logo_url' : 'favicon_url'] ?? '');
    onResult({
      status: 'success',
      title: 'Uploaded',
      message: `The ${label.toLowerCase()} has been saved. It appears across the app after the page reloads.`,
    });
  }

  async function handleClear() {
    if (!value) return;
    if (!confirm(`Remove the current ${label.toLowerCase()}?`)) return;

    setBusy(true);
    const res = await safeFetchJson(
      `/api/v1/application-settings/branding?kind=${kind}`,
      { method: 'DELETE' },
    );
    setBusy(false);

    if (!res.ok) {
      onResult({ status: 'error', title: 'Not removed', message: res.message, detail: res.detail });
      return;
    }
    onChange('');
    onResult({
      status: 'success',
      title: 'Removed',
      message: `The ${label.toLowerCase()} has been removed.`,
    });
  }

  // Two different failures, two different sentences: the server knows the file
  // is gone from disk, the browser knows the image would not render.
  const warning = fileMissing
    ? `The stored file is missing from the server. Upload the ${label.toLowerCase()} again.`
    : broken
      ? 'This image could not be displayed. It may be corrupt — try uploading it again.'
      : null;

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {value && !fileMissing && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={label}
              className="max-h-full max-w-full object-contain"
              onError={() => setBrokenUrl(value)}
            />
          ) : value ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
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
                className="btn-delete btn-icon"
                disabled={disabled || busy}
                title={`Remove ${label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {value && (
            <code className="text-xs text-muted-foreground truncate">{value}</code>
          )}
        </div>
      </div>
      {warning ? (
        <p className="text-xs text-destructive mt-1" role="alert">
          {warning}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}
