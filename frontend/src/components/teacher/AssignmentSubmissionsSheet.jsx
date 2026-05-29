import React, { useState, useEffect } from 'react';
import { Paperclip, ExternalLink, Loader2, Star, Trash2, AlertCircle } from 'lucide-react';
import { Sheet, Btn, Avatar, Tag } from '../ui';
import { assignmentApi } from '../../lib/api';

export default function AssignmentSubmissionsSheet({
  open, onClose, assignment, totalStudents = 0, onSubmissionDeleted,
}) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [gradingId, setGradingId]     = useState(null);
  const [gradeInput, setGradeInput]   = useState('');
  const [gradeError, setGradeError]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [deletingId, setDeletingId]   = useState(null);

  useEffect(() => {
    if (open && assignment?.id) {
      loadSubmissions();
    } else {
      setSubmissions([]);
      setGradingId(null);
      setGradeInput('');
      setGradeError('');
    }
  }, [open, assignment?.id]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const data = await assignmentApi.getSubmissions(assignment.id);
      setSubmissions(data.submissions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async (submissionId) => {
    const marks = parseFloat(gradeInput);
    if (isNaN(marks) || marks < 0 || marks > 100) {
      setGradeError('Enter a mark between 0 and 100');
      return;
    }
    setSaving(true);
    setGradeError('');
    try {
      await assignmentApi.grade(assignment.id, submissionId, { marks_obtained: marks });
      await loadSubmissions();
      setGradingId(null);
      setGradeInput('');
    } catch (err) {
      setGradeError(err.message || 'Failed to grade');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubmission = async (submissionId) => {
    if (!window.confirm('Remove this student\'s submission? Their points will be reversed and they can re-submit.')) return;
    setDeletingId(submissionId);
    try {
      await assignmentApi.deleteSubmission(assignment.id, submissionId);
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      onSubmissionDeleted?.();
    } catch (err) {
      alert(err.message || 'Failed to delete submission');
    } finally {
      setDeletingId(null);
    }
  };

  const submittedCount = submissions.length;
  const gradedCount = submissions.filter(s => s.marks_obtained != null).length;
  const pendingCount = submittedCount - gradedCount;

  return (
    <Sheet open={open} onClose={onClose} title={assignment?.title || 'Submissions'}>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-neutral-400" size={24} />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stats bar */}
          <div className="flex items-center gap-4 py-3 border-b border-neutral-100 text-sm">
            <span>
              <strong className="text-neutral-900">{submittedCount}</strong>
              {totalStudents > 0 && <span className="text-neutral-400">/{totalStudents}</span>}
              <span className="text-neutral-500"> submitted</span>
            </span>
            {gradedCount > 0 && (
              <span className="text-emerald-600 font-medium">{gradedCount} graded</span>
            )}
            {pendingCount > 0 && (
              <span className="text-amber-600 font-medium">{pendingCount} pending</span>
            )}
          </div>

          {submissions.length === 0 && (
            <div className="text-center py-12 text-sm text-neutral-400">
              No submissions yet.
            </div>
          )}

          {submissions.map((sub) => {
            const student = sub.students || {};
            const isGrading = gradingId === sub.id;
            const isGraded  = sub.marks_obtained != null;
            const isDeleting = deletingId === sub.id;

            return (
              <div key={sub.id} className="bg-white rounded-2xl border border-neutral-100 p-4 space-y-3">
                {/* Student row */}
                <div className="flex items-center gap-3">
                  <Avatar name={student.name || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{student.name || '—'}</p>
                    <p className="text-xs text-neutral-400">@{student.username || '—'}</p>
                  </div>
                  {isGraded && !isGrading && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Tag color="green">{sub.marks_obtained}/100</Tag>
                      <span className="flex items-center gap-0.5 text-xs text-amber-600 font-semibold">
                        <Star size={11} fill="currentColor" /> {sub.points_earned}
                      </span>
                    </div>
                  )}
                </div>

                {/* Submission file link */}
                <a
                  href={sub.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <Paperclip size={12} />
                  <span className="truncate max-w-[220px]">{sub.file_name || 'View submission'}</span>
                  <ExternalLink size={11} className="flex-shrink-0" />
                </a>

                <p className="text-[11px] text-neutral-400">
                  Submitted {new Date(sub.submitted_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>

                {/* Grade area */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {!isGraded && !isGrading && (
                      <button
                        onClick={() => { setGradingId(sub.id); setGradeInput(''); setGradeError(''); }}
                        className="text-xs font-semibold text-neutral-900 border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition-colors"
                      >
                        Grade
                      </button>
                    )}
                    {isGraded && !isGrading && (
                      <button
                        onClick={() => { setGradingId(sub.id); setGradeInput(String(sub.marks_obtained)); setGradeError(''); }}
                        className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
                      >
                        Change grade
                      </button>
                    )}
                  </div>

                  {/* Delete submission button */}
                  <button
                    onClick={() => handleDeleteSubmission(sub.id)}
                    disabled={isDeleting}
                    className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors disabled:opacity-40"
                    title="Remove submission (student can re-submit)"
                  >
                    {isDeleting
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />
                    }
                    Remove
                  </button>
                </div>

                {isGrading && (
                  <div className="space-y-2 pt-1 border-t border-neutral-50">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="Mark out of 100"
                        value={gradeInput}
                        onChange={e => { setGradeInput(e.target.value); setGradeError(''); }}
                        className="w-32 px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleGrade(sub.id);
                          if (e.key === 'Escape') { setGradingId(null); setGradeError(''); }
                        }}
                      />
                      <Btn size="sm" variant="primary" onClick={() => handleGrade(sub.id)} disabled={saving}>
                        {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                        Save
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={() => { setGradingId(null); setGradeError(''); }} disabled={saving}>
                        Cancel
                      </Btn>
                    </div>
                    {gradeError && (
                      <p className="flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle size={11} /> {gradeError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
