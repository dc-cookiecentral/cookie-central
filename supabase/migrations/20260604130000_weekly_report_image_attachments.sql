-- Cookie Central — weekly report image attachments
--
-- The Bentonville weekly email embeds 3-7 Walmart Retail Link screenshots
-- (OTIF WK / OTIF L4W / SQEP compliance / sales-performance charts). They
-- previously surfaced on /weekly only as bare filenames (image001.png …).
--
-- gmail-extract now downloads these via the Gmail API, stores them in the
-- public "weekly-report-attachments" Storage bucket, and records their public
-- URLs here so /weekly can render the actual images inline.

ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS image_attachments jsonb;

-- Public bucket: these are internal Walmart performance screenshots (no customer
-- data) and the app itself is auth-gated, so public read is acceptable and lets
-- <img src> load them directly. Service-role uploads (the agent) bypass RLS.
INSERT INTO storage.buckets (id, name, public)
VALUES ('weekly-report-attachments', 'weekly-report-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = true;
