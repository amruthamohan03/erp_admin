-- Restore the four-digit padding on every generated reference (§4.33, §7.2).
--
-- `0060_mca_ref_format_master` seeded every sequence segment with `width: 4`,
-- which is what all 51 live export references, both import invoices and the
-- export invoice already carry: NMI-IDCOR26-0051, 2026-NMI-EXP-0001.
--
-- A later change to unpadded numbering (`width: 1`) was applied to this
-- database and then reverted in source WITHOUT a migration undoing the data —
-- exactly the state §7.2 exists to prevent. The rows were left at width 1, so:
--
--   * the counter's pattern `^NMI-IDCOR26-([0-9]{1})$` matched NONE of the 51
--     references already issued, and the next export would have been numbered
--     1 again; and
--   * new references would have printed `-1` beside the existing `-0001`,
--     the same consignment number in two shapes.
--
-- Guarded on the current value, so a database seeded from 0060 (already 4) is
-- untouched and this is safe to re-run.
UPDATE mca_ref_format_master_t f
   SET segments = (
         SELECT jsonb_agg(
                  CASE
                    WHEN seg->>'type' = 'sequence' AND seg->>'width' = '1'
                      THEN jsonb_set(seg, '{width}', '4'::jsonb)
                    ELSE seg
                  END
                  ORDER BY ord
                )
           FROM jsonb_array_elements(f.segments) WITH ORDINALITY AS t(seg, ord)
       ),
       updated_at = now()
 WHERE EXISTS (
         SELECT 1
           FROM jsonb_array_elements(f.segments) AS seg
          WHERE seg->>'type' = 'sequence'
            AND seg->>'width' = '1'
       );
