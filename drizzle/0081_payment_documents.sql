-- 0081 — Document 1 and Document 2 on the Payment Request form (§4.1, §4.12).
--
-- `payment_request_t` has carried file1_path..file4_path since the port, but the
-- page config had no fields for them, so the two documents an operator attaches
-- to a request had nowhere to go. Config, not code: `file` is an existing field
-- type (the clients and licence pages already use it) and the save route's
-- whitelist is built from the accordion's own field list, so adding the rows is
-- all that is needed.
--
-- Documents 3 and 4 are deliberately NOT added: the reference app collects those
-- at the "Mark as Paid" stage, not on the request, and a field here would invite
-- them to be filled in before there is anything to attach.
--
-- Layout mirrors the reference: Motif takes half the row, the two documents a
-- quarter each. `colSpan: '3'` is the quarter added to Accordion's COL_CLASS in
-- the same change.
UPDATE master_page_accordion_field_t
   SET props = jsonb_set(props, '{colSpan}', '"6"'::jsonb),
       updated_at = now()
 WHERE accordion_id = 27
   AND name = 'motif'
   AND props->>'colSpan' = '12';

INSERT INTO master_page_accordion_field_t
  (id, accordion_id, name, label, field_type, required, props, display_order, display)
VALUES
  (306, 27, 'file1_path', 'Document 1', 'file', false,
   '{"accept":".pdf,.jpg,.jpeg,.png,.doc,.docx","maxSizeKb":5120,"colSpan":"3"}'::jsonb, 2, 'Y'),
  (307, 27, 'file2_path', 'Document 2', 'file', false,
   '{"accept":".pdf,.jpg,.jpeg,.png,.doc,.docx","maxSizeKb":5120,"colSpan":"3"}'::jsonb, 3, 'Y')
ON CONFLICT (id) DO NOTHING;

-- Keep the serial ahead of the explicit ids, or the next field added through the
-- page builder collides with one of them.
SELECT setval(
  pg_get_serial_sequence('master_page_accordion_field_t', 'id'),
  GREATEST((SELECT max(id) FROM master_page_accordion_field_t), 1)
);
