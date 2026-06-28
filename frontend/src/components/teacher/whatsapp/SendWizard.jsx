import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Send, CheckCircle2, Loader2, SlidersHorizontal, KeyRound, GraduationCap, CalendarRange, CalendarDays, Megaphone, Eye, History } from 'lucide-react';
import { Btn, Input, Skeleton } from '../../ui';
import { whatsappApi, testApi } from '../../../lib/api';
import ClassPicker from './ClassPicker';
import Composer from './Composer';
import CriteriaBuilder from './CriteriaBuilder';
import WhatsAppPreview from './WhatsAppPreview';
import { renderPreview } from './previewText';
import { DEFAULT_BANDS, DEFAULT_REPORT_MESSAGE } from './reportDefaults';

// One shared 3-step flow for every send task: Who → Message → Review & send.
// Task-specific behaviour (credentials / weekly / monthly / exam / announcement)
// is driven by the TASKS config so the teacher always walks the same three steps.
export const TASKS = {
  credentials: {
    title: 'Send Credentials', icon: KeyRound,
    hint: 'Each parent gets their child’s Student ID + password',
  },
  exam: {
    title: 'Exam Results', icon: GraduationCap,
    hint: 'Results + report for one exam, score-aware messages', period: 'overall',
  },
  weekly: {
    title: 'Weekly Report', icon: CalendarRange,
    hint: 'Last 7 days of progress per student', period: 'weekly',
  },
  monthly: {
    title: 'Monthly Report', icon: CalendarDays,
    hint: 'Last 30 days of progress per student', period: 'monthly',
  },
  announcement: {
    title: 'Announcement', icon: Megaphone,
    hint: 'A custom message to the classes you pick',
  },
};

const isReportTask = (task) => ['exam', 'weekly', 'monthly'].includes(task);

