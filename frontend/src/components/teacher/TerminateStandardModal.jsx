import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, Shield, Loader2, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal, Btn, Input } from '../ui';
import { apiClient } from '../../lib/api';
import { useSettingsStore } from '../../store';

export default function TerminateStandardModal({ open, onClose, standard, students, subjects, onSuccess }) {
  const { terminationPin } = useSettingsStore();
  const [step, setStep] = useState('warn');
  const [downloaded, setDownloaded] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState('');

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setStep('warn');
      setDownloaded(false);
      setPinEntry('');
      setPinError('');
    }
  }, [open]);

  const studentCount = (students || []).length;
  const subjectCount = (subjects || []).length;

  // Auto-skip backup step when there are no students
  useEffect(() => {
    if (step === 'backup' && studentCount === 0) {
      setStep('pin');
    }
  }, [step, studentCount]);

  const downloadBackup = () => {
    const wsData = [
      ['Name', 'Email', 'Phone', 'Standard'],
      ...(students || []).map(s => [s.name || '', s.email || '', s.phone || '', standard?.name || '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, `${(standard?.name || 'Standard').replace(/\s+/g, '_')}_Students_Backup.xlsx`);
    setDownloaded(true);
  };

  const handleConfirmPin = async () => {
    if (!terminationPin) {
      setPinError('No PIN set. Go to Settings → Security to set a termination PIN first.');
      return;
    }
    if (pinEntry !== terminationPin) {
      setPinError('Incorrect PIN. Please try again.');
      setPinEntry('');
      return;
    }
    setStep('deleting');
    try {
      await apiClient(`/standards/${standard.id}`, { method: 'DELETE' });
      onSuccess();
    } catch (err) {
      console.error('Terminate failed:', err);
      setStep('pin');
      setPinError('Deletion failed: ' + (err.message || 'Unknown error'));
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={step === 'deleting' ? undefined : onClose} title="Terminate Standard" size="sm">

      {/* Step 1: Warn */}
      {step === 'warn' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">This action is permanent and irreversible.</p>
              <p className="text-xs text-red-700">All data for <strong>{standard?.name}</strong> will be permanently deleted:</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              [`${studentCount} student${studentCount !== 1 ? 's' : ''} and their login accounts`, '👥'],
              [`${subjectCount} subject${subjectCount !== 1 ? 's' : ''} and all videos`, '📚'],
              ['All tests, scores, and attempts', '📝'],
              ['All broadcasts and attendance records', '📡'],
            ].map(([label, icon]) => (
              <li key={label} className="flex items-center gap-2 text-neutral-700">
                <span>{icon}</span> {label}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-2">
            <Btn variant="ghost" onClick={onClose} className="flex-1">Cancel</Btn>
            <Btn variant="default" onClick={() => setStep('backup')} className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
              Continue →
            </Btn>
          </div>
        </div>
      )}

      {/* Step 2: Backup (mandatory download) */}
      {step === 'backup' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <Download size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Download student backup first</p>
              <p className="text-xs text-amber-700">
                You must download the student list before terminating. You can re-import it into a new standard next year.
              </p>
            </div>
          </div>

          <div className="p-4 glass-panel rounded-xl text-center">
            <p className="text-2xl font-bold mb-0.5">{studentCount}</p>
            <p className="text-xs text-neutral-500 mb-4">students in {standard?.name}</p>
            <Btn
              variant={downloaded ? 'default' : 'primary'}
              icon={downloaded ? CheckCircle2 : Download}
              onClick={downloadBackup}
              className="w-full justify-center"
            >
              {downloaded ? 'Downloaded ✓ — download again' : 'Download student list (.xlsx)'}
            </Btn>
            <p className="text-[10px] text-neutral-400 mt-2">Name · Email · Phone · Standard — ready to re-import next year</p>
          </div>

          {downloaded ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              Student list downloaded. You may now proceed.
            </div>
          ) : (
            <p className="text-xs text-neutral-500 text-center">
              You must download the student list before you can continue.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setStep('warn')} className="flex-1">Back</Btn>
            <Btn
              variant="default"
              onClick={() => setStep('pin')}
              disabled={!downloaded}
              className={`flex-1 ${downloaded ? 'text-red-600 border-red-200 hover:bg-red-50' : 'opacity-40 cursor-not-allowed'}`}
            >
              Continue to PIN →
            </Btn>
          </div>
        </div>
      )}

      {/* Step 3: PIN */}
      {step === 'pin' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
            <Shield size={18} className="text-neutral-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-0.5">Enter your termination PIN</p>
              <p className="text-xs text-neutral-500">
                This permanently deletes <strong>{standard?.name}</strong> and all its data. Cannot be undone.
              </p>
            </div>
          </div>

          {!terminationPin ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              No PIN set. Go to <strong>Settings → Security</strong> to set a termination PIN first.
            </div>
          ) : (
            <Input
              type="password"
              inputMode="numeric"
              value={pinEntry}
              onChange={e => { setPinEntry(e.target.value); setPinError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmPin(); }}
              placeholder="Enter PIN"
              autoFocus
              maxLength={8}
            />
          )}

          {pinError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={11} /> {pinError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Btn variant="ghost" onClick={() => { setPinError(''); setStep(studentCount > 0 ? 'backup' : 'warn'); }} className="flex-1">Back</Btn>
            <Btn
              variant="default"
              onClick={handleConfirmPin}
              disabled={!terminationPin || !pinEntry}
              className="flex-1 bg-red-600 text-white hover:bg-red-700 border-red-600 disabled:opacity-50"
            >
              Terminate
            </Btn>
          </div>
        </div>
      )}

      {/* Step 4: Deleting */}
      {step === 'deleting' && (
        <div className="py-10 flex flex-col items-center text-center">
          <Loader2 size={40} className="text-red-500 animate-spin mb-4" />
          <p className="text-base font-semibold">Terminating {standard?.name}…</p>
          <p className="text-sm text-neutral-500 mt-1">Deleting all data — please do not close this window.</p>
        </div>
      )}

    </Modal>
  );
}
