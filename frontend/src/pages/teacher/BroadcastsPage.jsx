import React, { useState, useEffect } from 'react';
import { MessageSquare, Settings, X, Check } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import BroadcastThread from '../../components/teacher/BroadcastThread';
import { useStore, useAppCache } from '../../store';
import { Skeleton } from '../../components/ui';
import { broadcastApi } from '../../lib/api';

const TTL_OPTIONS = [
  { label: 'Never', value: null },
  { label: '24 hours', value: 24 },
  { label: '3 days', value: 72 },
  { label: '7 days', value: 168 },
  { label: '14 days', value: 336 },
  { label: '30 days', value: 720 },
];

function TTLPopover({ standardId, onClose }) {
  const [ttl, setTtl] = useState(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    broadcastApi.getTTL(standardId)
      .then(data => setTtl(data?.ttl_hours ?? null))
      .catch(() => setTtl(null));
  }, [standardId]);

  const handleSave = async (value) => {
    setSaving(true);
    try {
      await broadcastApi.setTTL(standardId, value);
      setTtl(value);
    } catch (err) {
      alert(err?.message || 'Failed to update auto-delete setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute right-0 top-8 z-50 w-56 bg-white/95 backdrop-blur-md border border-white/60 shadow-xl rounded-xl py-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
        <p className="text-xs font-semibold text-neutral-700">Auto-delete after</p>
        <button onClick={onClose} className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded">
          <X size={13} />
        </button>
      </div>
      {ttl === undefined ? (
        <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin" /></div>
      ) : (
        TTL_OPTIONS.map(opt => (
          <button key={String(opt.value)} disabled={saving} onClick={() => handleSave(opt.value)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${opt.value === ttl ? 'bg-neutral-50 text-neutral-900 font-medium' : 'text-neutral-700 hover:bg-neutral-50'}`}>
            {opt.value === ttl && <Check size={12} className="text-green-600 flex-shrink-0" />}
            {opt.value !== ttl && <span className="w-3 flex-shrink-0" />}
            {opt.label}
          </button>
        ))
      )}
    </div>
  );
}

export default function BroadcastsPage() {
  const { broadcastsByStandard, updateBroadcasts } = useStore();
  const location = useLocation();

  const standards        = useAppCache(s => s.standards);
  const students         = useAppCache(s => s.students);
  const standardsReady   = useAppCache(s => s.standardsReady);
  const studentsReady    = useAppCache(s => s.studentsReady);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const refreshStudents  = useAppCache(s => s.refreshStudents);
  const loading = !standardsReady || !studentsReady;

  const [activeStdId, setActiveStdId] = useState(location.state?.stdId || null);
  const [paneView, setPaneView] = useState(location.state?.stdId ? 'thread' : 'list');
  const [ttlOpenFor, setTtlOpenFor] = useState(null);

  useEffect(() => {
    if (standards.length > 0 && !activeStdId) setActiveStdId(standards[0].id);
  }, [standards]);

  useEffect(() => {
    refreshStandards();
    refreshStudents();
  }, []);

  const studentCounts = {};
  students.forEach(s => {
    studentCounts[s.standard_id] = (studentCounts[s.standard_id] || 0) + 1;
  });

  const std = standards.find(s => s.id === activeStdId);
  const showList   = paneView === 'list';
  const showThread = paneView === 'thread';

  if (loading) {
    return (
      <div>
        <TopBar title="Inbox" />
        <div className="px-5 md:px-8 py-4 max-w-5xl mx-auto space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (standards.length === 0) {
    return (
      <div>
        <TopBar title="Inbox" />
        <div className="px-5 md:px-8 py-20 max-w-5xl mx-auto text-center">
          <MessageSquare size={36} className="mx-auto mb-3 text-neutral-300" />
          <h3 className="font-medium text-neutral-600 mb-1">No standards yet</h3>
          <p className="text-sm text-neutral-500">Create a standard first to send broadcasts.</p>
        </div>
      </div>
    );
  }

  return (
    <div onClick={() => { if (ttlOpenFor) setTtlOpenFor(null); }}>
      <TopBar
        title={showThread && std ? std.name : 'Inbox'}
        subtitle={showThread && std ? `${studentCounts[std.id] || 0} students` : 'Class broadcasts'}
        showSearch={!showThread}
      />
      <div className="max-w-5xl mx-auto">
        <div className="flex h-[calc(100dvh-160px)] md:h-[calc(100dvh-90px)]">

          {/* Standards list pane */}
          <div className={`${showList ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-80 md:border-r border-white/40 overflow-y-auto flex-shrink-0`}>
            {standards.map(s => {
              const broadcasts = (broadcastsByStandard[s.id] || []).filter(b => !b.deleted);
              const lastMsg = broadcasts[broadcasts.length - 1];
              const isActive = s.id === activeStdId;
              return (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3.5 border-b border-white/40 hover:bg-white/40 transition-colors ${isActive ? 'bg-white/50' : ''}`}>
                  <button onClick={() => { setActiveStdId(s.id); setPaneView('thread'); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-11 h-11 rounded-xl bg-white/50 border border-white/60 shadow-sm flex items-center justify-center text-xl flex-shrink-0">
                      {s.emoji || '📚'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        {lastMsg && <span className="text-[10px] text-neutral-400 flex-shrink-0">{lastMsg.time}</span>}
                      </div>
                      <p className="text-xs text-neutral-500 truncate">
                        {lastMsg ? lastMsg.text : `${studentCounts[s.id] || 0} students`}
                      </p>
                    </div>
                  </button>
                  {/* Auto-delete settings gear */}
                  <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setTtlOpenFor(ttlOpenFor === s.id ? null : s.id)}
                      className={`p-1.5 rounded-md transition-colors ${ttlOpenFor === s.id ? 'text-neutral-700 bg-neutral-100' : 'text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100'}`}
                      title="Auto-delete settings">
                      <Settings size={14} />
                    </button>
                    {ttlOpenFor === s.id && (
                      <TTLPopover standardId={s.id} onClose={() => setTtlOpenFor(null)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Thread pane */}
          <div className={`${showThread ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
            {std ? (
              <BroadcastThread
                key={activeStdId}
                std={std}
                broadcasts={broadcastsByStandard[std.id] || []}
                onUpdate={updater => updateBroadcasts(std.id, updater)}
                onBack={() => setPaneView('list')}
                showBackBtn={showThread}
                studentCount={studentCounts[std.id] || 0}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
                Select a class to view broadcasts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
