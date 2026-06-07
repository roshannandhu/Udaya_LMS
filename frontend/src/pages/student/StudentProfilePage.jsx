import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../lib/auth';
import { useAppCache, useSettingsStore } from '../../store';
import { Edit2, LogOut, Target, CheckCircle2, Trophy, BookOpen, Lock, Camera, Loader2, PlayCircle, ChevronDown, ChevronUp, BarChart2, Mail, Phone, AtSign, Settings, Star, Sparkles, Activity, User, ArrowRight } from 'lucide-react';
import { Modal, Input, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';
import AttendanceStudentCard from '../../components/teacher/AttendanceStudentCard';
import { fadeUp, staggerChildren, springCard } from '../../lib/motion';

function relTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StudentProfilePage() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const studentsCanViewReport = useSettingsStore(s => s.studentsCanViewReport);

  const [student, setStudent] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [myVideos, setMyVideos] = useState([]);
  const [videosExpanded, setVideosExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const [me, subs, vids] = await Promise.all([
          apiClient('/auth/me'),
          apiClient('/subjects'),
          apiClient('/students/me/videos').catch(() => []),
        ]);
        if (isMounted) {
          setStudent(me);
          setSubjects(Array.isArray(subs) ? subs : []);
          setMyVideos(Array.isArray(vids) ? vids : []);
          setEditForm({ name: me?.name || '', email: me?.email || '', phone: me?.phone || '' });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  const handleLogout = async () => {
    await clearAuth();
    navigate('/login', { replace: true });
  };

  const displayStudent = student || user;

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('tutoria_token');
      const { getApiBaseUrl } = await import('../../lib/api');
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/students/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Avatar upload failed');
      const newUrl = data.avatar_url;
      setStudent(prev => ({ ...prev, avatar_url: newUrl }));
      const { user: authUser, role, setUser } = useAuthStore.getState();
      setUser({ ...authUser, avatar_url: newUrl }, role);
      useAppCache.getState().invalidateStudents?.();
      useAppCache.getState().refreshStudents?.();
    } catch (err) {
      console.error('Avatar upload failed', err);
      alert(err?.message || 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-20">
        <div className="px-5 md:px-8 pt-10 pb-4 max-w-[1200px] mx-auto">
          <Skeleton className="h-[400px] w-full rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  const name = displayStudent?.name || 'Student';
  const points = student?.points ?? 0;
  const avgScore = student?.avg_score ?? 0;
  const attendancePct = student?.attendance_pct ?? null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-[calc(6rem_+_env(safe-area-inset-bottom))] lg:pb-24 font-sans selection:bg-pink-100 selection:text-pink-900">
      
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 bg-[#F8F9FA] border-b border-black/5 mb-8">
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-pink-100 text-pink-500 flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-0.5">Settings</p>
              <h1 className="text-xl font-extrabold tracking-tight text-neutral-900">My Profile</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-5 md:px-8">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-12 gap-6 auto-rows-max">
          
          {/* ── 1. IDENTITY BENTO ── */}
          <motion.div variants={fadeUp} className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 border border-neutral-100 shadow-sm relative overflow-hidden flex flex-col items-center text-center group">
            {/* Pastel Blob Background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#fce4ec] rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-x-1/3 -translate-y-1/2 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#e0f7fa] rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-x-1/3 translate-y-1/2 pointer-events-none transition-transform group-hover:scale-110 duration-700"></div>

            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="relative cursor-pointer mb-6 transform group-hover:scale-105 transition-transform duration-300" onClick={() => avatarInputRef.current?.click()}>
                <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarChange} />
                
                <div className="w-32 h-32 rounded-[2rem] overflow-hidden shadow-xl shadow-black/5 bg-white border-4 border-white flex items-center justify-center">
                  {student?.avatar_url ? (
                    <img src={student.avatar_url} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl font-black text-pink-500">{name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                
                <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-neutral-900 rounded-full border-4 border-white flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform">
                  {avatarUploading ? <Loader2 size={18} className="text-white animate-spin" /> : <Camera size={18} className="text-white" />}
                </div>
              </div>

              <h1 className="text-2xl font-extrabold text-neutral-900 mb-1 leading-tight" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                {name}
              </h1>
              <p className={`text-sm font-bold uppercase tracking-widest text-neutral-400 ${student?.student_code ? 'mb-3' : 'mb-8'}`}>
                {student?.standard_name || 'Student'}
              </p>

              {student?.student_code && (
                <div className="mb-8 inline-flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Student ID</span>
                  <span className="px-4 py-1.5 rounded-full bg-neutral-100 border border-neutral-200 font-mono text-sm font-bold text-neutral-800">{student.student_code}</span>
                  <span className="text-[10px] text-neutral-400 mt-1.5">Use this to log in</span>
                </div>
              )}

              <button
                onClick={() => setEditOpen(true)}
                className="w-full py-4 px-6 bg-neutral-50 hover:bg-neutral-100 text-neutral-800 font-bold rounded-2xl transition-colors border border-neutral-200 flex items-center justify-center gap-2"
              >
                <Edit2 size={16} /> Edit Details
              </button>
            </div>
          </motion.div>

          {/* ── 2. GAMIFICATION BENTO ── */}
          <motion.div variants={fadeUp} onClick={() => navigate('/student/leaderboard')} className="lg:col-span-8 bg-gradient-to-br from-[#FFF4E5] to-[#FFE8CC] rounded-[2.5rem] p-8 md:p-12 border border-orange-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center justify-between cursor-pointer group">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 group-hover:scale-150 transition-transform duration-700 pointer-events-none"></div>
            
            <div className="relative z-10 text-center md:text-left mb-8 md:mb-0">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-orange-600 mb-4 flex items-center justify-center md:justify-start gap-2">
                <Trophy size={16} /> Leaderboard Status
              </h2>
              <div className="flex flex-col md:flex-row items-center md:items-end gap-2 md:gap-4 mb-2">
                <h3 className="text-6xl md:text-7xl font-extrabold text-orange-950 tracking-tight leading-none" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                  {points}
                </h3>
                <span className="text-xl font-bold text-orange-800 pb-2">XP</span>
              </div>
              <p className="text-orange-700 font-bold flex items-center justify-center md:justify-start gap-1">
                Keep learning to earn more points! <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </p>
            </div>

            <div className="relative z-10 w-32 h-32 md:w-48 md:h-48 rounded-full bg-white/40 backdrop-blur-sm border-8 border-white/60 shadow-2xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
              <Trophy className="w-16 h-16 md:w-24 md:h-24 text-amber-400 drop-shadow-md" fill="currentColor" />
            </div>
          </motion.div>

          {/* ── 3. AI MENTOR BENTO ── */}
          {studentsCanViewReport && (
            <motion.div variants={fadeUp} onClick={() => navigate('/student/report')} className="lg:col-span-12 bg-neutral-900 rounded-[2.5rem] p-8 md:p-12 shadow-sm relative overflow-hidden group cursor-pointer">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex-1 text-center md:text-left">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-[10px] font-extrabold uppercase tracking-widest border border-white/10 mb-6">
                    <Sparkles size={14} className="text-blue-300" /> Powered by Gemini AI
                  </span>
                  <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-4" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                    Read your personalized AI Mentor Report
                  </h2>
                  <p className="text-neutral-400 font-medium max-w-xl mx-auto md:mx-0">
                    Get deep insights into your learning patterns, test performance, and tailored advice on what to study next to maximize your scores.
                  </p>
                </div>
                
                <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-45 transition-transform duration-500 shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                  <ArrowRight size={24} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── 4. LEARNING STATS BENTO ── */}
          <motion.div variants={fadeUp} className="lg:col-span-12 bg-white rounded-[2.5rem] p-8 border border-neutral-100 shadow-sm">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-6 flex items-center gap-2">
              <Activity size={16} /> Performance Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { icon: Trophy,       color: 'text-amber-500',  bg: 'bg-amber-50',    value: points,                                                          label: 'Total XP'   },
                { icon: Target,       color: 'text-emerald-500',bg: 'bg-emerald-50',  value: avgScore ? `${Math.round(avgScore)}%` : '—',                    label: 'Avg Score'  },
                { icon: CheckCircle2, color: 'text-blue-500',   bg: 'bg-blue-50',     value: attendancePct !== null ? `${Math.round(attendancePct)}%` : '—', label: 'Attendance' },
                { icon: BookOpen,     color: 'text-purple-500', bg: 'bg-purple-50',   value: subjects.length,                                                label: 'Subjects'   },
              ].map((s, i) => (
                <div key={i} className="flex flex-col p-6 rounded-3xl bg-neutral-50 hover:bg-white border border-transparent hover:border-neutral-100 hover:shadow-md transition-all group">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${s.bg} group-hover:scale-110 transition-transform`}>
                    <s.icon size={20} className={s.color} />
                  </div>
                  <p className="text-3xl font-extrabold text-neutral-900 leading-none mb-2" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{s.value}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── 5. ACCOUNT ACTIONS & DETAILS ── */}
          <motion.div variants={fadeUp} className="lg:col-span-6 bg-white rounded-[2.5rem] p-8 border border-neutral-100 shadow-sm">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-6 flex items-center gap-2">
              <Settings size={16} /> Contact Info
            </h2>
            <div className="space-y-4">
              {displayStudent?.email && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-neutral-400">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Email</p>
                    <p className="text-sm font-bold text-neutral-900">{displayStudent.email}</p>
                  </div>
                </div>
              )}
              {student?.phone && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-neutral-400">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Phone</p>
                    <p className="text-sm font-bold text-neutral-900">{student.phone}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="lg:col-span-6 bg-white rounded-[2.5rem] p-8 border border-neutral-100 shadow-sm flex flex-col gap-4">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
              <Lock size={16} /> Security
            </h2>
            <button onClick={() => navigate('/student/change-password')} className="flex items-center justify-between p-6 rounded-3xl bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-100 group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-neutral-600 group-hover:scale-110 transition-transform">
                  <Lock size={20} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-neutral-900">Change Password</p>
                  <p className="text-xs text-neutral-500 font-medium">Update your security key</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <button onClick={handleLogout} className="flex items-center justify-between p-6 rounded-3xl bg-[#fff0f2] hover:bg-[#ffe4e8] transition-colors border border-[#ffccd5] group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                  <LogOut size={20} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-red-700">Sign Out</p>
                  <p className="text-xs text-red-400 font-medium">Log out of your account</p>
                </div>
              </div>
              <ArrowRight size={20} className="text-red-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          {/* ── 6. MY VIDEOS ACCORDION ── */}
          {myVideos.length > 0 && (
            <motion.div variants={fadeUp} className="lg:col-span-12 bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-neutral-100">
              <button className="w-full flex items-center justify-between p-8 hover:bg-neutral-50 transition-colors" onClick={() => setVideosExpanded(x => !x)}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                    <PlayCircle size={24} />
                  </div>
                  <div className="text-left">
                    <h2 className="text-xl font-extrabold text-neutral-900 leading-tight">Video Library</h2>
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mt-1">
                      {myVideos.filter(v => v.completed).length} of {myVideos.length} completed
                    </p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
                  {videosExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </button>
              
              {videosExpanded && (
                <div className="border-t border-neutral-100 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myVideos.map(v => (
                    <div key={v.video_id} className="flex items-center gap-4 p-4 rounded-3xl bg-neutral-50 hover:bg-white border border-transparent hover:border-neutral-100 hover:shadow-sm transition-all group cursor-pointer">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-200 flex items-center justify-center text-neutral-500 group-hover:bg-indigo-100 group-hover:text-indigo-500 transition-colors">
                        <PlayCircle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-neutral-900 truncate">{v.title}</p>
                        {v.subject_name && <p className="text-xs font-bold text-neutral-400 truncate">{v.subject_name}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {v.completed ? (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Done</span>
                        ) : (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">In Progress</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </motion.div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
          <div className="space-y-4 pt-4">
            <Input label="Full Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Email Address" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
            <Input label="Phone Number" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            
            <div className="flex gap-3 pt-6">
              <button 
                onClick={() => setEditOpen(false)} 
                disabled={editSaving}
                className="flex-1 py-4 px-4 rounded-2xl font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={editSaving} 
                onClick={async () => {
                  if (!editForm.name.trim()) return;
                  setEditSaving(true);
                  try {
                    await apiClient('/students/me', { method: 'PATCH', body: JSON.stringify({ name: editForm.name, email: editForm.email, phone: editForm.phone }) });
                    setStudent(prev => ({ ...prev, ...editForm }));
                    const { user, role, setUser } = useAuthStore.getState();
                    setUser({ ...user, ...editForm }, role);
                    useAppCache.getState().invalidateStudents();
                    useAppCache.getState().refreshStudents();
                    setEditOpen(false);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setEditSaving(false);
                  }
                }}
                className="flex-1 py-4 px-4 rounded-2xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center shadow-md shadow-indigo-500/20"
              >
                {editSaving ? <Loader2 size={20} className="animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}