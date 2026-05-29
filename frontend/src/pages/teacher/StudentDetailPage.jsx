import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Edit2, MoreVertical, MessageSquare, Download, Lock, Trash2, ShieldOff, Shield, Eye, CheckCircle2, Loader2, AlertTriangle, Share2 } from 'lucide-react';
import { Btn, Tag, Divider, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient, reportApi } from '../../lib/api';
import { useAppCache, useSettingsStore } from '../../store';
import StudentReportCard, { shareReportText } from '../../components/shared/StudentReportCard';

export default function StudentDetailPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [standard, setStandard] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [resetPwResult, setResetPwResult] = useState(null);
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [viewPwResult, setViewPwResult] = useState(null);
  const [viewPwLoading, setViewPwLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const [reportPeriod, setReportPeriod] = useState('overall');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  const [copied, setCopied] = useState(false);

  const handleDownloadPDF = async () => {
    if (!reportData) return;
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');
    const doc = new jsPDF();
    const s = reportData.student || {};
    const subjectRadar = reportData.subject_radar || [];
    
    doc.setFontSize(20); doc.text('Student Report Card', 14, 20);
    doc.setFontSize(12);
    doc.text(`Name: ${s.name}  |  Username: @${s.username}`, 14, 30);
    doc.text(
      `Period: ${reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)}  |  Avg Score: ${s.avg_score || 0}%  |  Attendance: ${s.attendance_pct || 0}%  |  Rank: ${reportData.rank ? `${reportData.rank}/${reportData.total_students}` : 'N/A'}`,
      14, 38
    );
    if (subjectRadar.length > 0) {
      doc.setFontSize(14); doc.text('Subject Performance', 14, 52);
      doc.autoTable({
        startY: 56,
        head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance']],
        body: subjectRadar.map(r => [
          `${r.emoji} ${r.subject}`,
          r.test_count > 0 ? `${r.test_avg}%` : '—',
          r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—',
          r.att_total > 0 ? `${r.attendance_pct}%` : '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
      });
    }
    doc.save(`${s.name}_Report_${reportPeriod}.pdf`);
  };

  const handleShare = async () => {
    const text = shareReportText(reportData, reportPeriod);
    if (!text) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${student?.name || 'Student'} - Report Card`,
          text: text,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to copy
      }
    }
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy report: ', err);
    }
  };

  const { defaultStudentPassword } = useSettingsStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const s = await apiClient(`/students/${studentId}`);
        setStudent(s);
        setEditForm({ name: s.name || '', email: s.email || '', phone: s.phone || '' });

        if (s.standard_id) {
          const std = await apiClient(`/standards/${s.standard_id}`).catch(() => null);
          setStandard(std);
        }
      } catch (err) {
        console.error('Student fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    setReportLoading(true);
    setReportError(null);
    reportApi.getV2(studentId, reportPeriod)
      .then(d => setReportData(d))
      .catch(e => setReportError(e.message || 'Failed to load report'))
      .finally(() => setReportLoading(false));
  }, [studentId, reportPeriod]);

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
      const body = defaultStudentPassword ? { new_password: defaultStudentPassword } : {};
      const res = await apiClient(`/students/${studentId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResetPwResult(res.new_password);
    } catch (err) {
      console.error(err);
    } finally {
      setResetPwLoading(false);
    }
  };

  const handleViewPassword = async () => {
    setViewPwLoading(true);
    setMenuOpen(false);
    try {
      const res = await apiClient(`/students/${studentId}/password`);
      if (res.status === 'ok') setViewPwResult(res.plain_password);
      else if (res.status === 'never_stored') setViewPwResult('never_stored');
      else setViewPwResult('changed');
    } catch (err) {
      const msg = err?.message || '';
      if (msg.startsWith('column_missing:')) {
        setViewPwResult('column_missing');
      } else {
        setViewPwResult('error');
      }
    } finally {
      setViewPwLoading(false);
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
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 min-h-screen">
          <Loader2 size={32} className="animate-spin mb-4 text-neutral-300" />
          <p className="text-sm">Loading...</p>
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
    <div className="bg-[#FAFAF9] min-h-screen">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/teacher/students')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 rounded-md transition-colors"><ArrowLeft size={16} /></button>
            <div className="flex-1 min-w-0">
              <p className="hidden lg:block text-[11px] text-neutral-400 leading-none mb-0.5">Students / {standard?.name}</p>
              <h1 className="text-base font-semibold truncate text-[#1A1A19]">{s.name}</h1>
            </div>
            {s.blocked && <Tag color="red" className="ml-2">Blocked</Tag>}
          </div>
          <div className="flex gap-2 flex-shrink-0 relative">
            {reportData && (
              <>
                <Btn variant="default" size="sm" icon={copied ? CheckCircle2 : Share2} onClick={handleShare} className="bg-white border-[#EBEAE7] text-[#1A1A19]">
                  {copied ? 'Copied!' : 'Share'}
                </Btn>
                <Btn variant="default" size="sm" icon={Download} onClick={handleDownloadPDF} className="bg-white border-[#EBEAE7] text-[#1A1A19]">
                  Export PDF
                </Btn>
              </>
            )}
            <Btn variant="default" size="sm" icon={Edit2} onClick={() => setEditOpen(true)} className="bg-white border-[#EBEAE7] text-[#1A1A19]">Edit</Btn>
            <Btn variant="default" size="sm" icon={MoreVertical} onClick={() => setMenuOpen(!menuOpen)} className="bg-white border-[#EBEAE7] text-[#1A1A19]" />
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 w-56 py-1 z-50 rounded-xl bg-white border border-[#EBEAE7] shadow-lg">
                  <button onClick={() => { navigate('/teacher/broadcasts', { state: { stdId: s.standard_id } }); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#FAFAF9] text-left text-[#1A1A19]"><MessageSquare size={14} /> Message standard</button>
                  <button onClick={handleResetPassword} disabled={resetPwLoading} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#FAFAF9] text-left text-[#1A1A19]"><Lock size={14} /> {resetPwLoading ? 'Resetting…' : 'Reset password'}</button>
                  <button onClick={handleViewPassword} disabled={viewPwLoading} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#FAFAF9] text-left text-[#1A1A19]"><Eye size={14} /> {viewPwLoading ? 'Loading…' : 'View password'}</button>
                  <button onClick={handleToggleBlock} disabled={blockLoading} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 text-left text-amber-700">
                    {s.blocked ? <Shield size={14} /> : <ShieldOff size={14} />} {blockLoading ? 'Updating…' : s.blocked ? 'Unblock student' : 'Block student'}
                  </button>
                  <Divider className="my-1 border-[#EBEAE7]" />
                  <button onClick={() => { setConfirmRemove(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-left text-red-600"><Trash2 size={14} /> Remove from standard</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {reportLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-neutral-400" /></div>
        ) : reportError ? (
          <div className="flex items-center gap-2 p-4 m-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
            <AlertTriangle size={16} />{reportError}
          </div>
        ) : reportData ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4 md:px-6 pt-5 pb-2 flex-wrap gap-3">
              <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Performance Report</h2>
              <div className="flex items-center gap-0.5 p-1">
              </div>
            </div>
            <StudentReportCard
              data={reportData}
              period={reportPeriod}
              onPeriodChange={setReportPeriod}
              showHeader={false}
            />
          </div>
        ) : null}
      </div>

      {/* Edit Modal */}
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

      {/* Password Modals */}
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

      <Modal open={!!viewPwResult} onClose={() => setViewPwResult(null)} title="Student password" size="sm">
        {(viewPwResult === 'error' || viewPwResult === 'column_missing') ? (
          <>
            <p className="text-sm text-neutral-600 mb-3">The <code className="bg-neutral-100 px-1 rounded text-xs">plain_password</code> column is missing. Run this once in your <strong>Supabase SQL Editor</strong>:</p>
            <div className="p-3 bg-neutral-900 text-white rounded-lg font-mono text-xs mb-4 select-all break-all">
              ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;
            </div>
            <p className="text-xs text-neutral-500 mb-4">After running the migration, restart the backend — it will auto-detect the column. New student passwords set after that will be visible here.</p>
            <div className="flex gap-2">
              <Btn variant="default" className="flex-1" onClick={() => { navigator.clipboard.writeText('ALTER TABLE students ADD COLUMN IF NOT EXISTS plain_password TEXT;'); }}>Copy SQL</Btn>
              <Btn variant="primary" className="flex-1" onClick={() => setViewPwResult(null)}>Close</Btn>
            </div>
          </>
        ) : viewPwResult === 'never_stored' ? (
          <>
            <p className="text-sm text-neutral-600 mb-3">
              No password on file for <strong>{s.name}</strong>. This student was created before password storage was enabled.
            </p>
            <p className="text-xs text-neutral-500 mb-4">Use "Reset password" to set a new password — it will be saved and visible here.</p>
            <Btn variant="primary" className="w-full" onClick={() => setViewPwResult(null)}>Close</Btn>
          </>
        ) : viewPwResult === 'changed' ? (
          <>
            <p className="text-sm text-neutral-600 mb-3">
              <strong>{s.name}</strong> has set their own password. The original is no longer available.
            </p>
            <p className="text-xs text-neutral-500 mb-4">Use "Reset password" to issue a new one.</p>
            <Btn variant="primary" className="w-full" onClick={() => setViewPwResult(null)}>Close</Btn>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-600 mb-3">Last password set for <strong>{s.name}</strong>:</p>
            <div className="p-3 bg-neutral-900 text-white rounded-lg font-mono text-base mb-3 select-all">
              {viewPwResult}
            </div>
            <p className="text-xs text-neutral-500 mb-4">This is the password you last set. Once the student changes it themselves, it won't be visible here.</p>
            <Btn variant="primary" className="w-full" onClick={() => { navigator.clipboard.writeText(viewPwResult); setViewPwResult(null); }}>
              Copy & close
            </Btn>
          </>
        )}
      </Modal>

      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove student?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">Remove <strong>{s.name}</strong> from <strong>{standard?.name}</strong>?</p>
        <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Btn>
          <Btn variant="dangerSolid" onClick={handleRemove}>Remove</Btn>
        </div>
      </Modal>

    </div>
  );
}
