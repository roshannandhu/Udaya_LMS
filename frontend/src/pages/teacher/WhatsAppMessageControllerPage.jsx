import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileBarChart, Clock, LayoutTemplate, Inbox, History, Settings as SettingsIcon, Send, Eye, KeyRound, ChevronDown, SlidersHorizontal, QrCode, CheckCircle2, Loader2 } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Input, Skeleton } from '../../components/ui';
import { whatsappApi, testApi } from '../../lib/api';

import OverviewTab from '../../components/teacher/whatsapp/OverviewTab';
import RecipientPicker from '../../components/teacher/whatsapp/RecipientPicker';
import Composer from '../../components/teacher/whatsapp/Composer';
import CostEstimate from '../../components/teacher/whatsapp/CostEstimate';
import CriteriaBuilder from '../../components/teacher/whatsapp/CriteriaBuilder';
import TemplatesTab from '../../components/teacher/whatsapp/TemplatesTab';
import InboxTab from '../../components/teacher/whatsapp/InboxTab';
import HistoryTab from '../../components/teacher/whatsapp/HistoryTab';
import AutomationTab from '../../components/teacher/whatsapp/AutomationTab';
import WhatsAppPreview from '../../components/teacher/whatsapp/WhatsAppPreview';
import FlowStepper from '../../components/teacher/whatsapp/FlowStepper';
import PendingActions from '../../components/teacher/whatsapp/PendingActions';
import { renderPreview } from '../../components/teacher/whatsapp/previewText';

