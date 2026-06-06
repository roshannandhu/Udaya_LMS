import React, { useState } from 'react';
import { Search, Calendar } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SearchPalette from './SearchPalette';
import NotificationBell from './NotificationBell';
import { Avatar } from '../ui';
import { useAuthStore } from '../../lib/auth';

export default function TopBar({ title, subtitle, action, showSearch = true, breadcrumbs }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  // On phones, students reach their profile from a top-left avatar (the bottom
  // bar holds Home/Subjects/Broadcasts/Tests/Live). Desktop uses the TopNav.
  const showStudentProfile = location.pathname.startsWith('/student');

  return (
    <div className="px-5 md:px-8 pt-6 pb-2 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        {showStudentProfile && (
          <button
            onClick={() => navigate('/student/profile')}
            aria-label="Profile"
            className="lg:hidden flex-shrink-0 rounded-full ring-2 ring-[#EFEDEA]"
          >
            <Avatar name={user?.name || 'S'} src={user?.avatar_url} size="sm" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {breadcrumbs && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span>/</span>}
                  {b.path ? <Link to={b.path} className="hover:text-neutral-900 transition-colors">{b.label}</Link> : <span className="text-neutral-900">{b.label}</span>}
                </React.Fragment>
              ))}
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight truncate" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 truncate mt-1">{subtitle}</p>}
        </div>
        {/* Search + notifications live in the desktop TopNav; show here on mobile only. */}
        {showSearch && (
          <button onClick={() => setSearchOpen(true)}
            className="lg:hidden p-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-lg">
            <Search size={18} />
          </button>
        )}
        <div className="flex items-center gap-1 lg:hidden">
          <Link to={showStudentProfile ? '/student/calendar' : '/teacher/attendance'} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-full transition-colors">
            <Calendar size={18} />
          </Link>
          <NotificationBell />
        </div>
        {action}
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
