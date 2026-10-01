/**
 * Turn an HS-code spreadsheet into a committed migration.
 *
 *   pnpm tsx scripts/seed-hscodes.ts <file.xlsx|file.csv> [--out drizzle/0131_hscode_seed.sql]
 *
 * It does NOT write to the database. §7.2 is explicit that a data change ships
 * as a migration — "if a change is not in drizzle/, it does not exist" — so
 * this reads the file, maps three columns and emits SQL for review. Applying it
 * is `pnpm db:migrate`, the same path every other change takes, which is what
 * makes a fresh database arrive at the same catalogue.
 *
 * Columns taken (headers matched loosely — case, spaces and punctuation are
 * ignored, so "HS Code without Space" and "hscode_without_space" both land):
 *
 *   HS Code without Space  → hscode_number
 *   DDi                    → hscode_ddi
 *   <any date column>      → created_at / updated_at
 *
 * Everything else takes the column default: the other four rates are 0.00 and
 * `requires_green_certificate` is NULL, which means "follow the prefix rules"
 * (0124) rather than "exempt".
 *
 * exceljs is already a dependency (it builds every Excel export), so this adds
 * none. A PDF cannot be read here — convert it to CSV or XLSX first, because
 * splitting a tariff schedule back into columns by guesswork is wrong in a way
 * nobody notices until a duty rate is wrong on a real file.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

type Row = Record<string, string>;

/** Headers compare on letters and digits alone — layout punctuation is noise. */
function key(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

const CODE_KEYS = ['hscodewithoutspace', 'hscodewithoutspaces', 'hscodenospace', 'hscode', 'code'];
const DDI_KEYS = ['ddi', 'ddivalue', 'hscodeddi', 'droitdedouane'];

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find((h) => key(h) === c);
    if (hit) return hit;
  }
  // Fall back to a header that merely CONTAINS the best candidate, so a sheet
  // with a slightly different wording still loads rather than failing outright.
  const hit = headers.find((h) => key(h).includes(candidates[0]));
  return hit ?? null;
}

function findDateColumn(headers: string[]): string | null {
  return headers.find((h) => key(h).includes('date')) ?? null;
}

async function readXlsx(path: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });

  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Row = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = row.getCell(i + 1).value;
      // A date cell comes back as a Date; everything else as text or number.
      r[h] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim();
    });
    rows.push(r);
  });
  return rows;
}

/** Minimal RFC-4180 split — quoted fields, doubled quotes, commas inside quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(path: string): Row[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/u, '');
  const lines = text.split(/\r?\n/u).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const r: Row = {};
    headers.forEach((h, i) => {
      if (h) r[h] = cells[i] ?? '';
    });
    return r;
  });
}

/**
 * The DRC tariff PDF, whose rows are `010121 00 00  01/01/2022`.
 *
 * Read with `pdftotext -layout`, which is the only mode that keeps a row on one
 * line — the plain mode emits the table COLUMN BY COLUMN (every code, then
 * every date), which would pair them by position and silently misalign the
 * moment one column had a gap.
 *
 * The document's Description and its five rate columns are NOT in the text
 * layer at all — only the code and the date are. They are drawn rather than
 * set as text, so nothing here can recover them; every rate therefore takes its
 * column default and the catalogue arrives with codes and dates only.
 */
function readPdf(path: string): Row[] {
  const text = execFileSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });

  const rows: Row[] = [];
  // Anchored on the row shape rather than on a header, because the header is a
  // legend ("1 DDI, 2 ICA, …") that does not sit above the columns.
  const LINE = /(\d{6})\s+(\d{2})\s+(\d{2})\s+(\d{2}\/\d{2}\/\d{4})/u;
  for (const line of text.split(/\r?\n/u)) {
    const m = LINE.exec(line);
    if (!m) continue;
    rows.push({
      // Synthetic headers, so the PDF feeds the same dedupe, normalisation and
      // SQL generation as a spreadsheet does (§4.10).
      'HS Code without Space': `${m[1]}${m[2]}${m[3]}`,
      Date: m[4],
    });
  }
  return rows;
}

/**
 * The code, reduced to its digits.
 *
 * Digits only, not merely space-stripped: `pdftotext` prefixes a FORM FEED to
 * the first row of every page, and a form feed is invisible. Stripped by hand
 * it would have put 291 codes into the catalogue carrying a control character —
 * indistinguishable on screen, never matching a lookup, and impossible to spot
 * in review.
 */
function normaliseCode(v: string): string {
  return v.replace(/\D/gu, '');
}

