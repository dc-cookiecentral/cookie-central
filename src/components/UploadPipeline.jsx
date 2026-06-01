import { useCallback, useRef, useState } from 'react';
import { parseFile } from '../utils/csvParser';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Reusable upload pipeline (BUILD_PLAN 2.1): drag-drop → parse → preview →
// confirm import. Driven by a parser config from src/parsers, so the same
// component handles Assemblers / DOT / QBO and embeds in any page.
//
// Stages: idle → parsing → preview → importing → done | error
export default function UploadPipeline({ parser, onComplete, title, note }) {
  const { profile } = useAuth();
  const inputRef = useRef(null);
  const [stage, setStage] = useState('idle');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => {
    setStage('idle');
    setFile(null);
    setParsed(null);
    setError(null);
    setResult(null);
  };

  const handleFile = useCallback(
    async (f) => {
      if (!f) return;
      setFile(f);
      setStage('parsing');
      setError(null);
      try {
        // Multi-sheet parsers (e.g. Production) need workbook structure that
        // the shared row-flattening helper destroys — they implement parseFile
        // directly and skip the (parseFile → parser.parse(rows)) pipeline.
        let out;
        if (parser.parseFile) {
          out = await parser.parseFile(f);
        } else {
          const { rows, parseErrors } = await parseFile(f);
          out = { ...parser.parse(rows), parseErrors };
        }
        setParsed(out);
        setStage('preview');
      } catch (e) {
        setError(e.message || 'Failed to parse file');
        setStage('error');
      }
    },
    [parser]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const confirmImport = async () => {
    setStage('importing');
    setError(null);
    let uploadId = null;
    try {
      // 1. Open an upload_log row (status: processing).
      const { data: log, error: logErr } = await supabase
        .from('upload_log')
        .insert({
          upload_type: parser.type,
          filename: file?.name,
          uploaded_by: profile?.id ?? null,
          row_count: parsed.records.length,
          status: 'processing',
        })
        .select('id')
        .single();
      if (logErr) throw logErr;
      uploadId = log.id;

      // 2. Run the parser's importer.
      const res = await parser.importRecords(parsed.records, { uploadId });

      // 3. Close the log row.
      await supabase
        .from('upload_log')
        .update({
          status: 'complete',
          row_count: res.inserted,
          errors: parsed.errors?.length ? parsed.errors : null,
        })
        .eq('id', uploadId);

      setResult(res);
      setStage('done');
      onComplete?.(res);
    } catch (e) {
      if (uploadId) {
        await supabase
          .from('upload_log')
          .update({ status: 'error', errors: [{ message: e.message }] })
          .eq('id', uploadId);
      }
      setError(e.message || 'Import failed');
      setStage('error');
    }
  };

  const preview = parsed?.records?.slice(0, 8) ?? [];

  return (
    <div className="bg-cd border border-lt rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-dk text-sm">{title || parser.label}</div>
        {parser.unconfirmed && (
          <span className="text-[9px] font-semibold uppercase text-amber-700 bg-amber-100 px-2 py-[2px] rounded-full">
            Format unconfirmed
          </span>
        )}
      </div>
      {note && <div className="text-[10px] text-gr mb-2">{note}</div>}

      {(stage === 'idle' || stage === 'parsing') && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center text-center cursor-pointer',
            'border-2 border-dashed rounded-lg py-10 px-4 transition-colors',
            dragging ? 'border-pk bg-pc' : 'border-lt hover:border-pk',
          ].join(' ')}
        >
          <div className="text-sm font-semibold text-md">
            {stage === 'parsing' ? 'Parsing…' : 'Drop file here or click to choose'}
          </div>
          <div className="text-[11px] text-gr mt-1">{parser.accept}</div>
          <input
            ref={inputRef}
            type="file"
            accept={parser.accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {stage === 'preview' && parsed && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-md">
              <span className="font-semibold text-dk">{file?.name}</span> — {parsed.summary}
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="text-xs text-gr hover:text-dk px-2 py-1">
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="text-xs font-semibold bg-pk text-white rounded-lg px-3 py-1 hover:bg-pm"
              >
                Import {parsed.records.length}
              </button>
            </div>
          </div>

          {parsed.errors?.length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
              {parsed.errors.length} row issue(s) will be skipped — e.g. row{' '}
              {parsed.errors[0].row}: {parsed.errors[0].message}
            </div>
          )}

          <div className="overflow-x-auto border border-lt rounded-lg">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-pc text-left">
                  {parser.previewColumns.map((c) => (
                    <th key={c.key} className="px-2 py-1 font-bold text-gr uppercase text-[9px]">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((rec, i) => (
                  <tr key={i} className="border-t border-bg">
                    {parser.previewColumns.map((c) => (
                      <td key={c.key} className="px-2 py-1 text-md">
                        {rec[c.key] == null ? '—' : String(rec[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.records.length > preview.length && (
            <div className="text-[10px] text-gr mt-1">
              Showing {preview.length} of {parsed.records.length} rows
            </div>
          )}
        </div>
      )}

      {stage === 'importing' && (
        <div className="text-sm text-md py-6 text-center">Importing…</div>
      )}

      {stage === 'done' && (
        <div className="py-6 text-center">
          <div className="text-sm font-semibold text-green-700">
            Imported {result?.inserted} record(s)
          </div>
          <button onClick={reset} className="text-xs text-pk hover:text-pm mt-2 underline">
            Upload another
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="py-6 text-center">
          <div className="text-sm font-semibold text-red-600">{error}</div>
          <button onClick={reset} className="text-xs text-pk hover:text-pm mt-2 underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
