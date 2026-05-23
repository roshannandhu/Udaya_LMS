import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Edit2, MoreVertical, MessageSquare, Download, Lock, Trash2, Target, CheckCircle2, Trophy, BookOpen, ChevronRight, ShieldOff, Shield } from 'lucide-react';
import { Btn, Avatar, Tag, Divider, Modal, Input, SectionHeader, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';
import { useAppCache } from '../../store';
import AttendanceStudentCard from '../../components/teacher/AttendanceStudentCard';
import StudentReportModal from '../../components/teacher/StudentReportModal';

export default function StudentDetailPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [standard, setStandard] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [resetPwResult, setResetPwResult] = useState(null);
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const s = await apiClient(`/students/${studentId}`);
        setStudent(s);
        setEditForm({ name: s.name || '', email: s.email || '', phone: s.phone || '' });

        if (s.standard_id) {
          const [std, subs] = await Promise.all([
            apiClient(`/standards/${s.standard_id}`).catch(() => null),
            apiClient(`/subjects?standard_id=${s.standard_id}`).catch(() => []),
          ]);
          setStandard(std);
          setSubjects(subs || []);
        }
      } catch (err) {
        console.error('Student fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [studentId]);

  const handleSave = async () => {
    try {
      await apiClient(`/students/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editForm.name, email: editForm.email, phone: editForm.phone }),
      });
      setStudent((prev) => ({ ...prev, ...editForm }));
      useAppCache.getState().invalidateStudents();
      useAppCache.getState().refreshStudents();
      setEditOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetPassword = async () => {
    setResetPwLoading(true);
    setMenuOpen(false);
    try {
      const res = await apiClient(`/students/${studentId}/reset-password`, { method: 'POST' });
      setResetPwResult(res.new_password);
    } catch (err) {
      console.error(err);
    } finally {
      setResetPwLoading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await apiClient(`/students/${studentId}`, { method: 'DELETE' });
      setRemoved(true);
      setConfirmRemove(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBlock = async () => {
    setBlockLoading(true);
    setMenuOpen(false);
    try {
      const newBlocked = !student?.blocked;
      await apiClient(`/students/${studentId}/block?blocked=${newBlocked}`, { method: 'PATCH' });
      setStudent(prev => ({ ...prev, blocked: newBlocked }));
      useAppCache.getState().invalidateStudents();
    } catch (err) {
      console.error(err);
    } finally {
      setBlockLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (removed) {
    return (
      <div>
        <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
            <h1 className="text-base font-semibold">Student removed</h1>
          </div>
        </div>
        <div className="px-5 md:px-8 py-16 max-w-5xl mx-auto text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-green-500" />
          <h3 className="font-medium mb-1">{student?.name} has been removed</h3>
          <p className="text-sm text-neutral-500 mb-5">They no longer have access to {standard?.name}.</p>
          <Btn variant="primary" onClick={() => navigate('/teacher/students')}>Back to students</Btn>
        </div>
      </div>
    );
  }

  const s = student || {};

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
          <div className="flex-1 min-w-0">
            <p className="hidden lg:block text-[11px] text-neutral-400 leading-none mb-0.5">Students / {standard?.name}</p>
            <h1 className="text-base font-semibold truncate">{s.name}</h1>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-start gap-4 mb-8 pb-8 border-b border-white/60">
          <Avatar name={s.name} src={s.avatar_url} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-semibold">{s.name}</h2>
              {s.blocked && <Tag color="red">Blocked</Tag>}
            </div>
            <p className="text-sm text-neutral-500 mb-3">@{s.username}</p>
            <div className="flex items-center gap-3 text-xs text-neutral-600 flex-wrap">
              {s.email && <span className="flex items-center gap-1"><Mail size={12} /> {s.email}</span>}
              {s.phone && <span className="flex items-center gap-1"><Phone size={12} /> {s.phone}</span>}
              {standard && <Tag color="gray">{standard.emoji} {standard.name}</Tag>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 relative">
            <Btn variant="default" size="sm" icon={Edit2} onClick={() => setEditOpen(true)}>Edit</Btn>
            <Btn variant="default" size="sm" icon={MoreVertical} onClick={() => setMenuOpen(!menuOpen)} />
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 w-48 py-1 z-50 rounded-xl glass-panel border border-white/60 shadow-lg backdrop-blur-md">
                  <button onClick={() => { navigate('/teacher/broadcasts', { state: { stdId: s.standard_id } }); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left"><MessageSquare size={13} /> Message standard</button>
                  <button onClick={() => { setReportOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left"><Download size={13} /> Export report</button>
                  <button onClick={handleResetPassword} disabled={resetPwLoading} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left"><Lock size={13} /> {resetPwLoading ? 'Resetting…' : 'Reset password'}</button>
                  <button onClick={handleToggleBlock} disabled={blockLoading} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-amber-50 text-left text-amber-700">
                    {s.blocked ? <Shield size={13} /> : <ShieldOff size={13} />} {blockLoading ? 'Updating…' : s.blocked ? 'Unblock student' : 'Block student'}
                  </button>
                  <Divider className="my-1" />
                  <button onClick={() => { setConfirmRemove(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600"><Trash2 size={13} /> Remove from standard</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Avg score',  value: s.avg_score != null ? `${Math.round(s.avg_score)}%` : '—', icon: Target },
            { label: 'Attendance', value: s.attendance_pct != null ? `${Math.round(s.attendance_pct)}%` : '—', icon: CheckCircle2 },
            { label: 'Points',     value: s.points ?? 0, icon: Trophy },
            { label: 'Subjects',   value: subjects.length, icon: BookOpen },
          ].map((stat, i) => (
            <div key={i} className="p-4 glass-panel border-white/60 shadow-sm rounded-xl">
              <stat.icon size={14} className="text-neutral-500 mb-2" />
              <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
              <p className="text-xs text-neutral-600">{stat.label}</p>
            </div>
          ))}
        </div>

        {s.standard_id && (
          <button
            onClick={() => navigate('/teacher/broadcasts', { state: { stdId: s.standard_id } })}
            className="w-full flex items-center gap-3 p-3.5 glass-panel rounded-xl hover:bg-white/50 transition-colors text-left mb-8 border border-white/60">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Broadcast to {standard?.name || 'class'}</p>
              <p className="text-xs text-neutral-500">Send a message to all students in this class</p>
            </div>
            <ChevronRight size={14} className="text-neutral-400" />
          </button>
        )}

        <div className="mb-8">
          <AttendanceStudentCard studentId={studentId} />
        </div>

        {subjects.length > 0 && (
          <div className="mb-8">
            <SectionHeader title="Enrolled in" count={subjects.length} />
            <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden">
              {subjects.map((c, i) => (
                <button key={c.id} onClick={() => navigate(`/teacher/subjects/${c.standard_id}/${c.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/70 transition-colors text-left ${i < subjects.length - 1 ? 'border-b border-white/40' : ''}`}>
                  <span className="text-lg">{c.emoji}</span>
                  <p className="flex-1 text-sm font-medium truncate">{c.name}</p>
                  <ChevronRight size={14} className="text-neutral-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit student">
        <div className="space-y-4">
          <Input label="Full name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
          <Input label="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label="Phone" type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSave}>Save</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetPwResult} onClose={() => setResetPwResult(null)} title="Password reset" size="sm">
        <p className="text-sm text-neutral-600 mb-3">New temporary password for <strong>{s.name}</strong>:</p>
        <div className="flex items-center gap-2 p-3 bg-neutral-900 text-white rounded-lg font-mono text-base mb-3 select-all">
          {resetPwResult}
        </div>
        <p className="text-xs text-neutral-500 mb-4">Share this with the student. They'll be prompted to change it on next login.</p>
        <Btn variant="primary" className="w-full" onClick={() => { navigator.clipboard.writeText(resetPwResult); setResetPwResult(null); }}>
          Copy & close
        </Btn>
      </Modal>

      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove student?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">Remove <strong>{s.name}</strong> from <strong>{standard?.name}</strong>?</p>
        <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Btn>
          <Btn variant="dangerSolid" onClick={handleRemove}>Remove</Btn>
        </div>
      </Modal>

      <StudentReportModal open={reportOpen} onClose={() => setReportOpen(false)} studentId={studentId} />
    </div>
  );
}
