import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, MessageSquare, ListOrdered, Wifi, WifiOff } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Btn, Tag, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient('/whatsapp/status');
      setData(res);
    } catch (err) {
      setError(err?.message || 'Failed to load WhatsApp status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient('/whatsapp/status');
        if (alive) setData(res);
      } catch (err) {
        if (alive) setError(err?.message || 'Failed to load WhatsApp status');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const connected = !!data?.connected;

  return (
    <div className="pb-24">
      <TopBar
        title="WhatsApp Status"
        subtitle="Parent notification service"
        action={
          <Btn variant="default" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>
            Refresh
          </Btn>
        }
      />

      <div className="px-5 md:px-8 max-w-5xl mx-auto space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading && !data ? (
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
                  {connected ? 'Connected' : 'Not configured'}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {connected
                    ? `Provider: ${data.provider || '—'} · ready to send to parents`
                    : 'Set up a provider in WhatsApp → Settings before sending.'}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                icon={MessageSquare}
                label="Messages today"
                value={data.today_count ?? 0}
                sub={`Daily limit: ${data.daily_limit ?? '—'}`}
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
