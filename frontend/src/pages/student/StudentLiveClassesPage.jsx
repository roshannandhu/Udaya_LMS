import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Btn } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView from '../../components/ZoomMeetingView';
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

export default function StudentLiveClassesPage() {
  const { user } = useAuthStore();
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeJoin, setActiveJoin] = useState(null);
  const [now, setNow] = useState(Date.now());

  const standardId = user?.standard_id;

  const fetchAll = async () => {
    if (!standardId) { setLoading(false); return; }
    setLoading(true);
    try {
      const subs = await apiClient(`/subjects?standard_id=${standardId}`).catch(() => []);
      const mySubjects = Array.isArray(subs) ? subs : [];

      const results = await Promise.allSettled(
        mySubjects.map(s => liveClassApi.getByClass(s.id).then(data => ({ s, data: Array.isArray(data) ? data : [] })))
      );
      const all = results.flatMap(r =>
        r.status === 'fulfilled'
          ? r.value.data.map(lc => ({ ...lc, subject: r.value.s }))
          : []
      );
      const filtered = all.filter(lc => lc.status !== 'cancelled');
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

  // Refresh list + clock every 60s so students see "Live" status when teacher starts.
  // Skip the network fetch while the tab is hidden to avoid background fan-out calls.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) fetchAll();
    }, 60000);
    return () => clearInterval(id);
  }, [standardId]);

  const handleJoin = async (lc) => {
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) {
      alert(err?.message || 'Failed to join class.');
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
    <div className="pb-28">
      <TopBar title="Live Classes" />

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-neutral-400" size={24} />
          </div>
        ) : liveClasses.length === 0 ? (
          <div className="text-center py-24">
            <Video size={32} className="mx-auto mb-3 text-neutral-400" />
            <h3 className="font-medium text-neutral-700 mb-1">No live classes</h3>
            <p className="text-sm text-neutral-500">Live classes from your teachers will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveClasses.map(lc => {
              const isLive = lc.status === 'live';
              const isScheduled = lc.status === 'scheduled';
              const isEnded = lc.status === 'ended';

              return (
                <div key={lc.id} className="rounded-xl glass-panel border-white/60 shadow-sm overflow-hidden flex flex-col">
                  <LiveClassThumbnail
                    thumbnailUrl={lc.thumbnail_url}
                    textSide={lc.thumbnail_text_side}
                    subjectName={lc.subject?.name}
                    standardName={user?.standard_name}
                    topic={lc.title}
                    status={lc.status}
                    scheduledAt={lc.scheduled_at}
                  />

                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2">{lc.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500">
                      {lc.subject && <span className="truncate max-w-full">{lc.subject.name}</span>}
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {fmtDateTime(lc.scheduled_at)}
                      </span>
                      {lc.duration_mins > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {lc.duration_mins} min
                        </span>
                      )}
                    </div>

                  {/* Status + actions */}
                  <div className="mt-auto flex items-center gap-2 flex-wrap pt-1">
                    {isLive && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Live now
                        </span>
                        <Btn size="sm" variant="primary" onClick={() => handleJoin(lc)}>
                          Watch live class
                        </Btn>
                      </>
                    )}

                    {isScheduled && (
                      <span className="text-xs font-medium text-amber-700">
                        Class has not started yet
                      </span>
                    )}

                    {isEnded && lc.my_attended === true && (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle size={12} />
                        You attended ✓
                      </span>
                    )}
                    {isEnded && lc.my_attended === false && (
                      <span className="flex items-center gap-1 text-xs font-medium text-neutral-500">
                        <XCircle size={12} />
                        You missed this class
                      </span>
                    )}
                    {isEnded && lc.my_attended == null && (
                      <span className="text-xs text-neutral-400">Class ended</span>
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
