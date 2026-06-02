import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import { useAppCache, useSettingsStore } from '../../store';
import { Edit2, LogOut, Target, CheckCircle2, Trophy, BookOpen, Lock, Camera, Loader2, PlayCircle, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import { Avatar, Modal, Btn, Input, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';
import AttendanceStudentCard from '../../components/teacher/AttendanceStudentCard';

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
  const [pwOpen, setPwOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [me, subs, vids] = await Promise.all([
          apiClient('/auth/me'),
          apiClient('/subjects'),
          apiClient('/students/me/videos').catch(() => []),
        ]);
        setStudent(me);
        setSubjects(Array.isArray(subs) ? subs : []);
        setMyVideos(Array.isArray(vids) ? vids : []);
        setEditForm({ name: me?.name || '', email: me?.email || '', phone: me?.phone || '' });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
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
      setStudent(prev => ({ ...prev, avatar_url: data.avatar_url }));
    } catch (err) {
      console.error('Avatar upload failed', err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-20">
        <div className="glass-nav bg-neutral-900/90 text-white p-6 pt-12">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-6">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl bg-white/10" />)}
          </div>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  const name = displayStudent?.name || 'Student';
  const points = student?.points ?? 0;
  const avgScore = student?.avg_score ?? 0;
  const attendancePct = student?.attendance_pct ?? null;

  return (
    <div className="min-h-screen bg-transparent pb-24">
      {/* Dark header */}
      <div className="glass-nav bg-neutral-900/90 border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)] text-white p-6 pt-12">
        <div className="flex items-center gap-4 max-w-xl mx-auto">
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            <input type="file" accept="image/*" ref={avatarInputRef} className="hidden" onChange={handleAvatarChange} />
            {student?.avatar_url ? (
              <img src={student.avatar_url} alt={name} className="w-16 h-16 rounded-full object-cover border-2 border-white/20 shadow-lg" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 flex items-center justify-center text-2xl font-bold border-2 border-white/20 shadow-lg">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {avatarUploading ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
            </div>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{name}</h1>
            <p className="text-neutral-400 text-sm">{student?.standard_name || 'Student'}</p>
            {student?.username && <p className="text-neutral-500 text-xs">@{student.username}</p>}
          </div>
          <button onClick={() => setEditOpen(true)}
            className="p-2 bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20 rounded-xl">
            <Edit2 size={18} />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-6 max-w-xl mx-auto">
          {[
            { icon: Trophy,       color: 'text-amber-400', value: points,                                                                    label: 'Points'     },
            { icon: Target,       color: 'text-green-400', value: avgScore ? `${Math.round(avgScore)}%` : '—',                              label: 'Avg Score'  },
            { icon: CheckCircle2, color: 'text-purple-400', value: attendancePct !== null ? `${Math.round(attendancePct)}%` : '—',           label: 'Attendance' },
            { icon: BookOpen,     color: 'text-blue-400',  value: subjects.length,                                                          label: 'Subjects'   },
          ].map((s, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3 text-center">
              <s.icon size={18} className={`mx-auto ${s.color} mb-1`} />
              <p className="text-base font-bold leading-tight">{s.value}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-xl mx-auto">
        {/* Attendance card */}
        {(student?.id || user?.id) && (
          <AttendanceStudentCard studentId={student?.id || user?.id} />
        )}

        {/* My Videos */}
        {myVideos.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/30 transition-colors"
              onClick={() => setVideosExpanded(x => !x)}
            >
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <PlayCircle size={16} className="text-neutral-500" />
                My Videos
                <span className="text-xs font-normal text-neutral-500">
                  {myVideos.filter(v => v.completed).length} of {myVideos.length} completed
                </span>
              </h2>
              {videosExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
            </button>
            {videosExpanded && (
              <div className="border-t border-white/40 divide-y divide-white/30">
                {myVideos.map(v => (
                  <div key={v.video_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      {v.subject_name && <p className="text-xs text-neutral-400">{v.subject_name}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {v.last_watched_at && (
                        <span className="text-xs text-neutral-400">{relTime(v.last_watched_at)}</span>
                      )}
                      {v.completed ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Done</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">In progress</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* About */}
        <div className="glass-panel rounded-2xl p-4">
          <h2 className="font-semibold mb-3">About</h2>
          <div className="space-y-2 text-sm">
            {displayStudent?.email && (
              <div className="flex items-center justify-between py-1 border-b border-white/40">
                <span className="text-neutral-500">Email</span>
                <span className="font-medium truncate max-w-[60%] text-right">{displayStudent.email}</span>
              </div>
            )}
            {student?.phone && (
              <div className="flex items-center justify-between py-1 border-b border-white/40">
                <span className="text-neutral-500">Phone</span>
                <span className="font-medium">{student.phone}</span>
              </div>
            )}
            {student?.username && (
              <div className="flex items-center justify-between py-1">
                <span className="text-neutral-500">Username</span>
                <span className="font-medium">@{student.username}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <button onClick={() => navigate('/student/leaderboard')}
          className="w-full flex items-center gap-3 p-4 glass-panel rounded-2xl hover:bg-white/40 transition-colors">
          <Trophy size={20} className="text-amber-500" />
          <span className="font-medium">Leaderboard</span>
        </button>

        {studentsCanViewReport && (
          <button onClick={() => navigate('/student/report')}
            className="w-full flex items-center gap-3 p-4 glass-panel rounded-2xl hover:bg-white/40 transition-colors">
            <BarChart2 size={20} className="text-blue-500" />
            <span className="font-medium">My Report Card</span>
          </button>
        )}

        <button onClick={() => navigate('/student/change-password')}
          className="w-full flex items-center gap-3 p-4 glass-panel rounded-2xl hover:bg-white/40 transition-colors">
          <Lock size={20} className="text-neutral-500" />
          <span className="font-medium">Change Password</span>
        </button>

        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 p-4 glass-panel rounded-2xl hover:bg-red-50/40 transition-colors text-red-600 border border-red-100">
          <LogOut size={20} />
          <span className="font-medium">Sign out</span>
        </button>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
          <div className="space-y-4">
            <Input label="Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Email" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
            <Input label="Phone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            <div className="flex gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setEditOpen(false)} className="flex-1" disabled={editSaving}>Cancel</Btn>
              <Btn variant="primary" disabled={editSaving} className="flex-1" onClick={async () => {
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
              }}>{editSaving ? 'Saving...' : 'Save'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}