// What may be attached to an outbound email or WhatsApp message.
//
// Pure, so the composer rejects a file the moment it is picked with the same
// sentence the send route would give (§4.23).

export const MAX_ATTACHMENTS = 10;
/** Per file. WhatsApp documents allow 100 MB, but most mail servers stop near 25 MB in total. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Executable and script types that mail servers bounce and recipients should never be sent. */
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'msi', 'msp', 'vbs', 'vbe', 'js', 'jse', 'jar',
  'ps1', 'psm1', 'wsf', 'wsh', 'hta', 'cpl', 'reg', 'lnk', 'dll', 'sh', 'app', 'iso',
]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachmentLike {
  name: string;
  size: number;
}

/** The first reason these files cannot be sent, or null when they can. */
export function attachmentError(files: ReadonlyArray<AttachmentLike>): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `Attachments: ${files.length} files chosen — the limit is ${MAX_ATTACHMENTS} per message. Remove some.`;
  }
  for (const f of files) {
    const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : '';
    if (BLOCKED_EXT.has(ext)) {
      return `Attachment "${f.name}" is a .${ext} file — programs and scripts cannot be sent. Zip it or send a document instead.`;
    }
    if (f.size === 0) return `Attachment "${f.name}" is empty — choose the file again.`;
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return `Attachment "${f.name}" is ${formatBytes(f.size)} — the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)} per file. Choose a smaller file.`;
    }
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return `Attachments total ${formatBytes(total)} — the limit is ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} per message. Remove a file or send it separately.`;
  }
  return null;
}
