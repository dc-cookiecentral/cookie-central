// Spec Sheet cell renderers — the small pills/chips the Cookulator uses.
// Kept as pure functions returning JSX so column defs can reference them.

export const Empty = ({ label = '—' }) => <span className="text-lt italic">{label}</span>;
export const TBD = ({ label = 'TBD' }) => (
  <span className="inline-block px-1.5 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700">{label}</span>
);
export const Code = ({ v }) =>
  v ? <span className="font-mono text-[10px] text-gr">{v}</span> : <Empty />;

export function StoragePill({ v }) {
  if (!v) return <Empty />;
  const frozen = v === 'Frozen';
  return (
    <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${frozen ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
      {frozen ? '❄ ' : '🌡 '}{v}
    </span>
  );
}

export function PrepPill({ v }) {
  if (!v) return <Empty />;
  const raw = String(v).toLowerCase() === 'raw';
  return (
    <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${raw ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{v}</span>
  );
}

export function FormPill({ v }) {
  if (!v) return <Empty />;
  const stuffed = v === 'Stuffed';
  return (
    <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${stuffed ? 'bg-violet-100 text-violet-700' : 'bg-cyan-100 text-cyan-700'}`}>{v}</span>
  );
}

export function TierPill({ v }) {
  if (!v) return <Empty />;
  const gourmet = v === 'Gourmet';
  return (
    <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${gourmet ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}`}>{v}</span>
  );
}

export function OzPill({ v }) {
  if (v === '' || v == null) return <Empty />;
  const n = parseFloat(v);
  const cls = n <= 1 ? 'bg-green-50 text-green-700' : n <= 2 ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-50 text-orange-700';
  return <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${cls}`}>{v}oz</span>;
}

export function BrandPill({ v }) {
  if (!v) return <Empty />;
  const wm = v === 'Walmart';
  return (
    <span className={`inline-block px-2 py-px rounded-full text-[10px] font-semibold ${wm ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pk'}`}>{v}</span>
  );
}

export function SampleChip({ on }) {
  return on ? (
    <span className="inline-block px-2 py-px rounded-full text-[10px] font-semibold bg-pink-100 text-pk">✓ Sample</span>
  ) : (
    <Empty />
  );
}

// Edit-mode toggle button for sample-eligibility.
export function SampleToggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${on ? 'bg-pk text-white border-pk' : 'bg-cd border-lt text-gr hover:text-pk'}`}
    >
      {on ? '✓ On sample site' : 'Add to samples'}
    </button>
  );
}