function StepHeader({ step, labels }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-[11px] font-semibold transition-colors ${
              active ? 'bg-whatsapp-green text-white'
                : done ? 'bg-whatsapp-green-light text-whatsapp-green-fg'
                : 'bg-[#F1EFEC] text-neutral-400'}`}>
              <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">{done ? '✓' : n}</span>
              {label}
            </div>
            {i < labels.length - 1 && <div className="flex-1 h-px bg-[#EBEAE7] min-w-2" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function SendWizard({
  task, groups, templates, variables, provider, configured,
  rates, currency = 'INR', reloadRecipients, initialExamId,
  onExit, onShowHistory, onGoToTemplates,
}) {
  const cfg = TASKS[task];
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(new Set());

  // Exam task
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examId, setExamId] = useState(initialExamId || '');
  const [examPreview, setExamPreview] = useState(null);

  // Report tasks — smart defaults: score-adaptive bands + PDF, customisable under Advanced.
  const [format, setFormat] = useState('pdf');
  const [criteria, setCriteria] = useState(DEFAULT_BANDS);
  const [defaultMsg, setDefaultMsg] = useState(DEFAULT_REPORT_MESSAGE);

  // Announcement
  const [msg, setMsg] = useState({ mode: provider === 'meta' ? 'template' : 'freeform', category: 'utility', manual_values: {}, body_text: '' });
  const [testPhone, setTestPhone] = useState('');

  // Sending & result
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);  // {sent,total,cost,configured,failedExample}
  const [batch, setBatch] = useState(null);    // {id,total,sent,failed,done}

  useEffect(() => {
    if (task !== 'exam') return;
    setExamsLoading(true);
    (async () => {
      try { const r = await testApi.getTests(); setExams(r?.tests || r || []); }
      catch (e) { alert(e.message || 'Could not load exams.'); setExams([]); }
      finally { setExamsLoading(false); }
    })();
  }, [task]);

  // An exam belongs to one standard — scope class pick to it and pre-select it.
  const examStandardId = task === 'exam' ? (exams.find(e => e.id === examId)?.standard_id || null) : null;
  const visibleGroups = examStandardId ? groups.filter(g => g.standard_id === examStandardId) : groups;
  useEffect(() => {
    if (task !== 'exam' || !examStandardId) return;
    const ids = groups.filter(g => g.standard_id === examStandardId)
      .flatMap(g => g.students.filter(s => s.phone && s.phone.trim() !== '' && !s.opted_out).map(s => s.id));
    setSelected(new Set(ids));
  }, [examId, examStandardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = selected.size;
  const category = task === 'announcement' ? msg.category : 'utility';
  const rate = rates?.[category] ?? 0.14;

  // Exam mode: once previewed, the honest count is who actually took the exam.
  const effCount = (task === 'exam' && examPreview) ? examPreview.preview.length : count;
  const amount = effCount * rate;

  // ── Per-task payloads ──────────────────────────────────────────────────────
  const reportPayload = () => ({
    included_student_ids: Array.from(selected),
    standard_ids: examStandardId ? [examStandardId] : undefined,
    report_format: format,
    period: cfg.period,
    test_id: task === 'exam' ? (examId || undefined) : undefined,
    criteria, default_message: defaultMsg, category: 'utility', mode: 'template',
  });
  const announcePayload = () => ({
    included_student_ids: Array.from(selected),
    mode: (provider === 'meta' && count > 1) ? 'template' : msg.mode,
    template_name: msg.template_name, manual_values: msg.manual_values,
    body_text: msg.body_text, media_url: msg.media_url, media_type: msg.media_type,
    category: msg.category,
  });

  // Auto-load the exam recipient preview when reaching Review (who took it + per-band message).
  useEffect(() => {
    if (task !== 'exam' || step !== 3 || !examId || count === 0) return;
    let ignore = false;
    whatsappApi.previewCriteria(reportPayload())
      .then(p => { if (!ignore) setExamPreview(p); })
      .catch(e => { if (!ignore) { alert(e.message || 'Could not load exam preview.'); setExamPreview(null); } });
    return () => { ignore = true; };
  }, [task, step, examId, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleResponse = (r, fallbackTotal) => {
    if (r.queued) {
      setBatch({ id: r.batch_id, total: r.total, sent: 0, failed: 0, done: false });
      return;
    }
    const failed = (r.results || []).filter(x => x.status === 'failed' || x.status === 'not_configured');
    setResult({
      sent: r.sent || 0,
      total: (r.results || []).length || fallbackTotal,
      cost: r.total_cost || 0,
      configured: r.configured,
      failedExample: failed[0]?.error || null,
      failedCount: failed.length,
    });
  };

  const send = async () => {
    setSending(true);
    try {
      let r;
      if (task === 'credentials') {
        r = await whatsappApi.sendWelcome({ included_student_ids: Array.from(selected), include_credentials: true, category: 'utility' });
      } else if (isReportTask(task)) {
        r = await whatsappApi.sendReports(reportPayload());
      } else {
        r = await whatsappApi.send(announcePayload());
      }
      handleResponse(r, effCount);
      reloadRecipients?.();
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) return;
    setSending(true);
    try {
      const r = await whatsappApi.send({ ...announcePayload(), test_to_self: testPhone.trim() });
      const res = r.results?.[0] || {};
      const ok = res.status && res.status !== 'failed' && res.status !== 'not_configured';
      alert(ok ? `✅ Test sent (${res.status}).` : `❌ Test failed: ${res.error || (!r.configured ? 'not connected' : 'unknown error')}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  // Poll batch progress until done. Sends keep running server-side even if the
  // teacher leaves this page — history is the audit trail.
  useEffect(() => {
    if (!batch?.id || batch.done) return undefined;
    const id = setInterval(async () => {
      try {
        const b = await whatsappApi.getBatch(batch.id);
        setBatch(prev => ({ ...prev, ...b }));
      } catch { /* server restarted — history still has the rows */ }
    }, 2500);
    return () => clearInterval(id);
  }, [batch?.id, batch?.done]);

  // ── Step validity ──────────────────────────────────────────────────────────
  const tpl = templates.find(t => t.name === msg.template_name);
  const hasAnnounceMessage = (msg.mode === 'template' ? !!tpl : !!(msg.body_text || '').trim()) || !!msg.media_url;
  const canNext =
    step === 1 ? (count > 0 && (task !== 'exam' || !!examId))
    : step === 2 ? (task !== 'announcement' || hasAnnounceMessage)
    : false;

  // ── Preview bubbles ────────────────────────────────────────────────────────
  const sample = useMemo(
    () => groups.flatMap(g => g.students).find(s => selected.has(s.id)) || {},
    [groups, selected]);
  const sampleName = sample.name || 'Aarav';
  const reportMedia = format === 'pdf'
    ? { mediaType: 'application/pdf', mediaName: `${sampleName.replace(/\s+/g, '_')}_Report.pdf` }
    : format === 'image' ? { mediaType: 'image/png' } : {};
  const previewMessages =
    task === 'credentials' ? [{
      text: `Welcome! Login details for ${sampleName}:\nStudent ID: ${sample.student_code || '25UDAYA100001'}\nPassword: ••••••\nUse the login page to sign in.`,
    }]
    : isReportTask(task) ? (criteria.length ? criteria : [{ message: defaultMsg, attach_report: true }]).map(b => ({
      text: b.message || defaultMsg,
      ...(b.attach_report !== false ? reportMedia : {}),
    }))
    : [{
      text: renderPreview(msg.mode === 'template' ? (tpl?.body_text || '') : (msg.body_text || ''), variables, msg.manual_values, sample),
      mediaType: msg.media_type, mediaUrl: msg.media_url, mediaName: msg.media_name,
    }];

  const Icon = cfg.icon;
  const sym = currency === 'INR' ? '₹' : '';
  const previewFootnote = task === 'credentials'
    ? 'Each parent receives their own child’s real Student ID & password.'
    : isReportTask(task)
      ? 'A sample per score level — each parent gets their own child’s report.'
      : 'Variables show example values here and fill in for real per parent.';

  // ── Done / progress screens replace the wizard once a send starts ──────────
  if (batch) {
    const processed = batch.sent + batch.failed;
    const pct = batch.total ? Math.round((processed / batch.total) * 100) : 0;
    return (
      <div className="max-w-md mx-auto text-center py-10 px-4">
        {batch.done
          ? <CheckCircle2 size={40} className="mx-auto mb-3 text-whatsapp-green-fg" />
          : <Loader2 size={36} className="mx-auto mb-3 animate-spin text-whatsapp-green-fg" />}
        <h3 className="font-semibold text-lg text-neutral-800 mb-1">
          {batch.done ? 'All done!' : 'Sending in the background…'}
        </h3>
        <p className="text-sm text-neutral-500 mb-4">
          {batch.sent} sent{batch.failed ? ` · ${batch.failed} failed` : ''} of {batch.total}
          {!batch.done && ' — you can leave this page, sending continues.'}
        </p>
        <div className="h-2.5 rounded-full bg-[#EBEAE7] overflow-hidden mb-6">
          <div className="h-full bg-whatsapp-green rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <Btn variant="default" icon={History} onClick={onShowHistory}>Delivery report</Btn>
          <Btn variant="primary" onClick={onExit}>Done</Btn>
        </div>
      </div>
    );
  }
  if (result) {
    return (
      <div className="max-w-md mx-auto text-center py-10 px-4">
        <CheckCircle2 size={40} className={`mx-auto mb-3 ${result.sent > 0 ? 'text-whatsapp-green-fg' : 'text-neutral-300'}`} />
        <h3 className="font-semibold text-lg text-neutral-800 mb-1">Sent {result.sent} of {result.total}</h3>
        <p className="text-sm text-neutral-500 mb-1">
          {result.cost > 0 ? `Cost ${sym}${result.cost.toFixed(2)}` : 'No per-message cost'}
        </p>
        {!result.configured && (
          <p className="text-xs text-amber-700 mb-2">WhatsApp isn’t connected — nothing actually went out. Connect it in Settings.</p>
        )}
        {result.failedCount > 0 && (
          <p className="text-xs text-red-600 mb-2">{result.failedCount} failed{result.failedExample ? ` — e.g. “${result.failedExample}”` : ''}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-5">
          <Btn variant="default" icon={History} onClick={onShowHistory}>Delivery report</Btn>
          <Btn variant="primary" onClick={onExit}>Done</Btn>
        </div>
      </div>
    );
  }

  return (
    // Phone: single column. Laptop: steps on the left, live preview pinned right.
    <div className="max-w-xl lg:max-w-5xl mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-start">
      <div className="min-w-0">
      {/* Task header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-whatsapp-green-light text-whatsapp-green-fg flex items-center justify-center flex-shrink-0">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-neutral-900 leading-tight">{cfg.title}</h2>
          <p className="text-[11px] text-neutral-500 truncate">{cfg.hint}</p>
        </div>
      </div>

      <StepHeader step={step} labels={[task === 'exam' ? 'Exam & class' : 'Who', 'Message', 'Send']} />

      {/* ── STEP 1: Who ── */}
      {step === 1 && (
        <div className="space-y-3">
          {task === 'exam' && (
            <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-3.5">
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Which exam?</label>
              {examsLoading ? <Skeleton className="h-10 w-full rounded-xl" /> : (
                <select value={examId} onChange={(e) => { setExamId(e.target.value); setExamPreview(null); }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                  <option value="">Select an exam…</option>
                  {exams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title}{ex.standard_name ? ` — ${ex.standard_name}` : ''}</option>
                  ))}
                </select>
              )}
              {!examsLoading && exams.length === 0 && <p className="text-[11px] text-neutral-400 mt-1">No exams found yet.</p>}
              {examStandardId && <p className="text-[11px] text-neutral-400 mt-1.5">Results go only to this exam’s class; only students who took it receive one.</p>}
            </div>
          )}
          {(task !== 'exam' || examId) && (
            <ClassPicker groups={visibleGroups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
          )}
        </div>
      )}

      {/* ── STEP 2: Message ── */}
      {step === 2 && (
        <div className="space-y-3">
          {task === 'credentials' && (
            <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-4">
              <p className="text-sm font-semibold text-neutral-800 mb-1 flex items-center gap-1.5"><KeyRound size={14} className="text-whatsapp-green-fg" /> Nothing to write</p>
              <p className="text-xs text-neutral-500">Each parent automatically gets their own child’s real Student ID and password, filled in per student. Check the preview below.</p>
            </div>
          )}

          {isReportTask(task) && (
            <>
              <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-3.5">
                <label className="text-xs font-medium text-neutral-600 mb-2 block">Report format</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['pdf', 'PDF'], ['image', 'Image'], ['text', 'Text only']].map(([id, label]) => (
                    <button key={id} onClick={() => setFormat(id)}
                      className={`px-2 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        format === id ? 'bg-whatsapp-green-light border-whatsapp-green-fg/30 text-whatsapp-green-fg'
                          : 'bg-white border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-2">The message adapts to each child’s score automatically — strong scores get praise, weak ones get encouragement.</p>
              </div>
              <details className="group glass-panel border border-[#EBEAE7] rounded-2xl p-3.5">
                <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-800 flex items-center gap-1 select-none">
                  <SlidersHorizontal size={12} /> Customize messages by score (advanced)
                </summary>
                <div className="mt-3 space-y-3">
                  <Input label="Default message (when no band matches)" value={defaultMsg}
                    onChange={(e) => setDefaultMsg(e.target.value)} />
                  <CriteriaBuilder value={criteria} onChange={setCriteria} templates={templates} />
                </div>
              </details>
            </>
          )}

          {task === 'announcement' && (
            <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-3.5">
              <Composer value={msg} onChange={setMsg} templates={templates} onGoToTemplates={onGoToTemplates}
                provider={provider} selectedCount={count} variables={variables} />
            </div>
          )}

          {/* In-flow preview is phone-only — the laptop layout has it pinned right */}
          <div className="lg:hidden">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
              <Eye size={13} /> What parents will see
            </p>
            <WhatsAppPreview messages={previewMessages} footnote={previewFootnote} />
          </div>
        </div>
      )}

      {/* ── STEP 3: Review & send ── */}
      {step === 3 && (
        <div className="space-y-3">
          {!configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              WhatsApp isn’t connected — nothing will actually send until you connect it in Settings.
            </div>
          )}

          <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-4 space-y-1.5">
            <p className="text-sm font-semibold text-neutral-800">{cfg.title}</p>
            <p className="text-xs text-neutral-500">
              {effCount} parent{effCount === 1 ? '' : 's'}
              {task === 'exam' && examPreview?.skipped_no_exam ? ` · ${examPreview.skipped_no_exam} didn’t take the exam` : ''}
              {rate > 0 ? ` · est. ${sym}${amount.toFixed(2)} (${effCount} × ${sym}${rate.toFixed(2)})` : ' · free to send'}
            </p>
          </div>

          {task === 'exam' && examPreview && examPreview.preview.length > 0 && (
            <div className="glass-panel border border-[#EBEAE7] rounded-2xl overflow-hidden">
              <div className="px-3.5 py-2 text-xs font-semibold text-neutral-500 border-b border-[#F1EFEC]">Who receives what</div>
              <div className="max-h-52 overflow-y-auto divide-y divide-[#F4F2EF]">
                {examPreview.preview.map(p => (
                  <div key={p.student_id} className="px-3.5 py-2 text-sm flex items-center gap-2">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-neutral-500 w-12 text-right flex-shrink-0">{p.score ?? '—'}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="lg:hidden"><WhatsAppPreview messages={previewMessages} /></div>

          {task === 'announcement' && (
            <div className="glass-panel border border-[#EBEAE7] rounded-2xl p-3.5">
              <div className="flex items-end gap-2">
                <div className="flex-1"><Input label="Test to my number first (optional)" placeholder="+91…"
                  value={testPhone} onChange={(e) => setTestPhone(e.target.value)} /></div>
                <Btn icon={Send} onClick={sendTest} disabled={sending || !testPhone.trim()}>Test</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="lg:sticky lg:bottom-4 z-30 mt-5">
        <div className="glass-panel border border-[#EBEAE7] rounded-2xl px-2 md:px-3.5 py-3 flex items-center justify-between gap-2 md:gap-3 bg-white/95 backdrop-blur shadow-lg">
          <div className="flex-shrink-0">
            <Btn variant="ghost" icon={ArrowLeft} onClick={() => step === 1 ? onExit() : setStep(s => s - 1)}>
              <span className="hidden sm:inline">{step === 1 ? 'Back' : 'Previous'}</span>
            </Btn>
          </div>
          <div className="flex-1 text-center text-[10px] md:text-xs text-neutral-500 min-w-0 truncate">
            <span className="hidden sm:inline">
              {count > 0 ? `${effCount} parent${effCount === 1 ? '' : 's'}${rate > 0 ? ` · ${sym}${amount.toFixed(2)}` : ''}` : 'Pick a class to start'}
            </span>
            <span className="sm:hidden">
              {count > 0 ? `${effCount} parent${effCount === 1 ? '' : 's'}` : 'Pick class'}
            </span>
          </div>
          <div className="flex-shrink-0">
            {step < 3 ? (
              <Btn variant="primary" onClick={() => setStep(s => s + 1)} disabled={!canNext}>
                Next <ArrowRight size={14} className="ml-1 hidden sm:block" />
              </Btn>
            ) : (
              <Btn variant="primary" icon={Send} onClick={send} disabled={sending || effCount === 0}>
                <span className="hidden sm:inline">{sending ? 'Sending…' : `Send${rate > 0 ? ` (${sym}${amount.toFixed(2)})` : ''}`}</span>
                <span className="sm:hidden">{sending ? 'Sending…' : 'Send'}</span>
              </Btn>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* ── Laptop right rail: live preview pinned across all three steps ── */}
      <div className="hidden lg:block lg:sticky lg:top-6">
        <div className="glass-panel border border-[#EBEAE7] rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-neutral-800">{effCount} parent{effCount === 1 ? '' : 's'}</span>
          <span className="text-xs text-neutral-500">{rate > 0 ? `est. ${sym}${amount.toFixed(2)}` : 'free to send'}</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
          <Eye size={13} /> What parents will see
        </p>
        <WhatsAppPreview messages={previewMessages} footnote={previewFootnote} />
      </div>
    </div>
  );
}
