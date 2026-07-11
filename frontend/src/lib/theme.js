import { create } from 'zustand';

// Whole-app light/dark theme. Applies/removes the `dark` class on <html> (the
// index.css `html.dark` overrides do the visual flip) and persists the choice.
// Defaults to LIGHT for everyone — it only goes dark when a user explicitly
// toggles (the choice is then remembered per-browser). Purely visual.
const STORAGE_KEY = 'udaya-theme';

function apply(dark) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function initialDark() {
  if (typeof window === 'undefined') return false;
  // Light unless the user has explicitly chosen dark. OS preference is ignored
  // on purpose, so first-time students/teachers always start in light mode.
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark';
  } catch { /* ignore */ }
  return false;
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
