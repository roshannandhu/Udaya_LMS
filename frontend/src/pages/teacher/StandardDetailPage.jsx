import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, X, Users, QrCode, UserPlus, ChevronRight, MoreVertical, Lock, Edit2, Trash2, Download, Plus, Loader2, Upload } from 'lucide-react';
import { Btn, Avatar, Tag, Divider, Modal, Input, SectionHeader, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';
import { useAppCache, useSettingsStore } from '../../store';
import BulkImportModal from '../../components/teacher/BulkImportModal';
import TerminateStandardModal from '../../components/teacher/TerminateStandardModal';

function NewSubjectModal({ open, onClose, standardId, onSuccess }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📐');
  const [loading, setLoading] = useState(false);
  const { invalidate, refreshSubjects } = useAppCache();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const created = await apiClient('/subjects', {
        method: 'POST',
        body: JSON.stringify({ standard_id: standardId, name, emoji })
      });
      invalidate();
      await refreshSubjects();
      onClose();
      if (onSuccess) onSuccess(created);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Subject" size="sm">
      <div className="space-y-4">
        <Input label="Subject name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <div className="flex gap-2 flex-wrap">
            {['📐', '🧮', '🔬', '🌍', '📝', '💻', '🎨', '📕'].map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl border ${emoji === e ? 'border-neutral-900 bg-white/50' : 'border-white/60'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Btn onClick={handleSubmit} disabled={loading} className="w-full" variant="primary">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Create Subject
        </Btn>
      </div>
    </Modal>
  );
}

function InviteModal({ open, onClose, standardId }) {
  const [inviteLink, setInviteLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('link');

  const generateLink = async () => {
    setLoading(true);
    try {
      const result = await apiClient('/invite-links', {
        method: 'POST',
        body: JSON.stringify({ standard_id: standardId })
      });
      setInviteLink(`${window.location.origin}/join/${result.code}`);
      const requestsData = await apiClient(`/join-requests?invite_code=${result.code}`);
      setRequests(requestsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite Students" size="md">
      <div className="space-y-4">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('link')} className={`px-3 py-1.5 text-sm rounded-md ${tab === 'link' ? 'bg-white/50 font-medium' : 'text-neutral-500'}`}>Share Link</button>
          <button onClick={() => setTab('requests')} className={`px-3 py-1.5 text-sm rounded-md ${tab === 'requests' ? 'bg-white/50 font-medium' : 'text-neutral-500'}`}>Requests ({requests.length})</button>
        </div>

        {tab === 'link' && (
          <>
            {!inviteLink ? (
              <div className="text-center py-8">
                <QrCode size={48} className="mx-auto mb-4 text-neutral-300" />
                <p className="text-sm text-neutral-600 mb-4">Generate a shareable invite link for this standard</p>
                <Btn variant="primary" onClick={generateLink} loading={loading}>Generate Invite Link</Btn>
              </div>
            ) : (
              <div>
                <p className="text-xs text-neutral-500 mb-2">Share this link with students:</p>
                <div className="flex gap-2">
                  <input readOnly value={inviteLink} className="flex-1 px-3 py-2 bg-white/30 border border-white/60 rounded-md text-sm" />
                  <Btn onClick={copyLink} variant="default">Copy</Btn>
                </div>
                <p className="text-xs text-neutral-400 mt-2">Students will need approval before joining.</p>
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">No pending requests</p>
            ) : (
              requests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 bg-white/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{req.student_name}</p>
                    <p className="text-xs text-neutral-500">{req.student_email || 'No email'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Btn size="sm" variant="ghost" onClick={async () => {
                      try {
                        await apiClient(`/join-requests/${req.id}/reject`, { method: 'PATCH' });
                        setRequests(prev => prev.filter(r => r.id !== req.id));
                      } catch (err) { console.error(err); }
                    }}>Reject</Btn>
                    <Btn size="sm" variant="primary" onClick={async () => {
                      try {
                        const result = await apiClient(`/join-requests/${req.id}/approve`, { method: 'PATCH' });
                        alert(`Approved! Username: ${result.username}, Temp Password: ${result.temp_password}`);
                        setRequests(prev => prev.filter(r => r.id !== req.id));
                      } catch (err) { console.error(err); }
                    }}>Approve</Btn>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddStudentModal({ open, onClose, standardId, onStudentAdded }) {
  const { defaultStudentPassword } = useSettingsStore();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  React.useEffect(() => {
    if (open) {
      setName(''); setUsername(''); setEmail('');
      setPassword(defaultStudentPassword || '');
      setError(''); setSuccess(null);
    }
  }, [open, defaultStudentPassword]);

  const handleSubmit = async () => {
    if (!name.trim() || !username.trim()) {
      setError('Name and username are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiClient('/admin/create-student', {
        method: 'POST',
        body: JSON.stringify({
          name,
          username: username.toLowerCase().replace(/\s/g, '.'),
          email: email || undefined,
          password: password || defaultStudentPassword || 'student123',
          standard_id: standardId
        })
      });
      setSuccess(`Created! Username: ${result.username}  Password: ${result.password}`);
      setName(''); setUsername(''); setEmail('');
      setPassword(defaultStudentPassword || '');
      if (onStudentAdded) onStudentAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pwdPlaceholder = defaultStudentPassword
    ? `Default: ${defaultStudentPassword.slice(0, 3)}${'*'.repeat(Math.max(0, defaultStudentPassword.length - 3))}`
    : 'Leave blank for auto-generated';

  return (
    <Modal open={open} onClose={onClose} title="Add Student" size="sm">
      <div className="space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}
        {success && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg font-mono whitespace-pre-wrap">{success}</div>
        )}
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarav Patel" />
        <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="aarav.p" />
        <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={pwdPlaceholder} />
        <Btn onClick={handleSubmit} disabled={loading} className="w-full" variant="primary">
          {loading && <Loader2 size={14} className="animate-spin" />}
          Add Student
        </Btn>
      </div>
    </Modal>
  );
}

export default function StandardDetailPage() {
  const { standardId } = useParams();
  const navigate = useNavigate();

  // Use global cache (instant from localStorage)
  const allStandards       = useAppCache(s => s.standards);
  const allSubjects        = useAppCache(s => s.subjects);
  const allStudents        = useAppCache(s => s.students);
  const invalidate         = useAppCache(s => s.invalidate);
  const invalidateStudents = useAppCache(s => s.invalidateStudents);
  const cachedStandard = allStandards.find(s => String(s.id) === String(standardId));
  const cachedSubjects = allSubjects.filter(s => String(s.standard_id) === String(standardId));
  const cachedStudents = allStudents.filter(s => String(s.standard_id) === String(standardId));

  const [standard, setStandard] = useState(cachedStandard || null);
  const [subjects, setSubjects] = useState(cachedSubjects);
  const [students, setStudents] = useState(cachedStudents);
  // Only show skeleton if we have NO cached data at all
  const [loading, setLoading] = useState(!cachedStandard && cachedStudents.length === 0);
  const [tab, setTab] = useState('subjects');
  const [studentSearch, setStudentSearch] = useState('');
  const [blockedIds, setBlockedIds] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      try {
        // Always refresh in background for freshness
        const [stdData, subjectsData, studentsData] = await Promise.all([
          apiClient(`/standards/${standardId}`).catch(() => null),
          apiClient(`/subjects?standard_id=${standardId}`),
          apiClient(`/students?standard_id=${standardId}`)
        ]);
        if (stdData) setStandard(stdData);
        setSubjects(subjectsData || []);
        const studs = studentsData || [];
        setStudents(studs);
        setBlockedIds(studs.filter(s => s.blocked).map(s => s.id));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (standardId) refresh();
  }, [standardId]);

  const filteredStudents = students.filter(s =>
    !studentSearch ||
    s.name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.username?.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const handleBlock = async (studentId) => {
    const willBlock = !blockedIds.includes(studentId);
    setBlockedIds(prev => willBlock ? [...prev, studentId] : prev.filter(id => id !== studentId));
    try {
      await apiClient(`/students/${studentId}/block?blocked=${willBlock}`, { method: 'PATCH' });
    } catch (err) {
      console.error(err);
      // Revert on error
      setBlockedIds(prev => willBlock ? prev.filter(id => id !== studentId) : [...prev, studentId]);
    }
  };

  const handleRemove = async (studentId) => {
    try {
      await apiClient(`/students/${studentId}`, { method: 'DELETE' });
      setStudents(prev => prev.filter(s => s.id !== studentId));
      setConfirmRemove(null);
    } catch (err) { console.error(err); }
  };

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <Skeleton className="w-8 h-8" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
          <Skeleton className="h-16 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/subjects')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{standard?.emoji || '📚'}</span>
          <div className="flex-1 min-w-0">
            <p className="hidden lg:block text-[11px] text-neutral-400 leading-none mb-0.5">Subjects</p>
            <h1 className="text-lg md:text-xl font-semibold truncate">{standard?.name || 'Standard'}</h1>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 mb-6 pb-6 border-b border-white/60">
          <div className="flex items-center gap-6">
            {[
              { label: 'students', value: students.length },
              { label: 'subjects', value: subjects.length },
              { label: 'blocked', value: blockedIds.length },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
                <p className="text-xs text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="default" size="sm" icon={QrCode} onClick={() => setInviteOpen(true)}>Invite</Btn>
            <Btn variant="default" size="sm" icon={Upload} onClick={() => setBulkImportOpen(true)}>Bulk Import</Btn>
            <Btn variant="primary" size="sm" icon={UserPlus} onClick={() => setAddStudentOpen(true)}>Add student</Btn>
            <Btn variant="default" size="sm" icon={Trash2} onClick={() => setTerminateOpen(true)} className="text-red-600 border-red-200 hover:bg-red-50">Terminate</Btn>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 mb-5 p-1 bg-black/5 rounded-pill">
          {['subjects', 'students'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-pill capitalize transition-colors ${tab === t ? 'bg-white shadow-sm text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900'}`}>
              {t === 'students' ? `Students (${students.length})` : `Subjects (${subjects.length})`}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search students..."
                  className="w-full pl-9 pr-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 outline-none text-sm" />
                {studentSearch && <button onClick={() => setStudentSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"><X size={14} /></button>}
              </div>
            </div>

            {filteredStudents.length === 0 && students.length === 0 ? (
              <div className="text-center py-16 glass-panel border-dashed border-[#D8D6D2] rounded-xl">
                <Users size={32} className="mx-auto mb-3 text-neutral-400" />
                <h3 className="font-medium mb-1">No students yet</h3>
                <p className="text-sm text-neutral-600 mb-5">Add students or share the invite link.</p>
                <div className="flex gap-2 justify-center">
                  <Btn variant="default" icon={QrCode} onClick={() => setInviteOpen(true)}>Share link</Btn>
                  <Btn variant="primary" icon={UserPlus} onClick={() => setAddStudentOpen(true)}>Add student</Btn>
                </div>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-sm text-neutral-500">No students match your search.</div>
            ) : (
              <div className="glass-panel border-white/60 shadow-sm rounded-xl overflow-hidden">
                {filteredStudents.map((s, i) => {
                  const isBlocked = blockedIds.includes(s.id);
                  return (
                    <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < filteredStudents.length - 1 ? 'border-b border-white/40' : ''} ${isBlocked ? 'opacity-60' : ''} hover:bg-[#F4F2EF] transition-colors`}>
                      <Avatar name={s.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigate(`/teacher/students/${s.id}`)} className="text-sm font-medium hover:underline text-left truncate">{s.name}</button>
                          {isBlocked && <Tag color="amber">Blocked</Tag>}
                        </div>
                        <p className="text-xs text-neutral-500 truncate">@{s.username}</p>
                      </div>
                      <div className="hidden md:flex items-center gap-6 text-xs">
                        <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Score</p><p className="font-medium">{s.avg_score || 0}%</p></div>
                        <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Attendance</p><p className="font-medium">{s.attendance_pct != null ? Math.round(s.attendance_pct) : 0}%</p></div>
                        <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Points</p><p className="font-medium">{s.points || 0}</p></div>
                      </div>
                      <button onClick={() => handleBlock(s.id)} title={isBlocked ? 'Unblock student' : 'Block student'} className={`p-1.5 rounded hover:bg-[#F4F2EF] ${isBlocked ? 'text-amber-600' : 'text-neutral-400 hover:text-neutral-900'}`}>
                        <Lock size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'subjects' && (
          <div>
            <p className="text-xs text-neutral-500 mb-4">
              All {students.length} students in {standard?.name} are enrolled in every subject.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/teacher/subjects/${standardId}/${c.id}`)}
                  className="glass-panel rounded-2xl p-5 text-left hover:bg-white/80 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group flex flex-col min-h-[130px]"
                >
                  <span className="text-3xl mb-3 block">{c.emoji || '📐'}</span>
                  <p className="text-sm font-semibold text-neutral-900 mb-0.5 truncate">{c.name}</p>
                  <p className="text-xs text-neutral-400">{c.end_date ? `Ends ${c.end_date}` : 'Active'}</p>
                  <div className="mt-auto pt-3 flex items-center justify-end">
                    <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              ))}
              <button
                onClick={() => setNewSubjectOpen(true)}
                className="glass-panel rounded-2xl p-5 text-left hover:bg-white/80 transition-all duration-200 border-2 border-dashed border-[#D8D6D2] hover:border-neutral-300 flex flex-col items-center justify-center min-h-[130px] text-neutral-400 hover:text-neutral-600 gap-2"
              >
                <div className="w-10 h-10 rounded-full border-2 border-neutral-300 flex items-center justify-center">
                  <Plus size={18} />
                </div>
                <span className="text-sm font-medium">Add subject</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} standardId={standardId} />
      <AddStudentModal
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        standardId={standardId}
        onStudentAdded={() => apiClient(`/students?standard_id=${standardId}`).then(data => setStudents(data || []))}
      />
      <BulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        standards={allStandards}
        existingStudents={students}
        initialStandardId={standardId}
        onImportComplete={(count) => {
          apiClient(`/students?standard_id=${standardId}`)
            .then(data => {
              setStudents(data || []);
              invalidateStudents();
            });
          setTab('students');
        }}
      />
      <NewSubjectModal
        open={newSubjectOpen}
        onClose={() => setNewSubjectOpen(false)}
        standardId={standardId}
        onSuccess={(created) => {
          if (created) setSubjects(prev => [...prev, created]);
        }}
      />

      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove student?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">Remove <strong>{confirmRemove?.name}</strong>?</p>
        <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Btn>
          <Btn variant="dangerSolid" onClick={() => handleRemove(confirmRemove?.id)}>Remove</Btn>
        </div>
      </Modal>

      <TerminateStandardModal
        open={terminateOpen}
        onClose={() => setTerminateOpen(false)}
        standard={standard}
        students={students}
        subjects={subjects}
        onSuccess={() => {
          invalidate();
          navigate('/teacher/subjects');
        }}
      />
    </div>
  );
}