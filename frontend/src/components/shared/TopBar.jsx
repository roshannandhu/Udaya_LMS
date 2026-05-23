import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import SearchPalette from './SearchPalette';

export default function TopBar({ title, subtitle, action, showSearch = true, breadcrumbs }) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
      <div className="px-5 md:px-8 py-4 flex items-center gap-3 max-w-5xl mx-auto">
        <div className="flex-1 min-w-0">
          {breadcrumbs && (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span>/</span>}
                  {b.path ? <Link to={b.path} className="hover:text-neutral-900 transition-colors">{b.label}</Link> : <span className="text-neutral-900">{b.label}</span>}
                </React.Fragment>
              ))}
            </div>
          )}
          <h1 className="text-base font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-neutral-500 truncate mt-0.5">{subtitle}</p>}
        </div>
        {showSearch && (
          <button onClick={() => setSearchOpen(true)}
            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/40 rounded-md transition-colors">
            <Search size={16} />
          </button>
        )}
        {action}
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
