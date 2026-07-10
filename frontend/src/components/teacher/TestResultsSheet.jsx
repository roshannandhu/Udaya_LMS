import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Check, X, Flag, Trash2, Edit2, Minus, Loader2, Save, Medal, Bell, Send, Eye, CheckCircle2, RotateCcw, Download, FileSpreadsheet, FileDown } from 'lucide-react';
import { Sheet, Avatar, Tag, Btn, Skeleton, Input } from '../ui';
import { testApi, apiClient, whatsappApi } from '../../lib/api';
import { examResultsPayload } from './whatsapp/reportDefaults';

const ExamResultPreviewLazy = lazy(() =>
  import('../../lib/reportPdf').then(m => ({ default: m.ExamResultTemplateV3 }))
);

export default function TestResultsSheet({ open, onClose, test, onSuccess, onDelete }) {
  const navigate = useNavigate();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('attempts');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notify, setNotify] = useState('idle'); // idle | sending | sent | later
  const [reattempts, setReattempts] = useState([]); // pending re-attempt requests
  const [reattemptBusy, setReattemptBusy] = useState(null); // request id being processed
  const [pdfBusy, setPdfBusy] = useState(null); // attempt id currently generating PDF
  const [previewAttempt, setPreviewAttempt] = useState(null); // null = closed
  const [previewReviewData, setPreviewReviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [xlsBusy, setXlsBusy] = useState(false);
  const [marksheetBusy, setMarksheetBusy] = useState(false);

  useEffect(() => {
    if (open && test?.id) {
      fetchResults();
      setIsEditing(false);
      setDeleteConfirm(false);
      setNotify('idle');
    }
  }, [open, test]);

  const handleNotifyNow = async () => {
    setNotify('sending');
    try {
      await whatsappApi.sendReports(examResultsPayload(test.id));
      setNotify('sent');
    } catch (err) {
      alert(err.message);
      setNotify('idle');
    }
  };

  const handleReviewFirst = () => {
    navigate('/teacher/whatsapp', { state: { tab: 'reports', examId: test.id } });
    onClose();
  };

  useEffect(() => {
    if (test) {
      const fmtLocal = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        return dt.toISOString().slice(0, 16);
      };
      setEditForm({
        title: test.title || '',
        duration_mins: test.duration_mins || test.duration || 30,
        total_marks: test.total_marks || test.totalMarks || 50,
        negative_marking: test.negative_marking || false,
        penalty: test.penalty || 0.25,
        scheduled_for: fmtLocal(test.scheduled_for),
        expires_at: fmtLocal(test.expires_at),
      });
    }
  }, [test]);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const [data, reqs] = await Promise.all([
        testApi.getTestResults(test.id),
        testApi.getReattemptRequests(test.id).catch(() => []),
      ]);
      setResults(data);
      setReattempts(Array.isArray(reqs) ? reqs : []);
    } catch (err) {
      console.error('Error fetching results:', err);
    } finally {
      setLoading(false);
    }
  };

  // Shared helper: build the 4 props needed by buildExamResultPdf / preview modal.
  const buildAttemptPdfProps = (attempt, reviewData = null) => {
    const student = attempt.students || {};
    const resultsTest = results?.test || {};
    const totalMarks = test.total_marks || test.totalMarks || resultsTest.total_marks;
    const marksToPct = (m) => (m != null && totalMarks ? (m / totalMarks) * 100 : undefined);
    return {
      reviewData,
      result: {
        id:             attempt.id,
        score:          attempt.score,
        total_marks:    totalMarks,
        percentage:     totalMarks ? (attempt.score / totalMarks) * 100 : null,
        correct_count:  attempt.correct_count,
        wrong_count:    attempt.wrong_count,
        marks_deducted: attempt.marks_deducted,
        total:          (attempt.correct_count || 0) + (attempt.wrong_count || 0),
        flagged:        attempt.flagged,
        cancelled:      attempt.terminated,
        points_earned:  attempt.points_earned,
        rank:           attempt.rank,
        total_attempts: attempt.total_attempts || results?.attempts?.length,
        class_avg_score_pct: marksToPct(results?.stats?.avg_score),
        highest_score_pct:   marksToPct(results?.stats?.highest_score),
        lowest_score_pct:    marksToPct(results?.stats?.lowest_score),
        flagged_count:  results?.stats?.flagged_count,
        started_at:     attempt.started_at,
        submitted_at:   attempt.submitted_at,
      },
      student: {
        name:          student.name,
        student_code:  student.student_code,
        standard_name: resultsTest.subject_classes?.standards?.name || student.standard_name,
        avatar_url:    student.avatar_url,
        username:      student.username,
      },
      testMeta: {
        title:         test.title,
        subject_name:  resultsTest.subject_classes?.name || test.subject_name || test.subject || '',
        duration_mins: test.duration_mins || test.duration || resultsTest.duration_mins,
        total_marks:   totalMarks,
        scheduled_for: test.scheduled_for,
        topic_tag:     resultsTest.topic_tag || test.topic_tag,
      },
    };
  };

  const handleDownloadExamPdf = async (attempt) => {
    if (pdfBusy === attempt.id) return;
    setPdfBusy(attempt.id);
    try {
      let reviewData = null;
      try {
        const editData = await testApi.getTestForEdit(test.id);
        let answers = attempt.answers;
        if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = {}; } }
        reviewData = { questions: editData?.questions || [], answers: answers || {} };
      } catch { /* PDF still renders from summary counts */ }
      const { buildExamResultPdf } = await import('../../lib/reportPdf');
      await buildExamResultPdf(buildAttemptPdfProps(attempt, reviewData));
    } catch (e) {
      console.error('Exam PDF failed', e);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfBusy(null);
    }
  };

  const handlePreviewPdf = async (attempt) => {
    setPreviewAttempt(attempt);
    setPreviewReviewData(null);
    setPreviewLoading(true);
    try {
      const editData = await testApi.getTestForEdit(test.id);
      let answers = attempt.answers;
      if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = {}; } }
      setPreviewReviewData({ questions: editData?.questions || [], answers: answers || {} });
    } catch { /* preview renders from summary counts */ }
    setPreviewLoading(false);
  };

  const handleExportExcel = async () => {
    if (!results?.attempts?.length || xlsBusy) return;
    setXlsBusy(true);
    try {
      const totalM = test.total_marks || test.totalMarks || 100;
      const PASS_PCT = 35;
      const grade = (pct) => {
        const s = Math.round(pct || 0);
        if (s >= 90) return 'A+'; if (s >= 80) return 'A'; if (s >= 70) return 'B+';
        if (s >= 60) return 'B'; if (s >= 50) return 'C'; if (s >= 35) return 'D'; return 'E';
      };
      const sorted = [...results.attempts].sort((a, b) => (a.rank || 999) - (b.rank || 999));
      const HEADER = ['Rank', 'Student ID', 'Name', 'Score', `Total (${totalM})`, '%', 'Grade', 'Correct', 'Wrong', 'Neg. Marks', 'Points', 'Status', 'Flagged'];
      const rows = sorted.map((a, i) => {
        const s = a.students || {};
        const pct = totalM ? (a.score / totalM) * 100 : 0;
        return [
          a.rank || (i + 1), s.student_code || '', s.name || 'Unknown',
          a.score ?? 0, totalM, parseFloat(pct.toFixed(1)), grade(pct),
          a.correct_count || 0, a.wrong_count || 0,
          a.marks_deducted || 0, a.points_earned || 0,
          pct >= PASS_PCT ? 'Pass' : 'Fail', a.flagged ? 'Yes' : 'No',
        ];
      });
      const COLS = [{wch:6},{wch:16},{wch:24},{wch:8},{wch:10},{wch:8},{wch:7},{wch:8},{wch:7},{wch:11},{wch:8},{wch:8},{wch:8}];
      const cheated = sorted.filter(a => a.flagged);
      const CHEAT_HDR = ['Rank', 'Student ID', 'Name', 'Score', '%', 'Events', 'Event Details'];
      const cheatRows = cheated.map(a => {
        const s = a.students || {};
        const pct = totalM ? parseFloat(((a.score / totalM) * 100).toFixed(1)) : 0;
        const evts = Array.isArray(a.cheat_events) ? a.cheat_events : [];
        const detail = evts.length ? evts.map(e => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.type}`).join('; ') : (a.terminated ? 'Exam terminated' : 'Flagged');
        return [a.rank || '-', s.student_code || '', s.name || 'Unknown', a.score ?? 0, pct, evts.length || (a.terminated ? 1 : 0), detail];
      });

      const clean = s => String(s || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      const filename = `${clean(test.title) || 'Exam'}_Results_${new Date().toISOString().slice(0, 10)}`;
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([HEADER, ...rows]); ws1['!cols'] = COLS;
      XLSX.utils.book_append_sheet(wb, ws1, 'Results');
      if (cheatRows.length) {
        const ws2 = XLSX.utils.aoa_to_sheet([CHEAT_HDR, ...cheatRows]);
        ws2['!cols'] = [{wch:6},{wch:16},{wch:24},{wch:8},{wch:8},{wch:8},{wch:70}];
        XLSX.utils.book_append_sheet(wb, ws2, 'Integrity Issues');
      }
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setXlsBusy(false);
    }
  };

  const handleExportMarksheetPdf = async () => {
    if (!results?.attempts?.length || marksheetBusy) return;
    setMarksheetBusy(true);
    try {
      const { buildClassMarksheetPdf } = await import('../../lib/reportPdf');
      const resultsTest = results?.test || {};
      await buildClassMarksheetPdf({
        test: { ...test, _resultsTest: resultsTest },
        attempts: results.attempts,
        stats: results.stats,
      });
    } catch (err) {
      console.error('Marksheet PDF failed:', err);
      alert('Failed to generate marksheet. Please try again.');
    } finally {
      setMarksheetBusy(false);
    }
  };

  const handleReattempt = async (reqId, action) => {
    setReattemptBusy(reqId);
    try {
      if (action === 'approve') await testApi.approveReattempt(reqId);
      else await testApi.rejectReattempt(reqId);
      setReattempts(prev => prev.filter(r => r.id !== reqId));
      if (action === 'approve') fetchResults();
    } catch (err) {
      alert(err?.message || 'Action failed. Please try again.');
    } finally {
      setReattemptBusy(null);
    }
  };

  const handlePublishTest = async () => {
    try {
      await apiClient(`/tests/${test.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' })
      });
      onClose();
      if (onSuccess) onSuccess({ ...test, status: 'active' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    try {
      const payload = {
        title: editForm.title,
        duration_mins: parseInt(editForm.duration_mins) || 30,
        total_marks: parseFloat(editForm.total_marks) || 50,
        negative_marking: editForm.negative_marking,
        penalty: editForm.negative_marking ? (parseFloat(editForm.penalty) || 0.25) : 0,
      };
      if (editForm.scheduled_for) payload.scheduled_for = new Date(editForm.scheduled_for).toISOString();
      if (editForm.expires_at) payload.expires_at = new Date(editForm.expires_at).toISOString();
      await apiClient(`/tests/${test.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setIsEditing(false);
      if (onSuccess) onSuccess({ ...test, ...payload });
    } catch (err) {
      console.error(err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeleting(true);
    try {
      await apiClient(`/tests/${test.id}`, { method: 'DELETE' });
      onClose();
      if (onDelete) onDelete(test.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  if (!test) return null;

  const isScheduled = test.status === 'scheduled' && (!test.scheduled_for || new Date(test.scheduled_for) > new Date());
  const isDraft = test.status === 'draft';

  // Build preview props using the shared helper (reviewData injected after fetch)
  const previewProps = previewAttempt
    ? buildAttemptPdfProps(previewAttempt, previewReviewData)
    : null;

  return (
    <>
    {/* ── PDF Preview Modal ───────────────────────────────────────────────── */}
    {previewAttempt && (
      <div
        className="fixed inset-0 z-[200] flex flex-col bg-black/60"
        onClick={e => { if (e.target === e.currentTarget) setPreviewAttempt(null); }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between gap-4 bg-white px-5 py-3 shadow-md flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{(previewAttempt.students || {}).name || 'Student'} — Result Preview</p>
            <p className="text-[11px] text-neutral-400">Scroll to see all pages · downloading saves the same content</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDownloadExamPdf(previewAttempt)}
              disabled={pdfBusy === previewAttempt.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {pdfBusy === previewAttempt.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Download PDF
            </button>
            <button
              onClick={() => setPreviewAttempt(null)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal body — scrollable, grey background, white PDF centered */}
        <div className="flex-1 overflow-y-auto bg-[#E5E5E5] p-6">
          {previewLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-neutral-400" />
            </div>
          ) : previewProps ? (
            <div className="mx-auto bg-white shadow-xl" style={{ width: 720 }}>
              <Suspense fallback={
                <div className="flex items-center justify-center py-24">
                  <Loader2 size={24} className="animate-spin text-neutral-300" />
                </div>
              }>
                <ExamResultPreviewLazy {...previewProps} />
              </Suspense>
            </div>
          ) : (
            <div className="text-center py-20 text-sm text-neutral-400">Preview unavailable</div>
          )}
        </div>
      </div>
    )}

    <Sheet open={open} onClose={onClose} title={isEditing ? 'Edit Test' : (test.title || 'Test Results')} size="lg">
      {(isScheduled || isDraft) ? (
        <>
          {isEditing ? (
            <div className="space-y-4">
              <Input label="Test title" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Duration (mins)" type="number" value={editForm.duration_mins} onChange={e => setEditForm({ ...editForm, duration_mins: e.target.value })} />
                <Input label="Total marks" type="number" value={editForm.total_marks} onChange={e => setEditForm({ ...editForm, total_marks: e.target.value })} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-white/30 border border-white/60">
                <div>
                  <p className="text-sm font-medium">Negative marking</p>
                  <p className="text-xs text-neutral-500">Deduct marks for wrong answers</p>
                </div>
                <button onClick={() => setEditForm({ ...editForm, negative_marking: !editForm.negative_marking })}
                  className={`w-11 h-6 rounded-full transition-colors ${editForm.negative_marking ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all ${editForm.negative_marking ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                </button>
              </div>
              {editForm.negative_marking && (
                <Input label="Penalty per wrong answer" type="number" step="0.25" value={editForm.penalty} onChange={e => setEditForm({ ...editForm, penalty: e.target.value })} />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start time" type="datetime-local" value={editForm.scheduled_for} onChange={e => setEditForm({ ...editForm, scheduled_for: e.target.value })} />
                <Input label="End time" type="datetime-local" value={editForm.expires_at} onChange={e => setEditForm({ ...editForm, expires_at: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-2">
                <Btn variant="ghost" onClick={() => setIsEditing(false)} className="flex-1" disabled={editSaving}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveEdit} disabled={editSaving} className="flex-1">
                  {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                  Save changes
                </Btn>
              </div>
            </div>
          ) : (
            <>
              <div className={`p-4 rounded-md mb-5 flex items-start gap-2 ${isDraft ? 'bg-neutral-50 border border-neutral-200' : 'bg-amber-50 border border-amber-100'}`}>
                <Clock size={14} className={`mt-0.5 flex-shrink-0 ${isDraft ? 'text-neutral-500' : 'text-amber-600'}`} />
                <div>
                  <p className={`text-sm font-medium ${isDraft ? 'text-neutral-800' : 'text-amber-900'}`}>
                    {isDraft ? 'Draft — not visible to students' : test.scheduled_for ? `Scheduled for ${new Date(test.scheduled_for).toLocaleString()}` : 'Scheduled'}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDraft ? 'text-neutral-500' : 'text-amber-700'}`}>
                    {isDraft ? 'Publish the test to make it available.' : "This test hasn't started yet."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-md bg-white/30 border border-white/60">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">Duration</p>
                  <p className="text-sm font-semibold">{test.duration_mins || test.duration} mins</p>
                </div>
                <div className="p-3 rounded-md bg-white/30 border border-white/60">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">Total Marks</p>
                  <p className="text-sm font-semibold">{test.total_marks || test.totalMarks}</p>
                </div>
              </div>

              {test.negative_marking !== false && test.penalty > 0 && (
                <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-100 text-xs text-red-900 flex items-center gap-2">
                  <Minus size={12} /> Negative marking: −{test.penalty} per wrong answer
                </div>
              )}

              <Btn onClick={handlePublishTest} variant="primary" className="w-full mb-3">
                Publish Test Now
              </Btn>
              <div className="flex gap-2">
                <Btn variant="default" icon={Edit2} className="flex-1" onClick={() => setIsEditing(true)}>Edit</Btn>
                <Btn
                  variant="danger"
                  icon={deleting ? Loader2 : Trash2}
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleteConfirm ? 'Confirm?' : 'Delete'}
                </Btn>
              </div>
              {deleteConfirm && (
                <p className="text-xs text-red-600 mt-2 text-center">Click Delete again to permanently remove this test.</p>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-md" />)}
              </div>
              <Skeleton className="h-48 rounded-md" />
            </div>
          ) : results ? (
            <>
              {results.stats.total_attempts > 0 && notify !== 'later' && (
                <div className="mb-5 p-4 rounded-md bg-emerald-50 border border-emerald-200">
                  {notify === 'sent' ? (
                    <p className="text-sm font-medium text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 size={16} /> Parents notified.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 mb-3">
                        <Bell size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">Results are in — notify parents?</p>
                          <p className="text-xs text-emerald-700 mt-0.5">Each parent gets their child's score, a short note, and a PDF report.</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="primary" icon={notify === 'sending' ? Loader2 : Send}
                          disabled={notify === 'sending'} onClick={handleNotifyNow}>
                          {notify === 'sending' ? 'Sending…' : 'Send Now'}
                        </Btn>
                        <Btn variant="default" icon={Eye} onClick={handleReviewFirst}>Review First</Btn>
                        <Btn variant="ghost" onClick={() => setNotify('later')}>Later</Btn>
                      </div>
                    </>
                  )}
                </div>
              )}
              {(() => {
                const totalM = test.total_marks || test.totalMarks || 100;
                const toP = v => v != null ? ((v / totalM) * 100).toFixed(1) : '—';
                return (
                  <div className="grid grid-cols-3 gap-2 mb-5">
                    <div className="p-3 rounded-md bg-white/30 border border-white/60">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Attempted</p>
                      <p className="text-lg font-semibold tabular-nums">{results.stats.total_attempts}</p>
                    </div>
                    <div className="p-3 rounded-md bg-white/30 border border-white/60">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Avg Score</p>
                      <p className="text-lg font-semibold tabular-nums">{toP(results.stats.avg_score)}%</p>
                    </div>
                    <div className="p-3 rounded-md bg-white/30 border border-white/60">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-500">Flagged</p>
                      <p className={`text-lg font-semibold tabular-nums ${results.stats.flagged_count > 0 ? 'text-red-600' : ''}`}>
                        {results.stats.flagged_count}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-1 mb-4">
                <button onClick={() => setActiveTab('attempts')}
                  className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'attempts' ? 'bg-white/50 font-medium' : 'text-neutral-500'}`}>
                  Results ({results.attempts.length})
                </button>
                <button onClick={() => setActiveTab('stats')}
                  className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'stats' ? 'bg-white/50 font-medium' : 'text-neutral-500'}`}>
                  Stats
                </button>
                <button onClick={() => setActiveTab('reattempts')}
                  className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 ${activeTab === 'reattempts' ? 'bg-white/50 font-medium' : 'text-neutral-500'}`}>
                  Re-attempts
                  {reattempts.length > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-amber-500 rounded-full">
                      {reattempts.length}
                    </span>
                  )}
                </button>
              </div>

              {activeTab === 'attempts' && (
                results.attempts.length === 0 ? (
                  <div className="text-center py-8 text-sm text-neutral-500">No attempts yet.</div>
                ) : (
                  <>
                    {/* Export actions */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                      <button
                        onClick={handleExportExcel}
                        disabled={xlsBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-white/60 bg-white/40 hover:bg-white/70 text-neutral-700 transition-colors disabled:opacity-50"
                      >
                        {xlsBusy ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
                        {xlsBusy ? 'Exporting…' : 'Export Excel'}
                      </button>
                      <button
                        onClick={handleExportMarksheetPdf}
                        disabled={marksheetBusy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-white/60 bg-white/40 hover:bg-white/70 text-neutral-700 transition-colors disabled:opacity-50"
                      >
                        {marksheetBusy ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                        {marksheetBusy ? 'Generating…' : 'Marksheet PDF'}
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {results.attempts.map((a, i) => {
                        const student = a.students || {};
                        const totalM = test.total_marks || test.totalMarks || 100;
                        const scorePct = a.score != null ? ((a.score / totalM) * 100).toFixed(1) : 0;
                        const displayRank = a.rank || i + 1;
                        return (
                          <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-md bg-white border ${a.flagged ? 'border-red-200' : 'border-white/60'}`}>
                            <span className={`text-xs font-semibold w-5 flex justify-center tabular-nums ${displayRank <= 3 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {displayRank === 1 ? <Medal size={15} className="text-amber-400" /> : displayRank === 2 ? <Medal size={15} className="text-neutral-400" /> : displayRank === 3 ? <Medal size={15} className="text-amber-700" /> : displayRank}
                            </span>
                            <Avatar name={student.name} src={student.avatar_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{student.name || 'Unknown'}</p>
                                {(a.flagged || (a.cheat_events && a.cheat_events.length > 0)) && (
                                  <Tag color="red" title={a.cheat_events?.map(e => `${new Date(e.timestamp).toLocaleTimeString()}: ${e.type}`).join('\n')}>
                                    <Flag size={10} /> Cheating ({a.cheat_events?.length || 1})
                                  </Tag>
                                )}
                              </div>
                              <p className="text-xs text-neutral-500">
                                {a.correct_count} correct, {a.wrong_count} wrong
                                {a.marks_deducted > 0 && ` (−${a.marks_deducted.toFixed(2)} deducted)`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="text-right mr-1">
                                <Tag color={scorePct >= 80 ? 'green' : scorePct >= 60 ? 'blue' : scorePct >= 40 ? 'amber' : 'red'}>
                                  {scorePct}%
                                </Tag>
                                <p className="text-[10px] text-neutral-400 mt-0.5">{a.points_earned} pts</p>
                              </div>
                              <button
                                onClick={() => handlePreviewPdf(a)}
                                title="Preview result PDF"
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-[#2383E2] hover:bg-blue-50 transition-colors"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={() => handleDownloadExamPdf(a)}
                                disabled={pdfBusy === a.id}
                                title="Download result PDF"
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors disabled:opacity-40"
                              >
                                {pdfBusy === a.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
              )}

              {activeTab === 'stats' && (() => {
                const totalM = test.total_marks || test.totalMarks || 100;
                const toP = v => v != null ? ((v / totalM) * 100).toFixed(1) : '—';
                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-md bg-white/30 border border-white/60">
                      <h4 className="text-sm font-medium mb-3">Score Distribution</h4>
                      <div className="space-y-2">
                        {[
                          { label: 'Highest', value: toP(results.stats.highest_score), color: 'text-green-600' },
                          { label: 'Average', value: toP(results.stats.avg_score), color: 'text-blue-600' },
                          { label: 'Lowest', value: toP(results.stats.lowest_score), color: 'text-red-600' },
                        ].map(s => (
                          <div key={s.label} className="flex justify-between items-center">
                            <span className="text-xs text-neutral-500">{s.label}</span>
                            <span className={`text-sm font-semibold ${s.color}`}>{s.value}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 rounded-md bg-white/30 border border-white/60">
                      <h4 className="text-sm font-medium mb-3">Performance Stats</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-neutral-500">Total Attempts</span>
                          <span className="text-sm font-semibold">{results.stats.total_attempts}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-neutral-500">Flagged for Cheating</span>
                          <span className={`text-sm font-semibold ${results.stats.flagged_count > 0 ? 'text-red-600' : ''}`}>
                            {results.stats.flagged_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'reattempts' && (
                reattempts.length === 0 ? (
                  <div className="text-center py-8 text-sm text-neutral-500">
                    No re-attempt requests.
                    <p className="text-xs text-neutral-400 mt-1">When a student asks to re-take this test, it shows here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reattempts.map(r => {
                      const student = r.students || {};
                      const totalM = test.total_marks || test.totalMarks || 100;
                      const oldPct = r.old_score != null ? ((r.old_score / totalM) * 100).toFixed(0) : null;
                      const busy = reattemptBusy === r.id;
                      return (
                        <div key={r.id} className="p-3 rounded-md bg-white border border-amber-100">
                          <div className="flex items-center gap-3 mb-2">
                            <Avatar name={student.name} src={student.avatar_url} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{student.name || 'Student'}</p>
                              {oldPct != null && <p className="text-[11px] text-neutral-500">Previous score: {oldPct}%</p>}
                            </div>
                            <RotateCcw size={15} className="text-amber-500 shrink-0" />
                          </div>
                          {r.reason && (
                            <p className="text-xs text-neutral-700 bg-neutral-50 border border-neutral-100 rounded-md px-3 py-2 mb-2.5 whitespace-pre-wrap">
                              "{r.reason}"
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Btn variant="primary" icon={busy ? Loader2 : Check} disabled={busy}
                              onClick={() => handleReattempt(r.id, 'approve')} className="flex-1">
                              Approve
                            </Btn>
                            <Btn variant="default" icon={X} disabled={busy}
                              onClick={() => handleReattempt(r.id, 'reject')} className="flex-1">
                              Reject
                            </Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </>
          ) : (
            <div className="text-center py-8 text-sm text-neutral-500">Failed to load results</div>
          )}

          {/* Delete danger zone — available for all active/completed tests */}
          <div className="mt-6 pt-4 border-t border-white/40">
            <Btn
              variant="danger"
              icon={deleting ? Loader2 : Trash2}
              disabled={deleting}
              onClick={handleDelete}
              className="w-full"
            >
              {deleteConfirm ? 'Confirm delete?' : 'Delete Test'}
            </Btn>
            {deleteConfirm && (
              <p className="text-xs text-red-600 mt-2 text-center">
                This will permanently delete the test and all {results?.stats?.total_attempts ?? 0} student attempts.
              </p>
            )}
          </div>
        </>
      )}
    </Sheet>
    </>
  );
}
