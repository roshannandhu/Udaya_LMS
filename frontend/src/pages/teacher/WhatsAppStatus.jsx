import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, MessageSquare, ListOrdered, Wifi, WifiOff, QrCode, Smartphone, Loader2, LogIn } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Tag, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';

// An error whose message indicates the session/token was rejected (401). apiClient
// throws "Session expired…" on a 401 it can't refresh; treat that distinctly so the
// page says "log in again" instead of pretending it's still generating a QR.
const isAuthError = (msg) => /session expired|log in again|unauthorized|401/i.test(msg || '');

// Status → dot colour, mirrors MessagePerformanceDonut so the whole WhatsApp
// module reads consistently.
const STATUS_COLOR = {
  delivered: '#0F7B6C',
  read: '#25D366',
  sent: '#2383E2',
  queued: '#B7791F',
  failed: '#C2410C',
  not_configured: '#9CA3AF',
};

function StatusDot({ status }) {
  const color = STATUS_COLOR[status] || '#9CA3AF';
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />;
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-[#EFEDEA] rounded-2xl p-4 shadow-card">
      <div className="flex items-center gap-2 text-neutral-500 text-xs font-medium mb-2">
        <Icon size={15} strokeWidth={2} />
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function WhatsAppStatus() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authError, setAuthError] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const aliveRef = useRef(true);
  // When the awaiting-QR spinner first appears — used to flip to a "taking too long"
  // hint instead of spinning forever when the service never emits a QR.
  const [qrWaitSince, setQrWaitSince] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchStatus = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await apiClient('/whatsapp/status');
      if (aliveRef.current) { setData(res); setError(null); setAuthError(false); }
    } catch (err) {
      if (aliveRef.current) {
        const msg = err?.message || 'Failed to load WhatsApp status';
        setError(msg);
        // A rejected session must NOT keep showing stale "connected/QR" data —
        // surface it so the card shows "log in again" instead of a fake spinner.
        if (isAuthError(msg)) { setAuthError(true); setData(null); }
      }
    } finally {
      if (aliveRef.current && showSpinner) setLoading(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    aliveRef.current = true;
    fetchStatus(true).finally(() => { if (aliveRef.current) setLoading(false); });
    return () => { aliveRef.current = false; };
  }, [fetchStatus]);

  // While not connected (e.g. waiting for a QR scan), poll every 4s so the dot
  // flips to green and the QR refreshes/clears without a manual reload. Stop
  // polling once the session is rejected — re-login is required, not a retry.
  const connected = !!data?.connected;
  const isBaileys = data?.provider === 'baileys';
  useEffect(() => {
    if (connected || authError) return;
    const t = setInterval(() => fetchStatus(false), 4000);
    return () => clearInterval(t);
  }, [connected, authError, fetchStatus]);

  const enableBaileys = async () => {
    setEnabling(true);
    try {
      await apiClient('/whatsapp/enable-baileys', { method: 'POST' });
      await fetchStatus(true);
    } catch (err) {
      setError(err?.message || 'Could not enable Baileys');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect WhatsApp? Outgoing messages will be buffered.')) return;
    setDisconnecting(true);
    try {
      await apiClient('/teacher/whatsapp/disconnect', { method: 'POST' });
      await fetchStatus(true);
    } catch (err) {
      alert(err.message || 'Could not disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const serviceDown = !!data?.service_down;
  const showQr = isBaileys && !connected && !!data?.qr;
  const awaitingQr = isBaileys && !connected && !serviceDown && !data?.qr && !authError;
  const needsEnable = data && data.provider !== 'baileys' && !authError;

  // Track how long we've been waiting for a QR so the spinner can become a hint
  // ("taking longer than expected") rather than spin forever.
  useEffect(() => {
    if (awaitingQr) setQrWaitSince((s) => s ?? Date.now());
    else setQrWaitSince(null);
  }, [awaitingQr]);
  useEffect(() => {
    if (!awaitingQr) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [awaitingQr]);
  const qrSlow = awaitingQr && qrWaitSince && (now - qrWaitSince > 20000);

  const goLogin = () => {
    try { window.dispatchEvent(new CustomEvent('auth:logout')); } catch { /* ignore */ }
    navigate('/login');
  };

  return (
    <div className="pb-24">
      <TopBar
        title="WhatsApp Status"
        subtitle="Parent notification service"
        action={
          <Btn variant="default" size="sm" icon={RefreshCw} onClick={() => fetchStatus(true)} disabled={loading}>
            Refresh
          </Btn>
        }
      />

      <div className="px-3 md:px-8 max-w-5xl mx-auto space-y-4">
        {/* Non-auth errors get a thin inline banner; auth errors get the full card below. */}
        {error && !authError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {authError ? (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-card flex flex-col items-center text-center">
            <span className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <LogIn size={22} />
            </span>
            <p className="font-semibold text-neutral-800">Your session has expired</p>
            <p className="text-sm text-neutral-500 mt-1 max-w-sm">
              Please log in again to load the WhatsApp connection and QR code.
            </p>
            <Btn variant="primary" size="sm" icon={LogIn} onClick={goLogin} className="mt-4">
              Log in again
            </Btn>
          </div>
        ) : loading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : data ? (
          <>
            {/* Connection banner */}
            <div className="bg-white border border-[#EFEDEA] rounded-2xl p-4 shadow-card flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-full"
                style={{ background: connected ? '#E7F6EC' : '#FBE9E7' }}
              >
                {connected
                  ? <Wifi size={18} className="text-[#0F7B6C]" />
                  : <WifiOff size={18} className="text-[#C2410C]" />}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <span className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: connected ? '#25D366' : '#C2410C' }} />
                  {connected ? 'Connected' : (data.service_down ? 'Service offline' : 'Not connected')}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {connected
                    ? `Provider: ${data.provider || '—'} · ready to send to parents`
                    : data.service_down
                      ? 'The WhatsApp microservice is unreachable. Messages are buffered until it returns.'
                      : isBaileys
                        ? 'Scan the QR below from your dedicated WhatsApp number to connect.'
                        : 'No WhatsApp transport is active yet.'}
                </div>
              </div>
              {needsEnable && (
                <Btn variant="primary" size="sm" icon={Smartphone} onClick={enableBaileys} disabled={enabling}>
                  {enabling ? 'Enabling…' : 'Connect WhatsApp'}
                </Btn>
              )}
              {connected && isBaileys && (
                <Btn variant="danger" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </Btn>
              )}
            </div>

            {/* QR pairing card — shown only when actually waiting for / showing a QR.
                Service-down gets its own message (no fake "Generating QR" spinner). */}
            {(showQr || awaitingQr) && (
              <div className="bg-white border border-[#EFEDEA] rounded-2xl p-5 shadow-card flex flex-col items-center text-center">
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <QrCode size={16} /> Scan to connect
                </div>
                {showQr ? (
                  <>
                    <img src={data.qr} alt="WhatsApp QR code" width={240} height={240}
                         className="rounded-xl border border-[#EFEDEA]" />
                    <p className="text-xs text-neutral-500 mt-3 max-w-xs">
                      On your <strong>dedicated</strong> phone: WhatsApp → <strong>Linked Devices</strong> →
                      Link a device → scan this code. You only do this once.
                    </p>
                  </>
                ) : (
                  <div className="w-[240px] h-[240px] bg-neutral-50 rounded-xl border border-[#EFEDEA] flex flex-col items-center justify-center p-4">
                    <Loader2 className="animate-spin text-neutral-400 mb-2" size={24} />
                    <p className="text-xs text-neutral-500">Generating QR code…</p>
                    {qrSlow ? (
                      <p className="text-[10px] text-neutral-400 mt-1 max-w-[200px]">
                        Taking longer than expected — make sure the WhatsApp service is running, then tap Refresh.
                      </p>
                    ) : (
                      <p className="text-[10px] text-neutral-400 mt-1 max-w-[200px]">Waiting for the WhatsApp service to start pairing.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Service offline — explicit, instead of a misleading QR spinner. */}
            {serviceDown && !connected && (
              <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-card flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <WifiOff size={18} />
                </span>
                <p className="text-sm text-neutral-600">
                  The WhatsApp service is offline. Outgoing messages are buffered and will send once it’s back.
                </p>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                icon={MessageSquare}
                label="Messages today"
                value={data.today_count ?? 0}
                sub={`Limit: ${data.warmup_limit ?? data.daily_limit ?? '—'}${data.warmup_limit ? ' (warm-up)' : ''}`}
              />
              <StatCard
                icon={ListOrdered}
                label="Queue length"
                value={data.queue_length ?? 0}
                sub="Messages waiting to send"
              />
            </div>

            {/* Recent log */}
            <div className="bg-white border border-[#EFEDEA] rounded-2xl shadow-card overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EFEDEA] flex items-center justify-between">
                <span className="font-medium text-sm">Recent messages</span>
                <span className="text-xs text-neutral-400">last 20</span>
              </div>
              {(!data.recent || data.recent.length === 0) ? (
                <div className="px-4 py-10 text-center text-sm text-neutral-400">
                  No messages sent yet.
                </div>
              ) : (
                <ul className="divide-y divide-[#F2F0ED]">
                  {data.recent.map((m, i) => (
                    <li key={i} className="px-4 py-3 flex items-start gap-3">
                      <span className="mt-1.5"><StatusDot status={m.status} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{m.to_phone || '—'}</span>
                          {m.template_name && <Tag color="gray">{m.template_name}</Tag>}
                        </div>
                        <div className="text-xs text-neutral-500 truncate mt-0.5">
                          {m.preview || ''}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-medium capitalize text-neutral-600">
                          {(m.status || '').replace('_', ' ')}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">{fmtTime(m.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
