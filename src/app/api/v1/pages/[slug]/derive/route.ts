// §4.12 derive runtime — resolve the ASYNC derives (fromRelated / template) for a
// page when a trigger field changes. The client posts the changed field name +
// the current form values; we return a map of { fieldName: derivedValue } for
// every field whose derive triggers on that field. Pure derives (statusMap /
// formula) are computed client-side and re-checked on save, not here.
import { NextRequest } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { masterPage, masterPageAccordion, masterPageAccordionField } from '@/db/schema';
import { ok, fail, requireAuth, isResponse } from '@/lib/api';
import { parseDerive, isAsyncDerive, renderTemplate } from '@/lib/pages/derive';
import { getDeriveSource } from '@/lib/pages/deriveSources';

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await requireAuth();
  if (isResponse(session)) return session;

  const { slug } = await params;

  let body: { trigger_field?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const triggerField = body.trigger_field;
  const values = body.values ?? {};
  if (!triggerField || typeof triggerField !== 'string') {
    return fail('trigger_field is required', 422);
  }

  // Load this page's fields that carry a derive spec.
  const rows = await db
    .select({ name: masterPageAccordionField.name, derive: masterPageAccordionField.derive })
    .from(masterPageAccordionField)
    .innerJoin(masterPageAccordion, eq(masterPageAccordion.id, masterPageAccordionField.accordionId))
    .innerJoin(masterPage, eq(masterPage.id, masterPageAccordion.pageId))
    .where(and(eq(masterPage.slug, slug), isNotNull(masterPageAccordionField.derive)));

  // Keep only async derives triggered by this field.
  const targets = rows
    .map((r) => ({ name: r.name, spec: parseDerive(r.derive) }))
    .filter((t) => isAsyncDerive(t.spec) && t.spec.trigger === triggerField);

  if (targets.length === 0) return ok({ values: {} });

  // Resolve each distinct source once.
  const sourceCache = new Map<string, Record<string, unknown> | null>();
  async function resolveSource(name: string): Promise<Record<string, unknown> | null> {
    if (sourceCache.has(name)) return sourceCache.get(name) ?? null;
    const src = getDeriveSource(name);
    const resolved = src ? await src.resolve(values) : null;
    sourceCache.set(name, resolved);
    return resolved;
  }

  const out: Record<string, unknown> = {};
  for (const { name, spec } of targets) {
    if (!isAsyncDerive(spec)) continue; // narrows spec to fromRelated | template
    const resolved = await resolveSource(spec.source);
    if (!resolved) {
      out[name] = null; // trigger cleared / source missing → blank the field
      continue;
    }
    if (spec.kind === 'fromRelated') {
      let v = resolved[spec.column] ?? null;
      if (v !== null && spec.valueMap) v = spec.valueMap[String(v)] ?? null;
      out[name] = v;
    } else if (spec.kind === 'template') {
      out[name] = renderTemplate(spec.template, resolved);
    }
  }

  return ok({ values: out });
}
