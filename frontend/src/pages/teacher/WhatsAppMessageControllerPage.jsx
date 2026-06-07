import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, MessageSquare, FileBarChart, Clock, LayoutTemplate, Inbox, History, Settings as SettingsIcon, Send, Eye, KeyRound, ChevronDown, SlidersHorizontal } from 'lucide-react';
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
import { fillTemplate } from '../../components/teacher/whatsapp/previewText';

// 4 everyday tabs; power features live behind "Advanced".
const PRIMARY_TABS = [
  { id: 'overview', label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'compose',  label: 'Send Message',         icon: MessageSquare },
  { id: 'reports',  label: 'Send Progress Report', icon: FileBarChart },
  { id: 'settings', label: 'Settings',             icon: SettingsIcon },
];
const ADVANCED_TABS = [
  { id: 'templates',  label: 'Templates',  icon: LayoutTemplate },
  { id: 'automation', label: 'Automation', icon: Clock },
  { id: 'inbox',      label: 'Inbox',      icon: Inbox },
  { id: 'history',    label: 'History',    icon: History },
];
const ADVANCED_IDS = ADVANCED_TABS.map(t => t.id);

export default function WhatsAppMessageControllerPage() {
  const [tab, setTab] = useState('overview');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => { try { setConfig(await whatsappApi.getConfig()); } catch { setConfig({}); } };
  const loadTemplates = async () => { try { const r = await whatsappApi.listTemplates(); setTemplates(r.templates || []); } catch { setTemplates([]); } };
  const loadRecipients = async () => {
    try {
      const r = await whatsappApi.getRecipients();
      setGroups(r.groups || []);
      // default: select every eligible student
      const ids = (r.groups || []).flatMap(g => g.students.filter(s => s.phone && !s.opted_out).map(s => s.id));
      setSelected(new Set(ids));
    } catch { setGroups([]); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadTemplates(), loadRecipients()]);
      setLoading(false);
    })();
  }, []);

  const rates = config?.rates || { utility: 0.14, marketing: 0.78, auth: 0.13 };
  const currency = config?.currency || 'INR';

  const selectedCount = selected.size;
  const estimateFor = (category) => ({ rate: rates[category] ?? 0.14, amount: selectedCount * (rates[category] ?? 0.14) });

  // Navigate; auto-open the Advanced drawer when targeting an advanced tab.
  const go = (id) => { setTab(id); if (ADVANCED_IDS.includes(id)) setAdvancedOpen(true); };
  const showAdvancedRow = advancedOpen || ADVANCED_IDS.includes(tab);

  return (
    <div className="min-h-screen bg-transparent">
      <TopBar title="WhatsApp" />
      <div className="max-w-5xl mx-auto p-4 pb-[calc(7rem_+_env(safe-area-inset-bottom))] lg:pb-8">
        {!config?.configured && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            WhatsApp is not configured yet. Add your provider API key in the <button
              className="underline font-medium" onClick={() => setTab('settings')}>Settings</button> tab.
            You can still set everything up — real sends start once a key is added.
          </div>
        )}

        {/* Primary tabs */}
        <div className="flex gap-1 overflow-x-auto mb-2 -mx-1 px-1">
          {PRIMARY_TABS.map(t => (
            <button key={t.id} onClick={() => go(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-ink text-white' : 'bg-white border border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF]'
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          <button onClick={() => setAdvancedOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-medium whitespace-nowrap transition-colors ${
              showAdvancedRow ? 'bg-[#F4F2EF] border border-[#EBEAE7] text-neutral-700' : 'bg-white border border-[#EBEAE7] text-neutral-500 hover:bg-[#F4F2EF]'
            }`}>
            <SlidersHorizontal size={13} /> Advanced
            <ChevronDown size={13} className={`transition-transform ${showAdvancedRow ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Advanced drawer */}
        {showAdvancedRow && (
          <div className="flex gap-1 overflow-x-auto mb-4 -mx-1 px-1">
            {ADVANCED_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-[11px] font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? 'bg-ink text-white' : 'bg-white border border-[#EBEAE7] text-neutral-600 hover:bg-[#F4F2EF]'
                }`}>
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        )}
        {!showAdvancedRow && <div className="mb-2" />}

        {loading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab onNavigate={go} currency={currency} />}
            {tab === 'compose' && (
              <ComposeTab groups={groups} selected={selected} setSelected={setSelected}
                templates={templates} estimateFor={estimateFor} currency={currency}
                configured={config?.configured} selectedCount={selectedCount}
                reloadRecipients={loadRecipients} onSendCredentials={() => go('credentials')} />
            )}
            {tab === 'reports' && (
              <ReportsTab groups={groups} selected={selected} setSelected={setSelected}
                templates={templates} estimateFor={estimateFor} currency={currency}
                configured={config?.configured} selectedCount={selectedCount}
                reloadRecipients={loadRecipients} />
            )}
            {tab === 'credentials' && (
              <CredentialsTab groups={groups} estimateFor={estimateFor} currency={currency}
                configured={config?.configured} reloadRecipients={loadRecipients} />
            )}
            {tab === 'automation' && <AutomationTab templates={templates} groups={groups} />}
            {tab === 'templates' && <TemplatesTab templates={templates} reload={loadTemplates} />}
            {tab === 'inbox' && <InboxTab />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'settings' && <SettingsTab config={config} reload={loadConfig} />}
          </>
        )}
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
function ComposeTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount, reloadRecipients, onSendCredentials }) {
  const [msg, setMsg] = useState({ mode: 'template', category: 'utility', variables: [], body_text: '' });
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const selectedStudents = useMemo(
    () => groups.flatMap(g => g.students).filter(s => selected.has(s.id)), [groups, selected]);
  const freeformAllowed = selectedStudents.length > 0 && selectedStudents.every(s => s.session_open);
  const classCount = useMemo(
    () => new Set(selectedStudents.map(s => s.standard_id)).size, [selectedStudents]);

  // Live preview text: filled template (sample = first selected student's name) or free-form body.
  const sampleName = selectedStudents[0]?.name || 'your child';
  const tpl = templates.find(t => t.name === msg.template_name && t.status === 'approved');
  const previewText = msg.mode === 'template'
    ? (tpl ? fillTemplate(tpl.body_text, msg.variables, tpl.variables) : '')
    : (msg.body_text || '');
  const previewMessages = [{
    text: previewText.replace(/\{your child\}/gi, sampleName),
    mediaType: msg.media_type, mediaUrl: msg.media_url, mediaName: msg.media_name,
  }];

  const buildPayload = () => ({
    included_student_ids: Array.from(selected),
    mode: msg.mode, template_name: msg.template_name, variables: msg.variables,
    body_text: msg.body_text, media_url: msg.media_url, media_type: msg.media_type,
    category: msg.category,
  });

  const send = async () => {
    if (selectedCount === 0) return;
    if (!confirm(`This will message ${selectedCount} parent(s) for ~₹${estimateFor(msg.category).amount.toFixed(2)}. Send?`)) return;
    setSending(true);
    try {
      const r = await whatsappApi.send(buildPayload());
      alert(`Sent ${r.sent}/${r.results.length}. Cost ₹${(r.total_cost || 0).toFixed(2)}.${!r.configured ? ' (Not configured — no real messages went out.)' : ''}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) return;
    setSending(true);
    try {
      const r = await whatsappApi.send({ ...buildPayload(), test_to_self: testPhone.trim() });
      alert(`Test send: ${r.results[0]?.status}.`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
      {/* Left: guided steps */}
      <div className="space-y-4">
        <Step n="1" title="Who gets it?"
          hint={selectedCount > 0 ? `${selectedCount} parent${selectedCount > 1 ? 's' : ''} across ${classCount} class${classCount > 1 ? 'es' : ''}` : 'Pick the classes or students to message'}>
          <RecipientPicker groups={groups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
          {onSendCredentials && (
            <button onClick={onSendCredentials}
              className="mt-2 text-xs font-medium text-whatsapp-green-fg hover:underline flex items-center gap-1">
              <KeyRound size={12} /> Send login details (ID & password) instead
            </button>
          )}
        </Step>

        <Step n="2" title="Your message" hint="Type it, attach a file, or pick a template">
          <Composer value={msg} onChange={setMsg} templates={templates} freeformAllowed={freeformAllowed} />
        </Step>

        <Step n="3" title="Review & send" hint="Send a test to yourself first if you like">
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
          footnote="Live preview — variable blanks show example values until you fill them." />
      </PreviewPanel>
    </div>
  );
}

// ── Send Progress Report (1-click; power features under Advanced) ───────────────
// Friendly, adaptive default bands so the message varies by score with zero config.
const DEFAULT_BANDS = [
  { min: 0, max: 20, message: 'Your child needs extra focus — let’s work together to improve.', attach_report: true },
  { min: 20, max: 50, message: 'Your child is doing okay, with room to grow. Keep encouraging them!', attach_report: true },
  { min: 50, max: null, message: 'Your child is performing well. Thank you for your support!', attach_report: true },
];
const REPORT_TYPES = [
  { id: 'weekly',  label: 'Weekly Report',  hint: 'Last week’s progress' },
  { id: 'monthly', label: 'Monthly Report', hint: 'Last month’s progress' },
  { id: 'exam',    label: 'Exam Report',    hint: 'Results for one exam' },
];

function ReportsTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount, reloadRecipients }) {
  const [reportType, setReportType] = useState('monthly');
  const [examId, setExamId] = useState('');
  const [exams, setExams] = useState([]);
  const [format, setFormat] = useState('image');        // nice report-card image by default
  const [criteria, setCriteria] = useState(DEFAULT_BANDS);
  const [defaultMsg, setDefaultMsg] = useState('Please find your child’s progress report attached.');
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

  const payload = () => ({
    included_student_ids: Array.from(selected),
    report_format: format,
    period: reportType === 'exam' ? 'overall' : reportType,   // weekly | monthly
    test_id: reportType === 'exam' ? (examId || undefined) : undefined,
    criteria, default_message: defaultMsg, category, mode: 'freeform',
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
                {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
              </select>
              {exams.length === 0 && <p className="text-[11px] text-neutral-400 mt-1">No exams found yet.</p>}
            </div>
          )}
        </Step>

        <Step n="2" title="Who gets it?" hint="Pick the classes or students">
          <RecipientPicker groups={groups} selected={selected} onChange={setSelected} onStudentUpdated={reloadRecipients} />
        </Step>

        <Step n="3" title="Preview & send" hint="See exactly what parents receive">
          <div className="flex flex-wrap gap-2 mb-3">
            <Btn onClick={runPreview}>Preview</Btn>
          </div>
          {preview && (
            <div className="mb-3 glass-panel border border-[#EBEAE7] rounded-xl overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-neutral-500 border-b border-[#F1EFEC]">
                {preview.preview.length} students{preview.skipped_no_band ? ` · ${preview.skipped_no_band} skipped` : ''}
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
          <CostEstimate count={selectedCount} estimate={estimateFor(category)} currency={currency}
            onSend={send} sending={sending} configured={configured}
            sendLabel={`Send to ${selectedCount} parent${selectedCount === 1 ? '' : 's'}`} />

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
                  <option value="image">Image card (recommended)</option>
                  <option value="pdf">PDF attachment</option>
                  <option value="text">Text summary</option>
                </select>
              </div>
              <Input label="Default message (when no band matches)" value={defaultMsg}
                onChange={(e) => setDefaultMsg(e.target.value)} />
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
function SettingsTab({ config, reload }) {
  const [form, setForm] = useState({
    provider: config?.provider || 'wanotifier',
    api_key: '',
    sender: config?.sender || '',
    currency: config?.currency || 'INR',
    rates: config?.rates || { utility: 0.14, marketing: 0.78, auth: 0.13 },
    auto_welcome: config?.auto_welcome || false,
    welcome_template: config?.welcome_template || '',
    quiet_hours: config?.quiet_hours || {},
  });
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm({ ...form, ...patch });

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.api_key) delete body.api_key;   // don't overwrite stored key with blank
      await whatsappApi.setConfig(body);
      await reload();
      setForm(f => ({ ...f, api_key: '' }));
      alert('Saved.');
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Provider</label>
        <select value={form.provider} onChange={(e) => set({ provider: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
          <option value="wanotifier">WANotifier</option>
        </select>
      </div>

      <Input label="API key" type="password"
        placeholder={config?.api_key_masked || 'Enter API key'}
        value={form.api_key} onChange={(e) => set({ api_key: e.target.value })} />
      <p className="text-[11px] text-neutral-400 -mt-2">
        {config?.configured ? `Stored: ${config.api_key_masked}. Leave blank to keep it.` : 'Stored server-side only; never shown again in full.'}
      </p>

      <Input label="Sender number / WhatsApp ID" value={form.sender}
        onChange={(e) => set({ sender: e.target.value })} />

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
