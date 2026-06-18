// Tiny CSV utility. No third-party deps; output is RFC-4180-compatible and
// opens directly in Excel / LibreOffice / Sheets without any prompting.
//
// Quoting rule: a field is quoted if it contains a comma, double quote, CR, or LF.
// Embedded double quotes are escaped by doubling them.

export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T & string; header: string }>,
): string {
  const headerLine = columns.map((c) => csvField(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => csvField(row[c.key])).join(','),
  );
  // Excel handles \r\n best.
  return [headerLine, ...bodyLines].join('\r\n');
}

export function csvResponse(content: string, filename: string): Response {
  // UTF-8 BOM so Excel correctly detects encoding for accented characters.
  const body = '﻿' + content;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function dateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
