import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, KeyRound, Users, BookOpen, GraduationCap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Avatar, Btn, Input, Modal } from '../../components/ui';
import { useAuthStore } from '../../lib/auth';
import { apiClient } from '../../lib/api';

function ChangePasswordModal({ open, onClose }) {
  const { changePassword } = useAuthStore();
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) { setForm({ next: '', confirm: '' }); setError(''); setSuccess(false); setSaving(false); }
  }, [open]);

  const handleSave = async () => {
    if (form.next.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.next !== form.confirm) { setError('New passwords do not match.'); return; }
    setError('');
    setSaving(true);
    const result = await changePassword(form.next);
    setSaving(false);
    if (result.success) {
      setSuccess(true);
      setTimeout(onClose, 1200);
    } else {
      setError(result.error || 'Failed to change password');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm">
      <div className="space-y-4">
        <Input label="New password" type="password" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} disabled={saving || success} autoFocus />
        <Input label="Confirm new password" type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} disabled={saving || success} />
        {error && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
        {success && <p className="text-xs text-green-600 flex items-center gap-1.5"><CheckCircle2 size={12} /> Password updated!</p>}
        <div className="flex gap-2 justify-end pt-1">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving || success}>{saving ? 'Saving…' : 'Update password'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="p-4 glass-panel border-white/60 shadow-sm rounded-xl">
      <Icon size={16} className={`${color} mb-2`} />
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function TeacherProfilePage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pwdOpen, setPwdOpen] = useState(false);

  const nameChanged  = name.trim() && name.trim() !== (user?.name || '');
  const emailChanged = email.trim() && email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
  const dirty = nameChanged || emailChanged;

  useEffect(() => {
    const load = async () => {
      try {
        const d = await apiClient('/dashboard/stats');
        setStats(d);
      } catch (e) {
        console.error(e);
      } finally {
        setStatsLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = {};
      if (nameChanged) body.name = name.trim();
      if (emailChanged) body.email = email.trim().toLowerCase();
      await apiClient('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
      setUser({
        ...user,
        ...(nameChanged ? { name: name.trim() } : {}),
        ...(emailChanged ? { email: email.trim().toLowerCase() } : {}),
      }, user?.role);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-3 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">My Profile</h1>
        </div>
      </div>

      <div className="px-3 md:px-8 py-6 max-w-5xl mx-auto space-y-6">

        {/* Avatar + name header */}
        <div className="glass-panel border-white/60 shadow-sm rounded-xl p-6 flex items-center gap-5">
          <Avatar name={user?.name} size="xl" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold">{user?.name || 'Teacher'}</p>
            <p className="text-sm text-neutral-500">{user?.email}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statsLoading ? (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 glass-panel border-white/60 shadow-sm rounded-xl animate-pulse">
                  <div className="h-4 w-10 bg-neutral-200 rounded mb-2" />
                  <div className="h-6 w-16 bg-neutral-200 rounded" />
                </div>
              ))}
            </>
          ) : (
            <>
              <StatCard icon={GraduationCap} label="Standards" value={stats?.standards_count ?? 0} color="text-blue-600" />
              <StatCard icon={Users} label="Students" value={stats?.students_count ?? 0} color="text-green-600" />
              <StatCard icon={BookOpen} label="Subjects" value={stats?.subjects_count ?? 0} color="text-amber-600" />
            </>
          )}
        </div>

        {/* Editable name */}
        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Profile</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-4">
            <div>
              <Input label="Full name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Input label="Email (login)" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              {emailChanged && (
                <p className="text-[11px] text-amber-600 mt-1.5">You'll log in with this new email after saving.</p>
              )}
            </div>
            {saveError && (
              <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {saveError}</p>
            )}
            <div className="flex items-center gap-2">
              <Btn variant="primary" size="sm" icon={saved ? CheckCircle2 : Save} onClick={handleSave} disabled={saving || !dirty}>
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </Btn>
            </div>
          </div>
        </div>

        {/* Account */}
        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Account</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
            <p className="text-sm text-neutral-600 mb-3">Update your login password to keep your account secure.</p>
            <Btn variant="primary" size="sm" icon={KeyRound} onClick={() => setPwdOpen(true)}>
              Change password
            </Btn>
          </div>
        </div>

      </div>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
  );
}
