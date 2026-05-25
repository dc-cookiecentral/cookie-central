import { createContext, useContext, useState, useMemo } from 'react';

export const RETAILER_OPTIONS = ['All', 'Walmart', 'Kroger'];
const STORAGE_KEY = 'cc.retailerFilter';
const RetailerFilterContext = createContext(null);

export function RetailerFilterProvider({ children }) {
  const [retailer, setRetailerState] = useState(() => {
    if (typeof window === 'undefined') return 'All';
    return localStorage.getItem(STORAGE_KEY) || 'All';
  });

  const setRetailer = (next) => {
    if (!RETAILER_OPTIONS.includes(next)) return;
    setRetailerState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo(
    () => ({
      retailer,
      setRetailer,
      options: RETAILER_OPTIONS,
      // Helper: filter an array of objects with a `retailer` field.
      filter: (rows, key = 'retailer') =>
        retailer === 'All' ? rows : rows.filter((r) => r[key] === retailer),
    }),
    [retailer]
  );

  return (
    <RetailerFilterContext.Provider value={value}>{children}</RetailerFilterContext.Provider>
  );
}

export function useRetailerFilter() {
  const ctx = useContext(RetailerFilterContext);
  if (!ctx) throw new Error('useRetailerFilter must be used inside RetailerFilterProvider');
  return ctx;
}
