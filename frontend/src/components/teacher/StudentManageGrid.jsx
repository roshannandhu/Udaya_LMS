import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Eye, EyeOff, Copy, Check, Loader2, KeyRound, ChevronDown, ChevronRight, AlertTriangle, UserPlus, Plus, X, Download, ClipboardPaste } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useAppCache, useSettingsStore } from '../../store';
import { Skeleton, Toggle, Tag } from '../ui';
import SubjectIcon from '../shared/SubjectIcon';
import StudentBulkActions from './StudentBulkActions';
import { generateUsername, generatePassword } from '../../lib/bulkImport';
import { downloadAoaWorkbook } from '../../lib/studentBackup';

const MASK = '•••••••';
let _draftSeq = 0;
const newDraft = (standard_id = '') => ({ key: `d${++_draftSeq}`, standard_id, name: '', email: '', phone: '' });

// Click-to-edit text cell. Commits on Enter or blur, cancels on Escape.
function EditableCell({ value, placeholder, type = 'text', onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value || '').trim()) onCommit(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
        }}
        className="w-full px-2 py-1 rounded border border-neutral-400 bg-white outline-none text-sm focus:ring-2 focus:ring-neutral-200"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="w-full text-left px-2 py-1 rounded hover:bg-[#F4F2EF] truncate min-h-[1.75rem] transition-colors"
    >
      {value ? value : <span className="text-neutral-300">{placeholder}</span>}
    </button>
  );
}

/**
 * Excel-style management grid for students. Owns its own data fetch (including
 * plain_password) and filters/groups by standard. Inline-edits name/email/phone
 * via PATCH /students/{id}; resets passwords to the configured default. This is
 * the ONLY surface where phone numbers can be edited.
 */
