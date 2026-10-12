import { loadDelayRules } from './delayTracker';
import type { StageDef } from '@/lib/imkpi/stages';

// The Delay KPI screens' stage definitions, from the master.
//
// `STAGE_DEFS` in `lib/imkpi/stages.ts` and `lib/exkpi/stages.ts` were the same
// information as `delay_rule_stage_t`, frozen in source — so a renegotiated
// target meant a deploy, and the Delay Tracker measuring the same legs would
// have been a second copy to keep in step (§4.10). The KPI screens read the
// rows now; the constants remain only as the shape and the fallback.
//
// The fallback matters: a database that has not run migration 0136, or one
// where somebody switched every rule off, must not leave the KPI screens
// blank. They fall back to the shipped definitions, which are what the seed
// inserted anyway.

/** The stages of a module's DEFAULT rule, in the shape the KPI screens use. */
export async function loadStageDefs(
  module: 'import' | 'export',
  fallback: StageDef[],
): Promise<StageDef[]> {
  let rules;
  try {
    rules = await loadDelayRules(module);
  } catch {
    // The table is missing (an un-migrated database), which is not a reason
    // for the KPI screen to fail — it is a reason to use what we shipped.
    return fallback;
  }
  // The default rule is the one the KPI screens chart: they summarise the
  // module as a whole, and a transport-specific rule describes a subset.
  const rule = rules.find((r) => r.transportLetter === null) ?? rules[0];
  if (!rule || rule.stages.length === 0) return fallback;

  return rule.stages.map((s) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    from: s.from,
    to: s.to,
    threshold: s.target,
    priority: s.priority,
    color: s.color,
    // The master stores a lucide-style name; the KPI screens render a tabler
    // class, so the `ti-` prefix is reattached here rather than stored twice.
    icon: s.icon.startsWith('ti-') ? s.icon : `ti-${s.icon}`,
  }));
}
