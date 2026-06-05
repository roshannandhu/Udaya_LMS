import React, { memo, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Search } from 'lucide-react';
import { useSettingsStore } from '../../store';
import { useAuthStore } from '../../lib/auth';
import { Avatar } from '../ui';
import NotificationBell from './NotificationBell';
import SearchPalette from './SearchPalette';
import { TEACHER_NAV, STUDENT_NAV, activeNavId } from './nav-items';

/**
 * Dark rounded top navigation bar (desktop only — hidden below lg, where the
 * BottomNav takes over). Matches the reference's dark pill nav.
 */
const TopNav = memo(function TopNav({ type = 'teacher' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lmsName, lmsLogo } = useSettingsStore();
  const { user, clearAuth } = useAuthStore();
  const items = type === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const active = activeNavId(type, location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const profilePath = type === 'teacher' ? '/teacher/more' : '/student/profile';

  const signOut = async () => {
    await clearAuth();
    navigate('/login');
  };

  return (
    <div className="hidden lg:block relative z-40 px-4 pt-4">
      <nav className="nav-dark max-w-6xl mx-auto px-4 py-2 flex items-center justify-between rounded-[28px]">
        {/* Brand */}
        <Link to={type === 'teacher' ? '/teacher' : '/student'} className="flex items-center gap-3 w-48 flex-shrink-0">
          <div className="w-9 h-9 rounded-[10px] bg-[#8B5CF6] flex items-center justify-center flex-shrink-0">
            <div className="w-3.5 h-3.5 border-[2.5px] border-white rounded-[3px] rotate-45" />
          </div>
          <span className="font-bold text-[22px] tracking-tight text-white truncate"
            style={{ fontFamily: '"Fraunces", Georgia, serif', letterSpacing: '-0.02em' }}>
            {lmsName || 'Udaya'}
          </span>
        </Link>

        {/* Center nav - icon only */}
        <div className="flex flex-1 justify-center items-center gap-3">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <Link key={item.id} to={item.path} title={item.label}
                className={`flex items-center justify-center w-[42px] h-[42px] rounded-full transition-colors flex-shrink-0 ${
                  isActive ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                }`}>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </Link>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center justify-end gap-3 w-48 flex-shrink-0">
          <button onClick={() => setSearchOpen(true)}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors">
            <Search size={18} />
          </button>
          <NotificationBell dark />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)}
              className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full hover:bg-white/10 transition-colors">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="Profile" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {user?.name ? user.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'AT'}
                </div>
              )}
              <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-lift border border-[#EFEDEA] overflow-hidden py-1">
                <Link to={profilePath} onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-neutral-700 hover:bg-[#F4F2EF]">Profile</Link>
                <button onClick={signOut}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
});

export default TopNav;
