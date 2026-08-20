// GET /api/v1/audit-log/export — the filtered trail as .xlsx.
//
// §4.28, twice over: exporting the audit log is its own permission, AND the
// export is itself an audited action. Someone taking a copy of who-did-what is
// exactly the event an investigation later needs to see.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, isResponse, withErrorHandler } from '@/lib/api';
import { buildXlsx, xlsxResponse, dateStamp } from '@/lib/xlsx';
import { recordAudit } from '@/lib/audit/recordAudit';
import { auditForExport } from '@/db/queries/auditLog';
import { AUDIT_MENU, parseAuditQuery } from '@/schemas/audit-log';
import { formatDateTime } from '@/lib/formatDate';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requirePermission(AUDIT_MENU, 'exportAudit');
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const filters = parseAuditQuery(searchParams);
  const rows = await auditForExport(filters);

  const buf = await buildXlsx([
    {
      name: 'Audit Log',
      columns: [
        { key: 'created_at', header: 'When', width: 20 },
        { key: 'actor_name', header: 'User', width: 24 },
        { key: 'actor_role', header: 'Role', width: 18 },
        { key: 'action', header: 'Action', width: 18 },
        { key: 'module', header: 'Module', width: 22 },
        { key: 'entity_type', header: 'Record Type', width: 24 },
        { key: 'entity_id', header: 'Record', width: 14 },
        { key: 'change_count', header: 'Fields Changed', width: 15 },
        { key: 'ip_address', header: 'IP Address', width: 18 },
        { key: 'user_agent', header: 'Device / Browser', width: 46 },
      ],
      rows: rows.map((r) => ({
        ...r,
        created_at: formatDateTime(r.created_at),
        actor_name: r.actor_name ?? 'System',
      })),
    },
  ]);

  // Logged before the bytes leave, and outside any transaction the read used —
  // the export has already happened as far as the operator is concerned.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'audit-log',
    entityId: 'export',
    module: 'audit-log',
    metadata: { row_count: rows.length, filters },
  });

  const res = xlsxResponse(buf, `audit-log-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});

