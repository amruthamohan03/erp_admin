'use client';

import { useRef, useState } from 'react';
import { Download, Loader2, Paperclip, Upload, X } from 'lucide-react';

// Single-file upload widget backed by /api/v1/files. Bytes flow:
// user picks a file → POST multipart to /api/v1/files with
// entity_type + entity_id → server writes bytes via the local
// storage backend and inserts a files_t row → returns { id, key,
// original_name } → widget calls onChange(row.id) and stores the
// file id for the parent form to persist.
//
// The parent form owns the file id (nullable integer). The widget
// only needs the current metadata to display; it fetches lazily via
// /api/v1/files/{id} when a value is set on mount.

export interface FileUploadValue {
  id: number;
  original_name: string;
  mime: string | null;
  size: number | null;
}

interface FileUploadProps {
  /**
   * Current file (null when unset). Parent typically holds only
   * the id in form state and fetches metadata separately for the
   * initial display; on upload the widget hands back a full value
   * and the parent stores the id.
   */
  value: FileUploadValue | null;
  onChange: (value: FileUploadValue | null) => void;
  entityType: string;
  /** Nullable — a create-mode form may not have an id yet. */
  entityId: string | null;
  label?: string;
  /** Max size in bytes; server also enforces, this is UX. */
  maxBytes?: number;
  accept?: string;
  disabled?: boolean;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function FileUpload({
  value,
  onChange,
  entityType,
  entityId,
  label,
  maxBytes = DEFAULT_MAX_BYTES,
  accept,
  disabled = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(`File too large (max ${fmtSize(maxBytes)})`);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('entity_type', entityType);
      if (entityId) form.append('entity_id', entityId);
      const res = await fetch('/api/v1/files', {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Upload failed');
        return;
      }
      onChange({
        id: json.data.id,
        original_name: json.data.original_name,
        mime: json.data.mime ?? null,
        size: json.data.size ?? null,
      });
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!value) return;
    if (!confirm(`Remove attached file "${value.original_name}"?`)) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/v1/files/${value.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message ?? 'Delete failed');
        return;
      }
      onChange(null);
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {label}
        </label>
      )}
      {value ? (
        <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-slate-50">
          <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <a
              href={`/api/v1/files/${value.id}/view`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary-600 hover:underline truncate block"
            >
              {value.original_name}
            </a>
            {value.size != null && (
              <div className="text-xs text-slate-500">{fmtSize(value.size)}</div>
            )}
          </div>
          <a
            href={`/api/v1/files/${value.id}/view`}
            className="p-1 text-slate-500 hover:text-primary-600"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading || disabled}
            className="p-1 text-slate-500 hover:text-red-600 disabled:opacity-50"
            title="Remove"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading || disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || disabled}
            className="btn-secondary w-full justify-center disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Choose file
              </>
            )}
          </button>
        </div>
      )}
      {error && (
        <div className="text-xs text-red-600 mt-1">{error}</div>
      )}
    </div>
  );
}
