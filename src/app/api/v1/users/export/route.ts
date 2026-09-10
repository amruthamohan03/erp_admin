import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usersT, roleMaster, mainOfficeMaster, departmentMaster } from '@/db/schema';
import { requireAuth, isResponse, withErrorHandler } from '@/lib/api';
import { recordAudit } from '@/lib/audit/recordAudit';
import { buildXlsx, xlsxResponse, dateStamp, type XlsxColumn } from '@/lib/xlsx';
import { formatDateTime } from '@/lib/formatDate';
import { userListQuerySchema } from '@/schemas';
import { USER_LIST_FIELDS, buildUserListWhere } from '../route';

// GET /api/v1/users/export?q=&status=&location_id=&dept_id=
//
// The users list as a spreadsheet. Same columns and the SAME filter as the
// screen, through the shared `buildUserListWhere` — an export of a filtered
// list must contain the rows that list was showing (§4.15, §4.10).
//
// No password, no image paths: a spreadsheet leaves the office, and neither is
// something anyone needs in one (§4.28's redaction reasoning applied at the
// boundary rather than after the fact).

const COLUMNS: XlsxColumn[] = [
  { key: 'username', header: 'Username', width: 18 },
  { key: 'full_name', header: 'Full Name', width: 26 },
  { key: 'email', header: 'Email', width: 30 },
  { key: 'mobile', header: 'Mobile', width: 16 },
  { key: 'role_name', header: 'Role', width: 20 },
  { key: 'location_name', header: 'Location', width: 18 },
  { key: 'department_name', header: 'Department', width: 18 },
  { key: 'status', header: 'Status', width: 12 },
  { key: 'created_at', header: 'Created', width: 18 },
];

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { searchParams } = new URL(req.url);
  const q = userListQuerySchema.parse({
    q: searchParams.get('q') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    location_id: searchParams.get('location_id') ?? undefined,
    dept_id: searchParams.get('dept_id') ?? undefined,
    page: '1',
    // The screen pages; a spreadsheet does not. Capped so one click cannot pull
    // an unbounded table into memory.
    pageSize: '100',
  });

  const rows = await db
    .select(USER_LIST_FIELDS)
    .from(usersT)
    .leftJoin(roleMaster, eq(roleMaster.id, usersT.roleId))
    .leftJoin(mainOfficeMaster, eq(mainOfficeMaster.id, usersT.locationId))
    .leftJoin(departmentMaster, eq(departmentMaster.id, usersT.deptId))
    .where(buildUserListWhere(q))
    .orderBy(usersT.id);

  const sheetRows = rows.map((r) => ({
    username: r.username,
    full_name: r.full_name,
    email: r.email,
    mobile: r.mobile ?? '',
    role_name: r.role_name ?? '',
    location_name: r.location_name ?? '',
    department_name: r.department_name ?? '',
    // The word, not the flag: 'Y' means nothing to someone reading the sheet.
    status: r.display === 'Y' ? 'Enabled' : 'Disabled',
    // §4.19 — a date somebody reads, so the house format.
    created_at: formatDateTime(r.created_at, ''),
  }));

  // §4.28 — exporting is itself a logged action, including what was exported.
  await recordAudit(db, {
    actorId: session.uid,
    action: 'export',
    entityType: 'user',
    entityId: 'list',
    module: 'users',
    after: { rows: sheetRows.length, status: q.status, filter: q.q?.trim() || null },
  });

  const buf = await buildXlsx([{ name: 'Users', columns: COLUMNS, rows: sheetRows }]);
  const res = xlsxResponse(buf, `users-${dateStamp()}.xlsx`);
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
});
