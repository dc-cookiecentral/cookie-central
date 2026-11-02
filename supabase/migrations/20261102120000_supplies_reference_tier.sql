-- Supplies: a "reference" tier for Marc's recorded sheet (docs/SUPPLIES_SPEC.md).
--
-- Marc's item-by-supplier sheet and its Contact Info tab are the base data, but
-- they are a record, not a document: no quote, invoice or PO behind them. The
-- app shows them de-emphasized and never lets them stand in for a document, so
-- that prices and contacts get confirmed from actual quotes and POs.
--
--   quotes.doc_type 'reference'  — a price recorded on Marc's sheet. Shown faint,
--                                  ranked below every document, never the "best
--                                  quote", never actual cost (v_po_line_cost
--                                  already reads only po / invoice).
--   vendor_contacts.source       — NULL = from a document / entered in the app;
--                                  'marc_sheet' = from Marc's Contact Info tab.
--
-- Additive; existing rows are unchanged.

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_doc_type_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_doc_type_check
  CHECK (doc_type IN ('quote', 'invoice', 'po', 'verbal', 'reference'));
COMMENT ON COLUMN quotes.doc_type IS
  'quote | invoice | po | verbal are documents. reference = recorded on Marc''s sheet, no document behind it (shown de-emphasized).';

ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('marc_sheet'));
COMMENT ON COLUMN vendor_contacts.source IS
  'NULL = from a document or entered in the app. marc_sheet = from Marc''s Contact Info tab — confirm before relying on it.';
