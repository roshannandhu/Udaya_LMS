import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { Sheet, Avatar, Skeleton } from '../ui';
import { liveClassApi } from '../../lib/api';

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function LiveClassAttendanceSheet({ liveClassId, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!liveClassId) return;
    setLoading(true);
    liveClassApi.getAttendance(liveClassId)
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [liveClassId]);

  const attended = records.filter(r => r.attended);
  const absent   = records.filter(r => !r.attended);

  return (
    <Sheet open={!!liveClassId} onClose={onClose} title="Attendance">
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-5 text-sm">
            <span className="text-green-700 font-medium">{attended.length} attended</span>
            <span className="text-neutral-300">·</span>
            <span className="text-red-600 font-medium">{absent.length} absent</span>
          </div>

          <div className="space-y-2">
            {records.map((r, i) => (
              <div key={r.student_id || i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/40 border border-white/50">
                <Avatar name={r.students?.name} src={r.students?.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{r.students?.name || r.students?.username || '—'}</p>
                  {r.attended && (
                    <p className="text-xs text-neutral-500">
                      {r.joined_at && `Joined ${fmtDateTime(r.joined_at)}`}
                      {r.duration_mins > 0 && ` · ${r.duration_mins}m`}
                    </p>
                  )}
                </div>
                {r.attended ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                    <CheckCircle size={10} /> Attended
                  </span>
                ) : (
                  <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">Absent</span>
                )}
              </div>
            ))}
          </div>

          {records.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-8">No attendance records yet.</p>
          )}
        </>
      )}
    </Sheet>
  );
}
