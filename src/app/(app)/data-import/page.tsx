'use client';

import DataImportPage from '@/modules/data-import/DataImportPage';

// Data Import — upload a spreadsheet or a scanned document and create records
// in the chosen module. Each reviewed row is written through that module's own
// save route, so nothing here duplicates its rules (see db/queries/dataImport.ts).
export default function DataImportRoute() {
  return <DataImportPage />;
}
