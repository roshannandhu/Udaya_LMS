import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, MessagesSquare, Clock, LayoutTemplate, Settings as SettingsIcon,
  ArrowLeft, ChevronRight, QrCode, CheckCircle2, Loader2, Send,
  SlidersHorizontal, IndianRupee, Smartphone, WifiOff, HelpCircle,
} from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Input, Skeleton, Tag } from '../../components/ui';
import { whatsappApi } from '../../lib/api';
import { useTheme } from '../../lib/theme';

import SendWizard, { TASKS } from '../../components/teacher/whatsapp/SendWizard';
import { applyServerAliases } from '../../components/teacher/whatsapp/previewText';
import GuideSheet from '../../components/teacher/whatsapp/GuideSheet';
import PendingActions from '../../components/teacher/whatsapp/PendingActions';
import TemplatesTab from '../../components/teacher/whatsapp/TemplatesTab';
import ChatsTab from '../../components/teacher/whatsapp/ChatsTab';
import HistoryTab from '../../components/teacher/whatsapp/HistoryTab';
import AutomationTab from '../../components/teacher/whatsapp/AutomationTab';

// Task-first WhatsApp Center. The home screen asks ONE question — "what do you
// want to send?" — and every answer walks the same 3-step wizard (who → message
// → send). Power surfaces (history/inbox/automation/templates/settings) live
// behind quick links. Phone-first: single column, no tabs console.

const TASK_CARDS = [
  { id: 'credentials',  color: '#0F7B6C', bg: '#DFF5EC', dcolor: '#6ee7b7', dbg: '#16302a' },
  { id: 'exam',         color: '#2383E2', bg: '#E3EFFB', dcolor: '#93c5fd', dbg: '#14233a' },
  { id: 'weekly',       color: '#0B6E3E', bg: '#E7FDDE', dcolor: '#86efac', dbg: '#0f2417' },
  { id: 'monthly',      color: '#6940A5', bg: '#EAE4F2', dcolor: '#c4b5fd', dbg: '#221d33' },
  { id: 'announcement', color: '#B7791F', bg: '#FBF1D9', dcolor: '#fcd34d', dbg: '#2b2616' },
];

const SCREENS = {
  history:    { title: 'Delivery Reports',   icon: History },
  inbox:      { title: 'Parent Chats',       icon: MessagesSquare },
  templates:  { title: 'Saved Messages',     icon: LayoutTemplate },
  automation: { title: 'Automatic Messages', icon: Clock },
  settings:   { title: 'Settings',           icon: SettingsIcon },
};

