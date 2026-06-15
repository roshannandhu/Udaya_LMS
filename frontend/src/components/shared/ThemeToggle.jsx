import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../lib/theme';

// Light/dark toggle. `onDark` styles it for the dark nav bar; otherwise a plain
// pill for light surfaces (e.g. the mobile "More" page).
export default function ThemeToggle({ onDark = false, showLabel = false, className = '' }) {
  const dark = useTheme(s => s.dark);
  const toggle = useTheme(s => s.toggle);
  const Icon = dark ? Sun : Moon;
  const base = onDark
    ? 'text-neutral-400 hover:text-white'
    : 'text-neutral-600 hover:text-neutral-900 hover:bg-[#F4F2EF]';
  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex items-center gap-2 ${showLabel ? 'px-3 py-2 rounded-xl' : 'p-1.5 rounded-full'} transition-colors ${base} ${className}`}
    >
      <Icon className="w-5 h-5" />
      {showLabel && <span className="text-sm font-medium">{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
