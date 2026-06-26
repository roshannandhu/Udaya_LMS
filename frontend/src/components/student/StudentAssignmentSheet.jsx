import React, { useState, useRef, useEffect } from 'react';
import {
  Paperclip, ExternalLink, Loader2, CheckCircle2, Clock,
  Star, CalendarClock, Camera, FolderOpen, X, FileText,
  FileImage, Trash2, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { Sheet, Btn, Tag } from '../ui';
import { assignmentApi } from '../../lib/api';
import SecureFileViewer from '../shared/SecureFileViewer';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentAssignmentSheet({
  open, onClose, assignment, onSubmitted, onDeleted,
  reattemptStatus, onReattemptRequested,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl]     = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');
  const [redoOpen, setRedoOpen]         = useState(false);
  const [redoReason, setRedoReason]     = useState('');
  const [redoBusy, setRedoBusy]         = useState(false);
  const [redoSent, setRedoSent]         = useState(false);
  const [viewerAtt, setViewerAtt]       = useState(null); // teacher file open in secure viewer
  const [viewerSub, setViewerSub]       = useState(null); // student's own submission in secure viewer
  const cameraRef = useRef(null);
  const fileRef   = useRef(null);

  const sub       = assignment?.my_submission;
  const isSubmitted = !!sub;
  const isGraded    = sub && sub.marks_obtained != null;

  const due    = assignment?.due_date ? new Date(assignment.due_date) : null;
  const now    = new Date();
  const isPast = due && due < now;

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(f);
    setError('');
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    e.target.value = '';
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedFile) { setError('Please select a file first'); return; }
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const result = await assignmentApi.submit(assignment.id, fd);
      onSubmitted?.(result);
      clearFile();
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmission = async () => {
    if (!window.confirm('Remove your submission? You can submit again after this.')) return;
    setDeleting(true);
    setError('');
    try {
      await assignmentApi.deleteMySubmission(assignment.id);
      onDeleted?.();
    } catch (err) {
      setError(err.message || 'Could not remove submission. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const submitRedo = async () => {
    setRedoBusy(true);
    setError('');
    try {
      await assignmentApi.requestReattempt(assignment.id, redoReason.trim());
      setRedoSent(true);
      setRedoOpen(false);
      setRedoReason('');
      onReattemptRequested?.(assignment.id);
    } catch (err) {
      // Treat an existing pending request as "already requested" rather than an error.
      if (/already have a pending/i.test(err?.message || '')) { setRedoSent(true); setRedoOpen(false); }
      else setError(err.message || 'Could not send request. Please try again.');
    } finally {
      setRedoBusy(false);
    }
  };

  const redoPending  = redoSent || reattemptStatus === 'pending';
  const redoRejected = reattemptStatus === 'rejected';
  const redoApproved = reattemptStatus === 'approved';

  const handleClose = () => { clearFile(); setRedoOpen(false); setRedoReason(''); onClose(); };

  if (!assignment) return null;

  const attachments = assignment.assignment_attachments || [];

  return (
    <Sheet open={open} onClose={handleClose} title={assignment.title}>
      <div className="space-y-5">

        {/* Due date */}
        {due && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${isPast ? 'text-red-600' : 'text-amber-700'}`}>
            <CalendarClock size={14} />
            Due: {due.toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
            {isPast && <Tag color="red">Closed</Tag>}
          </div>
        )}

        {/* Question text */}
        {assignment.description && (
          <div>
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Question</p>
            <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed bg-neutral-50 rounded-xl p-4 border border-neutral-100">
              {assignment.description}
            </p>
          </div>
        )}

        {/* Teacher's attached files — always visible regardless of submission state */}
        {attachments.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
              Files from Teacher
            </p>
            <div className="space-y-2">
              {attachments.map(att => (
                <button
                  key={att.id}
                  onClick={() => setViewerAtt(att)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 hover:bg-blue-100 active:scale-[0.98] transition-all text-left"
                >
                  <Paperclip size={15} className="flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">{att.file_name}</span>
                  <ExternalLink size={13} className="flex-shrink-0 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Your Answer section ── */}
        <div className="border-t border-neutral-100 pt-4">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest mb-3">
            Your Answer
          </p>

          {/* Graded */}
          {isGraded && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-900">
                    Graded: {sub.marks_obtained} / 100
                  </p>
                  <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold mt-0.5">
                    <Star size={11} fill="currentColor" />
                    {sub.points_earned} points earned
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setViewerSub(sub)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Paperclip size={13} />
                View your submission: {sub.file_name}
                <ExternalLink size={12} />
              </button>

              {/* Re-do request — for when the student wants another attempt at a
                  graded assignment. Teacher approval clears the grade so they can
                  retract + resubmit. */}
              {redoPending ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <Clock size={13} /> Re-do requested — waiting for teacher approval
                </div>
              ) : redoRejected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <X size={13} /> Your re-do request was declined.
                  </div>
                  <button onClick={() => setRedoOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
                    <AlertTriangle size={12} /> Request again
                  </button>
                </div>
              ) : redoOpen ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus value={redoReason} onChange={e => setRedoReason(e.target.value)}
                    maxLength={500} rows={3}
                    placeholder="Why do you need to redo this? (e.g. I uploaded the wrong file)"
                    className="w-full text-sm rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 outline-none focus:border-amber-400 focus:bg-white resize-none placeholder:text-neutral-400"
                  />
                  <div className="flex gap-2">
                    <Btn variant="ghost" onClick={() => { setRedoOpen(false); setRedoReason(''); }} disabled={redoBusy} className="flex-1">Cancel</Btn>
                    <Btn variant="primary" onClick={submitRedo} disabled={redoBusy || !redoReason.trim()} className="flex-1">
                      {redoBusy ? <Loader2 size={14} className="animate-spin mr-1" /> : null} Send request
                    </Btn>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRedoOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
                  <AlertTriangle size={12} /> Request to re-do this assignment
                </button>
              )}
            </div>
          )}

          {/* Submitted, awaiting grade */}
          {isSubmitted && !isGraded && (
            <div className="space-y-3">
              {/* Approval clears the grade and lands the student here — explain why,
                  and point them at the remove-and-re-upload action below. */}
              {redoApproved && (
                <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <RotateCcw size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-emerald-800">
                    Re-do approved — remove your current submission below and upload a new one.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                <Clock size={22} className="text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-900">Submitted — awaiting grading</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Your teacher will review and grade this soon.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setViewerSub(sub)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Paperclip size={13} />
                View your submission: {sub.file_name}
                <ExternalLink size={12} />
              </button>

              {/* Remove own submission */}
              <button
                onClick={handleDeleteSubmission}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
              >
                {deleting
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />
                }
                Remove submission and re-upload
              </button>
            </div>
          )}

          {/* Not submitted — upload UI */}
          {!isSubmitted && (
            <div className="space-y-4">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={handleFileChange} />
              <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx"
                className="hidden" onChange={handleFileChange} />

              {!selectedFile ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-neutral-100 hover:border-neutral-300 bg-white hover:bg-neutral-50 transition-all active:scale-[0.97]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
                      <Camera size={22} className="text-amber-600" />
                    </div>
                    <span className="text-sm font-semibold text-neutral-800">Take Photo</span>
                    <span className="text-[11px] text-neutral-400 text-center leading-tight">
                      Write on paper,<br />then photograph it
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-neutral-100 hover:border-neutral-300 bg-white hover:bg-neutral-50 transition-all active:scale-[0.97]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <FolderOpen size={22} className="text-blue-600" />
                    </div>
                    <span className="text-sm font-semibold text-neutral-800">Upload File</span>
                    <span className="text-[11px] text-neutral-400 text-center leading-tight">
                      PDF, Word or<br />image file
                    </span>
                  </button>
                </div>
              ) : (
                <div className="relative rounded-2xl border-2 border-neutral-200 overflow-hidden">
                  {previewUrl ? (
                    <div className="relative">
                      <img src={previewUrl} alt="Selected"
                        className="w-full max-h-64 object-contain bg-neutral-900" />
                      <button onClick={clearFile}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center flex-shrink-0">
                        <FileText size={20} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-neutral-900">{selectedFile.name}</p>
                        <p className="text-xs text-neutral-400">{formatBytes(selectedFile.size)}</p>
                      </div>
                      <button onClick={clearFile}
                        className="text-neutral-400 hover:text-red-500 p-1 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  {previewUrl && (
                    <div className="px-3 py-2 bg-white flex items-center gap-2">
                      <FileImage size={13} className="text-neutral-400 flex-shrink-0" />
                      <span className="text-xs text-neutral-600 truncate flex-1">{selectedFile.name}</span>
                      <span className="text-xs text-neutral-400">{formatBytes(selectedFile.size)}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedFile && (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="text-xs text-neutral-500 hover:text-neutral-700 underline">
                  Choose a different file
                </button>
              )}

              {error && (
                <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              <Btn variant="primary" onClick={handleSubmit}
                disabled={!selectedFile || submitting} className="w-full">
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Uploading…' : 'Submit Assignment'}
              </Btn>
            </div>
          )}

          {/* Error for delete */}
          {error && isSubmitted && (
            <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mt-3">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>
      </div>

      <SecureFileViewer
        open={!!viewerAtt}
        onClose={() => setViewerAtt(null)}
        endpoint={viewerAtt ? `/assignment-attachments/${viewerAtt.id}/file` : null}
        offlineKey={viewerAtt ? `asg-att-${viewerAtt.id}` : null}
        title={viewerAtt?.file_name || 'Attachment'}
      />

      <SecureFileViewer
        open={!!viewerSub}
        onClose={() => setViewerSub(null)}
        endpoint={viewerSub ? `/assignment-submissions/${viewerSub.id}/file` : null}
        offlineKey={viewerSub ? `sub-${viewerSub.id}` : null}
        title={viewerSub?.file_name || 'Your submission'}
      />
    </Sheet>
  );
}
