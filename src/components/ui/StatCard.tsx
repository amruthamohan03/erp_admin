// Small icon + label + value tile used in list page headers to
// surface stats endpoints (`/api/v1/<resource>/stats`). Extracted
// from quotations/page.tsx — now used by quotations, imports,
// exports, and licenses list pages.

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}

export default function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}