export default function WhatsAppMessageControllerPage() {
  const location = useLocation();
  // Honour deep-links from the test Results sheet ("Review First" → reports + exam preselected).
  const [tab, setTab] = useState(location.state?.tab || 'compose');
  const [pendingExamId, setPendingExamId] = useState(location.state?.examId || null);
  const [config, setConfig] = useState(null);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [connection, setConnection] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const loadConfig = async () => { try { setConfig(await whatsappApi.getConfig()); } catch { setConfig({}); } };
  const loadConnection = async () => { try { setConnection(await whatsappApi.getConnection()); } catch { setConnection({ connected: false }); } };
  const loadTemplates = async () => { try { const r = await whatsappApi.listTemplates(); setTemplates(r.templates || []); } catch { setTemplates([]); } };
  const loadVariables = async () => { try { const r = await whatsappApi.getVariables(); setVariables(r.variables || []); } catch { setVariables([]); } };
  const loadRecipients = async () => {
    try {
      const r = await whatsappApi.getRecipients();
      setGroups(r.groups || []);
      const ids = (r.groups || []).flatMap(g => g.students.filter(s => s.phone && !s.opted_out).map(s => s.id));
      setSelected(new Set(ids));
    } catch { setGroups([]); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadConnection(), loadTemplates(), loadVariables(), loadRecipients()]);
      setLoading(false);
    })();
  }, []);

  const rates = config?.rates || { utility: 0.14, marketing: 0.78, auth: 0.13 };
  const currency = config?.currency || 'INR';
  const provider = config?.provider;
  const selectedCount = selected.size;
  // Evolution (self-hosted) has no per-message cost — keep the UI free of ₹ jargon.
  const estimateFor = (category) => {
    if (provider === 'evolution') return { rate: 0, amount: 0 };
    const rate = rates[category] ?? 0.14;
    return { rate, amount: selectedCount * rate };
  };

  // Essentials are what a first-timer needs; everything else hides under "Advanced".
  const essentials = [
    { id: 'compose',   label: 'Send a Message', icon: MessageSquare },
    { id: 'templates', label: 'Templates',      icon: LayoutTemplate },
    { id: 'history',   label: 'Delivery Reports', icon: History },
  ];
  const advanced = [
    { id: 'overview',   label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'reports',    label: 'Progress Reports', icon: FileBarChart },
    { id: 'inbox',      label: 'Inbox',            icon: Inbox },
    { id: 'automation', label: 'Automations',      icon: Clock },
    { id: 'settings',   label: 'Settings',         icon: SettingsIcon },
  ];
  const allNav = [...essentials, ...advanced];

  return (
    <div className="flex flex-col h-screen bg-[#f0f2f5]">
      <TopBar title="WhatsApp Center" />
      <div className="flex flex-1 w-full max-w-[1400px] mx-auto bg-white md:my-4 md:rounded-2xl md:shadow-sm overflow-hidden border border-black/5 h-[calc(100vh-64px)] md:h-[calc(100vh-100px)]">
        
        {/* Sidebar Navigation */}
        <div className="w-[240px] bg-[#f8f9fa] border-r border-[#EBEAE7] flex flex-col flex-shrink-0 hidden md:flex">
          <div className="p-4 border-b border-[#EBEAE7] bg-white">
            <h2 className="font-bold text-neutral-800 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-whatsapp-green flex items-center justify-center">
                <MessageSquare size={12} className="text-white fill-current" />
              </div>
              WhatsApp
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {essentials.map(item => {
              const active = tab === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    active ? 'bg-whatsapp-green-light text-whatsapp-green-fg' : 'text-neutral-600 hover:bg-[#EBEAE7]'
                  }`}>
                  <item.icon size={16} /> {item.label}
                </button>
              );
            })}

            <button onClick={() => setAdvancedOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-600">
              <ChevronDown size={13} className={`transition-transform ${(advancedOpen || advanced.some(a => a.id === tab)) ? '' : '-rotate-90'}`} />
              Advanced
            </button>
            {(advancedOpen || advanced.some(a => a.id === tab)) && advanced.map(item => {
              const active = tab === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    active ? 'bg-whatsapp-green-light text-whatsapp-green-fg' : 'text-neutral-600 hover:bg-[#EBEAE7]'
                  }`}>
                  <item.icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Nav (Scrollable row) */}
        <div className="md:hidden flex gap-1 overflow-x-auto p-2 bg-white border-b border-[#EBEAE7] flex-shrink-0">
          {allNav.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-medium whitespace-nowrap transition-colors ${
                tab === item.id ? 'bg-ink text-white' : 'bg-white border border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF]'
              }`}>
              <item.icon size={14} /> {item.label}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white relative">
          {connection && !connection.connected && tab !== 'settings' && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3">
              <span>WhatsApp isn’t connected yet — scan the QR code to start sending.</span>
              <Btn onClick={() => setTab('settings')} size="sm" variant="secondary">Connect WhatsApp</Btn>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          ) : (
            <div className="max-w-4xl">
              {(tab === 'compose' || tab === 'overview') && (
                <PendingActions
                  onReview={(id) => { setPendingExamId(id); setTab('reports'); }}
                  onSent={loadRecipients} />
              )}
              {tab === 'overview' && <OverviewTab onNavigate={setTab} currency={currency} />}
              {tab === 'compose' && (
                <ComposeTab groups={groups} selected={selected} setSelected={setSelected}
                  templates={templates} estimateFor={estimateFor} currency={currency}
                  configured={connection?.connected} selectedCount={selectedCount} variables={variables}
                  reloadRecipients={loadRecipients} onSendCredentials={() => setTab('credentials')}
                  onGoToTemplates={() => setTab('templates')} provider={provider} />
              )}
              {tab === 'reports' && (
                <ReportsTab groups={groups} selected={selected} setSelected={setSelected}
                  templates={templates} estimateFor={estimateFor} currency={currency}
                  configured={connection?.connected} selectedCount={selectedCount}
                  reloadRecipients={loadRecipients} initialExamId={pendingExamId} />
              )}
              {tab === 'credentials' && (
                <CredentialsTab groups={groups} estimateFor={estimateFor} currency={currency}
                  configured={connection?.connected} reloadRecipients={loadRecipients} />
              )}
              {tab === 'automation' && <AutomationTab templates={templates} groups={groups} />}
              {tab === 'templates' && <TemplatesTab templates={templates} reload={loadTemplates} variables={variables} provider={provider} />}
              {tab === 'inbox' && <InboxTab />}
              {tab === 'history' && <HistoryTab />}
              {tab === 'settings' && <SettingsTab config={config} reload={loadConfig} onConnected={loadConnection} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared layout helpers ───────────────────────────────────────────────────
function Step({ n, title, hint, children }) {
  return (
    <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
      <div className="flex items-start gap-2.5 mb-3">
        <span className="w-6 h-6 rounded-full bg-whatsapp-green-light text-whatsapp-green-fg text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <div>
          <h3 className="text-sm font-semibold text-neutral-800 leading-tight">{title}</h3>
          {hint && <p className="text-[11px] text-neutral-400 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// Sticky on desktop; collapsible "what parents see" panel on mobile.
function PreviewPanel({ children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="lg:sticky lg:top-4">
      <button onClick={() => setOpen(o => !o)}
        className="lg:hidden w-full flex items-center justify-between mb-2 px-3 py-2 rounded-xl bg-white border border-[#EBEAE7] text-sm font-medium text-neutral-700">
        <span className="flex items-center gap-1.5"><Eye size={15} /> What parents will see</span>
        <span className="text-xs text-neutral-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      <p className="hidden lg:flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-1">
        <Eye size={13} /> What parents will see
      </p>
      <div className={open ? 'block' : 'hidden lg:block'}>{children}</div>
    </div>
  );
}

// ── Compose ───────────────────────────────────────────────────────────────────
function ComposeTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount, reloadRecipients, onSendCredentials, onGoToTemplates, provider, variables }) {
  const [msg, setMsg] = useState({ mode: provider === 'meta' ? 'template' : 'freeform', category: 'utility', manual_values: {}, body_text: '' });
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const selectedStudents = useMemo(
    () => groups.flatMap(g => g.students).filter(s => selected.has(s.id)), [groups, selected]);
  const classCount = useMemo(
    () => new Set(selectedStudents.map(s => s.standard_id)).size, [selectedStudents]);

  const sample = selectedStudents[0] || {};
  const tpl = templates.find(t => t.name === msg.template_name);
  const activeBody = msg.mode === 'template' ? (tpl?.body_text || '') : (msg.body_text || '');
  const previewMessages = [{
    text: renderPreview(activeBody, variables, msg.manual_values, sample),
    mediaType: msg.media_type, mediaUrl: msg.media_url, mediaName: msg.media_name,
  }];

  // Which step is the teacher on? Advances the flow bar as they fill things in.
  const hasMessage = (msg.mode === 'template' ? !!tpl : !!(msg.body_text || '').trim()) || !!msg.media_url;
  const currentStep = !hasMessage ? 1 : selectedCount === 0 ? 2 : 3;

  const buildPayload = () => ({
    included_student_ids: Array.from(selected),
    mode: (provider === 'meta' && selectedCount > 1) ? 'template' : msg.mode,
    template_name: msg.template_name, manual_values: msg.manual_values,
    body_text: msg.body_text, media_url: msg.media_url, media_type: msg.media_type,
    category: msg.category,
  });

  const send = async () => {
    if (selectedCount === 0) { alert('Pick at least one student first.'); return; }
    const est = estimateFor(msg.category);
    const costNote = est.amount > 0 ? ` for ~₹${est.amount.toFixed(2)}` : '';
    if (!confirm(`This will message ${selectedCount} parent(s)${costNote}. Send?`)) return;
    setSending(true);
    try {
      const r = await whatsappApi.send(buildPayload());
      const failed = (r.results || []).filter(x => x.status === 'failed' || x.status === 'not_configured');
      let extra = '';
      if (!r.configured) extra = '\n\n(Not connected — add your WhatsApp details in Settings.)';
      else if (failed.length) extra = `\n\n${failed.length} failed — e.g. "${failed[0].error || 'unknown error'}"`;
      alert(`Sent ${r.sent}/${r.results.length}. Cost ₹${(r.total_cost || 0).toFixed(2)}.${extra}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) return;
    setSending(true);
    try {
      const r = await whatsappApi.send({ ...buildPayload(), test_to_self: testPhone.trim() });
      const res = r.results?.[0] || {};
      const ok = res.status && res.status !== 'failed' && res.status !== 'not_configured';
      alert(ok ? `✅ Test sent (${res.status}).` : `❌ Test failed: ${res.error || (!r.configured ? 'not connected' : 'unknown error')}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  return (
    <div>
      <FlowStepper current={currentStep} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        {/* Left: guided steps — write, then choose, then send */}
        <div className="space-y-4">
          <Step n="1" title="Write your message" hint="Type it, attach a file, or start from a saved template">
            {!configured && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                WhatsApp isn’t connected yet — messages won’t actually send. Add your details in the <span className="font-medium">Settings</span> tab (under Advanced).
              </div>
            )}
            <Composer value={msg} onChange={setMsg} templates={templates} onGoToTemplates={onGoToTemplates}
              provider={provider} selectedCount={selectedCount} variables={variables} />
          </Step>

          <Step n="2" title="Choose who gets it"
            hint={selectedCount > 0 ? `${selectedCount} parent${selectedCount > 1 ? 's' : ''} across ${classCount} class${classCount > 1 ? 'es' : ''}` : 'Pick the classes or students to message'}>
            <RecipientPicker groups={groups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
            {onSendCredentials && (
              <button onClick={onSendCredentials}
                className="mt-2 text-xs font-medium text-whatsapp-green-fg hover:underline flex items-center gap-1">
                <KeyRound size={12} /> Send login details (ID & password) instead
              </button>
            )}
          </Step>

          <Step n="3" title="Preview & send" hint="Check the preview on the right, then send">
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1"><Input label="Test to my number first (optional)" placeholder="+91…"
                value={testPhone} onChange={(e) => setTestPhone(e.target.value)} /></div>
              <Btn icon={Send} onClick={sendTest} disabled={sending || !testPhone.trim()}>Test</Btn>
            </div>
            <CostEstimate count={selectedCount} estimate={estimateFor(msg.category)} currency={currency}
              onSend={send} sending={sending} configured={configured} />
          </Step>
        </div>

        {/* Right: live WhatsApp preview */}
        <PreviewPanel>
          <WhatsAppPreview messages={previewMessages}
            footnote="Live preview — variables show example values here, and fill in for real for each parent." />
        </PreviewPanel>
      </div>
    </div>
  );
}

// ── Send Progress Report (1-click; power features under Advanced) ───────────────
const REPORT_TYPES = [
  { id: 'weekly',  label: 'Weekly Report',  hint: 'Last week’s progress' },
  { id: 'monthly', label: 'Monthly Report', hint: 'Last month’s progress' },
  { id: 'exam',    label: 'Exam Report',    hint: 'Results for one exam' },
];

function ReportsTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount, reloadRecipients, initialExamId }) {
  const [reportType, setReportType] = useState('exam');
  const [examId, setExamId] = useState(initialExamId || '');
  const [exams, setExams] = useState([]);
  const [format, setFormat] = useState('pdf'); // pdf | image | text
  const [criteria, setCriteria] = useState([]);
  const [defaultMsg, setDefaultMsg] = useState('Please find your child’s report attached.');
  const [defaultTemplateName, setDefaultTemplateName] = useState('');
  const [category] = useState('utility');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);

  // Load the teacher's exams once (for the Exam picker).
  useEffect(() => {
    (async () => {
      try { const r = await testApi.getTests(); setExams(r?.tests || r || []); }
      catch { setExams([]); }
    })();
  }, []);

  // Re-target the picker when arriving via "Review First" for a specific exam.
  useEffect(() => {
    if (initialExamId) { setReportType('exam'); setExamId(initialExamId); }
  }, [initialExamId]);

  // An exam belongs to one standard — scope recipients to it.
  const examStandardId = reportType === 'exam'
    ? (exams.find(e => e.id === examId)?.standard_id || null) : null;
  const visibleGroups = examStandardId ? groups.filter(g => g.standard_id === examStandardId) : groups;

  // When the chosen exam changes, auto-select only that standard's eligible students.
  useEffect(() => {
    if (reportType !== 'exam' || !examStandardId) return;
    const ids = groups.filter(g => g.standard_id === examStandardId)
      .flatMap(g => g.students.filter(s => s.phone && !s.opted_out).map(s => s.id));
    setSelected(new Set(ids));
  }, [examId, examStandardId, reportType]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = () => ({
    included_student_ids: Array.from(selected),
    standard_ids: examStandardId ? [examStandardId] : undefined,
    report_format: format,
    period: reportType === 'exam' ? 'overall' : reportType,   // weekly | monthly
    test_id: reportType === 'exam' ? (examId || undefined) : undefined,
    criteria, default_message: defaultMsg, template_name: defaultTemplateName || undefined, category, mode: 'template',
  });

  const runPreview = async () => {
    try { setPreview(await whatsappApi.previewCriteria(payload())); }
    catch (e) { alert(e.message); }
  };

  const send = async () => {
    if (selectedCount === 0) { alert('Pick at least one class or student first.'); return; }
    if (reportType === 'exam' && !examId) { alert('Choose which exam to send.'); return; }
    if (!confirm(`Send progress reports to ${selectedCount} parent(s)?`)) return;
    setSending(true);
    try {
      const r = await whatsappApi.sendReports(payload());
      alert(`Sent ${r.sent}/${r.results.length}. Cost ₹${(r.total_cost || 0).toFixed(2)}.${!r.configured ? ' (Not configured.)' : ''}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  const sampleName = useMemo(() => {
    const s = groups.flatMap(g => g.students).find(x => selected.has(x.id));
    return s?.name || 'Aarav';
  }, [groups, selected]);
  const reportMedia = (name) => {
    if (format === 'pdf') return { mediaType: 'application/pdf', mediaName: `${name.replace(/\s+/g, '_')}_Report.pdf` };
    if (format === 'image') return { mediaType: 'image/png' };
    return {}; // text summary → in the body
  };
  const previewMessages = (criteria.length ? criteria : [{ message: defaultMsg, attach_report: true }]).map((b) => ({
    text: b.message || defaultMsg || 'Please find your child’s report attached.',
    ...(b.attach_report !== false ? reportMedia(sampleName) : {}),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
      <div className="space-y-4">
        <Step n="1" title="What to send" hint="Pick the kind of report">
          <div className="grid grid-cols-3 gap-2">
            {REPORT_TYPES.map(t => (
              <button key={t.id} onClick={() => setReportType(t.id)}
                className={`px-2 py-2.5 rounded-xl border text-center transition-colors ${
                  reportType === t.id ? 'bg-whatsapp-green-light border-whatsapp-green-fg/30 text-whatsapp-green-fg'
                                      : 'bg-white border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF]'}`}>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-[10px] text-neutral-400 mt-0.5">{t.hint}</span>
              </button>
            ))}
          </div>
          {reportType === 'exam' && (
            <div className="mt-3">
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Which exam?</label>
              <select value={examId} onChange={(e) => setExamId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                <option value="">Select an exam…</option>
                {exams.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}{ex.standard_name ? ` — ${ex.standard_name}` : ''}
                  </option>
                ))}
              </select>
              {exams.length === 0 && <p className="text-[11px] text-neutral-400 mt-1">No exams found yet.</p>}
            </div>
          )}
        </Step>

        <Step n="2" title="Who gets it?"
          hint={examStandardId ? 'Only this exam’s class — exam results stay within its standard' : 'Pick the classes or students'}>
          <RecipientPicker groups={visibleGroups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
        </Step>

        <Step n="3" title="Preview & send" hint="See exactly what parents receive">
          <div className="flex flex-wrap gap-2 mb-3">
            <Btn onClick={runPreview}>Preview</Btn>
          </div>
          {reportType === 'exam' && (
            <p className="text-[11px] text-neutral-400 mb-2">Only students who took this exam will receive results.</p>
          )}
          {preview && (
            <div className="mb-3 glass-panel border border-[#EBEAE7] rounded-xl overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-neutral-500 border-b border-[#F1EFEC]">
                {preview.preview.length} will receive
                {preview.skipped_no_exam ? ` · ${preview.skipped_no_exam} didn’t take the exam` : ''}
                {preview.skipped_no_band ? ` · ${preview.skipped_no_band} no band` : ''}
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-[#F4F2EF]">
                {preview.preview.map(p => (
                  <div key={p.student_id} className="px-3 py-2 text-sm flex items-center gap-2">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-neutral-500 w-12 text-right">{p.score ?? '—'}%</span>
                    <span className="flex-1 text-xs text-neutral-500 truncate">{p.message || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(() => {
            // Exam mode: once previewed, count only the students who took the exam.
            const eff = (reportType === 'exam' && preview) ? preview.preview.length : selectedCount;
            const { rate } = estimateFor(category);
            return (
              <CostEstimate count={eff} estimate={{ rate, amount: eff * rate }} currency={currency}
                onSend={send} sending={sending} configured={configured}
                sendLabel={`Send to ${eff} parent${eff === 1 ? '' : 's'}`} />
            );
          })()}

          {/* Advanced settings — most teachers never open this */}
          <details className="mt-4 group">
            <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-800 flex items-center gap-1 select-none">
              <SlidersHorizontal size={12} /> Advanced settings
            </summary>
            <div className="mt-3 space-y-3 border-l-2 border-[#EFEDEA] pl-3">
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Report format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                  <option value="pdf">PDF attachment (recommended)</option>
                  <option value="image">Image card</option>
                  <option value="text">Text summary</option>
                </select>
              </div>
              <Input label="Default message (when no band matches)" value={defaultMsg}
                onChange={(e) => setDefaultMsg(e.target.value)} />
              {templates.filter(t => t.status === 'approved').length > 0 && (
                <div>
                  <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Default Template (optional)</label>
                  <select value={defaultTemplateName} onChange={(e) => setDefaultTemplateName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
                    <option value="">Free-form message</option>
                    {templates.filter(t => t.status === 'approved').map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <CriteriaBuilder value={criteria} onChange={setCriteria} templates={templates} />
            </div>
          </details>
        </Step>
      </div>

      <PreviewPanel>
        <WhatsAppPreview messages={previewMessages}
          footnote="A sample per score level — each parent gets their own child’s report." />
      </PreviewPanel>
    </div>
  );
}

// ── Send login details (credentials) ────────────────────────────────────────────
function CredentialsTab({ groups, estimateFor, currency, configured, reloadRecipients }) {
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const count = selected.size;

  const send = async () => {
    if (count === 0) { alert('Pick at least one student first.'); return; }
    if (!confirm(`Send login details to ${count} parent(s)?`)) return;
    setSending(true);
    try {
      const r = await whatsappApi.sendWelcome({ included_student_ids: Array.from(selected), include_credentials: true, category: 'utility' });
      alert(`Sent ${r.sent}/${r.results.length}. Cost ₹${(r.total_cost || 0).toFixed(2)}.${!r.configured ? ' (Not configured.)' : ''}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  const previewMessages = [{ text:
    'Welcome! Login details for your child:\nStudent ID: 25UDAYA100001\nPassword: ******\nUse the login page to sign in.' }];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
      <div className="space-y-4">
        <div className="glass-panel border border-[#EBEAE7] rounded-card p-4 flex items-start gap-2.5">
          <KeyRound size={18} className="text-whatsapp-green-fg mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-800">Send login details</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">Each parent gets their child’s Student ID + password. Sent as a Utility message.</p>
          </div>
        </div>

        <Step n="1" title="Who gets login details?" hint="Pick the new students">
          <RecipientPicker groups={groups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
        </Step>

        <Step n="2" title="Send" hint="Credentials are filled in per student automatically">
          <CostEstimate count={count} estimate={estimateFor('utility')} currency={currency}
            onSend={send} sending={sending} configured={configured}
            sendLabel={`Send to ${count} parent${count === 1 ? '' : 's'}`} />
        </Step>
      </div>

      <PreviewPanel>
        <WhatsAppPreview messages={previewMessages}
          footnote="Each parent receives their own child’s real Student ID & password." />
      </PreviewPanel>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────
// ── Connect WhatsApp (scan-to-pair) + Advanced (for developers) ────────────────
function SettingsTab({ config, reload, onConnected }) {
  const [conn, setConn] = useState(null);
  const [qr, setQr] = useState(null);
  const [loadingConn, setLoadingConn] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshConn = async () => {
    try { const c = await whatsappApi.getConnection(); setConn(c); return c; }
    catch { setConn({ connected: false, state: 'error' }); return null; }
    finally { setLoadingConn(false); }
  };
  useEffect(() => { refreshConn(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadQr = async () => {
    setQr(null);
    try { setQr(await whatsappApi.getQr()); } catch (e) { setQr({ error: e.message }); }
  };
  const startConnect = async () => { setShowQr(true); await loadQr(); };

  // While the QR is on screen, poll until the phone links.
  useEffect(() => {
    if (!showQr) return undefined;
    const id = setInterval(async () => {
      const c = await refreshConn();
      if (c?.connected) { setShowQr(false); onConnected?.(); }
    }, 3000);
    return () => clearInterval(id);
  }, [showQr]); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = async () => {
    if (!confirm('Disconnect WhatsApp? You’ll need to scan again to reconnect.')) return;
    setBusy(true);
    try { await whatsappApi.disconnect(); await refreshConn(); onConnected?.(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (!testNumber.trim()) { alert('Enter your WhatsApp number.'); return; }
    setTesting(true);
    try {
      const r = await whatsappApi.send({ test_to_self: testNumber.trim(), mode: 'freeform',
        body_text: 'Test ✅ Your institute’s WhatsApp is connected and ready to send.' });
      const res = r.results?.[0] || {};
      const ok = res.status && res.status !== 'failed' && res.status !== 'not_configured';
      alert(ok ? `✅ Sent to ${testNumber.trim()}.` : `❌ Failed: ${res.error || 'unknown error'}`);
    } catch (e) { alert(e.message); } finally { setTesting(false); }
  };

  const connected = conn?.connected;
  const noServer = conn?.state === 'no_server' || qr?.state === 'no_server';

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h3 className="text-base font-semibold text-neutral-800">Connect WhatsApp</h3>
        <p className="text-sm text-neutral-500">Link your WhatsApp once — then every message sends from your own number.</p>
      </div>

      {loadingConn ? (
        <Skeleton className="h-28 w-full rounded-2xl" />
      ) : connected ? (
        <div className="glass-panel border border-whatsapp-green-fg/30 bg-whatsapp-green-light/30 rounded-card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-whatsapp-green text-white flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-neutral-800 leading-tight">Connected</p>
            <p className="text-xs text-neutral-500">{conn.number ? `+${conn.number}` : 'Your WhatsApp is linked.'}</p>
          </div>
          <Btn size="sm" variant="danger" onClick={disconnect} disabled={busy}>Disconnect</Btn>
        </div>
      ) : noServer ? (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The WhatsApp server isn’t set up yet. Ask your admin/developer to add it under
          <span className="font-medium"> Advanced (for developers)</span> below.
        </div>
      ) : (
        <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
          {!showQr ? (
            <div className="text-center py-3">
              <div className="w-12 h-12 rounded-full bg-whatsapp-green-light mx-auto flex items-center justify-center mb-2">
                <QrCode size={22} className="text-whatsapp-green-fg" />
              </div>
              <p className="text-sm text-neutral-600 mb-3">Your WhatsApp isn’t linked yet.</p>
              <Btn variant="primary" icon={QrCode} onClick={startConnect}>Connect WhatsApp</Btn>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="flex items-center justify-center">
                {qr?.qr_base64 ? (
                  <img src={qr.qr_base64} alt="WhatsApp QR code"
                    className="w-44 h-44 rounded-lg border border-[#EBEAE7] bg-white p-1" />
                ) : qr?.error ? (
                  <p className="text-xs text-red-600 text-center px-2">{qr.error}</p>
                ) : (
                  <div className="w-44 h-44 rounded-lg border border-dashed border-[#D9D7D3] flex items-center justify-center text-neutral-400">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                )}
              </div>
              <div className="text-sm">
                <p className="font-semibold text-neutral-800 mb-2">Scan to link</p>
                <ol className="text-xs text-neutral-600 space-y-1 list-decimal ml-4">
                  <li>Open <b>WhatsApp</b> on your phone</li>
                  <li>Tap <b>⋮ → Linked devices</b></li>
                  <li>Tap <b>Link a device</b></li>
                  <li>Point your phone at this code</li>
                </ol>
                {qr?.pairing_code && (
                  <p className="text-xs text-neutral-500 mt-2">Or enter code: <span className="font-mono font-semibold">{qr.pairing_code}</span></p>
                )}
                <button onClick={loadQr} className="mt-3 text-xs text-whatsapp-green-fg hover:underline">Refresh code</button>
                <p className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Waiting for you to scan…
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {connected && (
        <div className="glass-panel border border-[#EBEAE7] rounded-card p-3">
          <p className="text-xs font-medium text-neutral-700 mb-2">Send yourself a test message</p>
          <div className="flex items-end gap-2">
            <div className="flex-1"><Input label="Your WhatsApp number" placeholder="+91…"
              value={testNumber} onChange={(e) => setTestNumber(e.target.value)} /></div>
            <Btn icon={Send} onClick={sendTest} disabled={testing}>{testing ? 'Sending…' : 'Send test'}</Btn>
          </div>
        </div>
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-800 select-none flex items-center gap-1">
          <SlidersHorizontal size={12} /> Advanced (for developers)
        </summary>
        <div className="mt-3 border-l-2 border-[#EFEDEA] pl-3">
          <AdvancedSettings config={config} reload={reload} />
        </div>
      </details>
    </div>
  );
}

function AdvancedSettings({ config, reload }) {
  const [form, setForm] = useState({
    provider: config?.provider || 'evolution',
    api_key: '',
    sender: config?.sender || '',
    meta_access_token: '',
    meta_phone_number_id: config?.meta_phone_number_id || '',
    meta_waba_id: config?.meta_waba_id || '',
    evolution_base_url: config?.evolution_base_url || '',
    evolution_api_key: '',
    evolution_instance: config?.evolution_instance || '',
    currency: config?.currency || 'INR',
    rates: config?.rates || { utility: 0.14, marketing: 0.78, auth: 0.13 },
    auto_welcome: config?.auto_welcome || false,
    welcome_template: config?.welcome_template || '',
    quiet_hours: config?.quiet_hours || {},
  });
  const [saving, setSaving] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const set = (patch) => setForm({ ...form, ...patch });
  const isMeta = form.provider === 'meta';

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.api_key) delete body.api_key;                 // keep stored secret if blank
      if (!body.meta_access_token) delete body.meta_access_token;
      if (!body.evolution_api_key) delete body.evolution_api_key;
      await whatsappApi.setConfig(body);
      await reload();
      setForm(f => ({ ...f, api_key: '', meta_access_token: '', evolution_api_key: '' }));
      alert('Saved.');
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  // One-click delivery check: Meta seeds every account with the approved
  // "hello_world" template, so this proves the connection without any setup.
  const sendTest = async () => {
    if (!testNumber.trim()) { alert('Enter your WhatsApp number to test.'); return; }
    if (!config?.configured) { alert('Save your provider details first, then test.'); return; }
    setTesting(true);
    try {
      const r = await whatsappApi.send({ test_to_self: testNumber.trim(), mode: 'template',
        template_name: 'hello_world', language: 'en' });
      const res = r.results?.[0] || {};
      if (res.status && res.status !== 'failed' && res.status !== 'not_configured') {
        alert(`✅ Test sent (${res.status}). Check WhatsApp on ${testNumber.trim()}.`);
      } else {
        alert(`❌ Test failed: ${res.error || 'unknown error'}`);
      }
    } catch (e) { alert(e.message); } finally { setTesting(false); }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Provider</label>
        <select value={form.provider} onChange={(e) => set({ provider: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
          <option value="meta">Meta WhatsApp Cloud API (recommended)</option>
          <option value="wanotifier">WANotifier</option>
          <option value="evolution">Evolution API</option>
        </select>
      </div>

      {form.provider === 'meta' && (
        <>
          <Input label="Phone number ID" placeholder="e.g. 123456789012345"
            value={form.meta_phone_number_id} onChange={(e) => set({ meta_phone_number_id: e.target.value })} />
          <div>
            <Input label="Access token" type="password"
              placeholder={config?.meta_token_masked || 'Permanent access token'}
              value={form.meta_access_token} onChange={(e) => set({ meta_access_token: e.target.value })} />
            <p className="text-[11px] text-neutral-400 mt-1">
              {config?.meta_token_masked ? `Stored: ${config.meta_token_masked}. Leave blank to keep it.` : 'Stored server-side only; never shown again in full.'}
            </p>
          </div>
          <Input label="WhatsApp Business Account ID (for templates)" placeholder="e.g. 987654321098765"
            value={form.meta_waba_id} onChange={(e) => set({ meta_waba_id: e.target.value })} />
          <p className="text-[11px] text-neutral-400 -mt-2">
            Get these from Meta → WhatsApp Manager → API setup. Template approval is handled by Meta (24–48h).
          </p>

          {/* One-click delivery check */}
          <div className="glass-panel border border-[#EBEAE7] rounded-xl p-3">
            <p className="text-xs font-medium text-neutral-700 mb-2">Test the connection</p>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Input label="Your WhatsApp number" placeholder="+91…"
                value={testNumber} onChange={(e) => setTestNumber(e.target.value)} /></div>
              <Btn icon={Send} onClick={sendTest} disabled={testing}>{testing ? 'Sending…' : 'Send test'}</Btn>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1.5">Sends Meta’s pre-approved “hello_world” message — proves delivery works. Save first.</p>
          </div>
        </>
      )}
      {form.provider === 'evolution' && (
        <>
          <Input label="Evolution Base URL" placeholder="e.g. http://localhost:8080"
            value={form.evolution_base_url} onChange={(e) => set({ evolution_base_url: e.target.value })} />
          <div>
            <Input label="Global API Key" type="password"
              placeholder={config?.evolution_key_masked || 'Enter API key'}
              value={form.evolution_api_key} onChange={(e) => set({ evolution_api_key: e.target.value })} />
            <p className="text-[11px] text-neutral-400 mt-1">
              {config?.evolution_key_masked ? `Stored: ${config.evolution_key_masked}. Leave blank to keep it.` : 'Stored server-side only; never shown again in full.'}
            </p>
          </div>
          <Input label="Instance Name" placeholder="e.g. TutoriaInstance"
            value={form.evolution_instance} onChange={(e) => set({ evolution_instance: e.target.value })} />
          <p className="text-[11px] text-neutral-400 -mt-2">
            The WhatsApp instance must be created and paired (QR code) in the Evolution API manager.
          </p>
        </>
      )}
      {form.provider === 'wanotifier' && (
        <>
          <Input label="API key" type="password"
            placeholder={config?.api_key_masked || 'Enter API key'}
            value={form.api_key} onChange={(e) => set({ api_key: e.target.value })} />
          <p className="text-[11px] text-neutral-400 -mt-2">
            {config?.api_key_masked ? `Stored: ${config.api_key_masked}. Leave blank to keep it.` : 'Stored server-side only; never shown again in full.'}
          </p>
          <Input label="Sender number / WhatsApp ID" value={form.sender}
            onChange={(e) => set({ sender: e.target.value })} />
        </>
      )}

      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Per-message rates ({form.currency})</label>
        <div className="grid grid-cols-3 gap-2">
          {['utility', 'marketing', 'auth'].map(k => (
            <Input key={k} label={k} type="number" value={form.rates[k]}
              onChange={(e) => set({ rates: { ...form.rates, [k]: Number(e.target.value) } })} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Quiet hours — send from" type="time" value={form.quiet_hours?.start || ''}
          onChange={(e) => set({ quiet_hours: { ...form.quiet_hours, start: e.target.value } })} />
        <Input label="Quiet hours — send until" type="time" value={form.quiet_hours?.end || ''}
          onChange={(e) => set({ quiet_hours: { ...form.quiet_hours, end: e.target.value } })} />
      </div>

      <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Btn>
    </div>
  );
}
