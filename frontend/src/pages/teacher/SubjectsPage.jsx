import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, X, Loader2, ArrowRight,
  Users, BookOpen, UserPlus, BookPlus
} from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';
import { useAppCache, useSettingsStore } from '../../store';

/* ─── Badge colour helpers ─────────────────────────────────────── */
function getStdNum(name) { const m = name.match(/\d+/); return m ? m[0] : ''; }
function getGradient(num) {
  switch (num) {
    case '10': return 'from-[#EEEDFE] to-[#E3E1FC] text-[#3C3489] border-[#D4D1FA]';
    case '11': return 'from-[#E1F5EE] to-[#D0EFE5] text-[#085041] border-[#BCE8DA]';
    case '12': return 'from-[#FBEAF0] to-[#F8DDE6] text-[#72243E] border-[#F4CEDB]';
    case '9':  return 'from-[#FAEEDA] to-[#F6E3C6] text-[#633806] border-[#F1D7B0]';
    default:   return 'from-white/60 to-white/40 text-neutral-800 border-white/80';
  }
}

/* ─── Modals (New Standard, New Subject, Add Student) ────────── */
function NewStandardModal({ open, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [emoji, setEmoji] = useState('📚');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { invalidate, refreshStandards } = useAppCache();

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Please enter a standard name'); return; }
    setLoading(true); setError('');
    try {
      const created = await apiClient('/standards', { method: 'POST', body: JSON.stringify({ name, short, emoji }) });
      setName(''); setShort(''); setEmoji('📚');
      invalidate(); await refreshStandards();
      onClose(); if (onSuccess) onSuccess(created);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Class" size="sm">
      <div className="space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 10" />
        <Input label="Short name (optional)" value={short} onChange={(e) => setShort(e.target.value)} placeholder="e.g. 10th" />
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Emoji</label>
          <div className="flex gap-2 flex-wrap">
            {['📚', '📖', '🎓', '✨', '💡', '🔢', '🧪', '📐'].map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border transition-all ${emoji === e ? 'border-neutral-900 bg-white shadow-sm scale-110' : 'border-white/60 hover:bg-white/40'}`}>{e}</button>
            ))}
          </div>
        </div>
        <Btn onClick={handleSubmit} disabled={loading} className="w-full" variant="primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null} Create Class
        </Btn>
      </div>
    </Modal>
  );
}

function NewSubjectModal({ open, onClose, standardId, standardName }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📐');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { invalidate, refreshSubjects } = useAppCache();

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Please enter a subject name'); return; }
    setLoading(true); setError('');
    try {
      await apiClient('/subjects', { method: 'POST', body: JSON.stringify({ standard_id: standardId, name, emoji }) });
      setName(''); setEmoji('📐');
      invalidate(); await refreshSubjects();
      onClose();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`New Subject for ${standardName || 'Class'}`} size="sm">
      <div className="space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}
        <Input label="Subject name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Emoji</label>
          <div className="flex gap-2 flex-wrap">
            {['📐', '🧮', '🔬', '🌍', '📝', '💻', '🎨', '📕'].map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border transition-all ${emoji === e ? 'border-neutral-900 bg-white shadow-sm scale-110' : 'border-white/60 hover:bg-white/40'}`}>{e}</button>
            ))}
          </div>
        </div>
        <Btn onClick={handleSubmit} disabled={loading} className="w-full" variant="primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : null} Create Subject
        </Btn>
      </div>
    </Modal>
  );
}

