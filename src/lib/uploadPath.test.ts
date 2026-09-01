import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveUploadPath, uploadMimeFor } from '@/lib/storage';

// The containment check that stands between an untrusted path and the
// filesystem. It is shared by the existence check, the delete and the serving
// route, so these cases cover all three at once.

const ROOT = path.join(process.cwd(), 'public', 'uploads');
const inside = (p: string | null) =>
  p !== null && !path.relative(ROOT, p).startsWith('..') && path.relative(ROOT, p) !== '';

describe('resolveUploadPath', () => {
  it('resolves a stored public URL to a path under the uploads root', () => {
    const p = resolveUploadPath('/uploads/branding/0/logo.png');
    expect(inside(p)).toBe(true);
    expect(p).toBe(path.join(ROOT, 'branding', '0', 'logo.png'));
  });

  it('resolves the route segments to the same place as the URL', () => {
    expect(resolveUploadPath(['branding', '0', 'logo.png'])).toBe(
      resolveUploadPath('/uploads/branding/0/logo.png'),
    );
  });

  it.each([
    ['../../../package.json'],
    ['branding/../../../.env'],
    ['branding/0/../../../../package.json'],
    ['..'],
    ['../'],
  ])('refuses to escape the uploads root: %s', (evil) => {
    expect(resolveUploadPath(evil)).toBeNull();
  });

  it('refuses an absolute path', () => {
    expect(resolveUploadPath(['/etc/passwd'])).toBeNull();
  });

  // A NUL truncates the string at the syscall boundary, so a name that looks
  // safe to a string check can open a different file entirely.
  it('refuses a path containing a NUL byte', () => {
    expect(resolveUploadPath('branding/0/logo.png\0../../../.env')).toBeNull();
  });

  // A plain startsWith(UPLOADS_ROOT) check would accept a sibling directory
  // whose name merely begins with the root's name.
  it('refuses a sibling directory sharing the root prefix', () => {
    expect(resolveUploadPath('../uploads-backup/secret.png')).toBeNull();
  });

  it('refuses the root itself — a directory is not a file to serve', () => {
    expect(resolveUploadPath([])).toBeNull();
    expect(resolveUploadPath('/uploads/')).toBeNull();
  });
});

describe('uploadMimeFor', () => {
  it('maps the formats the uploader accepts', () => {
    expect(uploadMimeFor('/x/logo.png')).toBe('image/png');
    expect(uploadMimeFor('/x/photo.JPG')).toBe('image/jpeg');
    expect(uploadMimeFor('/x/mark.svg')).toBe('image/svg+xml');
    expect(uploadMimeFor('/x/site.ico')).toBe('image/x-icon');
  });

  // The serving route hands back null-typed files as 404 rather than guessing,
  // so anything that reached the folder by another route is not served.
  it('returns null for anything else', () => {
    expect(uploadMimeFor('/x/notes.txt')).toBeNull();
    expect(uploadMimeFor('/x/backup.zip')).toBeNull();
    expect(uploadMimeFor('/x/script.js')).toBeNull();
    expect(uploadMimeFor('/x/noextension')).toBeNull();
  });
});
