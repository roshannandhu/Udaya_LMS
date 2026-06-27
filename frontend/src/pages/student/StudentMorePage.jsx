import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAssignment, MdEmojiEvents, MdBarChart, MdChevronRight, MdNotificationsActive } from 'react-icons/md';
import { Loader2 } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { AnimatedPage, Item, Pressable, SpotlightCard } from '../../components/bits';
import ThemeToggle from '../../components/shared/ThemeToggle';
import { getPushStatus, enablePush } from '../../lib/push';

function NotificationsCard() {
  const [status, setStatus] = useState(() => getPushStatus());
  const [busy, setBusy] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);

  useEffect(() => {
    const onStatus = () => setStatus(getPushStatus());
    window.addEventListener('udaya:push-status', onStatus);
    return () => window.removeEventListener('udaya:push-status', onStatus);
  }, []);

  if (!status.supported) return null;  // web/iOS — only meaningful in the Android app

  const on = status.registered && status.permission === 'granted';
  const handle = async () => {
    setBusy(true); setNeedsSettings(false);
    try {
      const res = await enablePush();
      setStatus(getPushStatus());
      if (res?.needsSettings) setNeedsSettings(true);
    } finally { setBusy(false); }
  };

  return (
    <Item>
      <div className="glass-panel px-4 py-3 rounded-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MdNotificationsActive className={`w-5 h-5 flex-shrink-0 ${on ? 'text-emerald-600' : 'text-neutral-500'}`} />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-neutral-800">Notifications</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {on ? 'On — this device will receive alerts'
                    : status.permission === 'denied' ? 'Blocked in phone settings'
                    : 'Off — tap enable to receive alerts'}
              </p>
            </div>
          </div>
          {on ? (
            <span className="text-xs font-bold text-emerald-600 flex-shrink-0">Enabled</span>
          ) : (
            <button onClick={handle} disabled={busy}
              className="flex-shrink-0 px-3 py-1.5 rounded-full bg-neutral-900 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1">
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Enable
            </button>
          )}
        </div>
        {needsSettings && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
            Notifications are blocked. Open phone Settings → Apps → Udaya → Notifications and turn them on.
          </p>
        )}
        {status.error && !on && (
          <p className="text-[11px] text-neutral-400 mt-2 break-all">Status: {status.error}</p>
        )}
      </div>
    </Item>
  );
}

export default function StudentMorePage() {
  const navigate = useNavigate();

  const items = [
    { icon: MdAssignment, label: 'Tests',       sub: 'Take tests and view results',       onClick: () => navigate('/student/tests') },
    { icon: MdEmojiEvents,       label: 'Leaderboard', sub: 'View class rankings',               onClick: () => navigate('/student/leaderboard') },
    { icon: MdBarChart,     label: 'Report Card', sub: 'View your performance report card', onClick: () => navigate('/student/report') },
  ];

  return (
    <div className="min-h-screen bg-transparent pb-28">
      <TopBar title="Explore More" showSearch={false} />
      <AnimatedPage className="p-4 space-y-3 max-w-xl mx-auto">
        <NotificationsCard />
        {items.map((item, i) => (
          <Item key={i}>
            <SpotlightCard className="rounded-card">
              <Pressable as="button" onClick={item.onClick}
                className="w-full glass-panel flex items-center gap-3 px-4 py-4 hover:bg-[#F4F2EF] transition-colors text-left">
                <div className="w-8 flex items-center justify-center flex-shrink-0 mr-1">
                  <item.icon className="w-5 h-5 text-neutral-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-neutral-800">{item.label}</p>
                  {item.sub && <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>}
                </div>
                <MdChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
              </Pressable>
            </SpotlightCard>
          </Item>
        ))}

        <Item>
          <div className="glass-panel flex items-center justify-between px-4 py-3 rounded-card">
            <div>
              <p className="font-semibold text-sm text-neutral-800">Appearance</p>
              <p className="text-xs text-neutral-500 mt-0.5">Switch between light and dark</p>
            </div>
            <ThemeToggle showLabel className="" />
          </div>
        </Item>
      </AnimatedPage>
    </div>
  );
}
