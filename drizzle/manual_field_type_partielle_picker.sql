-- Allow the new 'partielle-picker' field type (licence-scoped PARTIELLE dropdown
-- + inline create) alongside the existing transaction-pages field types.
ALTER TABLE master_page_accordion_field_t
  DROP CONSTRAINT IF EXISTS master_page_accordion_field_t_field_type_check;
ALTER TABLE master_page_accordion_field_t
  ADD CONSTRAINT master_page_accordion_field_t_field_type_check
  CHECK (field_type IN (
    'text','textarea','email','tel','number','date','select',
    'checkbox-group','file','seal-picker','partielle-picker'
  ));
