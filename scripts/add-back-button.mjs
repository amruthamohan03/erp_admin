// Bulk-inserts <BackButton /> into every page that uses <DashboardShell>.
// One-shot script — run once after the BackButton component lands.
//
//   node scripts/add-back-button.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pages that use <DashboardShell> directly. /clients/[id] is excluded — it
// renders via <TransactionalPage> which wraps DashboardShell, so the back
// button gets added to that component instead. /dashboard is excluded per
// CLAUDE.md §4.13.
const FILES = [
  'src/app/clients/page.tsx',
  'src/app/masters/pages/page.tsx',
  'src/app/masters/pages/[id]/page.tsx',
  'src/app/masters/referers/page.tsx',
  'src/app/masters/phases/page.tsx',
  'src/app/masters/roles/page.tsx',
  'src/app/masters/industries/page.tsx',
  'src/app/masters/origins/page.tsx',
  'src/app/masters/type-of-goods/page.tsx',
  'src/app/masters/commodities/page.tsx',
  'src/app/masters/expense-types/page.tsx',
  'src/app/masters/regimes/page.tsx',
  'src/app/masters/units/page.tsx',
  'src/app/masters/transport-modes/page.tsx',
  'src/app/masters/transit-points/page.tsx',
  'src/app/masters/truck-statuses/page.tsx',
  'src/app/masters/clearing-statuses/page.tsx',
  'src/app/masters/clearances/page.tsx',
  'src/app/masters/document-statuses/page.tsx',
  'src/app/masters/departments/page.tsx',
  'src/app/masters/currencies/page.tsx',
  'src/app/masters/kinds/page.tsx',
  'src/app/masters/banks/page.tsx',
  'src/app/masters/main-offices/page.tsx',
  'src/app/masters/office-locations/page.tsx',
  'src/app/masters/incoterms/page.tsx',
  'src/app/masters/hscodes/page.tsx',
  'src/app/masters/feet-containers/page.tsx',
  'src/app/masters/group-companies/page.tsx',
  'src/app/masters/provinces/page.tsx',
  'src/app/masters/done-by/page.tsx',
  'src/app/masters/invoice-banks/page.tsx',
  'src/app/masters/bank-exchange-rates/page.tsx',
  'src/app/settings/application/page.tsx',
  'src/app/mapping/roletodashboardcard/page.tsx',
  'src/app/mapping/roletomenu/page.tsx',
  'src/app/masters/dashboard-cards/page.tsx',
  'src/app/masters/menu/page.tsx',
  'src/app/masters/users/page.tsx',
  'src/app/settings/page.tsx',
];

let updated = 0, alreadyHad = 0, notFound = 0;

for (const rel of FILES) {
  const path = join(repoRoot, rel);
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    console.log('NOT FOUND:', rel);
    notFound++;
    continue;
  }

  if (content.includes("from '@/components/ui/BackButton'")) {
    alreadyHad++;
    continue;
  }

  // 1) Add the import directly after the DashboardShell import line.
  const importLine = "import DashboardShell from '@/components/layout/DashboardShell';";
  if (!content.includes(importLine)) {
    console.log('NO DashboardShell IMPORT — skipped:', rel);
    continue;
  }
  content = content.replace(
    importLine,
    `${importLine}\nimport BackButton from '@/components/ui/BackButton';`,
  );

  // 2) Insert <BackButton /> after the first <DashboardShell> opening tag.
  //    The leading newline matches typical indentation.
  content = content.replace(
    '<DashboardShell>',
    '<DashboardShell>\n      <div className="mb-4"><BackButton /></div>',
  );

  writeFileSync(path, content, 'utf8');
  updated++;
  console.log('updated:', rel);
}

console.log();
console.log(`Done: ${updated} updated, ${alreadyHad} already had BackButton, ${notFound} not found.`);
