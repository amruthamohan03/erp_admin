'use client';

import { FileSpreadsheet } from 'lucide-react';
import DashboardCardsGrid from '@/components/ui/DashboardCardsGrid';

// Excel Report — what the main dashboard used to be.
//
// The same role-scoped cards from `dashboard_card_master_t`, but each one is a
// DOWNLOAD rather than a link: the tile shows how many rows it holds, and
// clicking it returns exactly those rows as a spreadsheet. The figure and the
// sheet narrow through the same key, so a card saying 42 cannot hand over a
// file of four hundred (§4.10, §4.15).
export default function ExcelReportPage() {
  return (
    <>
      <div className="card mb-6 p-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <FileSpreadsheet className="h-6 w-6 text-emerald-600" /> Excel Report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Click any card to download those records as a spreadsheet. The number on
          the card is how many rows the file will contain. A dimmed card has no
          export configured — set one on Masters → Dashboard Cards.
        </p>
      </div>
      <DashboardCardsGrid mode="export" />
    </>
  );
}
