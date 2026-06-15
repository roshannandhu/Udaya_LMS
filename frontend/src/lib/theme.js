import { create } from 'zustand';

// Whole-app light/dark theme. Applies/removes the `dark` class on <html> (the
// index.css `html.dark` overrides do the visual flip), persists the choice, and
// defaults to the OS preference on first run. Purely visual — no logic impact.
const STORAGE_KEY = 'tutoria-theme';

function apply(dark) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function initialDark() {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
}

export const useTheme = create((set, get) => ({
  // Seed from the class the inline <head> script already applied (mirrors
  // initialDark()), so the first render — including the toggle icon — matches
  // the painted theme and there's no flash or icon flicker on load.
  dark: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  initialized: false,
  init: () => {
    if (get().initialized) return;
    const dark = initialDark();
    apply(dark);
    set({ dark, initialized: true });
  },
  toggle: () => {
    const dark = !get().dark;
    apply(dark);
    try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
    set({ dark });
  },
}));
