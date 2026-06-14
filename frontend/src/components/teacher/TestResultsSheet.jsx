import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Check, X, Flag, Trash2, Edit2, Minus, Loader2, Save, Medal, Bell, Send, Eye, CheckCircle2, RotateCcw } from 'lucide-react';
import { Sheet, Avatar, Tag, Btn, Skeleton, Input } from '../ui';
import { testApi, apiClient, whatsappApi } from '../../lib/api';
import { examResultsPayload } from './whatsapp/reportDefaults';

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

  const handleReattempt = async (reqId, action) => {
    setReattemptBusy(reqId);
    try {
      if (action === 'approve') await testApi.approveReattempt(reqId);
      else await testApi.rejectReattempt(reqId);
      setReattempts(prev => prev.filter(r => r.id !== reqId));
      // The student's attempt was reset (approve) — refresh the results list.
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

  return (
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
                          <p className="text-xs text-emerald-700 mt-0.5">Each parent gets their child’s score, a short note, and a PDF report.</p>
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
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {results.attempts.map((a, i) => {
                      const student = a.students || {};
                      const totalM = test.total_marks || test.totalMarks || 100;
                      const scorePct = a.score != null ? ((a.score / totalM) * 100).toFixed(1) : 0;
                      return (
                        <div key={a.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-md bg-white border ${a.flagged ? 'border-red-200' : 'border-white/60'}`}>
                          <span className={`text-xs font-semibold w-5 flex justify-center tabular-nums ${i < 3 ? 'text-amber-600' : 'text-neutral-500'}`}>
                            {i === 0 ? <Medal size={15} className="text-amber-400" /> : i === 1 ? <Medal size={15} className="text-neutral-400" /> : i === 2 ? <Medal size={15} className="text-amber-700" /> : i + 1}
                          </span>
                          <Avatar name={student.name} size="sm" />
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
                          <div className="text-right">
                            <Tag color={scorePct >= 80 ? 'green' : scorePct >= 60 ? 'blue' : scorePct >= 40 ? 'amber' : 'red'}>
                              {scorePct}%
                            </Tag>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{a.points_earned} pts</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                            <Avatar name={student.name} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{student.name || 'Student'}</p>
                              {oldPct != null && <p className="text-[11px] text-neutral-500">Previous score: {oldPct}%</p>}
                            </div>
                            <RotateCcw size={15} className="text-amber-500 shrink-0" />
                          </div>
                          {r.reason && (
                            <p className="text-xs text-neutral-700 bg-neutral-50 border border-neutral-100 rounded-md px-3 py-2 mb-2.5 whitespace-pre-wrap">
                              “{r.reason}”
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
  );
}
