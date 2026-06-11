import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import { MdPerson, MdLibraryBooks, MdPeople, MdChatBubble, MdEvent, MdBarChart, MdNotifications, MdSettings, MdHelp, MdChevronRight, MdEdit, MdLogout, MdLoop } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import TopBar from '../../components/shared/TopBar';
import { Avatar, Modal } from '../../components/ui';
import { Btn, Input } from '../../components/ui';
import { PASTEL } from '../../components/cards/pastel';
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
    { icon: MdPerson,          label: 'My Profile',    sub: 'Edit name & view stats',     onClick: () => navigate('/teacher/profile') },
    { icon: MdLibraryBooks,    label: 'Question Bank', sub: 'Reusable questions',         onClick: () => navigate('/teacher/question-bank') },
    { icon: MdPeople,          label: 'Students',      sub: 'Manage class students',      onClick: () => navigate('/teacher/students') },
    { icon: MdChatBubble,      label: 'Broadcasts',    sub: 'Send messages to students',  onClick: () => navigate('/teacher/broadcasts') },
    { icon: FaWhatsapp,        label: 'WhatsApp',      sub: 'Message parents by class',   onClick: () => navigate('/teacher/whatsapp') },
    { icon: MdEvent,           label: 'Attendance',    sub: 'Mark & view attendance',     onClick: () => navigate('/teacher/attendance') },
    { icon: MdBarChart,        label: 'Reports',       sub: 'Analytics & low attendance', onClick: () => navigate('/teacher/reports') },
    { icon: MdNotifications,   label: 'Notifications', sub: 'Reminders & alerts',         onClick: () => navigate('/teacher/reminders') },
    { icon: MdSettings,        label: 'Settings',      sub: 'App preferences',            onClick: () => navigate('/teacher/settings') },
    { icon: MdHelp,            label: 'Help & Support',sub: 'FAQs and contact',           onClick: () => {} },
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
      <div className="p-4 space-y-4 pb-[calc(6rem_+_env(safe-area-inset-bottom))] lg:pb-4">
        <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
          <div className="flex items-center gap-4">
            <img src="/avatar-neutral.svg" alt="Profile" className="w-14 h-14 rounded-full object-cover shadow-sm border border-neutral-200" />
            <div className="flex-1">
              <p className="font-medium">{profile.name}</p>
              <p className="text-sm text-neutral-500">{profile.email}</p>
            </div>
            <button onClick={() => setProfileEdit(true)} className="p-2 hover:bg-[#F4F2EF] rounded-lg">
              <MdEdit className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
        </div>

        <div className="glass-panel divide-y divide-[#F1EFEC]">
          {items.map((item, i) => (
            <button key={i} onClick={item.onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#F4F2EF] transition-colors text-left">
              <div className="w-8 flex items-center justify-center flex-shrink-0 mr-1">
                <item.icon className="w-5 h-5 text-neutral-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.label}</p>
                {item.sub && <p className="text-xs text-neutral-500">{item.sub}</p>}
              </div>
              <MdChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            </button>
          ))}
        </div>

        <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 text-red-600 glass-panel border-white/60 shadow-sm rounded-xl hover:bg-[#F4F2EF] transition-colors">
          <MdLogout className="w-5 h-5" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>

      <Modal open={profileEdit} onClose={() => setProfileEdit(false)} title="Edit Profile">
        <div className="space-y-4">
          <Input label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <p className="text-xs text-neutral-400">Email cannot be changed here.</p>
          <Btn onClick={handleSave} disabled={editSaving} className="w-full" variant="primary">
            {editSaving ? <MdLoop className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </Btn>
        </div>
      </Modal>
    </div>
  );
}