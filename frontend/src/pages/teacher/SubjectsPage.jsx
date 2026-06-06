import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, X, Loader2, ArrowRight,
  Users, BookOpen, UserPlus, BookPlus
} from 'lucide-react';
import { motion } from 'framer-motion';
import TopBar from '../../components/shared/TopBar';
import { Btn, Modal, Input, Skeleton } from '../../components/ui';
import { PASTEL, pastelFor } from '../../components/cards/pastel';
import { springCard } from '../../lib/motion';
import { apiClient } from '../../lib/api';
import { useAppCache, useSettingsStore } from '../../store';

/* ─── Badge colour helpers ─────────────────────────────────────── */
function getStdNum(name) { const m = name.match(/\d+/); return m ? m[0] : ''; }

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
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border transition-all ${emoji === e ? 'border-neutral-900 bg-white shadow-sm scale-110' : 'border-white/60 hover:bg-[#F4F2EF]'}`}>{e}</button>
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
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl border transition-all ${emoji === e ? 'border-neutral-900 bg-white shadow-sm scale-110' : 'border-white/60 hover:bg-[#F4F2EF]'}`}>{e}</button>
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

/* ─── Bento Class Card ──────────────────────────────────────── */
function BentoClassCard({ std, subjectsCount, studentsCount, navigate, isLast }) {
  const num = getStdNum(std.name);
  const pastel = PASTEL[pastelFor(std.name)];

  return (
    <div className="relative flex items-start gap-4 md:gap-6 group">
      {/* Timeline line (hidden on very small screens, visible on md+) */}
      <div className="hidden md:flex flex-col items-center self-stretch pt-8">
        <div className="w-3 h-3 rounded-full border-2 bg-white z-10" style={{ borderColor: pastel.hex }} />
        {!isLast && <div className="w-0.5 flex-1 border-l-2 border-dashed border-neutral-200 my-2" />}
      </div>

      <motion.div
        onClick={() => navigate(`/teacher/subjects/${std.id}`)}
        whileHover={{ y: -4, scale: 1.01 }} whileTap={{ scale: 0.98 }} transition={springCard}
        className="flex-1 rounded-[2.5rem] p-6 md:p-8 cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{ background: pastel.hex }}
      >
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-3xl font-bold bg-white/60 shadow-sm"
            style={{ color: pastel.fgHex }}>
            {num || std.emoji || '📚'}
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-neutral-900 mb-1" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
              {std.name}
            </h3>
            <p className="text-sm font-medium text-neutral-600">
              {std.short || 'Standard details'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">
          <div className="bg-white/60 rounded-[1.2rem] px-4 py-2.5 flex items-center gap-2 flex-1 md:flex-initial">
            <BookOpen size={16} className="text-neutral-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Subjects</p>
              <p className="text-lg font-bold text-neutral-900 leading-none">{subjectsCount}</p>
            </div>
          </div>
          <div className="bg-white/60 rounded-[1.2rem] px-4 py-2.5 flex items-center gap-2 flex-1 md:flex-initial">
            <Users size={16} className="text-neutral-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Students</p>
              <p className="text-lg font-bold text-neutral-900 leading-none">{studentsCount}</p>
            </div>
          </div>
          <div className="w-12 h-12 rounded-[1.2rem] bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 group-hover:bg-black transition-colors ml-auto md:ml-2">
            <ArrowRight size={20} />
          </div>
        </div>
      </motion.div>
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
    <div className="pb-28 bg-[#F8F9FA] min-h-screen">
      {/* Hide the default TopBar since we are building a custom Bento header */}
      <div className="hidden"><TopBar title="Classes" /></div>
      
      <div className="px-5 md:px-8 py-8 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Main Content */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Custom Header Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-xl border border-neutral-100">📚</div>
                <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">My Classes</h1>
              </div>

              {/* Search Bar matching udaya.jpg */}
              <div className="relative w-full md:w-64">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes..."
                  className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white/80 border border-neutral-200 focus:bg-white focus:border-neutral-400 focus:ring-4 focus:ring-neutral-400/10 outline-none text-sm transition-all font-medium placeholder:text-neutral-400" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-900 rounded-lg hover:bg-neutral-100"><X size={14} /></button>}
              </div>
            </div>

            {/* Content List */}
            <div className="bg-white rounded-[3rem] p-6 md:p-10 shadow-sm border border-neutral-100 min-h-[60vh]">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold tracking-tight text-neutral-900">Class Directory</h2>
                
                {/* Stats Pills matching udaya.jpg top center */}
                <div className="hidden sm:flex items-center gap-3">
                  <div className="bg-sky-50 px-4 py-2 rounded-2xl text-center border border-sky-100">
                    <p className="text-xl font-bold text-sky-700 leading-none mb-1">{standards.length}</p>
                    <p className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Total</p>
                  </div>
                  <div className="bg-emerald-50 px-4 py-2 rounded-2xl text-center border border-emerald-100">
                    <p className="text-xl font-bold text-emerald-700 leading-none mb-1">{subjects.length}</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Subjects</p>
                  </div>
                  <div className="bg-amber-50 px-4 py-2 rounded-2xl text-center border border-amber-100">
                    <p className="text-xl font-bold text-amber-700 leading-none mb-1">{students.length}</p>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Students</p>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="space-y-6">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-[2.5rem]" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-neutral-50 rounded-[2.5rem] border-2 border-dashed border-neutral-200">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-neutral-100 shadow-sm">
                    <BookOpen size={24} className="text-neutral-400" />
                  </div>
                  <h3 className="text-lg font-bold text-neutral-900 mb-1">No classes found</h3>
                  <p className="text-sm text-neutral-500 mb-6">Create your first class to get started.</p>
                  <Btn variant="primary" icon={Plus} onClick={() => setNewStdOpen(true)}>Create class</Btn>
                </div>
              ) : (
                <div className="space-y-6">
                  {filtered.map((std, idx) => (
                    <BentoClassCard
                      key={std.id}
                      std={std}
                      subjectsCount={getSubjectsCount(std.id)}
                      studentsCount={getStudentsCount(std.id)}
                      navigate={navigate}
                      isLast={idx === filtered.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: My Events / Quick Actions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="flex items-center justify-between mb-2 px-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 flex items-center gap-2">
                Quick Actions ⚡
              </h2>
            </div>
            
            <button onClick={() => setNewStdOpen(true)} className="w-full bg-white rounded-[2rem] p-6 shadow-sm border border-neutral-100 hover:border-[#8B5CF6] hover:shadow-md transition-all group text-left">
              <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BookPlus size={20} />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 mb-1">Create New Class</h3>
              <p className="text-sm text-neutral-500">Set up a new standard or year group.</p>
            </button>

            <div className="bg-amber-50/50 rounded-[2rem] p-6 shadow-sm border border-amber-100">
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <BookOpen size={16} /> Directory Overview
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-amber-50">
                  <span className="text-sm font-medium text-neutral-700">Total Classes</span>
                  <span className="font-bold text-amber-600">{standards.length}</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-amber-50">
                  <span className="text-sm font-medium text-neutral-700">Total Subjects</span>
                  <span className="font-bold text-amber-600">{subjects.length}</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl shadow-sm border border-amber-50">
                  <span className="text-sm font-medium text-neutral-700">Enrolled Students</span>
                  <span className="font-bold text-amber-600">{students.length}</span>
                </div>
              </div>
            </div>
            
          </div>
          
        </div>
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