/**
 * A rate as `numeric(5,2)` accepts it: 0–999.99, two decimals.
 *
 * An unreadable or out-of-range value becomes the column default rather than
 * failing the whole load — one bad cell in several thousand should not stop the
 * catalogue arriving, and a rate left at 0.00 is visible and fixable on the
 * screen, where a missing code is not.
 */
function normaliseRate(v: string): string | null {
  const cleaned = v.replace(/[%\s,]/gu, '');
  if (cleaned === '') return null;

  // EXEM — the tariff's marker for an EXEMPT line, which is a real rate of
  // zero, not a missing value. Recognised by name rather than falling through
  // to the unreadable path, because "skipped" and "0%" are different outcomes
  // and only one of them is right here.
  //
  // Note that the column cannot record WHY a rate is zero: an exempt line and
  // a line nobody has filled in both read 0.00. Preserving the distinction
  // would need a flag of its own.
  if (/^exem/iu.test(cleaned)) return '0.00';

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 999.99) return null;
  return n.toFixed(2);
}

/** `YYYY-MM-DD` if the cell holds a date, else null. */
function normaliseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/u.test(v)) return v.slice(0, 10);

  // DAY-FIRST, explicitly. The source writes 25/01/2022 and `new Date()` reads
  // a slashed date as month-first, so it would call that one Invalid Date and
  // — worse — read 01/07/2022 as 7 January instead of 1 July, silently. §4.19
  // exists for exactly this ambiguity; here it decides whether a date is kept
  // at all.
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(v.trim());
  if (dmy) {
    const [, d, m, y] = dmy;
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const q = (s: string): string => `'${s.replace(/'/gu, "''")}'`;

async function main(): Promise<void> {
  const [path, ...rest] = process.argv.slice(2);
  if (!path) {
    console.error('Usage: pnpm tsx scripts/seed-hscodes.ts <file.pdf|.xlsx|.csv> [--update-rates] [--out <path.sql>]');
    process.exit(1);
  }
  const outIdx = rest.indexOf('--out');
  // `--update-rates` sets DDI on codes that already exist, rather than creating
  // them. Two modes, two statements — see the block that builds the UPDATE.
  const updateRates = rest.includes('--update-rates');
  const out =
    outIdx >= 0
      ? rest[outIdx + 1]
      : updateRates
        ? 'drizzle/0132_hscode_ddi_rates.sql'
        : 'drizzle/0131_hscode_seed.sql';

  const lower = path.toLowerCase();
  const rows = lower.endsWith('.pdf')
    ? readPdf(path)
    : lower.endsWith('.csv')
      ? readCsv(path)
      : await readXlsx(path);
  if (rows.length === 0) {
    console.error('That file has no data rows.');
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  const codeCol = findColumn(headers, CODE_KEYS);
  const ddiCol = findColumn(headers, DDI_KEYS);
  const dateCol = findDateColumn(headers);

  console.log(`Headers found : ${headers.join(' | ')}`);
  console.log(`HS code column: ${codeCol ?? '(none — cannot continue)'}`);
  console.log(`DDI column    : ${ddiCol ?? '(none — DDI will default to 0.00)'}`);
  console.log(`Date column   : ${dateCol ?? '(none — created_at defaults to now)'}`);

  if (!codeCol) {
    console.error('\nNo HS code column. Expected a header like "HS Code without Space".');
    process.exit(1);
  }

  // Deduplicated on the code: the table carries a unique index on
  // hscode_number where display='Y', so a repeat in the sheet would abort the
  // insert. First occurrence wins and the rest are reported.
  const seen = new Map<string, { code: string; ddi: string | null; date: string | null }>();
  let blank = 0;
  let dupes = 0;
  let badRate = 0;

  for (const r of rows) {
    const code = normaliseCode(r[codeCol] ?? '');
    if (!code) {
      blank++;
      continue;
    }
    if (seen.has(code)) {
      dupes++;
      continue;
    }
    const rawRate = ddiCol ? (r[ddiCol] ?? '') : '';
    const ddi = normaliseRate(rawRate);
    if (ddiCol && rawRate !== '' && ddi === null) badRate++;
    seen.set(code, { code, ddi, date: dateCol ? normaliseDate(r[dateCol] ?? '') : null });
  }

  const source = path.replace(/\\/gu, '/');

  // ── rates-only mode ──────────────────────────────────────────────────────
  //
  // The catalogue is already seeded, and the seed is `ON CONFLICT DO NOTHING`
  // by design — so a second INSERT of the same codes with real rates would do
  // precisely nothing. Setting a rate on an existing code is an UPDATE, and it
  // is a different statement rather than an option on the same one because the
  // two must never be confused: one creates, the other overwrites.
  if (updateRates) {
    const rated = [...seen.values()].filter((r) => r.ddi !== null);
    if (rated.length === 0) {
      console.error('\nNo readable DDI values in that file — nothing to update.');
      process.exit(1);
    }

    const pairs = rated.map((r) => `    (${q(r.code)}, ${q(r.ddi as string)})`).join(',\n');
    const updateSql = `-- HS code DDI rates, from ${source}.
--
-- §7.2 — a data correction ships as a migration, never typed into a database by
-- hand. Generated by scripts/seed-hscodes.ts --update-rates; regenerate rather
-- than hand-editing.
--
-- An UPDATE, not an INSERT: 0131 seeded the catalogue with every rate at its
-- 0.00 default because the source PDF carried no rate values, and that seed is
-- ON CONFLICT DO NOTHING — so re-inserting these codes would change nothing.
--
-- One statement over a VALUES list rather than ${rated.length} separate
-- UPDATEs: the whole correction is a single pass, and a code the catalogue does
-- not have simply matches no row instead of failing the migration.
UPDATE "hscode_master_t" AS h
   SET "hscode_ddi" = v.ddi::numeric(5,2),
       "updated_at" = CURRENT_TIMESTAMP
  FROM (VALUES
${pairs}
  ) AS v(code, ddi)
 WHERE h."hscode_number" = v.code
   AND h."display" = 'Y'
   -- Only where it would actually change something, so a re-run touches no
   -- rows and leaves updated_at alone on everything already correct.
   AND h."hscode_ddi" IS DISTINCT FROM v.ddi::numeric(5,2);
`;

    writeFileSync(out, updateSql, 'utf8');
    console.log(`\nRows in file  : ${rows.length}`);
    console.log(`Codes with DDI: ${rated.length}`);
    console.log(`No DDI value  : ${seen.size - rated.length} (skipped — an unreadable rate must not overwrite a good one)`);
    if (blank) console.log(`Blank codes   : ${blank} (skipped)`);
    if (dupes) console.log(`Duplicates    : ${dupes} (first occurrence kept)`);
    if (badRate) console.log(`Unreadable DDI: ${badRate} (skipped)`);
    console.log(`\nWrote ${out}`);
    console.log('Next: add it to drizzle/meta/_journal.json, review the SQL, then pnpm db:migrate');
    return;
  }

  const values = [...seen.values()]
    .map((r) => {
      const ddi = r.ddi === null ? 'DEFAULT' : q(r.ddi);
      // Both timestamps take the sheet's date, so a row reads as having been
      // created then rather than created then and immediately edited.
      const at = r.date === null ? 'DEFAULT' : `${q(r.date)}::timestamp`;
      return `  (${q(r.code)}, ${ddi}, ${at}, ${at})`;
    })
    .join(',\n');

  const sql = `-- HS code catalogue, seeded from ${path.replace(/\\/gu, '/')}.
--
-- §7.2 — reference data ships as a migration, never typed into a database by
-- hand, so a fresh environment reaches the same catalogue. Generated by
-- scripts/seed-hscodes.ts; regenerate rather than hand-editing.
--
-- Only the three columns the source carries are set. The other four rates take
-- their 0.00 default and \`requires_green_certificate\` stays NULL, which means
-- "follow the prefix rules" (0124) rather than "exempt" — so a prefix rule
-- added later covers these codes automatically.
--
-- ON CONFLICT DO NOTHING against the partial unique index on hscode_number:
-- re-running this must not duplicate the catalogue, and must not overwrite a
-- rate an operator has since corrected on screen.
INSERT INTO "hscode_master_t"
  ("hscode_number", "hscode_ddi", "created_at", "updated_at")
VALUES
${values}
ON CONFLICT DO NOTHING;
`;

  writeFileSync(out, sql, 'utf8');

  console.log(`\nRows in file  : ${rows.length}`);
  console.log(`Codes written : ${seen.size}`);
  if (blank) console.log(`Blank codes   : ${blank} (skipped)`);
  if (dupes) console.log(`Duplicates    : ${dupes} (first occurrence kept)`);
  if (badRate) console.log(`Unreadable DDI: ${badRate} (left at the 0.00 default)`);
  console.log(`\nWrote ${out}`);
  console.log('Next: add it to drizzle/meta/_journal.json, review the SQL, then pnpm db:migrate');
}

main().catch((e: unknown) => {
  console.error(String(e));
  process.exit(1);
});
