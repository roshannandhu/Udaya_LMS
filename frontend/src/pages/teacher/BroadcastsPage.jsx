import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Settings, X, Check } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import BroadcastThread from '../../components/teacher/BroadcastThread';
import { useStore, useAppCache, useThreadStore } from '../../store';
import { Skeleton } from '../../components/ui';
import { pastelFor, pastelTokens } from '../../components/cards/pastel';
import { useTheme } from '../../lib/theme';
import { broadcastApi } from '../../lib/api';
import SubjectIcon from '../../components/shared/SubjectIcon';

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
    <div className="absolute right-0 top-8 z-50 w-56 bg-white border border-white/60 shadow-xl rounded-xl py-1 overflow-hidden">
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
  const dark = useTheme(s => s.dark);

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

  // WhatsApp-style back: opening a class thread on mobile pushes a history entry
  // so the device/browser Back button returns to the standards list instead of
  // leaving the Broadcasts page. The in-app back arrow routes through the same
  // path (history.back) so history stays consistent either way.
  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

  const openThread = (id) => {
    setActiveStdId(id);
    setPaneView('thread');
    if (isMobile()) window.history.pushState({ tBroadcastThread: true }, '');
  };

  const closeThread = () => {
    if (window.history.state?.tBroadcastThread) window.history.back(); // fires popstate → list
    else setPaneView('list');
  };

  useEffect(() => {
    const onPop = () => setPaneView('list');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setThreadOpen = useThreadStore(s => s.setOpen);
  useEffect(() => {
    setThreadOpen(paneView === 'thread');
    return () => setThreadOpen(false);
  }, [paneView, setThreadOpen]);

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
        <div className="px-3 md:px-8 py-4 max-w-5xl mx-auto space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (standards.length === 0) {
    return (
      <div>
        <TopBar title="Inbox" />
        <div className="px-3 md:px-8 py-20 max-w-5xl mx-auto text-center">
          <MessageSquare size={36} className="mx-auto mb-3 text-neutral-300" />
          <h3 className="font-medium text-neutral-600 mb-1">No standards yet</h3>
          <p className="text-sm text-neutral-500">Create a standard first to send broadcasts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-[#f0f2f5] lg:p-4 ${showThread ? 'pb-0' : 'pb-[calc(74px+max(1rem,env(safe-area-inset-bottom)))]'}`} onClick={() => { if (ttlOpenFor) setTtlOpenFor(null); }}>
      {/* Mobile/tablet TopBar — the desktop TopNav only appears at lg, so keep the
          page header until then (was md:hidden → vanished on iPad with no replacement). */}
      <div className="lg:hidden flex-shrink-0">
        <TopBar
          title={showThread && std ? std.name : 'Inbox'}
          subtitle={showThread && std ? `${studentCounts[std.id] || 0} students` : 'Class broadcasts'}
          showSearch={!showThread}
        />
      </div>

      <div className="flex flex-1 min-h-0 w-full max-w-[1400px] mx-auto bg-white lg:rounded-xl lg:shadow-sm overflow-hidden border border-black/5">

        {/* Standards list pane (Sidebar) */}
        <div className={`${showList ? 'flex' : 'hidden md:flex'} flex-col min-h-0 w-full md:w-[350px] lg:w-[400px] bg-white border-r border-neutral-200 flex-shrink-0`}>
          {/* Sidebar Header */}
          <div className="hidden md:flex items-center justify-between px-4 py-3 bg-[#f0f2f5] border-b border-neutral-200">
            <h2 className="text-lg font-bold text-neutral-800">Broadcasts</h2>
          </div>
          
          <motion.div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          >
            {standards.map(s => {
              const broadcasts = (broadcastsByStandard[s.id] || []).filter(b => !b.deleted);
              const lastMsg = broadcasts[broadcasts.length - 1];
              const isActive = s.id === activeStdId;
              return (
                <motion.div
                  key={s.id}
                  variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22,1,0.36,1] } } }}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-neutral-100 cursor-pointer transition-colors ${isActive ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}`}
                  onClick={() => openThread(s.id)}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-neutral-700 overflow-hidden"
                    style={{ background: pastelTokens(pastelFor(s.name), dark).hex }}>
                    <SubjectIcon value={s.emoji} size={24} fallback="graduation" />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-medium text-neutral-900 truncate">{s.name}</p>
                      {lastMsg && <span className="text-xs text-neutral-500 flex-shrink-0">{lastMsg.time}</span>}
                    </div>
                    <p className="text-sm text-neutral-500 truncate mt-0.5">
                      {lastMsg ? lastMsg.text : `${studentCounts[s.id] || 0} students`}
                    </p>
                  </div>
                  {/* Auto-delete settings gear */}
                  <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setTtlOpenFor(ttlOpenFor === s.id ? null : s.id)}
                      className={`p-2 rounded-full transition-colors ${ttlOpenFor === s.id ? 'text-neutral-700 bg-neutral-200' : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'}`}
                      title="Auto-delete settings">
                      <Settings size={18} />
                    </button>
                    {ttlOpenFor === s.id && (
                      <TTLPopover standardId={s.id} onClose={() => setTtlOpenFor(null)} />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Thread pane (Chat Area) */}
        <div className={`${showThread ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0 bg-[#efeae2] relative`}>
          {std ? (
            <BroadcastThread
              key={activeStdId}
              std={std}
              broadcasts={broadcastsByStandard[std.id] || []}
              onUpdate={updater => updateBroadcasts(std.id, updater)}
              onBack={closeThread}
              showBackBtn={showThread}
              studentCount={studentCounts[std.id] || 0}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
              <MessageSquare size={48} className="mb-4 text-neutral-300" strokeWidth={1} />
              <p className="text-lg font-medium text-neutral-600">Udaya Broadcasts</p>
              <p className="text-sm text-neutral-400 mt-2">Select a class to send messages, assignments, and announcements.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
