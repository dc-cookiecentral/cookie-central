-- Cookie Central — Gmail agent state + per-message log
--
-- The AI email agent polls systems@dirtycookie.com, classifies each message into
-- one of six categories, and acts on it (structured extraction → po_emails /
-- po_lot_numbers / po_changes, or attachment auto-import → upload_log /
-- weekly_reports). Two tables back that:
--
--   gmail_sync_state — connection + poll cursor (one logical row).
--   gmail_messages   — one row per Gmail message: dedupe key, classification,
--                      and links to whatever the message produced. Lets a poll be
--                      idempotent (skip seen message ids) and gives an audit trail
--                      of what the agent did with each email.
--
-- Writes come exclusively from the Edge Functions (service role → bypasses RLS),
-- so only a read policy is defined, mirroring the house pattern.
--
-- NOT auto-deployed — paste into the SQL editor in filename order (RUNBOOK §7).

CREATE TABLE gmail_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_email text,
  connected_at timestamptz,
  last_history_id text,
  last_polled_at timestamptz,
  last_poll_count int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gmail_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON gmail_sync_state FOR SELECT USING (true);

CREATE TABLE gmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text,
  internal_date timestamptz,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  classification text CHECK (classification IN (
    'PO', 'BOL', 'supplier_confirmation',
    'assemblers_report', 'weekly_report', 'other'
  )),
  classified_at timestamptz,
  processed boolean DEFAULT false,
  po_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_email_id uuid REFERENCES po_emails(id) ON DELETE SET NULL,
  upload_log_id uuid REFERENCES upload_log(id) ON DELETE SET NULL,
  error text,
  raw jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON gmail_messages FOR SELECT USING (true);

CREATE INDEX idx_gmail_messages_msgid ON gmail_messages(gmail_message_id);
CREATE INDEX idx_gmail_messages_class ON gmail_messages(classification);
CREATE INDEX idx_gmail_messages_unprocessed ON gmail_messages(processed) WHERE NOT processed;

-- Verify:
--   SELECT to_regclass('public.gmail_sync_state'), to_regclass('public.gmail_messages');
