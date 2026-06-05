import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Btn } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassThumbnail from '../../components/LiveClassThumbnail';

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

export default function StudentLiveClassesPage() {
  const { user } = useAuthStore();
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeJoin, setActiveJoin] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const [now, setNow] = useState(Date.now());

  const standardId = user?.standard_id;

  const fetchAll = async () => {
    if (!standardId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Single call for all live classes in the student's standard
      const data = await apiClient(`/live-classes?standard_id=${standardId}`).catch(() => []);
      const all = Array.isArray(data) ? data : [];
      const filtered = all
        .filter(lc => lc.status !== 'cancelled')
        .map(lc => ({ ...lc, subject: { id: lc.class_id, name: lc.class_name || '' } }));
      filtered.sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
      setLiveClasses(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  // Refresh list + clock every 15s — list is now fast (DB only, no Zoom calls).
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) fetchAll();
    }, 15000);
    return () => clearInterval(id);
  }, [standardId]);

  const handleJoin = async (lc) => {
    if (joiningId) return;            // ignore double-clicks while a join is in flight
    setJoiningId(lc.id);
    preloadZoomSDK();                 // start the 5.6 MB SDK download NOW, in parallel with the token fetch
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
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
        onLeave={() => { setActiveJoin(null); fetchAll(); }}
      />
    );
  }

  return (
    <div className="pb-28 min-h-screen bg-[#F4F7F6]">
      <TopBar title="Live Classes" />

      <div className="px-5 md:px-8 py-8 max-w-6xl mx-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveClasses.map((lc, idx) => {
              const isLive = lc.status === 'live';
              const isScheduled = lc.status === 'scheduled';
              const isEnded = lc.status === 'ended';
              const theme = CARD_COLORS[idx % CARD_COLORS.length];

              return (
                <div key={lc.id} className={`rounded-[32px] ${theme.bg} flex flex-col transition-transform hover:-translate-y-1 hover:shadow-md`}>
                  <div className="p-2">
                    <LiveClassThumbnail
                      thumbnailUrl={lc.thumbnail_url}
                      textSide={lc.thumbnail_text_side}
                      subjectName={lc.subject?.name}
                      standardName={user?.standard_name}
                      topic={lc.title}
                      status={lc.status}
                      scheduledAt={lc.scheduled_at}
                      className="rounded-[24px]"
                    />
                  </div>

                  <div className="px-6 pb-6 pt-2 flex flex-col gap-3 flex-1">
                    <div>
                      <h3 className={`text-[19px] font-bold ${theme.text} leading-tight line-clamp-2 mb-2`}>{lc.title}</h3>
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-black/40 flex-wrap">
                        {lc.subject && <span className="bg-white/50 px-2 py-0.5 rounded-full">{lc.subject.name}</span>}
                        <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">
                          <Calendar size={12} />
                          {fmtDateTime(lc.scheduled_at)}
                        </span>
                        {lc.duration_mins > 0 && (
                          <span className="flex items-center gap-1 bg-white/50 px-2 py-0.5 rounded-full">
                            <Clock size={12} />
                            {lc.duration_mins} min
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status + actions */}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        {isLive && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full bg-white text-green-600 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            Live now
                          </span>
                        )}
                        {isScheduled && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-white/50 text-black/50">
                            Scheduled
                          </span>
                        )}
                        {isEnded && lc.my_attended === true && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-white text-green-600 shadow-sm">
                            <CheckCircle size={14} />
                            Attended
                          </span>
                        )}
                        {isEnded && lc.my_attended === false && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-white/50 text-black/50">
                            <XCircle size={14} />
                            Missed
                          </span>
                        )}
                        {isEnded && lc.my_attended == null && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-white/50 text-black/50">
                            Ended
                          </span>
                        )}
                      </div>

                      {isLive && (
                        <button 
                          onClick={() => handleJoin(lc)} 
                          disabled={joiningId === lc.id}
                          className="bg-black text-white px-4 py-2 rounded-full text-[13px] font-semibold shadow-md hover:bg-neutral-800 transition-colors flex items-center gap-1.5"
                        >
                          {joiningId === lc.id
                            ? <><Loader2 size={14} className="animate-spin" /> Opening…</>
                            : 'Watch'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
