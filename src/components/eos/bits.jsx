import { useEffect, useRef, useState } from 'react';

// Small shared pieces for the EOS tabs. Kept together because each is a few
// lines and they are only meaningful inside this feature.

// ── Scoring colours ────────────────────────────────────────────────────────
// 'none' = the metric has no goal yet (still baselining) — the number shows,
// deliberately uncoloured. 'empty' = nobody entered a number that week.
export const SCORE_CELL = {
  green:  'bg-emerald-50 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-800 border-amber-200',
  red:    'bg-red-50 text-red-800 border-red-200',
  none:   'bg-cd text-md border-lt',
  empty:  'bg-cd text-gr border-lt',
};

export const SCORE_DOT = {
  green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500',
  none: 'bg-lt', empty: 'bg-lt',
};

export function SectionCard({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`bg-cd border border-lt rounded-xl ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-lt">
          <div className="min-w-0">
            {title && <div className="text-[12px] font-bold text-dk">{title}</div>}
            {subtitle && <div className="text-[10px] text-gr mt-0.5 leading-snug">{subtitle}</div>}
          </div>
          {right && <div className="flex-shrink-0">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Free-text owner. The roster mixes real names with 'OPEN' and 'HIRE #1', so an
// unfilled seat reads as a state rather than a missing value.
export function OwnerChip({ name, className = '' }) {
  if (!name) return <span className={`text-[10px] text-gr italic ${className}`}>unassigned</span>;
  const open = /^(OPEN|HIRE|TBD)/i.test(name);
  return (
    <span
      className={`inline-block px-2 py-[2px] rounded-full text-[10px] font-semibold whitespace-nowrap ${
        open ? 'bg-amber-100 text-amber-800' : 'bg-pc text-pk'
      } ${className}`}
    >
      {name}
    </span>
  );
}

// Click to edit, Enter or blur to save, Escape to cancel. Used for every inline
// text field in the tracker so editing never needs a modal or a save button.
export function InlineText({
  value, onSave, placeholder = '—', className = '', inputClassName = '', multiline = false, disabled = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); } }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next === '' ? null : next);
  };

  if (disabled) {
    return <span className={className}>{value || <span className="text-gr italic">{placeholder}</span>}</span>;
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`text-left hover:bg-pc rounded px-1 -mx-1 ${className}`}
        title="Click to edit"
      >
        {value || <span className="text-gr italic">{placeholder}</span>}
      </button>
    );
  }

  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      ref={ref}
      value={draft}
      rows={multiline ? 3 : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
      }}
      className={`bg-white border border-pk rounded px-1.5 py-0.5 text-[11px] w-full outline-none ${inputClassName}`}
    />
  );
}

// A row of mutually exclusive status buttons — Rock status, issue status.
export function StatusToggle({ value, options, onChange, disabled }) {
  return (
    <div className="inline-flex rounded-md border border-lt overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-2 py-[3px] text-[9px] font-semibold whitespace-nowrap ${
            value === o.value ? o.active : 'bg-cd text-gr hover:bg-pc'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Trend line for one measurable across the visible window. Gaps are skipped
// rather than drawn as zero — a week nobody entered is not a week of no sales.
export function Sparkline({ values, width = 80, height = 22 }) {
  const pts = values
    .map((v, i) => ({ i, v: Number(v) }))
    .filter((p) => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return <div style={{ width, height }} />;

  const lastX = Math.max(values.length - 1, 1);
  const nums = pts.map((p) => p.v);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || Math.abs(max) || 1;
  const x = (i) => (i / lastX) * (width - 3) + 1.5;
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4);
  const d = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline points={d} fill="none" stroke="#C2185B" strokeWidth="1.25"
                strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2" fill="#C2185B" />
    </svg>
  );
}

// Used wherever a section can be empty on a brand-new install.
export function EmptyRow({ children, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-[11px] text-gr">
        {children}
      </td>
    </tr>
  );
}

export const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
export const BTN = 'px-2.5 py-1 rounded-md text-[10px] font-semibold border border-lt bg-cd text-md hover:border-pk hover:text-pk';
export const BTN_PK = 'px-2.5 py-1 rounded-md text-[10px] font-semibold bg-pk text-white hover:bg-pm';
