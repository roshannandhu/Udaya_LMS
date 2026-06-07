import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, MessageSquare, FileBarChart, Clock, LayoutTemplate, Inbox, History, Settings as SettingsIcon, Send } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Input, Skeleton } from '../../components/ui';
import { whatsappApi } from '../../lib/api';

import OverviewTab from '../../components/teacher/whatsapp/OverviewTab';
import RecipientPicker from '../../components/teacher/whatsapp/RecipientPicker';
import Composer from '../../components/teacher/whatsapp/Composer';
import CostEstimate from '../../components/teacher/whatsapp/CostEstimate';
import CriteriaBuilder from '../../components/teacher/whatsapp/CriteriaBuilder';
import TemplatesTab from '../../components/teacher/whatsapp/TemplatesTab';
import InboxTab from '../../components/teacher/whatsapp/InboxTab';
import HistoryTab from '../../components/teacher/whatsapp/HistoryTab';
import AutomationTab from '../../components/teacher/whatsapp/AutomationTab';

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'compose',    label: 'Compose',    icon: MessageSquare },
  { id: 'reports',    label: 'Reports',    icon: FileBarChart },
  { id: 'automation', label: 'Automation', icon: Clock },
  { id: 'templates',  label: 'Templates',  icon: LayoutTemplate },
  { id: 'inbox',      label: 'Inbox',      icon: Inbox },
  { id: 'history',    label: 'History',    icon: History },
  { id: 'settings',   label: 'Settings',   icon: SettingsIcon },
];

export default function WhatsAppMessageControllerPage() {
  const [tab, setTab] = useState('overview');
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

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto mb-4 -mx-1 px-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-ink text-white' : 'bg-white border border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF]'
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (
          <>
            {tab === 'overview' && <OverviewTab onNavigate={setTab} currency={currency} />}
            {tab === 'compose' && (
              <ComposeTab groups={groups} selected={selected} setSelected={setSelected}
                templates={templates} estimateFor={estimateFor} currency={currency}
                configured={config?.configured} selectedCount={selectedCount} />
            )}
            {tab === 'reports' && (
              <ReportsTab groups={groups} selected={selected} setSelected={setSelected}
                templates={templates} estimateFor={estimateFor} currency={currency}
                configured={config?.configured} selectedCount={selectedCount} />
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

// ── Compose ───────────────────────────────────────────────────────────────────
function ComposeTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount }) {
  const [msg, setMsg] = useState({ mode: 'template', category: 'utility', variables: [], body_text: '' });
  const [sending, setSending] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const selectedStudents = useMemo(
    () => groups.flatMap(g => g.students).filter(s => selected.has(s.id)), [groups, selected]);
  const freeformAllowed = selectedStudents.length > 0 && selectedStudents.every(s => s.session_open);

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
    <div className="space-y-5">
      <RecipientPicker groups={groups} selected={selected} onChange={setSelected} />
      <Composer value={msg} onChange={setMsg} templates={templates} freeformAllowed={freeformAllowed} />

      <div className="flex items-end gap-2">
        <div className="flex-1"><Input label="Test to a number first (optional)" placeholder="+91…"
          value={testPhone} onChange={(e) => setTestPhone(e.target.value)} /></div>
        <Btn icon={Send} onClick={sendTest} disabled={sending || !testPhone.trim()}>Test</Btn>
      </div>

      <CostEstimate count={selectedCount} estimate={estimateFor(msg.category)} currency={currency}
        onSend={send} sending={sending} configured={configured} />
    </div>
  );
}

// ── Reports + criteria ─────────────────────────────────────────────────────────
function ReportsTab({ groups, selected, setSelected, templates, estimateFor, currency, configured, selectedCount }) {
  const [format, setFormat] = useState('pdf');
  const [period, setPeriod] = useState('overall');
  const [criteria, setCriteria] = useState([]);
  const [defaultMsg, setDefaultMsg] = useState('');
  const [category] = useState('utility');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);

  const payload = () => ({
    included_student_ids: Array.from(selected),
    report_format: format, period, criteria, default_message: defaultMsg,
    category, mode: 'freeform',
  });

  const runPreview = async () => {
    try { setPreview(await whatsappApi.previewCriteria(payload())); }
    catch (e) { alert(e.message); }
  };

  const send = async () => {
    if (selectedCount === 0) return;
    if (!confirm(`Send report cards to up to ${selectedCount} parent(s)?`)) return;
    setSending(true);
    try {
      const r = await whatsappApi.sendReports(payload());
      alert(`Sent ${r.sent}/${r.results.length}. Cost ₹${(r.total_cost || 0).toFixed(2)}.${!r.configured ? ' (Not configured.)' : ''}`);
    } catch (e) { alert(e.message); } finally { setSending(false); }
  };

  return (
    <div className="space-y-5">
      <RecipientPicker groups={groups} selected={selected} onChange={setSelected} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Report format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="pdf">PDF attachment</option>
            <option value="image">Image card</option>
            <option value="text">Text summary</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Score period (for banding)</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="overall">Overall average</option>
            <option value="monthly">Last month</option>
            <option value="weekly">Last week</option>
          </select>
        </div>
      </div>

      <Input label="Default message (when no band matches)" value={defaultMsg}
        onChange={(e) => setDefaultMsg(e.target.value)} />

      <CriteriaBuilder value={criteria} onChange={setCriteria} templates={templates} />

      <div>
        <Btn onClick={runPreview}>Preview criteria</Btn>
        {preview && (
          <div className="mt-3 glass-panel border border-[#EBEAE7] rounded-xl overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold text-neutral-500 border-b border-[#F1EFEC]">
              Preview · {preview.preview.length} students{preview.skipped_no_band ? ` · ${preview.skipped_no_band} skipped (no band)` : ''}
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-[#F4F2EF]">
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
      </div>

      <CostEstimate count={selectedCount} estimate={estimateFor(category)} currency={currency}
        onSend={send} sending={sending} configured={configured} sendLabel="Send reports" />
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
