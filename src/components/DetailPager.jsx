import { useNavigate } from 'react-router-dom';

// Prev/next pager for detail pages. Steps through `items` (an ordered array of
// keys — e.g. po_numbers) in the SAME order as the list the user came from, so
// ← / → walk the orders/payments table row-by-row. Disabled at the ends (and
// while the list is still loading / the current key isn't in the list).
//
//   items    ordered keys (already filtered/sorted to match the list view)
//   current  the key currently shown (route param)
//   makePath (key) => path to navigate to
export default function DetailPager({ items, current, makePath }) {
  const navigate = useNavigate();
  const idx = items.indexOf(current);
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;

  const btn =
    'bg-bg border border-lt rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-md ' +
    'hover:bg-pc disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-1.5 h-fit">
      <button
        className={btn}
        disabled={!prev}
        onClick={() => prev && navigate(makePath(prev))}
        title={prev ? `Previous — ${prev}` : 'No previous'}
        aria-label="Previous"
      >
        ←
      </button>
      {idx >= 0 && items.length > 0 && (
        <span className="text-[9px] text-gr tabular-nums whitespace-nowrap">
          {idx + 1} / {items.length}
        </span>
      )}
      <button
        className={btn}
        disabled={!next}
        onClick={() => next && navigate(makePath(next))}
        title={next ? `Next — ${next}` : 'No next'}
        aria-label="Next"
      >
        →
      </button>
    </div>
  );
}
