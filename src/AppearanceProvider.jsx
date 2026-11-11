import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { APPEARANCE_KEY, normalizeAppearance, readAppearance, resolveAppearance } from './appearance.js';

const AppearanceContext = createContext(null);
export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }) {
  const [mode, setMode] = useState(readAppearance);
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = resolveAppearance(mode, media.matches); };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);
  const changeMode = useCallback(value => {
    const next = normalizeAppearance(value);
    setMode(next); setError('');
    try { window.localStorage.setItem(APPEARANCE_KEY, next); }
    catch { setError('Appearance applied for this session, but the preference could not be saved in this browser.'); }
  }, []);
  const value = useMemo(() => ({ mode, changeMode, error }), [mode, changeMode, error]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
