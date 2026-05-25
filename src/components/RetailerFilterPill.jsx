import { useRetailerFilter } from '../contexts/RetailerFilterContext';

// Top-bar pill: All | Walmart | Kroger.
// Render on pages where retailer filter applies (Product Orders, Payments).
export default function RetailerFilterPill() {
  const { retailer, setRetailer, options } = useRetailerFilter();
  return (
    <div className="inline-flex bg-cd border border-lt rounded-full p-[2px]">
      {options.map((r) => (
        <button
          key={r}
          onClick={() => setRetailer(r)}
          className={[
            'px-3 py-1 text-[11px] font-semibold rounded-full transition-colors',
            retailer === r
              ? 'bg-pk text-white'
              : 'bg-transparent text-md hover:text-pk',
          ].join(' ')}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
