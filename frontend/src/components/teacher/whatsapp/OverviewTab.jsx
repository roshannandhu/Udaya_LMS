import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, CheckCheck, Eye, XCircle, Wallet, Clock } from 'lucide-react';
import StatCard from '../../cards/StatCard';
import { Tag, Toggle, Skeleton } from '../../ui';
import { staggerChildren } from '../../../lib/motion';
import { whatsappApi } from '../../../lib/api';
import MessagePerformanceDonut from './MessagePerformanceDonut';
import QuickActions from './QuickActions';
import RecentMessagesTable, { fmtDate } from './RecentMessagesTable';

export default function OverviewTab({ onNavigate, currency = 'INR' }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setStats(await whatsappApi.getStats()); }
    catch { setStats(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleJob = async (id) => { try { await whatsappApi.toggleJob(id); load(); } catch { /* ignore */ } };

  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const totals = stats?.totals || { total: 0, delivered: 0, read: 0, failed: 0 };
  const spend = stats?.spend || { month: 0, total: 0, currency };
  const jobs = stats?.jobs || [];
  const cur = (n) => `₹${Number(n || 0).toFixed(2)}`;

  return (
    <div className="space-y-5">
      {/* Spend pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium bg-whatsapp-green-light text-whatsapp-green-fg">
          <Wallet size={13} /> This month: {cur(spend.month)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-medium bg-white border border-[#EBEAE7] text-neutral-600">
          Total spend: {cur(spend.total)}
        </span>
      </div>

      {/* KPI cards */}
      <motion.div initial="hidden" animate="show" variants={staggerChildren}
        className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={totals.total}     label="Total messages" icon={Send}       color="whatsapp" emphasis />
        <StatCard value={totals.delivered} label="Delivered"      icon={CheckCheck} color="sky" />
        <StatCard value={totals.read}      label="Read"           icon={Eye}        color="mint" />
        <StatCard value={totals.failed}    label="Failed"         icon={XCircle}    color="peach" />
      </motion.div>

      {/* Donut + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MessagePerformanceDonut performance={stats?.performance || []} />
        <QuickActions onAction={onNavigate} />
      </div>

      {/* Recent messages */}
      <RecentMessagesTable messages={stats?.recent || []} />

      {/* Automation rules summary */}
      <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Automation rules</h3>
          <button onClick={() => onNavigate?.('automation')}
            className="text-xs text-whatsapp-green-fg font-medium hover:underline">Manage</button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-neutral-400">No automatic jobs yet.</p>
        ) : (
          <div className="space-y-1">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 py-1.5">
                <Clock size={14} className="text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{j.name}</p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {j.trigger_type === 'interval' ? `Every ${j.trigger_config?.every || '—'}` : j.trigger_type}
                    {' · next: '}{fmtDate(j.next_run_at)}
                  </p>
                </div>
                <Tag color={j.active ? 'green' : 'gray'}>{j.active ? 'On' : 'Off'}</Tag>
                <Toggle checked={j.active} onChange={() => toggleJob(j.id)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
