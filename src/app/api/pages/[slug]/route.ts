// §4.12 — GET the structure of a transactional page (accordions + fields),
// already filtered by what the calling user's role can see. If ?entity_id=...
// is provided, current values from the target table are bundled in.
//
// Response shape (PageFetchResponse in src/types):
//   { page: { id, slug, title, route, accordions: [{ ...acc, permission, fields: [...] }] }, values: { ... } }
//
// Composite-key masters and other resources that aren't transactional pages
// must use their own endpoints; this route only serves master_page rows.
import { NextRequest } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  masterPage,
  masterPageAccordion,
  masterPageAccordionRole,
  masterPageAccordionField,
} from '@/db/schema';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { fetchEntityValues, safeColumnsFor, getPageTarget } from '@/lib/pages/targets';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return fail('Unauthorized', 401);

  const { slug } = await params;

  // Validate entity_id early — anything that isn't 'new' or a number is wrong.
  // Most common cause: the URL is /clients/<not-a-number> (e.g. someone typed
  // /clients/clients in the address bar).
  const { searchParams } = new URL(req.url);
  const entityIdRaw = searchParams.get('entity_id');
  if (entityIdRaw !== null && entityIdRaw !== 'new' && Number.isNaN(Number(entityIdRaw))) {
    return fail(
      `entity_id must be a numeric id or 'new'; got '${entityIdRaw}'`,
      400,
      { hint: 'Valid client URLs: /clients (list), /clients/new (create), /clients/<id> (edit).' },
    );
  }

  try {
    return await loadPage(req, slug, session.role_id, entityIdRaw);
  } catch (err) {
    // Defensive: anything that throws inside this handler MUST still produce a
    // JSON response. If our own error analysis throws, fall back to a bare 500.
    try {
      // eslint-disable-next-line no-console
      console.error('[pages.GET]', err);
      const info = describeDbError(err);
      // 42P01 = undefined_table, 42703 = undefined_column.
      if (info.code === '42P01') {
        return fail(
          'Page master tables not found — run `pnpm db:migrate` to apply migrations 0039–0042.',
          500,
          { sqlstate: '42P01', detail: info.fullMessage },
        );
      }
      if (info.code === '42703') {
        return fail(
          'A column referenced by the page runtime does not exist — partial migration. Try `pnpm db:generate` + `pnpm db:migrate`.',
          500,
          { sqlstate: '42703', detail: info.fullMessage },
        );
      }
      return fail('Server error loading page', 500, {
        sqlstate: info.code,
        detail: info.fullMessage,
      });
    } catch (fallback) {
      // eslint-disable-next-line no-console
      console.error('[pages.GET fallback]', fallback);
      return fail('Server error (error handler crashed)', 500, {
        original: safeStringify(err),
        fallbackError: safeStringify(fallback),
      });
    }
  }
}

function describeDbError(err: unknown): { code: string | undefined; fullMessage: string } {
  // Walk the cause chain. Drizzle wraps pg errors in a DrizzleQueryError-like
  // object whose .message starts with "Failed query: ..." and whose .cause is
  // the original pg error (with .code = SQLSTATE).
  const messages: string[] = [];
  let code: string | undefined;
  let cur: unknown = err;
  const seen = new WeakSet<object>();

  while (cur && typeof cur === 'object') {
    if (seen.has(cur as object)) break;
    seen.add(cur as object);
    const obj = cur as Record<string, unknown>;
    if (typeof obj.message === 'string') messages.push(obj.message);
    if (!code && typeof obj.code === 'string') code = obj.code;
    cur = obj.cause;
  }

  return {
    code,
    fullMessage:
      messages.length > 0
        ? messages.join(' | ')
        : (typeof err === 'string' ? err : 'Unknown error'),
  };
}

