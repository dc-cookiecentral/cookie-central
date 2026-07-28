import { useMemo, useState } from 'react';

// Reusable Cookulator table: sortable headers, per-column multi-select filters,
// and a level-grouped column chooser. Column def:
//   { key, label, render:(row)=>JSX, value?:(row)=>primitive (sort/filter key),
//     sortable=true, filterable=false, optional=false, defaultOn=true,
//     group?:string (chooser grouping), locked?:boolean (always-on note) }

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider whitespace-nowrap';

const val = (col, row) => {
  const v = col.value ? col.value(row) : row[col.key];
  return v == null ? '' : v;
};

export default function SpecTable({ columns, rows, bandLabel, bandColor = '#C2185B', emptyNote }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [filters, setFilters] = useState({}); // key -> Set of selected string values
  const [openFilter, setOpenFilter] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hidden, setHidden] = useState(() => {
    // optional columns default off when defaultOn === false
    const h = {};
    columns.forEach((c) => {
      if (c.optional && c.defaultOn === false) h[c.key] = true;
    });
    return h;
  });

  const optionalCols = columns.filter((c) => c.optional);
  const groups = useMemo(() => {
    const g = {};
    optionalCols.forEach((c) => {
      const k = c.group || 'Optional';
      (g[k] = g[k] || []).push(c);
    });
    return g;
  }, [columns]);

  const visibleCols = columns.filter((c) => !c.optional || !hidden[c.key]);

  const view = useMemo(() => {
    let out = rows.filter((r) => {
      for (const k in filters) {
        const set = filters[k];
        if (set && set.size) {
          const col = columns.find((c) => c.key === k);
          if (!set.has(String(val(col, r)))) return false;
        }
      }
      return true;
    });
    if (sortCol) {
      const col = columns.find((c) => c.key === sortCol);
      out = [...out].sort((a, b) => {
        const av = val(col, a);
        const bv = val(col, b);
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return String(av).localeCompare(String(bv)) * sortDir;
      });
    }
    return out;
  }, [rows, filters, sortCol, sortDir, columns]);

  const toggleSort = (c) => {
    if (!c.sortable && c.sortable !== undefined) return;
    if (sortCol === c.key) setSortDir((d) => -d);
    else {
      setSortCol(c.key);
      setSortDir(1);
    }
  };

  const distinct = (c) => [...new Set(rows.map((r) => String(val(c, r))))].sort();

  const toggleFilterVal = (key, v) => {
    setFilters((f) => {
      const cur = new Set(f[key] || []);
      if (cur.has(v)) cur.delete(v);
      else cur.add(v);
      return { ...f, [key]: cur };
    });
  };

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden mb-4">
      {(bandLabel || optionalCols.length > 0) && (
        <div className="flex justify-between items-center px-3 py-1.5 border-b border-lt" style={bandLabel ? { background: bandColor } : undefined}>
          <div className={`text-[9px] font-bold uppercase tracking-wider ${bandLabel ? 'text-white' : 'text-gr'}`}>{bandLabel}</div>
          {optionalCols.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setPanelOpen((v) => !v)}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${bandLabel ? 'bg-white/90 border-white text-dk' : 'bg-bg border-lt text-pk'}`}
              >
                Columns ▾
              </button>
              {panelOpen && (
                <div className="absolute right-0 top-7 z-20 bg-cd border border-lt rounded-lg shadow-lg p-3 min-w-[220px] text-left" onClick={(e) => e.stopPropagation()}>
                  {Object.entries(groups).map(([grp, cols]) => (
                    <div key={grp} className="mb-2">
                      <div className="text-[8px] font-bold uppercase text-pk mb-1">{grp}</div>
                      {cols.map((c) => (
                        <label key={c.key} className="flex items-center gap-1.5 text-[10px] text-dk py-0.5 cursor-pointer">
                          <input type="checkbox" checked={!hidden[c.key]} onChange={() => setHidden((h) => ({ ...h, [c.key]: !h[c.key] }))} />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-pc">
              {visibleCols.map((c) => {
                const isSorted = sortCol === c.key;
                const fActive = filters[c.key] && filters[c.key].size;
                return (
                  <th key={c.key} className={TH}>
                    <span className={c.sortable === false ? '' : 'cursor-pointer'} onClick={() => c.sortable !== false && toggleSort(c)}>
                      {c.label}
                      {isSorted && <span className="ml-0.5">{sortDir > 0 ? '▲' : '▼'}</span>}
                    </span>
                    {c.filterable && (
                      <span className="relative inline-block">
                        <button
                          className={`ml-1 text-[9px] ${fActive ? 'text-pk font-bold' : 'text-lt'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenFilter((k) => (k === c.key ? null : c.key));
                          }}
                        >
                          ⏷
                        </button>
                        {openFilter === c.key && (
                          <div className="absolute left-0 top-6 z-20 bg-cd border border-lt rounded-lg shadow-lg p-2 min-w-[160px] max-h-[240px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            {distinct(c).map((v) => {
                              const sel = filters[c.key];
                              const checked = !sel || sel.size === 0 || sel.has(v);
                              return (
                                <label key={v} className="flex items-center gap-1.5 text-[10px] text-dk py-0.5 normal-case font-normal tracking-normal cursor-pointer">
                                  <input type="checkbox" checked={checked} onChange={() => toggleFilterVal(c.key, v)} />
                                  {v === '' ? '(blank)' : v}
                                </label>
                              );
                            })}
                            <div className="flex gap-2 mt-1 pt-1 border-t border-lt">
                              <button className="text-[9px] text-pk" onClick={() => setFilters((f) => ({ ...f, [c.key]: new Set() }))}>All</button>
                              <button className="text-[9px] text-gr" onClick={() => setOpenFilter(null)}>Done</button>
                            </div>
                          </div>
                        )}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.id || i} className="border-b border-bg hover:bg-pc">
                {visibleCols.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-top">{c.render ? c.render(r) : (val(c, r) || <span className="text-lt">—</span>)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {view.length === 0 && (
          <div className="px-3 py-6 text-[11px] text-gr italic text-center">{emptyNote || 'No rows match the current filters.'}</div>
        )}
      </div>
    </div>
  );
}
