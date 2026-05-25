import { createContext, useContext, useState, useMemo } from 'react';
import { DEFAULT_SUBCATEGORY, UOM_OPTIONS, convertCases, formatCases } from '../utils/uomConverter';

const STORAGE_KEY = 'cc.uom';
const UOMContext = createContext(null);

export function UOMProvider({ children }) {
  const [uom, setUomState] = useState(() => {
    if (typeof window === 'undefined') return 'Cases';
    return localStorage.getItem(STORAGE_KEY) || 'Cases';
  });

  const setUom = (next) => {
    if (!UOM_OPTIONS.includes(next)) return;
    setUomState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo(
    () => ({
      uom,
      setUom,
      options: UOM_OPTIONS,
      subcategory: DEFAULT_SUBCATEGORY,
      convert: (cases, sc) => convertCases(cases, uom, sc),
      format:  (cases, sc) => formatCases(cases,  uom, sc),
    }),
    [uom]
  );

  return <UOMContext.Provider value={value}>{children}</UOMContext.Provider>;
}

export function useUOM() {
  const ctx = useContext(UOMContext);
  if (!ctx) throw new Error('useUOM must be used inside UOMProvider');
  return ctx;
}
