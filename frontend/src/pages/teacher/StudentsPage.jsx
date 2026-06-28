import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Users, Upload, Download, CheckCircle2, Loader2, List, Table2, ListChecks, CheckSquare, Square, X } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Avatar, Tag, Skeleton, Btn } from '../../components/ui';
import BulkImportModal from '../../components/teacher/BulkImportModal';
import StudentManageGrid from '../../components/teacher/StudentManageGrid';
import StudentBulkActions from '../../components/teacher/StudentBulkActions';
import { useAppCache, useSettingsStore } from '../../store';
import { apiClient } from '../../lib/api';
import { exportStudentsBackup } from '../../lib/studentBackup';
import SubjectIcon from '../../components/shared/SubjectIcon';

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState('');
  const [stdFilter, setStdFilter] = useState('all');
  const [sortBy, setSortBy]       = useState('name');
  const [view, setView]           = useState('list'); // 'list' | 'manage'
  const [importOpen, setImportOpen] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backedUp, setBackedUp]   = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected]     = useState(() => new Set()); // student ids
  const lmsName = useSettingsStore(s => s.lmsName);

  // Pull from global cache (instant if prefetched)
  const students        = useAppCache(s => s.students);
  const standards       = useAppCache(s => s.standards);
  const studentsReady   = useAppCache(s => s.studentsReady);
  const standardsReady  = useAppCache(s => s.standardsReady);
  const refreshStudents  = useAppCache(s => s.refreshStudents);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const loading = !studentsReady || !standardsReady;

  useEffect(() => {
    // Background refresh
    refreshStudents();
    refreshStandards();
  }, []);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      // Pull a fresh copy so the backup is complete & current; fall back to the
      // cached list if the network is down — the backup still works offline.
      let all = students;
      try {
        const fresh = await apiClient('/students');
        if (Array.isArray(fresh) && fresh.length) all = fresh;
      } catch { /* offline — use cached students */ }

      // Always back up EVERY student. The on-screen standard filter only affects
      // what's listed; "Backup" is an all-students action (one sheet per standard
      // plus a combined sheet), so it must not be scoped by the current filter.
      await exportStudentsBackup(all, standards, { filenamePrefix: lmsName });
      setBackedUp(true);
      setTimeout(() => setBackedUp(false), 2500);
    } catch (err) {
      console.error('Student backup failed:', err);
      alert('Could not create the backup. Please try again.');
    } finally {
      setBackingUp(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...students];
    if (stdFilter !== 'all') list = list.filter(s => String(s.standard_id) === String(stdFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.student_code || '').toLowerCase().includes(q) ||
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

  // ── Bulk select (List view) ─────────────────────────────────────────────────
  const selectedRows = useMemo(() => filtered.filter(s => selected.has(s.id)), [filtered, selected]);
  const allSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(prev => {
    const n = new Set(prev);
    if (allSelected) filtered.forEach(s => n.delete(s.id));
    else filtered.forEach(s => n.add(s.id));
    return n;
  });
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  return (
    <div>
      <TopBar title="Students" subtitle={loading ? '…' : `${filtered.length} of ${students.length}`} />
      <div className={`px-3 md:px-8 py-6 mx-auto ${view === 'manage' ? 'max-w-7xl' : 'max-w-5xl'}`}>

        {/* List / Manage toggle */}
        <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-pill bg-[#F1F1EF] border border-[#EFEDEA]">
          {[
            ['list', 'List', List],
            ['manage', 'Manage (Excel)', Table2],
          ].map(([key, label, Icon]) => (
            <button key={key} onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium transition-colors ${
                view === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
              }`}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="ml-auto md:order-last flex items-center gap-2">
            {view === 'list' && (
              <Btn
                variant={selectMode ? 'primary' : 'default'}
                icon={selectMode ? X : ListChecks}
                onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                disabled={studentsReady && students.length === 0}
                title="Select students for bulk actions"
              >
                {selectMode ? 'Cancel' : 'Select'}
              </Btn>
            )}
            <Btn
              variant="default"
              icon={backingUp ? Loader2 : backedUp ? CheckCircle2 : Download}
              onClick={handleBackup}
              disabled={backingUp || (studentsReady && students.length === 0)}
              className={backingUp ? '[&_svg]:animate-spin' : ''}
              title="Download a spreadsheet backup of all students (one sheet per standard)"
            >
              {backingUp ? 'Backing up…' : backedUp ? 'Saved ✓' : 'Backup'}
            </Btn>
            <Btn variant="primary" icon={Upload} onClick={() => setImportOpen(true)}>
              Bulk Import
            </Btn>
          </div>
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, username, email…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 outline-none text-sm shadow-sm" />
          </div>
          <select value={stdFilter} onChange={e => setStdFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] outline-none text-sm shadow-sm">
            <option value="all">All standards</option>
            {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {view === 'list' && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] outline-none text-sm shadow-sm">
              <option value="name">Name</option>
              <option value="score">Avg score</option>
              <option value="attendance">Attendance</option>
              <option value="points">Points</option>
            </select>
          )}
        </div>

        {/* Manage (Excel) grid — phone editing lives only here */}
        {view === 'manage' ? (
          <StudentManageGrid search={search} stdFilter={stdFilter} standards={standards} />
        ) : /* List */
        loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
            <Users size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-medium text-neutral-600">
              {search || stdFilter !== 'all' ? 'No students match your filters' : 'No students yet'}
            </p>
            {!search && stdFilter === 'all' && (
              <p className="text-sm text-neutral-400 mt-1">Add students from the standard page.</p>
            )}
          </div>
        ) : (
          <>
            {selectMode && (
              <StudentBulkActions selectedRows={selectedRows} standards={standards} onClear={() => setSelected(new Set())} />
            )}
          <div className="glass-panel rounded-2xl overflow-hidden">
            {selectMode && (
              <button onClick={toggleAll}
                className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-[#EFEDEA] bg-[#F1F1EF] text-xs font-semibold text-neutral-600 hover:bg-[#F4F2EF] transition-colors">
                {allSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} className="text-neutral-400" />}
                Select all ({filtered.length})
              </button>
            )}
            {filtered.map((s, i) => {
              const std = standards.find(x => String(x.id) === String(s.standard_id));
              const attendLow = (s.attendance_pct ?? 100) < 75;
              const isSel = selected.has(s.id);
              return (
                <button key={s.id} onClick={() => (selectMode ? toggleOne(s.id) : navigate(`/teacher/students/${s.id}`))}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${isSel ? 'bg-indigo-50/70' : 'hover:bg-[#F4F2EF]'} ${i > 0 ? 'border-t border-white/40' : ''}`}>
                  {selectMode && (isSel
                    ? <CheckSquare size={18} className="text-indigo-600 flex-shrink-0" />
                    : <Square size={18} className="text-neutral-300 flex-shrink-0" />)}
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {std && <Tag color="gray"><span className="inline-flex items-center gap-1"><SubjectIcon value={std.emoji} size={12} fallback="graduation" />{std.name}</span></Tag>}
                      {s.blocked && <Tag color="red">Blocked</Tag>}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">
                      {s.student_code && <><span className="font-mono text-neutral-600">{s.student_code}</span><span className="mx-1.5 text-neutral-300">·</span></>}
                      @{s.username}
                    </p>
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
                  {!selectMode && <ChevronRight size={14} className="text-neutral-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          </>
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
