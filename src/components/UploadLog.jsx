import { useEffect } from 'react';
import { useUploadLog } from '../hooks/useUploadLog';
import { PARSERS } from '../parsers';

const STATUS_STYLE = {
  complete:   'bg-green-100 text-green-700',
  processing: 'bg-amber-100 text-amber-700',
  error:      'bg-red-100 text-red-700',
};

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// BUILD_PLAN 2.2 — upload history table. `refreshKey` bumps to re-fetch after
// a new import completes.
export default function UploadLog({ refreshKey }) {
  const { rows, loading, error, refresh } = useUploadLog();

  // Re-fetch when the parent signals a completed upload.
  useEffect(() => {
    if (refreshKey !== undefined) refresh();
  }, [refreshKey, refresh]);

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-lt">
        <div className="font-bold text-dk text-sm">Upload Log</div>
        <button onClick={refresh} className="text-[11px] text-pk hover:text-pm underline">
          Refresh
        </button>
      </div>

      {error && <div className="px-4 py-3 text-xs text-red-600">{error}</div>}
      {loading ? (
        <div className="px-4 py-6 text-sm text-gr text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gr text-center">No uploads yet.</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-pc text-left">
              {['Type', 'File', 'Rows', 'Status', 'By', 'When'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold text-gr uppercase text-[9px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-bg">
                <td className="px-3 py-2 font-semibold text-dk">
                  {PARSERS[r.upload_type]?.label ?? r.upload_type}
                </td>
                <td className="px-3 py-2 text-md max-w-[180px] truncate">{r.filename || '—'}</td>
                <td className="px-3 py-2 text-md">{r.row_count ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-[2px] rounded-full text-[10px] font-semibold ${STATUS_STYLE[r.status] || ''}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-md">{r.user_profiles?.full_name ?? '—'}</td>
                <td className="px-3 py-2 text-gr whitespace-nowrap">{fmtTime(r.uploaded_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
