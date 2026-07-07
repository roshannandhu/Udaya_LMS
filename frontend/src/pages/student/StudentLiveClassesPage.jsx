import React, { useState, useEffect, useRef } from 'react';
import { Video, Calendar, Clock, CheckCircle, XCircle, Loader2, Play, X } from 'lucide-react';
import { Btn } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useWhatsNew, isNewSince } from '../../store';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassCard from '../../components/cards/LiveClassCard';
import { AnimatedPage, Item } from '../../components/bits';

function pad(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function LiveCountdown({ scheduledAt, isLive, isEnded }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (isLive || isEnded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive, isEnded]);

  if (isLive) return 'Live Now';
  if (isEnded) return 'Ended';

  const msUntil = scheduledAt ? new Date(scheduledAt).getTime() - now : 0;
  if (msUntil <= 0) return 'Starting…';

  return formatCountdown(msUntil) + ' to start';
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const CARD_COLORS = [
  { bg: 'bg-[#EAF3EB]', text: 'text-green-950', badge: 'bg-green-100 text-green-800' },
  { bg: 'bg-[#F8E1FB]', text: 'text-purple-950', badge: 'bg-purple-100 text-purple-800' },
  { bg: 'bg-[#FFF6D8]', text: 'text-amber-950', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-[#E5F2FE]', text: 'text-blue-950', badge: 'bg-blue-100 text-blue-800' },
  { bg: 'bg-[#FFEBE5]', text: 'text-orange-950', badge: 'bg-orange-100 text-orange-800' }
];

let liveClassesCache = null; // { userId, list }

export default function StudentLiveClassesPage() {
  const { user } = useAuthStore();
  // The module cache outlives logins — only trust it for the same account.
  const cache = liveClassesCache && liveClassesCache.userId === user?.id ? liveClassesCache : null;
  const [liveClasses, setLiveClasses] = useState(cache?.list || []);
  const [loading, setLoading] = useState(!cache);
  const [activeJoin, setActiveJoin] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  // A class that just flipped to LIVE over the WebSocket → drives the one-tap
  // "Join now" banner so the student doesn't have to hunt for the card.
  const [justLiveId, setJustLiveId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const fetchSeq = useRef(0);
  // True once we've shown a list at least once (from cache or a successful fetch).
  // Read inside fetchAll so BACKGROUND refreshes (the 15s interval / focus) never
  // flip `loading` back on — flashing the spinner would unmount the card grid and
  // replay AnimatedPage's entrance stagger, which is the "cards flicker every few
  // seconds" the user saw. A ref (stable identity, read at call time) sidesteps the
  // stale-closure bug where the interval captured the first render's `cache` (null).
  const hydratedRef = useRef(!!cache);

  const standardId = user?.standard_id;

  // NEW pills compare against the session baseline; visiting clears the nav badge.
  const prevSeen = useWhatsNew(s => s.prevSeen);
  useEffect(() => { useWhatsNew.getState().markSeen('live'); }, []);

  const fetchAll = async () => {
    if (!standardId) { setLoading(false); return; }
    const seq = ++fetchSeq.current; // ignore out-of-order responses
    if (!hydratedRef.current) setLoading(true);
    try {
      // Single call for all live classes in the student's standard.
      // null = request failed — keep showing the last good list instead of
      // flashing the "No live classes" empty state on a transient error.
      const data = await apiClient(`/live-classes?standard_id=${standardId}`).catch(() => null);
      if (seq !== fetchSeq.current) return;
      if (data === null) return;
      const all = Array.isArray(data) ? data : [];
      const filtered = all
        .filter(lc => lc.status !== 'cancelled')
        .map(lc => ({ ...lc, subject: { id: lc.class_id, name: lc.class_name || '' } }));
      filtered.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setLiveClasses(filtered);
      hydratedRef.current = true; // from now on, refreshes update in place (no spinner)
      liveClassesCache = { userId: user?.id, list: filtered };
      // Re-arm on-device full-screen alarms whenever the list changes (new/edited classes).
      import('../../lib/liveAlarms').then(m => m.syncLiveAlarms()).catch(() => {});
    } catch (err) {
      console.error(err);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [standardId]);

  // Warm the Zoom SDK in the background so the first "Watch" click is instant.
  useEffect(() => {
    const ric = window.requestIdleCallback
      ? window.requestIdleCallback.bind(window)
      : (fn) => setTimeout(fn, 1500);
    const cancel = window.cancelIdleCallback
      ? window.cancelIdleCallback.bind(window)
      : clearTimeout;
    const id = ric(() => preloadZoomSDK());
    return () => cancel(id);
  }, []);

  // Real-time: the global useLiveClassEvents hook opens ONE WebSocket and fires a
  // `live-class-update` window event. Flip the matching card instantly; if the
  // update is for a class we don't have yet (scheduled after this page loaded),
  // pull the list in place (no spinner). Returning to the tab reconciles too, so
  // newly-scheduled classes appear without a manual refresh.
  useEffect(() => {
    const handleUpdate = (e) => {
      const { id, status } = e.detail || {};
      if (!id) return;
      let known = false;
      setLiveClasses(prev => {
        known = prev.some(lc => lc.id === id);
        return known ? prev.map(lc => (lc.id === id ? { ...lc, status } : lc)) : prev;
      });
      if (!known) fetchAll();                       // unknown class → reconcile (in place)
      if (status === 'live') setJustLiveId(id);     // surface the "Join now" banner
      if (status === 'ended') setJustLiveId(prev => (prev === id ? null : prev));
    };
    const onFocus = () => { if (!document.hidden) fetchAll(); };

    window.addEventListener('live-class-update', handleUpdate);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    // Update the clock every second for countdowns
    const clockId = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.removeEventListener('live-class-update', handleUpdate);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(clockId);
    };
  }, []);

  const handleJoin = async (lc) => {
    if (joiningId) return;            // ignore double-clicks while a join is in flight
    setJustLiveId(null);             // dismiss the "Join now" banner once acted on
    setJoiningId(lc.id);
    preloadZoomSDK();                 // start the 5.6 MB SDK download NOW, in parallel with the token fetch
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      // Token issued ⇒ Zoom confirmed the meeting is live; reflect locally so the
      // card shows LIVE when the student leaves the meeting view.
      setLiveClasses(prev => prev.map(c => c.id === lc.id ? { ...c, status: 'live' } : c));
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) {
      alert(err?.message || 'Failed to join class.');
    } finally {
      setJoiningId(null);
    }
  };

  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 0}
        display_name={user?.name || 'Student'}
        passcode={activeJoin.passcode}
        zak={activeJoin.zak}
        viewerRole="student"
        onLeave={() => { setActiveJoin(null); setJustLiveId(null); fetchAll(); }}
      />
    );
  }

  // The class that just went live (if it's still live and in our list) → banner.
  const justLiveClass = justLiveId
    ? liveClasses.find(lc => lc.id === justLiveId && lc.status === 'live')
    : null;

  return (
    <div className="bg-[#FAFAF9]">
      <TopBar title="Live Classes" />

      <div className="px-5 md:px-8 pt-8 pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-8 max-w-6xl mx-auto">
        {/* Auto-open prompt: a class just went live → one tap to join. (True silent
            auto-join isn't possible — Zoom needs a user gesture for audio.) */}
        {justLiveClass && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 shadow-sm">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-extrabold text-red-700 uppercase tracking-wide leading-none">Class is live</p>
              <p className="text-sm font-bold text-neutral-900 truncate mt-0.5">{justLiveClass.title}</p>
            </div>
            <button
              onClick={() => handleJoin(justLiveClass)}
              disabled={joiningId === justLiveClass.id}
              className="shrink-0 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold shadow-sm transition-colors disabled:opacity-60 flex items-center gap-1.5">
              {joiningId === justLiveClass.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
              Join now
            </button>
            <button onClick={() => setJustLiveId(null)} className="shrink-0 p-1.5 text-red-400 hover:text-red-700 rounded-full" title="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-neutral-400" size={24} />
          </div>
        ) : liveClasses.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[32px] shadow-sm">
            <Video size={32} className="mx-auto mb-3 text-neutral-400" />
            <h3 className="font-medium text-neutral-700 mb-1">No live classes</h3>
            <p className="text-sm text-neutral-500">Live classes from your teachers will appear here.</p>
          </div>
        ) : (
          <AnimatedPage className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveClasses.map((lc, idx) => {
              const isLive = lc.status === 'live';
              const isScheduled = lc.status === 'scheduled';
              const isEnded = lc.status === 'ended';
              const theme = CARD_COLORS[idx % CARD_COLORS.length];

              return (
                <Item key={lc.id} className="relative">
                  {!isEnded && isNewSince(lc.created_at, prevSeen.live) && (
                    <span className="absolute -top-2 -right-2 z-20 bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md pointer-events-none">
                      New
                    </span>
                  )}
                <LiveClassCard
                  lc={lc}
                  onClick={handleJoin}
                  joiningId={joiningId}
                  themeIndex={idx}
                  avatars={
                    <div className="flex -space-x-3">
                      <img src={`https://i.pravatar.cc/100?u=${lc.id}1`} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white shadow-sm relative z-[3]" alt="" />
                      <img src={`https://i.pravatar.cc/100?u=${lc.id}2`} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white shadow-sm relative z-[2]" alt="" />
                      <img src={`https://i.pravatar.cc/100?u=${lc.id}3`} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white shadow-sm relative z-[1]" alt="" />
                    </div>
                  }
                />
                </Item>
              );
            })}
          </AnimatedPage>
        )}
      </div>
    </div>
  );
}
