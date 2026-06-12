import React from 'react';
import { Radio, Users, Trash2, Loader2 } from 'lucide-react';
import { Btn } from '../../ui';
import LiveClassCard from '../../cards/LiveClassCard';

export default function LiveSection({
  liveClasses, joiningLiveId,
  onSchedule, onWatch, onEnd, onCancel, onDelete, onAttendance,
}) {
  if (liveClasses.length === 0) {
    return (
      <div className="text-center py-14 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <Radio size={24} className="text-neutral-400" />
        </div>
        <h3 className="font-semibold text-neutral-800 mb-1">No live classes yet</h3>
        <p className="text-sm text-neutral-500 mb-5">Schedule a Zoom live class for this subject.</p>
        <Btn variant="primary" icon={Radio} onClick={onSchedule}>Schedule</Btn>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {liveClasses.map((lc, idx) => {
        const status = lc.status || 'scheduled';
        const isLive = status === 'live';
        const isScheduled = status === 'scheduled';
        const isEnded = status === 'ended';
        return (
          <div key={lc.id} className="h-full">
            <LiveClassCard
              lc={lc}
              themeIndex={idx}
              onClick={onWatch}
              joiningId={joiningLiveId}
              compact={true}
              actions={
                <>
                  {isScheduled && (
                    <button onClick={() => onCancel(lc)} className="bg-white/60 hover:bg-white text-neutral-700 px-3 py-2 rounded-full text-[12px] font-bold shadow-sm transition-all hover:-translate-y-0.5">Cancel</button>
                  )}
                  {isLive && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); onWatch(lc); }} disabled={joiningLiveId === lc.id} className="bg-blue-600 text-white px-3 py-2 rounded-full text-[12px] font-bold shadow-sm transition-all hover:-translate-y-0.5 flex items-center gap-1">
                        {joiningLiveId === lc.id ? <><Loader2 size={13} className="animate-spin"/> Opening…</> : 'Watch live'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onAttendance(lc.id); }} className="bg-white/80 hover:bg-white text-neutral-700 px-3 py-2 rounded-full text-[12px] font-bold shadow-sm flex items-center gap-1">
                        <Users size={12}/> {lc.attended_count ?? 0}/{lc.total_registered ?? 0}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEnd(lc); }} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-full text-[12px] font-bold shadow-sm transition-all">End</button>
                    </>
                  )}
                  {isEnded && (
                    <button onClick={(e) => { e.stopPropagation(); onAttendance(lc.id); }} className="bg-white/80 hover:bg-white text-neutral-700 px-3 py-2 rounded-full text-[12px] font-bold shadow-sm flex items-center gap-1">
                      <Users size={12}/> {lc.attended_count ?? 0}/{lc.total_registered ?? 0} attended
                    </button>
                  )}
                  {!isLive && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(lc); }} className="bg-white/60 hover:bg-white text-red-600 px-3 py-2 rounded-full text-[12px] font-bold shadow-sm transition-all flex items-center gap-1 ml-auto">
                      <Trash2 size={12}/> Delete
                    </button>
                  )}
                </>
              }
            />
          </div>
        );
      })}
    </div>
  );
}
