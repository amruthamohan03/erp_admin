// §4.1 — which field a field is welded to, read from its `props.currencyField`.
//
// An amount and the currency it is quoted in are ONE value to an operator. Laid
// out as two independent cells they took two of the five columns per row and
// could end up scrolled apart, so a figure could be read with no currency
// anywhere in sight. Which fields pair is configuration, not a list in code:
// `master_page_accordion_field_t.props.currencyField` names the companion, so a
// new pair is a row edit rather than a deploy.
//
// Shared by the editable Accordion and the read-only RecordViewModal so the two
// never disagree about what is paired (§4.10).
export function companionOf(props: Record<string, unknown> | null): string | null {
  const v = props?.['currencyField'];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
