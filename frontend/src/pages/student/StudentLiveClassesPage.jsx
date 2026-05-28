import React, { useState, useEffect } from 'react';
import { Video, Calendar, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Btn, Tag } from '../../components/ui';
import TopBar from '../../components/shared/TopBar';
import { liveClassApi, apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView from '../../components/ZoomMeetingView';

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

function fmtCountdown(ms) {
  if (ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

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
          <div className="space-y-3">
            {liveClasses.map(lc => {
              const isLive = lc.status === 'live';
              const isScheduled = lc.status === 'scheduled';
              const isEnded = lc.status === 'ended';
              const msUntilStart = new Date(lc.scheduled_at) - now;
              const within5min = msUntilStart > 0 && msUntilStart <= 300000;

              return (
                <div key={lc.id} className="p-4 rounded-xl glass-panel border-white/60 shadow-sm space-y-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-neutral-900 truncate mb-0.5">{lc.title}</h3>
                    {lc.subject && (
                      <p className="text-xs text-neutral-500 mb-2">{lc.subject.name}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {fmtDateTime(lc.scheduled_at)}
                      </span>
                      {lc.duration_mins > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {lc.duration_mins} min
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isLive && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Live now
                        </span>
                        <Btn size="sm" variant="primary" onClick={() => handleJoin(lc)}>
                          Join class
                        </Btn>
                      </>
                    )}

                    {isScheduled && within5min && (
                      <>
                        <Tag color="amber">Starting soon</Tag>
                        <Btn size="sm" variant="primary" onClick={() => handleJoin(lc)}>
                          Join class
                        </Btn>
                      </>
                    )}

                    {isScheduled && !within5min && (
                      <span className="text-xs font-medium text-amber-700">
                        {fmtCountdown(msUntilStart)}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
