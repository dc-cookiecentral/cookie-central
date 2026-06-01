import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAuditLog, useAuditFacets } from '../hooks/useAuditLog';
import { formatDateTime } from '../utils/dates';

// Audit log viewer (BUILD_PLAN 7.3). RLS limits read to admin/finance, so ops
// users see an explicit "no access" message rather than empty results.

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';

const ACTION_COLOR = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
};

const SINCE_OPTIONS = [
  { v: 7, l: 'Last 7 days' },
  { v: 30, l: 'Last 30 days' },
  { v: 90, l: 'Last 90 days' },
  { v: 0, l: 'All time' },
];

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <div className="text-[8px] uppercase text-gr mb-0.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-cd border border-lt rounded-md text-[10px] px-2 py-1 w-full"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function AuditLog() {
  const { profile } = useAuth();
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [sinceDays, setSinceDays] = useState(30);
  const filters = {
    table: table || undefined,
    action: action || undefined,
    userId: userId || undefined,
    sinceDays,
    limit: 500,
  };
  const { rows, loading, error } = useAuditLog(filters);
  const facets = useAuditFacets();

  const canRead = profile && (profile.role === 'admin' || profile.role === 'finance');

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-3">Audit Log</h1>

      {!canRead ? (
        <div className="bg-cd border border-lt rounded-xl p-8 text-center">
          <div className="text-sm font-semibold text-dk mb-1">Restricted</div>
          <div className="text-xs text-md">
            Audit log access is limited to admin and finance roles. Current role:{' '}
            <span className="font-semibold">{profile?.role || 'unknown'}</span>.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Select
              label="Table"
              value={table}
              onChange={setTable}
              options={[
                { value: '', label: 'All tables' },
                ...facets.tables.map((t) => ({ value: t, label: t })),
              ]}
            />
            <Select
              label="Action"
              value={action}
              onChange={setAction}
              options={[
                { value: '', label: 'All actions' },
                { value: 'INSERT', label: 'INSERT' },
                { value: 'UPDATE', label: 'UPDATE' },
                { value: 'DELETE', label: 'DELETE' },
              ]}
            />
            <Select
              label="User"
              value={userId}
              onChange={setUserId}
              options={[
                { value: '', label: 'All users' },
                ...facets.users.map((u) => ({ value: u.id, label: u.full_name })),
              ]}
            />
            <Select
              label="Range"
              value={String(sinceDays)}
              onChange={(v) => setSinceDays(Number(v))}
              options={SINCE_OPTIONS.map((o) => ({ value: String(o.v), label: o.l }))}
            />
          </div>

          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

          <div className="bg-cd border border-lt rounded-xl overflow-hidden">
            <div className="px-3 py-2 text-[9px] font-bold text-gr uppercase tracking-wider border-b border-lt flex justify-between">
              <span>{loading ? 'Loading…' : `${rows.length} event(s)`}</span>
              <span className="italic">Newest first · capped at 500 rows</span>
            </div>
            {!loading && rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-[11px] text-gr">No matching events.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-pc">
                      <th className={TH}>Time</th>
                      <th className={TH}>User</th>
                      <th className={TH}>Table</th>
                      <th className={TH}>Action</th>
                      <th className={TH}>Field</th>
                      <th className={TH}>Old → New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-bg">
                        <td className="px-2 py-1.5 text-[9px] text-gr whitespace-nowrap">
                          {formatDateTime(r.timestamp)}
                        </td>
                        <td className="px-2 py-1.5 text-[10px]">
                          <div className="font-semibold">{r.user?.full_name || '—'}</div>
                          <div className="text-[8px] text-gr">{r.user?.role || ''}</div>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] font-mono text-gr">{r.table_name}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              ACTION_COLOR[r.action] || 'bg-gray-100 text-gr'
                            }`}
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] font-semibold">
                          {r.field_name || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-[10px]">
                          <span className="text-gr">{truncate(r.old_value)}</span>
                          <span className="mx-1 text-lt">→</span>
                          <span className="text-dk font-semibold">{truncate(r.new_value)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function truncate(s, n = 40) {
  if (s == null) return '—';
  const str = String(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}
