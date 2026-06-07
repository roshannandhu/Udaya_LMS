import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, KeyRound, Users, BookOpen, GraduationCap, Loader2, CheckCircle2 } from 'lucide-react';
import { Avatar, Btn, Input } from '../../components/ui';
import { useAuthStore } from '../../lib/auth';
import { apiClient } from '../../lib/api';

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
  const [email] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    try {
      await apiClient('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      setUser({ ...user, name: name.trim() }, user?.role);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">My Profile</h1>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-6">

        {/* Avatar + name header */}
        <div className="glass-panel border-white/60 shadow-sm rounded-xl p-6 flex items-center gap-5">
          <Avatar name={user?.name} size="xl" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold">{user?.name || 'Teacher'}</p>
            <p className="text-sm text-neutral-500">{email}</p>
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
              <p className="text-xs font-medium text-neutral-600 mb-1.5">Email</p>
              <p className="text-sm text-neutral-500 px-3 py-2 rounded-md bg-neutral-50/50 border border-white/60">{email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Btn variant="primary" size="sm" icon={saved ? CheckCircle2 : Save} onClick={handleSave} disabled={saving || !name.trim() || name === user?.name}>
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
            <Btn variant="primary" size="sm" icon={KeyRound} onClick={() => navigate('/teacher/settings')}>
              Change password
            </Btn>
          </div>
        </div>

      </div>
    </div>
  );
}
