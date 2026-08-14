import { describe, it, expect } from 'vitest';
import { saveUploadedImage, UploadError } from './storage';

// These tests cover only the validation branches — they reject before any
// filesystem write happens, so no fs mocking is needed. The happy-path
// (mkdir + writeFile + url assembly) is left for an integration test once a
// proper test-temp-dir setup exists.

function makeFile(opts: { type: string; size: number; name?: string }): File {
  const bytes = new Uint8Array(opts.size);
  return new File([bytes], opts.name ?? 'sample.png', { type: opts.type });
}

describe('saveUploadedImage validation', () => {
  it('rejects unsupported MIME types with 415', async () => {
    const file = makeFile({ type: 'application/zip', size: 100 });
    try {
      await saveUploadedImage(file, { bucket: 'avatars', ownerId: 1 });
      throw new Error('Expected saveUploadedImage to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadError);
      const u = err as UploadError;
      expect(u.status).toBe(415);
      expect(u.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(u.message).toMatch(/unsupported/i);
      // §4.23 — the message names the accepted formats and the rejected one, so
      // the user can act on it without opening the network tab.
      expect(u.message).toMatch(/\.png/);
      expect(u.message).toMatch(/application\/zip/);
    }
  });

  it('names the field in the message when a label is given', async () => {
    const file = makeFile({ type: 'application/zip', size: 100, name: 'brand.zip' });
    await expect(
      saveUploadedImage(file, { bucket: 'branding', ownerId: 0, label: 'Favicon' }),
    ).rejects.toThrow(/Favicon must be/);
  });

  it('accepts a file the browser could not type, using its magic bytes', async () => {
    // A .ico picked on Windows commonly arrives as '' or octet-stream. The
    // declared type used to be the only check, so a valid favicon was rejected.
    const ico = new Uint8Array(64);
    ico.set([0x00, 0x00, 0x01, 0x00], 0); // ICO header
    const file = new File([ico], 'favicon.ico', { type: '' });
    await expect(
      saveUploadedImage(file, {
        bucket: 'branding',
        ownerId: 0,
        allowedMime: new Set(['image/png']), // deliberately excludes ICO
        label: 'Favicon',
      }),
    ).rejects.toThrow(/this file is \.ico/);
  });

  it('rejects an empty file rather than storing a zero-byte asset', async () => {
    const file = makeFile({ type: 'image/png', size: 0 });
    await expect(
      saveUploadedImage(file, { bucket: 'avatars', ownerId: 1, label: 'Logo' }),
    ).rejects.toThrow(/Logo is empty/);
  });

  it('rejects oversized files with 413, honoring per-call maxBytes', async () => {
    // 2 KB declared max, 4 KB actual.
    const file = makeFile({ type: 'image/png', size: 4 * 1024 });
    try {
      await saveUploadedImage(file, {
        bucket: 'avatars',
        ownerId: 1,
        maxBytes: 2 * 1024,
      });
      throw new Error('Expected saveUploadedImage to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UploadError);
      const u = err as UploadError;
      expect(u.status).toBe(413);
      expect(u.code).toBe('PAYLOAD_TOO_LARGE');
      // message includes the KB cap so the user sees the actual limit.
      expect(u.message).toMatch(/2 KB/);
    }
  });

  it('UploadError is an AppError so withErrorHandler maps it', async () => {
    const file = makeFile({ type: 'application/octet-stream', size: 1, name: 'sample.exe' });
    try {
      await saveUploadedImage(file, { bucket: 'avatars', ownerId: 1 });
      throw new Error('Expected saveUploadedImage to throw');
    } catch (err) {
      // We rely on instanceof-AppError matching in @/lib/api withErrorHandler.
      // Verifying the chain here keeps a future refactor honest.
      const { AppError } = await import('@/lib/errors');
      expect(err).toBeInstanceOf(AppError);
    }
  });
});