function safeStringify(v: unknown): string {
  try {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

async function loadPage(
  req: NextRequest,
  slug: string,
  roleId: number,
  entityIdRaw: string | null,
) {
  // 1) Load the page row.
  const [page] = await db
    .select({
      id: masterPage.id,
      slug: masterPage.slug,
      title: masterPage.title,
      route: masterPage.route,
      target_table: masterPage.targetTable,
    })
    .from(masterPage)
    .where(and(eq(masterPage.slug, slug), eq(masterPage.display, 'Y')))
    .limit(1);

  if (!page) return fail('Page not found', 404);

  // Defensive: refuse to serve a page whose target_table isn't in the runtime
  // whitelist. This stops a misconfigured master_page row from exposing a table
  // the runtime can't safely query.
  if (!getPageTarget(slug)) {
    return fail('Page target is not registered in the runtime', 500);
  }

  // 2) Load accordions the user's role has access to. We join through
  //    role_id = session.role_id (each user has one role today).
  const accordionRows = await db
    .select({
      id: masterPageAccordion.id,
      slug: masterPageAccordion.slug,
      title: masterPageAccordion.title,
      icon: masterPageAccordion.icon,
      display_order: masterPageAccordion.displayOrder,
      permission: masterPageAccordionRole.permission,
    })
    .from(masterPageAccordion)
    .innerJoin(
      masterPageAccordionRole,
      eq(masterPageAccordionRole.accordionId, masterPageAccordion.id),
    )
    .where(
      and(
        eq(masterPageAccordion.pageId, page.id),
        eq(masterPageAccordion.display, 'Y'),
        eq(masterPageAccordionRole.roleId, roleId),
      ),
    )
    .orderBy(asc(masterPageAccordion.displayOrder));

  if (accordionRows.length === 0) {
    // The user's role has no view/edit grant on any accordion of this page —
    // surface it as 403 so the client doesn't silently render an empty form.
    return fail('No accordion on this page is visible to your role', 403);
  }

  // 3) Bulk-load fields for the visible accordions in one query.
  const accordionIds = accordionRows.map((a) => a.id);
  const fieldRows = await db
    .select({
      id: masterPageAccordionField.id,
      accordion_id: masterPageAccordionField.accordionId,
      name: masterPageAccordionField.name,
      label: masterPageAccordionField.label,
      field_type: masterPageAccordionField.fieldType,
      required: masterPageAccordionField.required,
      options_source: masterPageAccordionField.optionsSource,
      options_label_field: masterPageAccordionField.optionsLabelField,
      options_static: masterPageAccordionField.optionsStatic,
      props: masterPageAccordionField.props,
      display_order: masterPageAccordionField.displayOrder,
    })
    .from(masterPageAccordionField)
    .where(
      and(
        inArray(masterPageAccordionField.accordionId, accordionIds),
        eq(masterPageAccordionField.display, 'Y'),
      ),
    )
    .orderBy(asc(masterPageAccordionField.displayOrder));

  // Group fields under their accordion.
  const fieldsByAcc = new Map<number, typeof fieldRows>();
  for (const f of fieldRows) {
    const list = fieldsByAcc.get(f.accordion_id);
    if (list) list.push(f);
    else fieldsByAcc.set(f.accordion_id, [f]);
  }

  const accordions = accordionRows.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    icon: a.icon,
    display_order: a.display_order,
    permission: a.permission,
    fields: (fieldsByAcc.get(a.id) ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      label: f.label,
      field_type: f.field_type,
      required: f.required,
      options_source: f.options_source,
      options_label_field: f.options_label_field,
      options_static: f.options_static,
      props: f.props,
      display_order: f.display_order,
    })),
  }));

  // 4) If an entity id is supplied, fetch values for the visible columns only.
  // entityIdRaw was already validated to be null, 'new', or a numeric string.
  let values: Record<string, unknown> = {};
  if (entityIdRaw && entityIdRaw !== 'new') {
    const entityId = Number(entityIdRaw);
    const allFieldNames = accordions.flatMap((a) => a.fields.map((f) => f.name));
    const safe = safeColumnsFor(slug, allFieldNames);
    const row = await fetchEntityValues(slug, entityId, safe);
    if (row) values = row;
  }

  return ok({
    page: {
      id: page.id,
      slug: page.slug,
      title: page.title,
      route: page.route,
      accordions,
    },
    values,
  });
}
