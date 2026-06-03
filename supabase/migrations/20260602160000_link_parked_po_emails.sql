-- Cookie Central — back-fill parked email extractions when their PO arrives
--
-- The Gmail agent extracts PO/BOL emails into po_emails (+ po_lot_numbers),
-- matched to a purchase_orders row by po_number. When the email lands BEFORE the
-- PO is loaded from NetSuite, po_id is left null ("parked"), with the po_number
-- preserved in extracted_data. This SECURITY DEFINER RPC links those parked rows
-- the moment the matching PO is created — the NetSuite parser calls it per
-- upserted PO (src/parsers/netsuite.js importRecords).
--
-- SECURITY DEFINER so the client-side parser (signed-in ops/admin) can run it
-- without granting a broad UPDATE policy on po_emails / po_lot_numbers. The
-- function only ever links null→matching-PO by po_number; it cannot mutate
-- already-linked rows.
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7). Required for the
-- NetSuite back-fill to work; without it the parser's RPC call is a silent no-op.

CREATE OR REPLACE FUNCTION public.link_parked_po_emails(p_po_id uuid, p_po_number text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_emails int;
BEGIN
  -- Attach parked email extractions for this PO number.
  UPDATE public.po_emails
     SET po_id = p_po_id
   WHERE po_id IS NULL
     AND source = 'email'
     AND extracted_data->>'po_number' = p_po_number;
  GET DIAGNOSTICS linked_emails = ROW_COUNT;

  -- Attach the parked lots tied to the emails we just linked (lots are persisted
  -- with po_id null when parked, joined back via extracted_from_email_id).
  UPDATE public.po_lot_numbers l
     SET po_id = p_po_id
    FROM public.po_emails e
   WHERE l.po_id IS NULL
     AND l.extracted_from_email_id = e.id
     AND e.po_id = p_po_id;

  RETURN linked_emails;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_parked_po_emails(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_parked_po_emails(uuid, text) TO authenticated, service_role;

-- Verify (after a PO with parked emails exists):
--   select public.link_parked_po_emails(
--     (select id from purchase_orders where po_number = 'PO14451'), 'PO14451');
