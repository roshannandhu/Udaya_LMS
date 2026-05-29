import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileQuestion, Upload, MessageSquare, UserPlus } from 'lucide-react';
import { useAppCache } from '../../store';

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const students  = useAppCache(s => s.students);
  const subjects  = useAppCache(s => s.subjects);
  const standards = useAppCache(s => s.standards);

  useEffect(() => { if (open) setQuery(''); }, [open]);

  if (!open) return null;

  const q = query.toLowerCase();
  const results = query
    ? [
        ...students
          .filter((s) => s.name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q))
          .slice(0, 4)
          .map((s) => ({ type: 'Student', label: s.name, sub: `@${s.username}`, go: () => navigate(`/teacher/students/${s.id}`) })),
        ...subjects
          .filter((c) => c.name?.toLowerCase().includes(q))
          .slice(0, 4)
          .map((c) => ({
            type: 'Subject', label: c.name,
            sub: standards.find((s) => s.id === c.standard_id)?.name,
            go: () => navigate(`/teacher/subjects/${c.standard_id}/${c.id}`)
          })),
      ]
    : [
        { type: 'Quick action', label: 'Create new test',  icon: FileQuestion, go: () => navigate('/teacher/tests') },
        { type: 'Quick action', label: 'Upload video',     icon: Upload,       go: () => navigate('/teacher/subjects') },
        { type: 'Quick action', label: 'Send broadcast',   icon: MessageSquare,go: () => navigate('/teacher/broadcasts') },
        { type: 'Quick action', label: 'Add student',      icon: UserPlus,     go: () => navigate('/teacher/students') },
      ];

  const pick = (r) => { r.go(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-neutral-900/30" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-white/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/40 flex items-center gap-2">
          <Search size={16} className="text-neutral-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); }}
            placeholder="Search students, subjects..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-400" />
          <kbd className="text-[10px] text-neutral-400 px-1.5 py-0.5 bg-white/50 rounded">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-neutral-500">No matches for "{query}"</div>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => pick(r)} className="w-full px-4 py-2.5 hover:bg-white/40 flex items-center gap-3 text-left">
              {r.icon ? <r.icon size={14} className="text-neutral-500" /> : <div className="w-3.5" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.label}</p>
                {r.sub && <p className="text-xs text-neutral-500 truncate">{r.sub}</p>}
              </div>
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider">{r.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