function AddStudentModal({ open, onClose, standardId, standardName }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const { invalidateStudents, refreshStudents } = useAppCache();
  const { defaultStudentPassword } = useSettingsStore();

  const handleSubmit = async () => {
    if (!name.trim() || !username.trim()) { setError('Name and username are required'); return; }
    setLoading(true); setError('');
    try {
      const result = await apiClient('/admin/create-student', {
        method: 'POST',
        body: JSON.stringify({ name, username: username.toLowerCase().replace(/\s/g, '.'), email: email || undefined, password: password || defaultStudentPassword || 'student123', standard_id: standardId })
      });
      setSuccess(`Created! Username: ${result.username}`);
      setName(''); setUsername(''); setEmail(''); setPassword('');
      invalidateStudents(); await refreshStudents();
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add Student to ${standardName || 'Class'}`} size="sm">
      <div className="space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</div>}
        {success && <div className="text-xs text-green-600 bg-green-50 p-3 rounded-xl border border-green-100">{success}</div>}
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarav Patel" />
        <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="aarav.p" />
        <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={defaultStudentPassword ? `Leave blank to use "${defaultStudentPassword}"` : 'Leave blank for student123'} />
        <Btn onClick={handleSubmit} disabled={loading} className="w-full" variant="primary">
          {loading && <Loader2 size={14} className="animate-spin" />} Add Student
        </Btn>
      </div>
    </Modal>
  );
}

/* ─── Premium Glassmorphic Class Card ────────────────────────── */
function PremiumClassCard({ std, subjectsCount, studentsCount, navigate }) {
  const num = getStdNum(std.name);
  const grad = getGradient(num);

  return (
    <div 
      onClick={() => navigate(`/teacher/subjects/${std.id}`)}
      className="group relative bg-white/40 backdrop-blur-2xl border border-white/60 rounded-[20px] md:rounded-[24px] p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full"
    >
      {/* Decorative background glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/40 rounded-full blur-3xl group-hover:bg-white/60 transition-colors pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-start justify-between mb-4 md:mb-8 relative z-10">
        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-xl md:text-2xl font-bold bg-gradient-to-br border shadow-sm ${grad}`}>
          {num || std.emoji || '📚'}
        </div>
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/50 border border-white/60 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900 transition-all shadow-sm">
          <ArrowRight size={18} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative z-10">
        <h3 className="text-lg md:text-xl font-bold text-neutral-900 tracking-tight mb-1">{std.name}</h3>
        <p className="text-xs md:text-sm text-neutral-500 font-medium mb-4 md:mb-6">Standard Details</p>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <div className="bg-white/50 border border-white/60 rounded-xl md:rounded-2xl p-2 md:p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <BookOpen size={12} className="md:w-3.5 md:h-3.5" />
              <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider">Subjects</span>
            </div>
            <span className="text-lg md:text-xl font-bold text-neutral-900">{subjectsCount}</span>
          </div>
          <div className="bg-white/50 border border-white/60 rounded-xl md:rounded-2xl p-2 md:p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <Users size={12} className="md:w-3.5 md:h-3.5" />
              <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wider">Students</span>
            </div>
            <span className="text-lg md:text-xl font-bold text-neutral-900">{studentsCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Classes Page ─────────────────────────────────────────── */
export default function SubjectsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  
  // Modal states
  const [newStdOpen, setNewStdOpen] = useState(false);
  const [activeStdForSubject, setActiveStdForSubject] = useState(null);
  const [activeStdForStudent, setActiveStdForStudent] = useState(null);

  const standards      = useAppCache(s => s.standards);
  const subjects       = useAppCache(s => s.subjects);
  const students       = useAppCache(s => s.students);
  const standardsReady = useAppCache(s => s.standardsReady);
  const subjectsReady  = useAppCache(s => s.subjectsReady);
  const refreshStandards  = useAppCache(s => s.refreshStandards);
  const refreshSubjects   = useAppCache(s => s.refreshSubjects);
  const refreshStudents   = useAppCache(s => s.refreshStudents);
  const loading = !standardsReady || !subjectsReady;

  useEffect(() => {
    refreshStandards();
    refreshSubjects();
    refreshStudents();
  }, []);

  const filtered = standards.filter(std =>
    !search || std.name.toLowerCase().includes(search.toLowerCase())
  );

  const getSubjectsCount = (stdId) => subjects.filter(s => String(s.standard_id) === String(stdId)).length;
  const getStudentsCount = (stdId) => students.filter(s => String(s.standard_id) === String(stdId)).length;

  return (
    <div className="pb-28">
      <TopBar
        title="Classes"
        subtitle={`${standards.length} classes · ${subjects.length} subjects`}
        action={<Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewStdOpen(true)}>New class</Btn>}
      />
      <div className="px-5 md:px-8 py-8 max-w-7xl mx-auto">
        {/* Search */}
        <div className="mb-8 relative max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/40 backdrop-blur-md border border-white/60 focus:border-neutral-400 focus:bg-white/60 outline-none text-sm shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all font-medium placeholder:text-neutral-400" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-white/60"><X size={14} /></button>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => <Skeleton key={i} className="h-72 rounded-[24px]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 glass-panel rounded-[32px] border-dashed border-white/80">
            <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/60 shadow-sm">
              <BookOpen size={32} className="text-neutral-300" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-1">No classes found</h3>
            <p className="text-sm text-neutral-500 mb-6">Create your first class to get started.</p>
            <Btn variant="primary" icon={Plus} onClick={() => setNewStdOpen(true)}>Create class</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(std => (
              <PremiumClassCard
                key={std.id}
                std={std}
                subjectsCount={getSubjectsCount(std.id)}
                studentsCount={getStudentsCount(std.id)}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </div>

      <NewStandardModal 
        open={newStdOpen} 
        onClose={() => setNewStdOpen(false)} 
      />
      <NewSubjectModal 
        open={!!activeStdForSubject} 
        onClose={() => setActiveStdForSubject(null)} 
        standardId={activeStdForSubject?.id} 
        standardName={activeStdForSubject?.name}
      />
      <AddStudentModal 
        open={!!activeStdForStudent} 
        onClose={() => setActiveStdForStudent(null)} 
        standardId={activeStdForStudent?.id} 
        standardName={activeStdForStudent?.name}
      />
    </div>
  );
}