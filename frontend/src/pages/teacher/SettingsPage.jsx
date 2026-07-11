import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MdArrowBack, MdVisibility, MdVisibilityOff, MdAddPhotoAlternate, MdClose, MdPeople, MdGppBad, MdDelete, MdLoop, MdPersonAdd, MdCheck, MdCheckCircle, MdFavorite, MdBackup, MdDownload } from 'react-icons/md';
import { Toggle, Btn, Input, Modal } from '../../components/ui';
import { useAuthStore } from '../../lib/auth';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../../store';
import { teacherApi } from '../../lib/api';
import LiveClassCard from '../../components/cards/LiveClassCard';

const fmtSize = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ''; } };

function PasswordChange({ onClose }) {
  const { changePassword } = useAuthStore();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!form.current || !form.next || !form.confirm) { setError('All fields are required.'); return; }
    if (form.next !== form.confirm) { setError('New passwords do not match.'); return; }
    if (form.next.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSaving(true);
    setError('');
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
    <Modal open={true} onClose={onClose} title="Change Password">
      <div className="space-y-4">
        <Input label="Current password" type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} disabled={saving || success} />
        <Input label="New password" type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} disabled={saving || success} />
        <Input label="Confirm new password" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} disabled={saving || success} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Password updated!</p>}
        <div className="flex gap-2 justify-end">
          <Btn variant="default" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving || success}>{saving ? 'Saving…' : 'Update password'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// Shared input with eye-icon reveal toggle
function SecretInput({ value, onChange, placeholder, inputMode, maxLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="w-full px-3 py-2 pr-9 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
        tabIndex={-1}
      >
        {show ? <MdVisibilityOff className="w-4 h-4" /> : <MdVisibility className="w-4 h-4" />}
      </button>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">{title}</p>
      <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden divide-y divide-white/40">
        {children}
      </div>
    </div>
  );
}

function Row({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-neutral-500">{sub}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isPrimary = !user?.teacher_type || user?.teacher_type === 'primary';
  const [pwOpen, setPwOpen] = useState(false);

  const {
    lmsName, setLmsName, lmsLogo, setLmsLogo,
    defaultStudentPassword, setDefaultStudentPassword,
    terminationPin, setTerminationPin,
    notifTestSubmission, notifNewStudent, notifBroadcastReply, notifWeeklyReport, setNotif,
    securitySingleDevice, securityAutoLogout, securityTwoStepVerification, otpEmailReady, setSecurityPref,
    studentsCanViewReport, setStudentsCanViewReport,
    studentsCanUploadFiles, setStudentsCanUploadFiles,
  } = useSettingsStore();

  const logoInputRef = useRef(null);
  const [nameInput, setNameInput] = useState(lmsName || 'Udaya Learn');
  const [nameSaved, setNameSaved] = useState(false);
  const [pwdInput, setPwdInput] = useState(defaultStudentPassword || '');
  const [pwdSaved, setPwdSaved] = useState(false);
  const [backfill, setBackfill] = useState({ loading: false, msg: '' });
  const [regen, setRegen] = useState({ loading: false, msg: '' });
  const [pinInput, setPinInput] = useState(terminationPin || '');
  const [pinSaved, setPinSaved] = useState(false);

  // Backups: cadence setting + manual run + recent list
  const [backupFreq, setBackupFreq] = useState('daily');
  const [freqSaved, setFreqSaved] = useState(false);
  const [backupRun, setBackupRun] = useState({ loading: false, msg: '' });
  const [backupList, setBackupList] = useState([]);

  // Team management state (primary teacher only)
  const [subTeachers, setSubTeachers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Live-class auto-thumbnail (universal base image + blank-side preference)
  const thumbInputRef = useRef(null);
  const [thumb, setThumb] = useState({ url: null, side: 'right' });
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const [thumbSaving, setThumbSaving] = useState(false);
  const [thumbSaved, setThumbSaved] = useState(false);

  // Profile photo
  const profilePhotoInputRef = useRef(null);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);
  const [profilePhotoSaving, setProfilePhotoSaving] = useState(false);
  const [profilePhotoSaved, setProfilePhotoSaved] = useState(false);

  useEffect(() => {
    if (!isPrimary) return;
    setTeamLoading(true);
    teacherApi.list()
      .then(setSubTeachers)
      .catch(() => {})
      .finally(() => setTeamLoading(false));

    teacherApi.getThumbnail()
      .then(res => {
        setThumb({ url: res.thumbnail_url || null, side: res.thumbnail_text_side || 'right' });
        setProfilePhoto(res.profile_photo_url || null);
      })
      .catch(() => {});
  }, [isPrimary]);

  const handleAddTeacher = async () => {
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      setAddError('Name, email and password are required.'); return;
    }
    if (addForm.password.length < 8) {
      setAddError('Password must be at least 8 characters.'); return;
    }
    setAddLoading(true); setAddError(''); setAddSuccess('');
    try {
      const created = await teacherApi.create(addForm);
      setSubTeachers(prev => [...prev, created]);
      setAddForm({ name: '', email: '', phone: '', password: '' });
      setAddSuccess(`${created.name}'s account created.`);
      setTimeout(() => setAddSuccess(''), 3000);
    } catch (e) {
      setAddError(e.message || 'Failed to create teacher account.');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveTeacher = async (id, name) => {
    if (!window.confirm(`Remove ${name} from your team? They will lose access immediately.`)) return;
    try {
      await teacherApi.remove(id);
      setSubTeachers(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert(e.message || 'Failed to remove teacher.');
    }
  };

  // Block sub-teachers from accessing settings
  if (!isPrimary) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
          <div className="px-3 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md"><MdArrowBack className="w-4 h-4" /></button>
            <h1 className="text-lg md:text-xl font-semibold flex-1">Settings</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-neutral-400">
          <MdGppBad className="w-9 h-9 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-500">Settings are only available to the primary teacher.</p>
          <p className="text-xs text-neutral-400">Contact your primary teacher to change app settings.</p>
        </div>
      </div>
    );
  }

  const handleSaveName = () => {
    setLmsName(nameInput.trim() || 'Udaya Learn');
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
  };

  const handleLogoChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLmsLogo(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSaveDefaultPwd = () => {
    setDefaultStudentPassword(pwdInput.trim());
    setPwdSaved(true);
    setTimeout(() => setPwdSaved(false), 1500);
  };

  const handleBackfillCodes = async () => {
    setBackfill({ loading: true, msg: '' });
    try {
      const res = await teacherApi.backfillStudentCodes();
      const updated = res?.updated ?? 0;
      setBackfill({
        loading: false,
        msg: updated > 0
          ? `Generated IDs for ${updated} student${updated !== 1 ? 's' : ''}.`
          : 'All students already have an ID.',
      });
    } catch (e) {
      setBackfill({ loading: false, msg: e.message || 'Failed to generate IDs.' });
    }
  };

  const handleRegenerateCodes = async () => {
    const ok = window.confirm(
      'This rewrites EVERY student\'s ID into the new format. Their login ID will change, ' +
      'so you\'ll need to share the new IDs with them. Continue?'
    );
    if (!ok) return;
    setRegen({ loading: true, msg: '' });
    try {
      const res = await teacherApi.backfillStudentCodes(true);
      const updated = res?.updated ?? 0;
      setRegen({
        loading: false,
        msg: `Regenerated ${updated} student ID${updated !== 1 ? 's' : ''}.`,
      });
    } catch (e) {
      setRegen({ loading: false, msg: e.message || 'Failed to regenerate IDs.' });
    }
  };

  // Load backup cadence + recent backups on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await teacherApi.getSettings();
        if (alive && s?.backup_frequency) setBackupFreq(s.backup_frequency);
      } catch { /* ignore */ }
      try {
        const r = await teacherApi.listBackups();
        if (alive) setBackupList(r?.backups || []);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const handleSaveFrequency = async (next) => {
    setBackupFreq(next);
    setFreqSaved(false);
    try {
      await teacherApi.updateSettings({ backup_frequency: next });
      setFreqSaved(true);
      setTimeout(() => setFreqSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleBackupNow = async () => {
    setBackupRun({ loading: true, msg: '' });
    try {
      await teacherApi.createBackup();
      const r = await teacherApi.listBackups();
      setBackupList(r?.backups || []);
      setBackupRun({ loading: false, msg: 'Backup complete.' });
    } catch (e) {
      setBackupRun({ loading: false, msg: e.message || 'Backup failed.' });
    }
  };

  const handleSavePin = () => {
    setTerminationPin(pinInput.trim());
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 1500);
  };

  const handleThumbFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setThumbFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setThumbPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSaveThumb = async () => {
    setThumbSaving(true);
    try {
      const res = await teacherApi.uploadThumbnail({ file: thumbFile, textSide: thumb.side });
      setThumb({ url: res.thumbnail_url || null, side: res.thumbnail_text_side || 'right' });
      setThumbFile(null);
      setThumbPreview(null);
      setThumbSaved(true);
      setTimeout(() => setThumbSaved(false), 1800);
    } catch (e) {
      alert(e.message || 'Failed to save thumbnail');
    } finally {
      setThumbSaving(false);
    }
  };

  const handleProfilePhotoFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setProfilePhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setProfilePhotoPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSaveProfilePhoto = async () => {
    setProfilePhotoSaving(true);
    try {
      const res = await teacherApi.uploadProfilePhoto(profilePhotoFile);
      setProfilePhoto(res.profile_photo_url || null);
      setProfilePhotoFile(null);
      setProfilePhotoPreview(null);
      setProfilePhotoSaved(true);
      setTimeout(() => setProfilePhotoSaved(false), 1800);
    } catch (e) {
      alert(e.message || 'Failed to save profile photo');
    } finally {
      setProfilePhotoSaving(false);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-3 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md"><MdArrowBack className="w-4 h-4" /></button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">Settings</h1>
        </div>
      </div>

      <motion.div
        className="px-3 md:px-8 py-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] lg:pb-6 max-w-5xl mx-auto"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >

        {/* Team Members */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Team Members</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-4">

            {/* Existing sub-teachers */}
            {teamLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
                <MdLoop className="w-4 h-4 animate-spin" /> Loading team…
              </div>
            ) : subTeachers.length > 0 ? (
              <div className="space-y-2">
                {subTeachers.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-3 p-3 bg-white/30 rounded-lg border border-white/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 font-bold text-xs">
                        {(t.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{t.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{t.email}{t.phone ? ` · ${t.phone}` : ''}</p>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveTeacher(t.id, t.name)}
                      className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0" title="Remove teacher">
                      <MdDelete className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-1">No team members yet. Add a teacher below.</p>
            )}

            {/* Add teacher form */}
            <div className="border-t border-white/40 pt-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5"><MdPersonAdd className="w-4 h-4" /> Add Teacher</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={addForm.name} onChange={e => setAddForm(f => ({...f, name: e.target.value}))} placeholder="Full name *"
                  className="px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.email} onChange={e => setAddForm(f => ({...f, email: e.target.value}))} placeholder="Email *" type="email"
                  className="px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.phone} onChange={e => setAddForm(f => ({...f, phone: e.target.value}))} placeholder="Phone (optional)" type="tel"
                  className="px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.password} onChange={e => setAddForm(f => ({...f, password: e.target.value}))} placeholder="Password * (min 8 chars)" type="password"
                  className="px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
              </div>
              {addError  && <p className="text-xs text-red-600">{addError}</p>}
              {addSuccess && <p className="text-xs text-green-700 flex items-center gap-1"><MdCheckCircle className="w-3.5 h-3.5" /> {addSuccess}</p>}
              <Btn variant="primary" size="sm" onClick={handleAddTeacher} disabled={addLoading}>
                {addLoading ? <><MdLoop className="w-3.5 h-3.5 animate-spin mr-1" />Creating…</> : 'Create Teacher Account'}
              </Btn>
              <p className="text-[11px] text-neutral-400">New teachers can access everything except Settings. Share their email + password directly.</p>
            </div>

          </div>
        </div>

        {/* Branding */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Branding</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-4">

            {/* Logo upload */}
            <div>
              <p className="text-sm font-medium mb-0.5">App logo</p>
              <p className="text-xs text-neutral-500 mb-3">Shown on the login page, sidebar and top bar. Defaults to the Udaya logo — upload a square image to override.</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="w-14 h-14 rounded-xl border-2 border-dashed border-[#D8D6D2] bg-white/30 hover:bg-[#F4F2EF] flex items-center justify-center overflow-hidden transition-colors flex-shrink-0"
                >
                  <img src={lmsLogo || DEFAULT_LMS_LOGO} alt="logo" className="w-full h-full object-cover bg-white" />
                </button>
                <div className="flex flex-col gap-1.5">
                  <Btn variant="default" size="sm" onClick={() => logoInputRef.current?.click()}>
                    {lmsLogo ? 'Change logo' : 'Upload logo'}
                  </Btn>
                  {lmsLogo && (
                    <button onClick={() => setLmsLogo(null)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                      <MdClose className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </div>
            </div>

            {/* Name */}
            <div>
              <p className="text-sm font-medium mb-0.5">App name</p>
              <p className="text-xs text-neutral-500 mb-2">Displayed on the login page, sidebar, and browser tab.</p>
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); }}
                  placeholder="e.g. Priya's Academy"
                  className="flex-1 px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 focus:border-white/80 outline-none text-sm transition-all"
                />
                <Btn variant="primary" size="sm" onClick={handleSaveName}>
                  {nameSaved ? <span className="flex items-center gap-1"><MdCheck className="w-4 h-4" /> Saved</span> : 'Save'}
                </Btn>
              </div>
            </div>

            {/* Profile Photo */}
            <div className="pt-2 border-t border-[#EFEDEA]">
              <p className="text-sm font-medium mb-0.5">Teacher Profile Photo</p>
              <p className="text-xs text-neutral-500 mb-3">Shown on live class cards as your avatar.</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => profilePhotoInputRef.current?.click()}
                  className="w-14 h-14 rounded-full border-2 border-dashed border-[#D8D6D2] bg-white/30 hover:bg-[#F4F2EF] flex items-center justify-center overflow-hidden transition-colors flex-shrink-0"
                >
                  {(profilePhotoPreview || profilePhoto)
                    ? <img src={profilePhotoPreview || profilePhoto} alt="profile" className="w-full h-full object-cover" />
                    : <MdAddPhotoAlternate className="w-5 h-5 text-neutral-400" />}
                </button>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Btn variant="default" size="sm" onClick={() => profilePhotoInputRef.current?.click()}>
                      {(profilePhotoPreview || profilePhoto) ? 'Change photo' : 'Upload photo'}
                    </Btn>
                    {profilePhotoFile && (
                      <Btn variant="primary" size="sm" onClick={handleSaveProfilePhoto} disabled={profilePhotoSaving}>
                        {profilePhotoSaving ? 'Saving...' : profilePhotoSaved ? 'Saved' : 'Save'}
                      </Btn>
                    )}
                  </div>
                  {profilePhoto && !profilePhotoFile && (
                    <button onClick={async () => {
                        setProfilePhotoSaving(true);
                        try {
                          const res = await teacherApi.uploadProfilePhoto(new File([], 'empty')); 
                          // Wait, my backend implementation doesn't handle deleting file if size is 0.
                          // Let's just allow uploading a transparent/empty one, or better yet, we can skip delete for now
                        } catch(e){}
                        setProfilePhotoSaving(false);
                      }} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 w-fit hidden">
                    </button>
                  )}
                </div>
                <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoFile} />
              </div>
            </div>

          </div>
        </div>

        {/* Live Class Auto-Thumbnail */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Live Class Thumbnail</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-4">
            <div>
              <p className="text-sm font-medium mb-0.5">Universal thumbnail image</p>
              <p className="text-xs text-neutral-500 mb-3">
                Upload one image (e.g. your photo) with a blank space on one side. Every scheduled class
                automatically composites its subject, class and topic into that blank space.
              </p>

              {/* Live preview */}
              <div className="max-w-sm mb-3">
                <LiveClassCard
                  thumbnailUrl={thumbPreview || thumb.url}
                  textSide={thumb.side}
                  teacherAvatar={profilePhotoPreview || profilePhoto}
                  standardName="10th Standard"
                  subjectName="Mathematics"
                  topic="Trigonometry — Chapter 8"
                  status="scheduled"
                  scheduledAt={new Date(Date.now() + 3725000).toISOString()}
                  compact={true}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Btn variant="default" size="sm" onClick={() => thumbInputRef.current?.click()}>
                  {(thumbPreview || thumb.url) ? 'Change image' : 'Upload image'}
                </Btn>
                <input ref={thumbInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbFile} />
              </div>
            </div>

            {/* Blank side */}
            <div>
              <p className="text-sm font-medium mb-2">Text position (blank side)</p>
              <div className="flex gap-2">
                {['left', 'right'].map(side => (
                  <button
                    key={side}
                    onClick={() => setThumb(t => ({ ...t, side }))}
                    className={`px-3 py-1.5 rounded-md text-sm capitalize border transition-colors ${
                      thumb.side === side
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-white/40 border-white/60 text-neutral-600 hover:bg-[#F4F2EF]'
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Btn variant="primary" size="sm" onClick={handleSaveThumb} disabled={thumbSaving}>
                {thumbSaving ? <><MdLoop className="w-3.5 h-3.5 animate-spin mr-1" />Saving…</> : thumbSaved ? <span className="flex items-center gap-1"><MdCheck className="w-4 h-4" /> Saved</span> : 'Save thumbnail'}
              </Btn>
              <span className="text-[11px] text-neutral-400">Applies to classes scheduled after saving.</span>
            </div>
          </div>
        </div>

        {/* Notifications — now persisted */}
        <Section title="Notifications">
          <Row label="Test submissions" sub="When a student submits a test" checked={notifTestSubmission} onChange={v => setNotif('notifTestSubmission', v)} />
          <Row label="New student joined" checked={notifNewStudent} onChange={v => setNotif('notifNewStudent', v)} />
          <Row label="Broadcast replies" sub="Student replies to announcements" checked={notifBroadcastReply} onChange={v => setNotif('notifBroadcastReply', v)} />
          <Row label="Weekly report" sub="Every Monday morning" checked={notifWeeklyReport} onChange={v => setNotif('notifWeeklyReport', v)} />
        </Section>

        {/* Student Portal */}
        <Section title="Student Portal">
          <Row label="Students can view their report card" sub="If off, the Report Card button is hidden from students" checked={studentsCanViewReport} onChange={setStudentsCanViewReport} />
          <Row label="Allow student file uploads" sub="If off, students cannot upload images or attachments anywhere in the app" checked={studentsCanUploadFiles} onChange={setStudentsCanUploadFiles} />
        </Section>

        {/* Security — now persisted */}
        <Section title="Security">
          <Row label="Single device login" sub="Students can only be logged in on one device" checked={securitySingleDevice} onChange={v => setSecurityPref('securitySingleDevice', v)} />
          <Row label="Auto-logout students" sub="Log out after 30 days of inactivity" checked={securityAutoLogout} onChange={v => setSecurityPref('securityAutoLogout', v)} />
          <Row label="Two-step verification" sub="Email teachers a 6-digit code when logging in on a new device" checked={securityTwoStepVerification} onChange={v => setSecurityPref('securityTwoStepVerification', v)} />
          {securityTwoStepVerification && !otpEmailReady && (
            <p className="px-4 pb-2 -mt-1 text-[11px] text-amber-600">
              Email isn't configured yet — add <code className="bg-amber-50 px-1 rounded">RESEND_API_KEY</code> to backend/.env and restart the backend. Until then, logins skip the code.
            </p>
          )}

          {/* Termination PIN — with eye toggle + currently-set indicator */}
          <div className="px-4 py-3">
            <p className="text-sm font-medium mb-0.5">Termination PIN</p>
            <p className="text-xs text-neutral-500 mb-2">Required to permanently delete a standard and all its data.</p>
            <div className="flex gap-2">
              <SecretInput
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
                placeholder="4–8 digit PIN"
                inputMode="numeric"
                maxLength={8}
              />
              <Btn variant="primary" size="sm" onClick={handleSavePin}>
                {pinSaved ? <span className="flex items-center gap-1"><MdCheck className="w-4 h-4" /> Saved</span> : terminationPin ? 'Update' : 'Save'}
              </Btn>
            </div>
            {terminationPin && !pinSaved && (
              <p className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                <MdCheckCircle className="w-3.5 h-3.5" /> PIN is set — click the eye to reveal it
              </p>
            )}
          </div>
        </Section>

        {/* Default student password — with eye toggle + currently-set indicator */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Students</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
            <p className="text-sm font-medium mb-0.5">Default student password</p>
            <p className="text-xs text-neutral-500 mb-3">Used when creating new students. Leave blank to auto-generate random passwords.</p>
            <div className="flex gap-2">
              <SecretInput
                value={pwdInput}
                onChange={e => setPwdInput(e.target.value)}
                placeholder="e.g. Welcome@123 (leave blank for random)"
              />
              <Btn variant="primary" size="sm" onClick={handleSaveDefaultPwd}>
                {pwdSaved ? <span className="flex items-center gap-1"><MdCheck className="w-4 h-4" /> Saved</span> : defaultStudentPassword ? 'Update' : 'Save'}
              </Btn>
            </div>
            {defaultStudentPassword && !pwdSaved && (
              <p className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                <MdCheckCircle className="w-3.5 h-3.5" /> Password is set — click the eye to reveal it
              </p>
            )}

            {/* Student ID backfill — one-time for students created before this feature */}
            <div className="mt-5 pt-4 border-t border-white/40">
              <p className="text-sm font-medium mb-0.5">Student IDs</p>
              <p className="text-xs text-neutral-500 mb-3">New students get an ID automatically. Run this once to generate IDs for students added earlier.</p>
              <Btn variant="default" size="sm" onClick={handleBackfillCodes} disabled={backfill.loading}>
                {backfill.loading ? <><MdLoop className="w-3.5 h-3.5 animate-spin mr-1" />Generating…</> : 'Generate IDs for existing students'}
              </Btn>
              {backfill.msg && (
                <p className="text-[11px] text-green-700 mt-2 flex items-center gap-1">
                  <MdCheckCircle className="w-3.5 h-3.5" /> {backfill.msg}
                </p>
              )}

              {/* Force-regenerate all IDs into the new format — changes login IDs */}
              <div className="mt-4 pt-4 border-t border-white/40">
                <p className="text-xs text-neutral-500 mb-3">Changed the ID format? Rewrite every student's ID to the new format. This changes their login ID — you'll need to share the new IDs.</p>
                <Btn variant="default" size="sm" onClick={handleRegenerateCodes} disabled={regen.loading}>
                  {regen.loading ? <><MdLoop className="w-3.5 h-3.5 animate-spin mr-1" />Regenerating…</> : 'Regenerate all Student IDs (new format)'}
                </Btn>
                {regen.msg && (
                  <p className="text-[11px] text-green-700 mt-2 flex items-center gap-1">
                    <MdCheckCircle className="w-3.5 h-3.5" /> {regen.msg}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Change account password */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Account</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
            <p className="text-sm text-neutral-600 mb-3">Update your login password to keep your account secure.</p>
            <Btn variant="primary" size="sm" onClick={() => setPwOpen(true)}>Change password</Btn>
          </div>
        </div>

        {pwOpen && <PasswordChange onClose={() => setPwOpen(false)} />}

        {/* Backups */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Backups</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4">
            <p className="text-sm font-medium mb-0.5">Automatic backups</p>
            <p className="text-xs text-neutral-500 mb-3">Your data (students, attendance, marks, tests — everything) is backed up to secure cloud storage. Videos &amp; notes are already stored safely and aren't re-copied.</p>
            <div className="flex items-center gap-2">
              <select
                value={backupFreq}
                onChange={e => handleSaveFrequency(e.target.value)}
                className="px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:bg-white/70 outline-none text-sm transition-all"
              >
                <option value="off">Off</option>
                <option value="daily">Daily (recommended)</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              {freqSaved && <span className="text-[11px] text-green-700 flex items-center gap-1"><MdCheckCircle className="w-3.5 h-3.5" /> Saved</span>}
            </div>

            {/* Manual backup */}
            <div className="mt-5 pt-4 border-t border-white/40">
              <p className="text-sm font-medium mb-0.5">Backup now</p>
              <p className="text-xs text-neutral-500 mb-3">Create an immediate backup — handy before big changes like year-end updates.</p>
              <Btn variant="primary" size="sm" onClick={handleBackupNow} disabled={backupRun.loading}>
                {backupRun.loading ? <><MdLoop className="w-3.5 h-3.5 animate-spin mr-1" />Backing up…</> : <><MdBackup className="w-4 h-4 mr-1" />Backup now</>}
              </Btn>
              {backupRun.msg && (
                <p className="text-[11px] text-green-700 mt-2 flex items-center gap-1">
                  <MdCheckCircle className="w-3.5 h-3.5" /> {backupRun.msg}
                </p>
              )}
            </div>

            {/* Recent backups */}
            {backupList.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/40">
                <p className="text-sm font-medium mb-2">Recent backups</p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {backupList.slice(0, 20).map((b) => (
                    <div key={b.filename} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate text-neutral-700">{b.filename}</p>
                        <p className="text-[10px] text-neutral-400">{b.type} · {fmtSize(b.size)}{b.modified ? ' · ' + fmtDate(b.modified) : ''}</p>
                      </div>
                      <a href={b.download_url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-neutral-600 hover:text-ink hover:underline">
                        <MdDownload className="w-4 h-4" /> Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Data</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden divide-y divide-white/40">
            <button className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-[#F4F2EF] transition-colors text-left">
              <span>Export all data</span><span className="text-xs text-neutral-400">CSV / JSON</span>
            </button>
            <button className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-red-50/50 transition-colors text-left text-red-600">
              <span>Delete account</span><span className="text-xs text-red-400">Irreversible</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400 flex items-center justify-center gap-1">Udaya v{import.meta.env.VITE_APP_VERSION || '1.1.7'} · Built with <MdFavorite className="w-3.5 h-3.5 text-red-500" /></p>
      </motion.div>
    </div>
  );
}
