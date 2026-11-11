export const APPEARANCE_KEY = 'trace.appearance.v1';
export const APPEARANCE_MODES = ['light', 'dark', 'system'];
export const normalizeAppearance = value => APPEARANCE_MODES.includes(value) ? value : 'system';
export const resolveAppearance = (mode, systemDark) => normalizeAppearance(mode) === 'system' ? (systemDark ? 'dark' : 'light') : mode;

export function readAppearance() {
  try { return normalizeAppearance(window.localStorage.getItem(APPEARANCE_KEY)); }
  catch { return 'system'; }
}

export function initializeAppearance() {
  document.documentElement.dataset.theme = resolveAppearance(readAppearance(), window.matchMedia('(prefers-color-scheme: dark)').matches);
}
