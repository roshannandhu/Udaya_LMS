import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import { FileQuestion, BarChart3, Bell, Settings, ChevronRight, Edit2, LogOut, MessageSquare, Calendar, Loader2, Users, User, Database } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Avatar, Modal } from '../../components/ui';
import { Btn, Input } from '../../components/ui';
import { apiClient } from '../../lib/api';

export default function MorePage() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [profileEdit, setProfileEdit] = useState(false);
  const [profile, setProfile] = useState({
    name: user?.name || 'Teacher',
    email: user?.email || 'teacher@tutoria.com',
  });
  const [editForm, setEditForm] = useState(profile);
  const [editSaving, setEditSaving] = useState(false);

  const items = [
    { icon: User,          label: 'My Profile',    sub: 'Edit name & view stats',     onClick: () => navigate('/teacher/profile') },
    { icon: Database,      label: 'Question Bank', sub: 'Reusable questions',          onClick: () => navigate('/teacher/question-bank') },
    { icon: Users,         label: 'Students',      sub: 'Manage class students',      onClick: () => navigate('/teacher/students') },
    { icon: MessageSquare, label: 'Broadcasts',    sub: 'Send messages to students',  onClick: () => navigate('/teacher/broadcasts') },
    { icon: Calendar,      label: 'Attendance',    sub: 'Mark & view attendance',      onClick: () => navigate('/teacher/attendance') },
    { icon: BarChart3,     label: 'Reports',       sub: 'Analytics & low attendance', onClick: () => navigate('/teacher/reports') },
    { icon: Bell,          label: 'Notifications', sub: 'Reminders & alerts',         onClick: () => navigate('/teacher/reminders') },
    { icon: Settings,      label: 'Settings',      sub: 'App preferences',            onClick: () => navigate('/teacher/settings') },
    { icon: FileQuestion,  label: 'Help & Support',sub: 'FAQs and contact',           onClick: () => {} },
  ];

  const handleSave = async () => {
    setEditSaving(true);
    try {
      await apiClient('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: editForm.name }),
      });
      const { user, role, setUser } = useAuthStore.getState();
      setUser({ ...user, name: editForm.name }, role);
      setProfile(prev => ({ ...prev, name: editForm.name }));
      setProfileEdit(false);
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleLogout = async () => {
    await clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <TopBar title="More" />
      <div className="p-4 space-y-4">
        <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-neutral-900 flex items-center justify-center text-white text-lg font-medium">
              {profile.name?.charAt(0) || 'T'}
            </div>
            <div className="flex-1">
              <p className="font-medium">{profile.name}</p>
              <p className="text-sm text-neutral-500">{profile.email}</p>
            </div>
            <button onClick={() => setProfileEdit(true)} className="p-2 hover:bg-white/60 rounded-lg">
              <Edit2 size={18} className="text-neutral-500" />
            </button>
          </div>
        </div>

        <div className="glass-panel border-white/60 shadow-sm rounded-xl divide-y divide-white/40">
          {items.map((item, i) => (
            <button key={i} onClick={item.onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/40 transition-colors text-left">
              <div className="w-9 h-9 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center flex-shrink-0">
                <item.icon size={18} className="text-neutral-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.label}</p>
                {item.sub && <p className="text-xs text-neutral-500">{item.sub}</p>}
              </div>
              <ChevronRight size={16} className="text-neutral-400 flex-shrink-0" />
            </button>
          ))}
        </div>

        <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 text-red-600 glass-panel border-white/60 shadow-sm rounded-xl hover:bg-white/70 transition-colors">
          <LogOut size={20} />
          <span className="font-medium">Sign out</span>
        </button>
      </div>

      <Modal open={profileEdit} onClose={() => setProfileEdit(false)} title="Edit Profile">
        <div className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <p className="text-xs text-neutral-400">Email cannot be changed here.</p>
          <Btn onClick={handleSave} disabled={editSaving} className="w-full" variant="primary">
            {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Save
          </Btn>
        </div>
      </Modal>
    </div>
  );
}