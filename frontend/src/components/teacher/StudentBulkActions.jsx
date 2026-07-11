import React, { useState, useMemo } from 'react';
import { Trash2, ArrowRightLeft, Ban, ShieldCheck, KeyRound, Download, Loader2, Check, AlertTriangle } from 'lucide-react';
import { studentApi } from '../../lib/api';
import { useAppCache } from '../../store';
import { Modal, Btn } from '../ui';
import { downloadAoaWorkbook } from '../../lib/studentBackup';

/**
 * Shared bulk-action bar + confirmation modals for a selection of students.
 * Used by both the Manage (Excel) grid and the Students List view. Selection
 * state lives in the parent (it renders the rows/checkboxes); this component
 * just acts on `selectedRows` and reports back via `onApplied`.
 *
 * Props:
 *  - selectedRows: student objects [{id,name,student_code,username,email,phone,standard_id,blocked,plain_password}]
 *  - standards:    [{id,name,...}]
 *  - onClear():    clear the parent's selection
 *  - onApplied(change): optional — parent updates local data
 *      { kind:'delete', ids }
 *      { kind:'move', ids, standard_id }
 *      { kind:'block', ids, blocked }
 *      { kind:'reset', pwById }
 */
export default function StudentBulkActions({ selectedRows = [], standards = [], onClear, onApplied }) {
  const [action, setAction]   = useState(null); // 'delete'|'move'|'block'|'unblock'|'reset'
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [deleteAck, setDeleteAck]   = useState(false);
  const [resetRows, setResetRows]   = useState(null); // [{...row, plain_password}] after a reset

  const refreshStudents = useAppCache(s => s.refreshStudents);

  const ids = useMemo(() => selectedRows.map(r => r.id), [selectedRows]);
  const stdName = (id) => standards.find(s => String(s.id) === String(id))?.name || '';
  const selectedStdNames = useMemo(() => {
    const names = new Set();
    selectedRows.forEach(s => names.add(stdName(s.standard_id) || 'No standard'));
    return [...names];
  }, [selectedRows, standards]);
  const allBlocked = selectedRows.length > 0 && selectedRows.every(s => s.blocked);

  const close = () => { if (busy) return; setAction(null); setError(null); setDeleteAck(false); setMoveTarget(''); setResetRows(null); };
  const afterMutate = () => { useAppCache.getState().invalidateStudents(); refreshStudents(); };

  const exportRows = (rs, prefix = 'Students') => {
    if (!rs?.length) return;
    const aoa = [
      ['Student ID', 'Name', 'Username', 'Password', 'Standard', 'Email', 'Phone', 'Login URL'],
      ...rs.map(r => [r.student_code || '', r.name || '', r.username || '', r.plain_password || '', stdName(r.standard_id), r.email || '', r.phone || '', 'https://udaya-learn.com/login']),
    ];
    downloadAoaWorkbook(aoa, {
      filename: `${prefix}_${new Date().toISOString().split('T')[0]}`,
      cols: [{ wch: 16 }, { wch: 20 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 24 }],
      sheetName: 'Credentials',
    });
  };

  const doDelete = async () => {
    setBusy(true); setError(null);
    try {
      await studentApi.bulkDelete(ids);
      afterMutate(); onApplied?.({ kind: 'delete', ids }); onClear?.(); close();
    } catch (e) { setError(e?.message || 'Delete failed'); }
    finally { setBusy(false); }
  };
  const doMove = async () => {
    if (!moveTarget) { setError('Choose a class to move to.'); return; }
    setBusy(true); setError(null);
    try {
      await studentApi.bulkMove(ids, moveTarget);
      afterMutate(); onApplied?.({ kind: 'move', ids, standard_id: moveTarget }); onClear?.(); close();
    } catch (e) { setError(e?.message || 'Move failed'); }
    finally { setBusy(false); }
  };
  const doBlock = async (blocked) => {
    setBusy(true); setError(null);
    try {
      await studentApi.bulkBlock(ids, blocked);
      afterMutate(); onApplied?.({ kind: 'block', ids, blocked }); onClear?.(); close();
    } catch (e) { setError(e?.message || 'Update failed'); }
    finally { setBusy(false); }
  };
  const doReset = async () => {
    setBusy(true); setError(null);
    try {
      const res = await studentApi.bulkResetPassword(ids);
      const pwById = Object.fromEntries((res.results || []).map(r => [r.id, r.new_password]));
      afterMutate();
      onApplied?.({ kind: 'reset', pwById });
      setResetRows(selectedRows.map(r => ({ ...r, plain_password: pwById[r.id] || r.plain_password })));
    } catch (e) { setError(e?.message || 'Reset failed'); }
    finally { setBusy(false); }
  };

  if (selectedRows.length === 0 && !action) return null;
  const n = ids.length;

  return (
    <>
      {selectedRows.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 border-b border-indigo-100 bg-indigo-50/90 flex-wrap rounded-t-2xl">
          <span className="text-xs font-bold text-indigo-900">{n} selected</span>
          <button onClick={onClear} className="text-xs text-indigo-500 hover:text-indigo-800 underline-offset-2 hover:underline">Clear</button>
          <div className="flex-1" />
          <button onClick={() => { setMoveTarget(''); setError(null); setAction('move'); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 bg-white hover:bg-[#F4F2EF] border border-[#E4E2DF] px-2.5 py-1.5 rounded-lg transition-colors">
            <ArrowRightLeft size={13} /> Move to class
          </button>
          <button onClick={() => { setResetRows(null); setError(null); setAction('reset'); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 bg-white hover:bg-[#F4F2EF] border border-[#E4E2DF] px-2.5 py-1.5 rounded-lg transition-colors">
            <KeyRound size={13} /> Reset passwords
          </button>
          <button onClick={() => { setError(null); setAction(allBlocked ? 'unblock' : 'block'); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 bg-white hover:bg-[#F4F2EF] border border-[#E4E2DF] px-2.5 py-1.5 rounded-lg transition-colors">
            {allBlocked ? <><ShieldCheck size={13} /> Unblock</> : <><Ban size={13} /> Block</>}
          </button>
          <button onClick={() => exportRows(selectedRows, 'Selected_Students')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 bg-white hover:bg-[#F4F2EF] border border-[#E4E2DF] px-2.5 py-1.5 rounded-lg transition-colors">
            <Download size={13} /> Export
          </button>
          <button onClick={() => { setDeleteAck(false); setError(null); setAction('delete'); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-lg transition-colors">
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}

      <Modal
        open={!!action}
        onClose={close}
        title={
          action === 'delete' ? 'Delete students'
          : action === 'move' ? 'Move to another class'
          : action === 'block' ? 'Block students'
          : action === 'unblock' ? 'Unblock students'
          : action === 'reset' ? 'Reset passwords'
          : ''
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {action === 'delete' && (
            <>
              <p className="text-sm text-neutral-700">
                Permanently delete <b>{n}</b> student{n === 1 ? '' : 's'}
                {selectedStdNames.length > 0 && <> from <b>{selectedStdNames.join(', ')}</b></>}? This also removes their
                login, test attempts and message history. <span className="text-red-600 font-semibold">This cannot be undone.</span>
              </p>
              <label className="flex items-center gap-2 text-sm text-neutral-700 select-none">
                <input type="checkbox" checked={deleteAck} onChange={e => setDeleteAck(e.target.checked)} className="w-4 h-4 accent-red-600" />
                I understand this is permanent
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Btn variant="default" onClick={close} disabled={busy}>Cancel</Btn>
                <button onClick={doDelete} disabled={busy || !deleteAck}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  Delete {n}
                </button>
              </div>
            </>
          )}

          {action === 'move' && (
            <>
              <p className="text-sm text-neutral-700">
                Move <b>{n}</b> student{n === 1 ? '' : 's'} to a different class. They'll be enrolled in the new class and get all of its subjects.
              </p>
              <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E4E2DF] bg-white outline-none text-sm">
                <option value="">Choose a class…</option>
                {standards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <Btn variant="default" onClick={close} disabled={busy}>Cancel</Btn>
                <Btn variant="primary" onClick={doMove} disabled={busy || !moveTarget}>
                  {busy ? <Loader2 size={15} className="animate-spin mr-1" /> : <ArrowRightLeft size={15} className="mr-1" />}
                  Move
                </Btn>
              </div>
            </>
          )}

          {(action === 'block' || action === 'unblock') && (
            <>
              <p className="text-sm text-neutral-700">
                {action === 'block'
                  ? <>Block <b>{n}</b> student{n === 1 ? '' : 's'}? They won't be able to log in until unblocked.</>
                  : <>Unblock <b>{n}</b> student{n === 1 ? '' : 's'}? They'll be able to log in again.</>}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Btn variant="default" onClick={close} disabled={busy}>Cancel</Btn>
                <Btn variant="primary" onClick={() => doBlock(action === 'block')} disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin mr-1" /> : (action === 'block' ? <Ban size={15} className="mr-1" /> : <ShieldCheck size={15} className="mr-1" />)}
                  {action === 'block' ? 'Block' : 'Unblock'}
                </Btn>
              </div>
            </>
          )}

          {action === 'reset' && (
            resetRows ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-800 text-sm rounded-lg border border-emerald-100">
                  <Check size={15} /> Reset {resetRows.filter(r => r.plain_password).length} password{resetRows.length === 1 ? '' : 's'}. Share the new ones with students.
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Btn variant="default" onClick={() => { onClear?.(); close(); }}>Done</Btn>
                  <Btn variant="primary" onClick={() => exportRows(resetRows, 'Reset_Credentials')}>
                    <Download size={15} className="mr-1" /> Download credentials
                  </Btn>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-700">
                  Reset passwords for <b>{n}</b> student{n === 1 ? '' : 's'} to new random passwords? Each will be asked to change it on next login. You can download the new credentials afterwards.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <Btn variant="default" onClick={close} disabled={busy}>Cancel</Btn>
                  <Btn variant="primary" onClick={doReset} disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin mr-1" /> : <KeyRound size={15} className="mr-1" />}
                    Reset {n}
                  </Btn>
                </div>
              </>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
