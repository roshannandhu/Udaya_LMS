import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Users, Upload } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Avatar, Tag, Skeleton, Btn } from '../../components/ui';
import BulkImportModal from '../../components/teacher/BulkImportModal';
import { useAppCache } from '../../store';

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState('');
  const [stdFilter, setStdFilter] = useState('all');
  const [sortBy, setSortBy]       = useState('name');
  const [importOpen, setImportOpen] = useState(false);

  // Pull from global cache (instant if prefetched)
  const { students, standards, studentsReady, standardsReady, refreshStudents, refreshStandards } = useAppCache();
  const loading = !studentsReady || !standardsReady;

  useEffect(() => {
    // Background refresh
    refreshStudents();
    refreshStandards();
  }, []);

  const filtered = useMemo(() => {
    let list = [...students];
    if (stdFilter !== 'all') list = list.filter(s => String(s.standard_id) === String(stdFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(search)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'name')       return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'score')      return (b.avg_score || 0) - (a.avg_score || 0);
      if (sortBy === 'attendance') return (b.attendance_pct || 0) - (a.attendance_pct || 0);
      if (sortBy === 'points')     return (b.points || 0) - (a.points || 0);
      return 0;
    });
    return list;
  }, [search, stdFilter, sortBy, students]);

  return (
    <div>
      <TopBar title="Students" subtitle={loading ? '…' : `${filtered.length} of ${students.length}`} />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Btn variant="primary" icon={Upload} onClick={() => setImportOpen(true)} className="md:order-last ml-auto">
            Bulk Import
          </Btn>
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, username, email…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 focus:border-neutral-400 outline-none text-sm shadow-sm" />
          </div>
          <select value={stdFilter} onChange={e => setStdFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 outline-none text-sm shadow-sm">
            <option value="all">All standards</option>
            {standards.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 outline-none text-sm shadow-sm">
            <option value="name">Name</option>
            <option value="score">Avg score</option>
            <option value="attendance">Attendance</option>
            <option value="points">Points</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 glass-panel border-dashed border-white/60 rounded-2xl">
            <Users size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-medium text-neutral-600">
              {search || stdFilter !== 'all' ? 'No students match your filters' : 'No students yet'}
            </p>
            {!search && stdFilter === 'all' && (
              <p className="text-sm text-neutral-400 mt-1">Add students from the standard page.</p>
            )}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden">
            {filtered.map((s, i) => {
              const std = standards.find(x => String(x.id) === String(s.standard_id));
              const attendLow = (s.attendance_pct ?? 100) < 75;
              return (
                <button key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/40 transition-colors text-left ${i > 0 ? 'border-t border-white/40' : ''}`}>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {std && <Tag color="gray">{std.emoji} {std.name}</Tag>}
                      {s.blocked && <Tag color="red">Blocked</Tag>}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">@{s.username}</p>
                    {/* Mobile stats */}
                    <div className="flex md:hidden gap-4 text-xs mt-1 text-neutral-500">
                      <span>Score: {Math.round(s.avg_score || 0)}%</span>
                      <span className={attendLow ? 'text-red-500 font-medium' : ''}>
                        Att: {Math.round(s.attendance_pct || 0)}%
                      </span>
                    </div>
                  </div>
                  {/* Desktop stats */}
                  <div className="hidden md:flex items-center gap-6 text-xs text-right mr-2">
                    {[
                      ['Score',  `${Math.round(s.avg_score || 0)}%`],
                      ['Attend', `${Math.round(s.attendance_pct || 0)}%`, attendLow ? 'text-red-500 font-semibold' : ''],
                      ['Points', s.points || 0],
                    ].map(([k, v, cls = '']) => (
                      <div key={k}>
                        <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{k}</p>
                        <p className={`font-semibold ${cls}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <ChevronRight size={14} className="text-neutral-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BulkImportModal 
        open={importOpen} 
        onClose={() => setImportOpen(false)} 
        standards={standards} 
        existingStudents={students}
        onImportComplete={(count) => {
          refreshStudents();
        }}
      />
    </div>
  );
}
