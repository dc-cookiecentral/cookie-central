import { useMemo, useRef, useState } from 'react';

// A single-select combobox that filters as you type.
//
// Built for the Salesperson picker, which went from 2 options to 27 overnight
// when the Cortina roster landed. A native <select> at that size means scrolling
// a list you cannot search, and the thing you are looking for — a person — is
// exactly what a human wants to type rather than hunt for.
//
// Matches on BOTH the label and the sub-line, so "marci", "mclark" and
// "@onefrozen" all narrow the list. The sub-line is the email, which is the
// operative field: it is what ShipStation notifies, and the roster currently has
// a shared mailbox under two names and three addresses that do not match their
// person. Searching it is how those get found.
//
// ⚠️ Escape calls stopPropagation while the list is open. This lives inside a
// focus-trapped dialog whose own Escape handler closes the whole drawer — so
// without that, dismissing the dropdown would throw away the cart behind it.

export default function SearchSelect({
  value, onChange, options, placeholder = 'Search…', ariaLabel, invalid, id,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listId = `${id || 'ss'}-list`;

  const selected = options.find((o) => o.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.sub || ''}`.toLowerCase().includes(q));
  }, [options, query]);

  const commit = (opt) => {
    if (!opt) return;
    onChange(opt.id);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return Math.max(0, Math.min(filtered.length - 1, next));
      });
      return;
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      commit(filtered[active]);
      return;
    }
    if (e.key === 'Escape' && open) {
      // Close the list, NOT the dialog around it. See the note above.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={(e) => {
        // Only close when focus actually leaves the widget — clicking an option
        // moves focus within it.
        if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setQuery(''); }
      }}
    >
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        // Shows the current selection when idle, the query while searching.
        value={open ? query : (selected ? `${selected.label}${selected.sub ? ` — ${selected.sub}` : ''}` : '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
        className={`w-full px-2 py-1 rounded border text-[14px] bg-bg ${invalid ? 'border-red-500' : 'border-lt'}`}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 left-0 right-0 mt-1 max-h-[240px] overflow-y-auto bg-cd border border-lt rounded-lg shadow-lg py-1"
        >
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-[12px] text-gr italic">No match for “{query.trim()}”</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              // mousedown, not click: it fires before blur, so the option is
              // chosen instead of the list closing out from under the pointer.
              onMouseDown={(e) => { e.preventDefault(); commit(o); }}
              onMouseEnter={() => setActive(i)}
              className={`px-2 py-1.5 cursor-pointer ${i === active ? 'bg-pc' : ''}`}
            >
              <div className={`text-[14px] ${o.id === value ? 'font-bold text-pk' : 'text-dk'}`}>{o.label}</div>
              {o.sub && <div className="text-[12px] text-gr break-all">{o.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
