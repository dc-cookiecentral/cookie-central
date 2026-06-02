import type { SupabaseClient } from '@supabase/supabase-js';

// Server-side mirror of UploadPipeline.confirmImport (src/components/UploadPipeline.jsx):
// open an upload_log row → run the parser's importRecords with the service
// client → close the row complete/error. Tagged source='email' so the upload
// log distinguishes agent-ingested files from Marc's manual drops.
//
// `parser` is one of the existing src/parsers configs (e.g. production), reused
// byte-for-byte — only the supabase client is injected.
export async function runEmailImport(
  supabase: SupabaseClient,
  parser: { importRecords: (records: any, opts: any) => Promise<{ inserted: number }> },
  parsed: { records: any[]; errors?: { row?: number; message: string }[] },
  meta: { filename: string; uploadType: string },
): Promise<{ uploadId: string; inserted: number }> {
  const { data: log, error: logErr } = await supabase
    .from('upload_log')
    .insert({
      upload_type: meta.uploadType,
      filename: meta.filename,
      row_count: parsed.records.length,
      status: 'processing',
      source: 'email',
    })
    .select('id')
    .single();
  if (logErr) throw logErr;
  const uploadId = log.id as string;

  try {
    const res = await parser.importRecords(parsed.records, { uploadId, client: supabase });
    await supabase
      .from('upload_log')
      .update({
        status: 'complete',
        row_count: res.inserted,
        errors: parsed.errors?.length ? parsed.errors : null,
      })
      .eq('id', uploadId);
    return { uploadId, inserted: res.inserted };
  } catch (e) {
    await supabase
      .from('upload_log')
      .update({ status: 'error', errors: [{ message: String((e as Error)?.message ?? e) }] })
      .eq('id', uploadId);
    throw e;
  }
}