export default function StudentManageGrid({ search = '', stdFilter = 'all', standards = [] }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [pwUnavailable, setPwUnavailable] = useState(false); // fell back to cached list (no passwords)
  const [showAllPw, setShowAllPw] = useState(false);
  const [revealed, setRevealed] = useState({});   // { [id]: true }
  const [status, setStatus]     = useState({});   // { [id]: 'saving' | 'saved' | 'error' }
  const [copiedId, setCopiedId] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // { [standardId]: true }

  // ── Bulk selection (the action bar + modals live in <StudentBulkActions/>) ──
  const [selected, setSelected] = useState(() => new Set()); // student ids

  // ── Add-new-students (in-grid) ──────────────────────────────────────────────
  const [drafts, setDrafts]   = useState([]);     // [{key, standard_id, name, email, phone}]
  const [savingNew, setSavingNew] = useState(false);
  const [addResult, setAddResult] = useState(null); // {added, skipped, errors, rows:[...]}
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [newStandard, setNewStandard] = useState(''); // default standard for added/pasted rows

  const defaultStudentPassword = useSettingsStore(s => s.defaultStudentPassword);
  const refreshStudents = useAppCache(s => s.refreshStudents);

  // Default a new draft's standard to the chosen default, else the active filter,
  // else the only standard.
  const defaultStandardId = stdFilter !== 'all' ? String(stdFilter) : (standards.length === 1 ? standards[0].id : '');
  const effectiveDefaultStd = newStandard || defaultStandardId;
  const addDraft = () => { setAddResult(null); setDrafts(d => [...d, newDraft(effectiveDefaultStd)]); };
  const updateDraft = (key, patch) => setDrafts(d => d.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeDraft = (key) => setDrafts(d => d.filter(r => r.key !== key));
  const stdName = (id) => standards.find(s => String(s.id) === String(id))?.name || '';

  // Paste-to-add: each pasted line "Name, Email, Phone" (tab- or comma-separated)
  // becomes a draft row, so a teacher can add a whole class in one paste.
  const applyPaste = () => {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const newRows = [];
    for (const line of lines) {
      const cells = line.split(/\t|,|;/).map(c => c.trim());
      const name = cells[0];
      if (!name) continue;
      const emailCell = cells.find(c => c.includes('@')) || '';
      const phoneCell = cells.slice(1).find(c => /\d/.test(c) && !c.includes('@')) || '';
      newRows.push({ ...newDraft(effectiveDefaultStd), name, email: emailCell, phone: phoneCell });
    }
    if (newRows.length) { setAddResult(null); setDrafts(d => [...d, ...newRows]); }
    setPasteText('');
    setPasteOpen(false);
  };

  const saveDrafts = async () => {
    const valid = drafts.filter(r => r.name.trim() && r.standard_id);
    if (valid.length === 0) return;
    setSavingNew(true);
    setAddResult(null);
    try {
      // Auto-generate usernames (unique vs existing + within this batch) + passwords.
      const existingUsernames = rows.map(r => r.username).filter(Boolean);
      const localSet = new Set();
      const payloadStudents = valid.map(r => {
        const username = generateUsername(r.name, existingUsernames, localSet);
        localSet.add(username);
        return {
          name: r.name.trim(),
          username,
          email: r.email.trim() || null,
          phone: r.phone.trim() || null,
          standard_id: r.standard_id,
          temp_password: defaultStudentPassword || generatePassword(),
        };
      });

      const res = await apiClient('/students/bulk', {
        method: 'POST',
        body: JSON.stringify({ filename: 'manage-grid', students: payloadStudents }),
      });

      // Merge the created rows straight into the grid (real id + code + password).
      const createdRows = (res.students || []).map(s => ({
        id: s.id,
        name: s.name,
        username: s.username,
        student_code: s.student_code,
        email: s.email,
        phone: s.phone,
        standard_id: s.standard_id,
        plain_password: s.temp_password,
        must_change_pwd: true,
        points: 0, attendance_pct: 0, avg_score: 0, blocked: false,
      }));
      if (createdRows.length) {
        setRows(rs => [...createdRows, ...rs]);
        setRevealed(v => { const n = { ...v }; createdRows.forEach(r => { n[r.id] = true; }); return n; });
      }
      setAddResult({ added: res.created || 0, skipped: res.skipped || 0, errors: res.errors || 0, rows: createdRows });
      setDrafts([]);
      // Keep the List view's cards + "X of X" count in sync.
      useAppCache.getState().invalidateStudents();
      refreshStudents();
    } catch (e) {
      setAddResult({ error: e?.message || 'Failed to add students' });
    } finally {
      setSavingNew(false);
    }
  };

  const downloadNewCredentials = () => {
    const rs = addResult?.rows || [];
    if (!rs.length) return;
    const aoa = [
      ['Student ID', 'Name', 'Username', 'Temporary Password', 'Standard', 'Email', 'Phone', 'Login URL'],
      ...rs.map(r => [r.student_code || '', r.name || '', r.username || '', r.plain_password || '', stdName(r.standard_id), r.email || '', r.phone || '', 'https://tutoria.app/login']),
    ];
    downloadAoaWorkbook(aoa, {
      filename: `New_Students_${new Date().toISOString().split('T')[0]}`,
      cols: [{ wch: 16 }, { wch: 20 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 24 }],
      sheetName: 'Credentials',
    });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiClient('/students?include_passwords=true')
      .then(d => { if (alive) { setRows(Array.isArray(d) ? d : []); setError(null); setPwUnavailable(false); } })
      .catch(e => {
        if (!alive) return;
        // The backend may be down/restarting while the List view still shows the
        // persisted cache. Fall back to that cached list so the grid stays usable
        // (just without passwords) instead of hard-erroring.
        const cached = useAppCache.getState().students;
        if (Array.isArray(cached) && cached.length) {
          setRows(cached);
          setPwUnavailable(true);
          setError(null);
        } else {
          setError(
            e?.message === 'Failed to fetch'
              ? 'Could not reach the server. Make sure the backend is running, then reload.'
              : (e?.message || 'Failed to load students')
          );
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const flashStatus = (id, val) => {
    setStatus(s => ({ ...s, [id]: val }));
    if (val === 'saved') {
      setTimeout(() => setStatus(s => {
        if (s[id] !== 'saved') return s;
        const n = { ...s }; delete n[id]; return n;
      }), 1500);
    }
  };

  const patchField = async (id, field, value) => {
    const prev = rows.find(r => r.id === id)?.[field];
    if ((prev || '') === (value || '')) return;
    setRows(rs => rs.map(r => (r.id === id ? { ...r, [field]: value } : r)));   // optimistic
    flashStatus(id, 'saving');
    try {
      await apiClient(`/students/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
      flashStatus(id, 'saved');
      // Keep the card list + "X of X" count in sync.
      useAppCache.getState().invalidateStudents();
      refreshStudents();
    } catch (e) {
      setRows(rs => rs.map(r => (r.id === id ? { ...r, [field]: prev } : r)));  // revert
      flashStatus(id, 'error');
    }
  };

  const resetPassword = async (id) => {
    flashStatus(id, 'saving');
    try {
      const body = defaultStudentPassword ? { new_password: defaultStudentPassword } : {};
      const res = await apiClient(`/students/${id}/reset-password`, { method: 'POST', body: JSON.stringify(body) });
      setRows(rs => rs.map(r => (r.id === id ? { ...r, plain_password: res.new_password } : r)));
      setRevealed(v => ({ ...v, [id]: true }));
      flashStatus(id, 'saved');
    } catch (e) {
      flashStatus(id, 'error');
    }
  };

  const copyPw = (id, pw) => {
    navigator.clipboard.writeText(pw);
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500);
  };

  const filtered = useMemo(() => {
    let list = rows;
    if (stdFilter !== 'all') list = list.filter(s => String(s.standard_id) === String(stdFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.username || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.student_code || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(search)
      );
    }
    return list;
  }, [rows, search, stdFilter]);

  // Group rows under one header per standard, ordered like `standards`.
  const groups = useMemo(() => {
    const byStd = new Map();
    filtered.forEach(s => {
      const k = s.standard_id || 'none';
      if (!byStd.has(k)) byStd.set(k, []);
      byStd.get(k).push(s);
    });
    const ordered = [];
    standards.forEach(std => {
      if (byStd.has(std.id)) { ordered.push({ std, list: byStd.get(std.id) }); byStd.delete(std.id); }
    });
    byStd.forEach((list, k) => ordered.push({ std: { id: k, name: 'No standard' }, list }));
    ordered.forEach(g => g.list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    return ordered;
  }, [filtered, standards]);

  // ── Selection (scoped to what's currently visible/filtered) ────────────────
  const filteredIds = useMemo(() => filtered.map(s => s.id), [filtered]);
  const selectedIds = useMemo(() => filteredIds.filter(id => selected.has(id)), [filteredIds, selected]);
  const selectedRows = useMemo(() => filtered.filter(s => selected.has(s.id)), [filtered, selected]);
  const allSelected = filteredIds.length > 0 && selectedIds.length === filteredIds.length;

  const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids, on) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });
  const toggleAll = () => toggleMany(filteredIds, !allSelected);
  const clearSelection = () => setSelected(new Set());

  // Apply a completed bulk action to the grid's local rows (passwords/reveal etc.).
  const applyToRows = (change) => {
    if (!change) return;
    const set = new Set(change.ids || []);
    if (change.kind === 'delete') setRows(rs => rs.filter(r => !set.has(r.id)));
    else if (change.kind === 'move') setRows(rs => rs.map(r => (set.has(r.id) ? { ...r, standard_id: change.standard_id } : r)));
    else if (change.kind === 'block') setRows(rs => rs.map(r => (set.has(r.id) ? { ...r, blocked: change.blocked } : r)));
    else if (change.kind === 'reset') {
      const pwById = change.pwById || {};
      setRows(rs => rs.map(r => (pwById[r.id] ? { ...r, plain_password: pwById[r.id] } : r)));
      setRevealed(v => { const n = { ...v }; Object.keys(pwById).forEach(id => { n[id] = true; }); return n; });
    }
  };

  const COLS = 7;
  const validDraftCount = drafts.filter(d => d.name.trim() && d.standard_id).length;

  // In-grid "Add new students" panel. Lives above the table so the first
  // students can be added to an empty standard too; reuses the proven
  // /students/bulk path (auto username/password/code, dedupe).
  const addPanel = (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#EFEDEA] bg-white flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
          <UserPlus size={15} className="text-neutral-500" /> Add new students
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Default standard applied to newly added / pasted rows */}
          {standards.length > 1 && (
            <select value={effectiveDefaultStd} onChange={e => setNewStandard(e.target.value)}
              title="Default class for new rows"
              className="px-2 py-1.5 rounded-lg border border-[#E4E2DF] text-xs bg-white outline-none max-w-[150px]">
              <option value="">Class for new rows…</option>
              {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button onClick={() => { setAddResult(null); setPasteOpen(o => !o); }} disabled={standards.length === 0}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-[#F4F2EF] disabled:opacity-40 px-2.5 py-1.5 rounded-lg border border-[#EFEDEA] transition-colors">
            <ClipboardPaste size={13} /> Paste list
          </button>
          {drafts.length === 0 ? (
            <button onClick={addDraft} disabled={standards.length === 0}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={13} /> Add students
            </button>
          ) : (
            <>
              <button onClick={addDraft}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-[#F4F2EF] px-2.5 py-1.5 rounded-lg border border-[#EFEDEA] transition-colors">
                <Plus size={13} /> Add row
              </button>
              <button onClick={() => setDrafts([])} disabled={savingNew}
                className="text-xs text-neutral-500 hover:text-neutral-800 px-2 py-1.5 disabled:opacity-40">Discard</button>
              <button onClick={saveDrafts} disabled={savingNew || validDraftCount === 0}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
                {savingNew ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save {validDraftCount || ''} student{validDraftCount === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>

      {pasteOpen && (
        <div className="px-4 py-3 border-b border-[#EFEDEA] bg-[#FAFAF9] space-y-2">
          <p className="text-[11px] text-neutral-500">Paste one student per line — <span className="font-medium">Name, Email, Phone</span> (commas or tabs). Email/phone optional. They'll be added as rows below using the default class.</p>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4}
            placeholder={'Aarav Patel, aarav@email.com, 9876543210\nMeera Singh\nRohan Kumar, , 9123456780'}
            className="w-full px-3 py-2 rounded-lg border border-[#E4E2DF] text-sm bg-white outline-none font-mono resize-y" />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setPasteOpen(false); setPasteText(''); }} className="text-xs text-neutral-500 hover:text-neutral-800 px-2 py-1.5">Cancel</button>
            <button onClick={applyPaste} disabled={!pasteText.trim()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={13} /> Add rows
            </button>
          </div>
        </div>
      )}

      {standards.length === 0 && (
        <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50">Create a standard first, then you can add students here.</div>
      )}

      {addResult && (
        addResult.error ? (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 text-xs border-b border-red-100">
            <AlertTriangle size={14} /> {addResult.error}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 text-emerald-800 text-xs border-b border-emerald-100 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Check size={14} /> Added {addResult.added}
              {addResult.skipped ? ` · Skipped ${addResult.skipped} (already exist)` : ''}
              {addResult.errors ? ` · Failed ${addResult.errors}` : ''}
            </span>
            {addResult.rows?.length > 0 && (
              <button onClick={downloadNewCredentials} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900">
                <Download size={13} /> Download credentials
              </button>
            )}
          </div>
        )
      )}

      {drafts.length > 0 && (
        <div className="divide-y divide-[#F1EFEC]">
          {drafts.map((d, i) => {
            const missingName = !d.name.trim();
            const missingStd = !d.standard_id;
            return (
              <div key={d.key} className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 py-2">
                <select value={d.standard_id} onChange={e => updateDraft(d.key, { standard_id: e.target.value })}
                  className={`px-2 py-1.5 rounded border text-sm bg-white outline-none w-full md:w-40 ${missingStd ? 'border-red-300' : 'border-[#E4E2DF]'}`}>
                  <option value="">Standard…</option>
                  {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input value={d.name} onChange={e => updateDraft(d.key, { name: e.target.value })} placeholder="Full name *"
                  className={`px-2 py-1.5 rounded border text-sm bg-white outline-none flex-1 min-w-[120px] ${missingName ? 'border-red-300' : 'border-[#E4E2DF]'}`} />
                <input value={d.email} onChange={e => updateDraft(d.key, { email: e.target.value })} placeholder="Email (optional)" type="email"
                  className="px-2 py-1.5 rounded border border-[#E4E2DF] text-sm bg-white outline-none flex-1 min-w-[140px]" />
                <input value={d.phone} onChange={e => updateDraft(d.key, { phone: e.target.value })} placeholder="Phone (optional)" type="tel"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === drafts.length - 1) addDraft(); } }}
                  className="px-2 py-1.5 rounded border border-[#E4E2DF] text-sm bg-white outline-none w-full md:w-40" />
                <span className="text-[11px] text-neutral-400 hidden lg:inline whitespace-nowrap">ID &amp; password auto</span>
                <button onClick={() => removeDraft(d.key)} className="text-neutral-400 hover:text-red-500 p-1 flex-shrink-0" title="Remove row"><X size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading && rows.length === 0) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>;
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
        <AlertTriangle size={16} />{error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {addPanel}
      {filtered.length === 0 ? (
        <div className="text-center py-16 glass-panel border-dashed border-[#D8D6D2] rounded-2xl text-neutral-500 text-sm">
          {rows.length === 0 ? 'No students yet — add your first students above.' : 'No students match your filters'}
        </div>
      ) : (
      <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#EFEDEA] bg-white flex-wrap">
        <p className="text-xs text-neutral-500">Click any cell to edit. Phone numbers can only be changed here.</p>
        <label className="flex items-center gap-2 text-xs text-neutral-600 select-none">
          <span>Show all passwords</span>
          <Toggle checked={showAllPw} onChange={setShowAllPw} />
        </label>
      </div>

      {/* Bulk selection action bar + confirm modals (shared with the List view) */}
      <StudentBulkActions
        selectedRows={selectedRows}
        standards={standards}
        onClear={clearSelection}
        onApplied={applyToRows}
      />

      {pwUnavailable && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs">
          <AlertTriangle size={14} />
          Showing the cached student list — couldn't load saved passwords. Reconnect to the backend and reload to see them.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[880px]">
          <thead>
            <tr className="bg-[#F1F1EF] text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2 border-b border-[#E4E2DF] w-8">
                <input type="checkbox" aria-label="Select all" checked={allSelected}
                  onChange={toggleAll} className="w-4 h-4 accent-neutral-900 cursor-pointer align-middle" />
              </th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Student ID</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Name</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Email</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Phone</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Password</th>
              <th className="text-left font-semibold px-3 py-2 border-b border-[#E4E2DF]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ std, list }) => {
              const isCollapsed = !!collapsed[std.id];
              return (
                <React.Fragment key={std.id}>
                  <tr className="bg-[#FAF8F5] border-y border-[#EFEDEA] hover:bg-[#F4F2EF]">
                    <td className="px-3 py-1.5 w-8">
                      <input type="checkbox" aria-label={`Select all in ${std.name}`}
                        checked={list.length > 0 && list.every(s => selected.has(s.id))}
                        onChange={(e) => toggleMany(list.map(s => s.id), e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-neutral-900 cursor-pointer align-middle" />
                    </td>
                    <td colSpan={COLS - 1} className="px-3 py-1.5 cursor-pointer"
                      onClick={() => setCollapsed(c => ({ ...c, [std.id]: !c[std.id] }))}>
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600">
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {std.emoji && <SubjectIcon value={std.emoji} size={13} fallback="graduation" />}
                        {std.name}
                        <span className="text-neutral-400 font-normal">({list.length})</span>
                      </div>
                    </td>
                  </tr>

                  {!isCollapsed && list.map(s => {
                    const show = showAllPw || revealed[s.id];
                    const st = status[s.id];
                    const isSel = selected.has(s.id);
                    return (
                      <tr key={s.id} className={`border-b border-[#EFEDEA] ${isSel ? 'bg-indigo-50/60' : 'hover:bg-[#F9F8F6]'}`}>
                        <td className="px-3 py-1.5 w-8 align-middle">
                          <input type="checkbox" aria-label={`Select ${s.name}`} checked={isSel}
                            onChange={() => toggleOne(s.id)}
                            className="w-4 h-4 accent-neutral-900 cursor-pointer align-middle" />
                        </td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-neutral-600">{s.student_code || '—'}</span>
                            {s.blocked && <Tag color="red">Blocked</Tag>}
                          </div>
                        </td>
                        <td className="px-2 py-1 align-middle min-w-[140px]">
                          <EditableCell value={s.name} placeholder="—" onCommit={v => patchField(s.id, 'name', v)} />
                        </td>
                        <td className="px-2 py-1 align-middle min-w-[180px]">
                          <EditableCell value={s.email} type="email" placeholder="add email" onCommit={v => patchField(s.id, 'email', v)} />
                        </td>
                        <td className="px-2 py-1 align-middle min-w-[150px]">
                          <EditableCell value={s.phone} type="tel" placeholder="add phone" onCommit={v => patchField(s.id, 'phone', v)} />
                        </td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                          {s.plain_password ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{show ? s.plain_password : MASK}</span>
                              <button
                                onClick={() => setRevealed(v => ({ ...v, [s.id]: !v[s.id] }))}
                                className="text-neutral-400 hover:text-neutral-700"
                                title={show ? 'Hide' : 'Show'}
                              >
                                {show ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              {show && (
                                <button
                                  onClick={() => copyPw(s.id, s.plain_password)}
                                  className="text-neutral-400 hover:text-neutral-700"
                                  title="Copy password"
                                >
                                  {copiedId === s.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-300 text-xs" title="Use Reset to set a password">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => resetPassword(s.id)}
                              className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-[#F4F2EF] px-2 py-1 rounded-lg border border-[#EFEDEA] transition-colors"
                              title="Reset password to the default"
                            >
                              <KeyRound size={13} /> Reset
                            </button>
                            {st === 'saving' && <Loader2 size={13} className="animate-spin text-neutral-400" />}
                            {st === 'saved'  && <Check size={13} className="text-green-600" />}
                            {st === 'error'  && <span className="text-[11px] text-red-500">failed</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </div>
  );
}
