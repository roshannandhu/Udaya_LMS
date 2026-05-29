import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, CheckCircle2, ImagePlus, X, Users, ShieldOff, Trash2, Loader2, UserPlus } from 'lucide-react';
import { Toggle, Btn, Input, Modal } from '../../components/ui';
import { useAuthStore } from '../../lib/auth';
import { useSettingsStore } from '../../store';
import { teacherApi } from '../../lib/api';

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
        className="w-full px-3 py-2 pr-9 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 focus:ring-2 focus:ring-white/50 shadow-inner outline-none text-sm transition-all placeholder:text-neutral-400"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
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
    securitySingleDevice, securityAutoLogout, setSecurityPref,
    studentsCanViewReport, setStudentsCanViewReport,
  } = useSettingsStore();

  const logoInputRef = useRef(null);
  const [nameInput, setNameInput] = useState(lmsName || 'Tutoria');
  const [nameSaved, setNameSaved] = useState(false);
  const [pwdInput, setPwdInput] = useState(defaultStudentPassword || '');
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pinInput, setPinInput] = useState(terminationPin || '');
  const [pinSaved, setPinSaved] = useState(false);

  // Team management state (primary teacher only)
  const [subTeachers, setSubTeachers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  useEffect(() => {
    if (!isPrimary) return;
    setTeamLoading(true);
    teacherApi.list()
      .then(setSubTeachers)
      .catch(() => {})
      .finally(() => setTeamLoading(false));
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
        <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
            <h1 className="text-base font-semibold flex-1">Settings</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-neutral-400">
          <ShieldOff size={36} className="text-neutral-300" />
          <p className="text-sm font-medium text-neutral-500">Settings are only available to the primary teacher.</p>
          <p className="text-xs text-neutral-400">Contact your primary teacher to change app settings.</p>
        </div>
      </div>
    );
  }

  const handleSaveName = () => {
    setLmsName(nameInput.trim() || 'Tutoria');
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

  const handleSavePin = () => {
    setTerminationPin(pinInput.trim());
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 1500);
  };

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/60 rounded-md"><ArrowLeft size={16} /></button>
          <h1 className="text-base font-semibold flex-1">Settings</h1>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">

        {/* Team Members */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Team Members</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl p-4 space-y-4">

            {/* Existing sub-teachers */}
            {teamLoading ? (
              <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading team…
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
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-1">No team members yet. Add a teacher below.</p>
            )}

            {/* Add teacher form */}
            <div className="border-t border-white/40 pt-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5"><UserPlus size={14} /> Add Teacher</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={addForm.name} onChange={e => setAddForm(f => ({...f, name: e.target.value}))} placeholder="Full name *"
                  className="px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.email} onChange={e => setAddForm(f => ({...f, email: e.target.value}))} placeholder="Email *" type="email"
                  className="px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.phone} onChange={e => setAddForm(f => ({...f, phone: e.target.value}))} placeholder="Phone (optional)" type="tel"
                  className="px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
                <input value={addForm.password} onChange={e => setAddForm(f => ({...f, password: e.target.value}))} placeholder="Password * (min 8 chars)" type="password"
                  className="px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 outline-none text-sm transition-all placeholder:text-neutral-400" />
              </div>
              {addError  && <p className="text-xs text-red-600">{addError}</p>}
              {addSuccess && <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={11} /> {addSuccess}</p>}
              <Btn variant="primary" size="sm" onClick={handleAddTeacher} disabled={addLoading}>
                {addLoading ? <><Loader2 size={12} className="animate-spin mr-1" />Creating…</> : 'Create Teacher Account'}
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
              <p className="text-xs text-neutral-500 mb-3">Shown on the login page and sidebar. Square image recommended.</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="w-14 h-14 rounded-xl border-2 border-dashed border-white/60 bg-white/30 hover:bg-white/50 flex items-center justify-center overflow-hidden transition-colors flex-shrink-0"
                >
                  {lmsLogo
                    ? <img src={lmsLogo} alt="logo" className="w-full h-full object-cover" />
                    : <ImagePlus size={20} className="text-neutral-400" />}
                </button>
                <div className="flex flex-col gap-1.5">
                  <Btn variant="default" size="sm" onClick={() => logoInputRef.current?.click()}>
                    {lmsLogo ? 'Change logo' : 'Upload logo'}
                  </Btn>
                  {lmsLogo && (
                    <button onClick={() => setLmsLogo(null)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                      <X size={11} /> Remove
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
                  className="flex-1 px-3 py-2 rounded-md bg-white/40 backdrop-blur-sm border border-white/60 focus:bg-white/70 focus:border-white/80 outline-none text-sm transition-all"
                />
                <Btn variant="primary" size="sm" onClick={handleSaveName}>
                  {nameSaved ? 'Saved ✓' : 'Save'}
                </Btn>
              </div>
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
        </Section>

        {/* Security — now persisted */}
        <Section title="Security">
          <Row label="Single device login" sub="Students can only be logged in on one device" checked={securitySingleDevice} onChange={v => setSecurityPref('securitySingleDevice', v)} />
          <Row label="Auto-logout students" sub="Log out after 30 days of inactivity" checked={securityAutoLogout} onChange={v => setSecurityPref('securityAutoLogout', v)} />

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
                {pinSaved ? 'Saved ✓' : terminationPin ? 'Update' : 'Save'}
              </Btn>
            </div>
            {terminationPin && !pinSaved && (
              <p className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={11} /> PIN is set — click the eye to reveal it
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
                {pwdSaved ? 'Saved ✓' : defaultStudentPassword ? 'Update' : 'Save'}
              </Btn>
            </div>
            {defaultStudentPassword && !pwdSaved && (
              <p className="text-[11px] text-green-700 mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={11} /> Password is set — click the eye to reveal it
              </p>
            )}
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

        {/* Data */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Data</p>
          <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden divide-y divide-white/40">
            <button className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-white/70 transition-colors text-left">
              <span>Export all data</span><span className="text-xs text-neutral-400">CSV / JSON</span>
            </button>
            <button className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-red-50/50 transition-colors text-left text-red-600">
              <span>Delete account</span><span className="text-xs text-red-400">Irreversible</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400">Tutoria v1.0 Beta · Built with ♥</p>
      </div>
    </div>
  );
}