export default function WhatsAppCenterPage() {
  const location = useLocation();
  // Honour deep-links from the test Results sheet ("Review first" → exam wizard preselected).
  const initialScreen = location.state?.examId ? 'task:exam'
    : location.state?.tab === 'reports' ? 'task:exam'
    : location.state?.tab === 'compose' ? 'home'
    : location.state?.tab && SCREENS[location.state.tab] ? location.state.tab
    : 'home';
  const [screen, setScreen] = useState(initialScreen);
  const [examId, setExamId] = useState(location.state?.examId || null);
  const [guideOpen, setGuideOpen] = useState(false);

  const [config, setConfig] = useState(null);
  const [connection, setConnection] = useState(null);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => { try { setConfig(await whatsappApi.getConfig()); } catch { setConfig({}); } };
  const loadConnection = async () => { try { setConnection(await whatsappApi.getConnection()); } catch { setConnection({ connected: false }); } };
  const loadTemplates = async () => { try { const r = await whatsappApi.listTemplates(); setTemplates(r.templates || []); } catch { setTemplates([]); } };
  const loadVariables = async () => {
    try {
      const r = await whatsappApi.getVariables();
      setVariables(r.variables || []);
      applyServerAliases(r.aliases); // keep tag-alias handling in lockstep with the backend
    } catch { setVariables([]); }
  };
  const loadRecipients = async () => {
    try { const r = await whatsappApi.getRecipients(); setGroups(r.groups || []); }
    catch { setGroups([]); }
  };
  const loadInbox = async () => { try { const r = await whatsappApi.getInbox(); setInboxUnread(r.unread || 0); } catch { /* badge stays 0 */ } };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadConnection(), loadTemplates(), loadVariables(), loadRecipients(), loadInbox()]);
      setLoading(false);
    })();
  }, []);

  const rates = config?.rates || { utility: 0.14, marketing: 0.78, auth: 0.13 };
  const currency = config?.currency || 'INR';
  const provider = config?.provider;
  const parentCount = groups.flatMap(g => g.students).filter(s => s.phone && s.phone.trim() !== '' && !s.opted_out).length;

  const goHome = () => { setScreen('home'); setExamId(null); };
  const isTask = screen.startsWith('task:');
  const taskId = isTask ? screen.slice(5) : null;
  const sub = SCREENS[screen];

  return (
    <div className="min-h-screen bg-[#FAFAF9] pb-28 lg:pb-8">
      <TopBar title="WhatsApp Center" action={
        <div className="flex items-center gap-1.5">
          <button onClick={() => setGuideOpen(true)} title="How this works"
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium bg-white text-neutral-600 hover:bg-[#F4F2EF] border border-[#EFEDEA] shadow-card">
            <HelpCircle size={14} /> <span className="hidden sm:inline">Guide</span>
          </button>
          <button onClick={() => setScreen('settings')}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium bg-white text-neutral-900 hover:bg-[#F4F2EF] border border-[#EFEDEA] shadow-card">
            <QrCode size={14} /> Connect
          </button>
        </div>
      } />

      <GuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} variables={variables} />

      {/* Phone: narrow column. Laptop: home gets a wide grid, wizard/sub-screens breathe. */}
      <div className={`px-4 md:px-8 py-5 mx-auto max-w-3xl ${isTask || sub ? 'lg:max-w-5xl' : 'lg:max-w-6xl'}`}>
        {/* Sub-screen / wizard header with back button */}
        {(isTask || sub) && (
          <button onClick={goHome}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
            <ArrowLeft size={15} /> WhatsApp home
          </button>
        )}

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {isTask ? (
                <SendWizard
                  key={`${taskId}-${examId || ''}`}
                  task={taskId}
                  groups={groups}
                  templates={templates}
                  variables={variables}
                  provider={provider}
                  configured={connection?.connected}
                  rates={rates}
                  currency={currency}
                  reloadRecipients={loadRecipients}
                  initialExamId={taskId === 'exam' ? examId : undefined}
                  onExit={goHome}
                  onShowHistory={() => setScreen('history')}
                  onGoToTemplates={() => setScreen('templates')}
                />
              ) : sub ? (
                <div>
                  <h2 className="font-semibold text-lg text-neutral-900 mb-4 flex items-center gap-2">
                    <sub.icon size={18} className="text-whatsapp-green-fg" /> {sub.title}
                  </h2>
                  {screen === 'history' && <HistoryTab />}
                  {screen === 'inbox' && <ChatsTab connection={connection} groups={groups} onUnreadChange={setInboxUnread} />}
                  {screen === 'automation' && <AutomationTab templates={templates} groups={groups} />}
                  {screen === 'templates' && <TemplatesTab templates={templates} reload={loadTemplates} variables={variables} provider={provider} />}
                  {screen === 'settings' && <SettingsScreen config={config} reload={loadConfig} onConnected={loadConnection} />}
                </div>
              ) : (
                <HomeScreen
                  connection={connection}
                  parentCount={parentCount}
                  inboxUnread={inboxUnread}
                  currency={currency}
                  onTask={(id) => setScreen(`task:${id}`)}
                  onScreen={setScreen}
                  onReviewExam={(id) => { setExamId(id); setScreen('task:exam'); }}
                  onSent={loadRecipients}
                  onOpenGuide={() => setGuideOpen(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* ── Home: connection → pending → task cards, with a laptop right rail ──────── */
function HomeScreen({ connection, parentCount, inboxUnread, onTask, onScreen, onReviewExam, onSent, currency, onOpenGuide }) {
  const dark = useTheme(s => s.dark);
  return (
    <div className="space-y-5">
      {/* Connection banner */}
      {connection && !connection.connected ? (
        <div className="space-y-2">
          <button onClick={() => onScreen('settings')}
            className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100/60 transition-colors">
            <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0"><QrCode size={16} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-amber-900">WhatsApp isn’t connected</span>
              <span className="block text-xs text-amber-700">Scan a QR code once — then everything below sends from your own number.</span>
            </span>
            <ChevronRight size={16} className="text-amber-400 flex-shrink-0" />
          </button>
          <button onClick={onOpenGuide}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 px-1">
            <HelpCircle size={13} /> New here? See how this works →
          </button>
        </div>
      ) : connection?.connected ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-whatsapp-green-fg/20 bg-whatsapp-green-light/30 px-4 py-2.5">
          <CheckCircle2 size={15} className="text-whatsapp-green-fg flex-shrink-0" />
          <p className="text-xs text-neutral-700 flex-1 min-w-0 truncate">
            Connected{connection.number ? ` as +${connection.number}` : ''} · {parentCount} parent{parentCount === 1 ? '' : 's'} reachable
          </p>
          <button onClick={() => onScreen('settings')} className="text-xs font-medium text-whatsapp-green-fg hover:underline flex-shrink-0">Manage</button>
        </div>
      ) : null}

      {/* Laptop: tasks left (2/3), quick links + stats right (1/3). Phone: stacked. */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-5 lg:space-y-0">
        <div className="lg:col-span-2 space-y-5">
          {/* Auto-detected exam results waiting to go out */}
          <PendingActions onReview={onReviewExam} onSent={onSent} />

          {/* The one question: what do you want to send? */}
          <div>
            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-3">What do you want to send?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 lg:gap-3">
              {TASK_CARDS.map(({ id, color, bg, dcolor, dbg }) => {
                const t = TASKS[id];
                const Icon = t.icon;
                return (
                  <button key={id} onClick={() => onTask(id)}
                    className="flex items-center gap-3.5 p-4 lg:p-5 rounded-2xl bg-white border border-[#EBEAE7] hover:border-neutral-300 hover:shadow-sm transition-all text-left">
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: dark ? dbg : bg, color: dark ? dcolor : color }}>
                      <Icon size={20} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-neutral-900">{t.title}</span>
                      <span className="block text-[11px] text-neutral-500 truncate">{t.hint}</span>
                    </span>
                    <ChevronRight size={16} className="text-neutral-300 flex-shrink-0" />
                  </button>
                );
              })}

              {/* Fees — future hook, visibly parked */}
              <div className="flex items-center gap-3.5 p-4 lg:p-5 rounded-2xl bg-white/60 border border-dashed border-[#D9D7D3] text-left opacity-70">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FFEBE5] text-[#C2410C]">
                  <IndianRupee size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-700">Fee Reminder</span>
                  <span className="block text-[11px] text-neutral-400">Monthly fee notices to parents</span>
                </span>
                <Tag color="gray">Coming soon</Tag>
              </div>
            </div>
          </div>
        </div>

        {/* Right rail (stacks below on phones) */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div>
            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-widest mb-3">More</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2.5">
              {Object.entries(SCREENS).map(([id, s]) => (
                <button key={id} onClick={() => onScreen(id)}
                  className="relative flex flex-row items-center justify-start gap-3 py-3 px-3.5 rounded-2xl bg-white border border-[#EBEAE7] hover:bg-[#F4F2EF] transition-colors w-full">
                  <s.icon size={17} className="text-neutral-500 flex-shrink-0" />
                  <span className="text-xs lg:text-sm font-medium text-neutral-600 lg:text-neutral-700 leading-tight text-left">{s.title}</span>
                  {id === 'inbox' && inboxUnread > 0 && (
                    <span className="ml-auto min-w-4 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {inboxUnread > 9 ? '9+' : inboxUnread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Settings (connect via QR + developer config) — carried over ────────────── */
function SettingsScreen({ config, reload, onConnected }) {
  const [conn, setConn] = useState(null);
  const [loadingConn, setLoadingConn] = useState(true);
  const [testNumber, setTestNumber] = useState('');
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  const refreshConn = async () => {
    try { const c = await whatsappApi.getConnection(); setConn(c); return c; }
    catch { setConn({ connected: false, state: 'error' }); return null; }
    finally { setLoadingConn(false); }
  };
  useEffect(() => { refreshConn(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // While waiting for a QR scan, poll so the QR appears and the card flips to
  // "Connected" without a manual reload.
  const connected = conn?.connected;
  useEffect(() => {
    if (connected || loadingConn) return;
    const t = setInterval(refreshConn, 3500);
    return () => clearInterval(t);
  }, [connected, loadingConn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (connected) onConnected?.(); }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Connect WhatsApp": make Baileys the active transport, then start polling for
  // the QR. The backend returns a `qr` data-URL on /connection while pairing.
  const connect = async () => {
    setConnecting(true); setConnectError('');
    try { await whatsappApi.enableBaileys(); await reload?.(); await refreshConn(); }
    catch (e) { setConnectError(e?.message || 'Could not start WhatsApp connection.'); }
    finally { setConnecting(false); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect WhatsApp? Outgoing messages will be buffered until you reconnect.')) return;
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

  const serviceDown = conn?.state === 'service_down';
  const showQr = !connected && !!conn?.qr;

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-neutral-500">Link your WhatsApp once — then every message sends from your own number.</p>

      <div className="rounded-card border border-[#EBEAE7] bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Setup checklist</p>
        <div className="space-y-1.5 text-xs text-neutral-600">
          <p>1. Connect WhatsApp with the QR code.</p>
          <p>2. Add parent numbers in Students.</p>
          <p>3. Send a test to your own number.</p>
          <p>4. Use Send for the first parent message.</p>
        </div>
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
            {(conn.queue_length || conn.outbox_pending || conn.today_count != null) && (
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Today {conn.today_count ?? 0} · queue {conn.queue_length ?? 0} · waiting {conn.outbox_pending ?? 0}
              </p>
            )}
          </div>
          <Btn size="sm" variant="danger" onClick={disconnect} disabled={busy}>Disconnect</Btn>
        </div>
      ) : (
        <div className="rounded-card border border-[#EBEAE7] bg-white p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              {serviceDown ? <WifiOff size={18} /> : <QrCode size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-neutral-800 leading-tight">
                {serviceDown ? 'WhatsApp service offline' : 'Connect WhatsApp'}
              </p>
              <p className="text-xs text-neutral-500">
                {serviceDown
                  ? `The service is unreachable right now. ${conn?.outbox_pending || 0} message(s) are waiting.`
                  : 'Scan one QR code from your institute’s phone — then everything sends from your own number. Free, no Meta setup.'}
              </p>
            </div>
            {!serviceDown && !showQr && (
              <Btn icon={Smartphone} onClick={connect} disabled={connecting}>
                {connecting ? 'Starting…' : 'Connect'}
              </Btn>
            )}
          </div>

          {connectError && <p className="text-xs text-red-600">{connectError}</p>}

          {showQr && (
            <div className="flex flex-col items-center text-center border-t border-[#EFEDEA] pt-4">
              <img src={conn.qr} alt="WhatsApp QR code" width={232} height={232}
                   className="rounded-xl border border-[#EFEDEA]" />
              <p className="text-xs text-neutral-500 mt-3 max-w-xs">
                On your institute’s phone: WhatsApp → <strong>Linked Devices</strong> →
                <strong> Link a device</strong> → scan this code. You only do this once.
              </p>
            </div>
          )}
          {connecting && !showQr && (
            <div className="flex items-center gap-2 text-xs text-neutral-400 border-t border-[#EFEDEA] pt-3">
              <Loader2 className="animate-spin" size={13} /> Waiting for the QR code…
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
          <SlidersHorizontal size={12} /> Advanced — other providers (Meta / WANotifier)
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
    provider: config?.provider || 'baileys',
    api_key: '',
    sender: config?.sender || '',
    meta_access_token: '',
    meta_phone_number_id: config?.meta_phone_number_id || '',
    meta_waba_id: config?.meta_waba_id || '',
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

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (!body.api_key) delete body.api_key;                 // keep stored secret if blank
      if (!body.meta_access_token) delete body.meta_access_token;
      await whatsappApi.setConfig(body);
      await reload();
      setForm(f => ({ ...f, api_key: '', meta_access_token: '' }));
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
          <option value="baileys">WhatsApp QR — your own number (recommended, free)</option>
          <option value="meta">Meta WhatsApp Cloud API (official, paid)</option>
          <option value="wanotifier">WANotifier</option>
        </select>
        <p className="text-[11px] text-neutral-400 mt-1">
          Most institutes use the free QR option — connect it from the card above. Pick Meta only if you need official, billable template messaging.
        </p>
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
      {form.provider === 'baileys' && (
        <div className="glass-panel border border-whatsapp-green-fg/20 bg-whatsapp-green-light/10 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
            <CheckCircle2 size={16} className="text-whatsapp-green-fg" /> Free QR transport (recommended)
          </p>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Sends from your institute’s own paired WhatsApp number — no per-message cost, no Meta setup.
            Connect or disconnect it from the <strong>Connect WhatsApp</strong> card at the top of this page.
          </p>
        </div>
      )}

      {form.provider === 'meta' && (
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Per-message rates ({form.currency})</label>
          <div className="grid grid-cols-3 gap-2">
            {['utility', 'marketing', 'auth'].map(k => (
              <Input key={k} label={k} type="number" value={form.rates[k]}
                onChange={(e) => set({ rates: { ...form.rates, [k]: Number(e.target.value) } })} />
            ))}
          </div>
        </div>
      )}

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
