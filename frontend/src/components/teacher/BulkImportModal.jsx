import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileUp, AlertTriangle, CheckCircle2, XCircle, ChevronRight, Loader2, Download, UserPlus } from 'lucide-react';
import { Modal, Btn } from '../ui';
import { parseImportFile } from '../../lib/bulkImport';
import { downloadAoaWorkbook } from '../../lib/studentBackup';
import { apiClient } from '../../lib/api';
import { useSettingsStore } from '../../store';
export default function BulkImportModal({ open, onClose, standards, existingStudents, onImportComplete, initialStandardId = null }) {
  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [data, setData] = useState(null);
  // Students returned by the backend after a successful import — carries the
  // server-generated Student ID (student_code) per student.
  const [createdStudents, setCreatedStudents] = useState([]);

  const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, skipped: 0, errors: 0 });

  const fileInputRef = useRef(null);
  const { defaultStudentPassword } = useSettingsStore();

  const downloadTemplate = async () => {
    const initStd = initialStandardId ? standards.find(s => s.id === initialStandardId) : null;
    const stdName = initStd ? initStd.name : '10th Standard';
    const wsData = [
      ['Name', 'Email', 'Phone', 'Parent Phone', 'Standard'],
      ['Aarav Patel',  '', '', '', stdName],
      ['Meera Singh',  '', '', '', stdName],
      ['Rohan Kumar',  '', '', '', stdName],
    ];
    await downloadAoaWorkbook(wsData, {
      filename: 'Student_Import_Template',
      cols: [{ wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 18 }],
      sheetName: 'Students',
    });
  };

  // Fire onImportComplete immediately when step becomes 'done'
  useEffect(() => {
    if (step === 'done') {
      onImportComplete(progress.successes);
    }
  }, [step]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setStep('upload');
      setFile(null);
      setData(null);
      setParsing(false);
    }
  }, [open]);

  const existingUsernames = existingStudents ? existingStudents.map(s => s.username) : [];

  const handleFileDrop = async (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer?.files[0] || e.target.files[0];
    if (!droppedFile) return;
    
    setFile(droppedFile);
    setParsing(true);
    
    try {
      let parsed = await parseImportFile(droppedFile, standards, existingUsernames, defaultStudentPassword || null);
      
      // If modal was opened from a specific standard, auto-map any unmatched standards to it
      if (initialStandardId) {
        const initStd = standards.find(s => s.id === initialStandardId);
        if (initStd) {
          parsed.students = parsed.students.map(s => {
            if (!s.matched_standard_id) {
              return { 
                ...s, 
                matched_standard_id: initStd.id, 
                matched_standard_name: initStd.name,
                status: s.errors.filter(e => e !== 'Missing Standard').length > 0 ? 'error' : (s.warnings.length > 0 ? 'warning' : 'ready'),
                errors: s.errors.filter(e => e !== 'Missing Standard')
              };
            }
            return s;
          });
          // Recalculate counts
          parsed.unrecognised_standards = [];
          parsed.ready_count = parsed.students.filter(s => s.status === 'ready').length;
          parsed.warning_count = parsed.students.filter(s => s.status === 'warning').length;
          parsed.error_count = parsed.students.filter(s => s.status === 'error').length;
        }
      }
      
      setData(parsed);
      setStep('preview');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!data) return;
    setStep('importing');
    
    const validStudents = data.students.filter(s => s.status !== 'error' && s.matched_standard_id);
    setProgress({ current: 0, total: validStudents.length, successes: 0, skipped: 0, errors: 0 });
    
    // Send in one bulk request to backend
    const payload = {
      filename: file.name,
      students: validStudents.map(s => ({
        name: s.raw_name,
        username: s.generated_username,
        email: s.raw_email,
        phone: s.raw_phone,
        parent_phone: s.raw_parent_phone,
        standard_id: s.matched_standard_id,
        temp_password: s.temp_password
      }))
    };
    
    try {
      const res = await apiClient('/students/bulk', { method: 'POST', body: JSON.stringify(payload) });
      setCreatedStudents(Array.isArray(res.students) ? res.students : []);
      setProgress({ current: validStudents.length, total: validStudents.length, successes: res.created, skipped: res.skipped || 0, errors: res.errors });
      setStep('done');
    } catch (err) {
      console.error(err);
      alert('Import failed: ' + err.message);
      setStep('preview'); // go back
    }
  };

  const downloadCredentials = async () => {
    // Prefer the backend response (carries the generated Student ID). Fall back
    // to the locally parsed rows if the server didn't return them (older backend).
    const useServer = createdStudents.length > 0;
    const rows = useServer
      ? createdStudents.map(s => ({
          student_code: s.student_code || '',
          name: s.name || '',
          username: s.username || '',
          temp_password: s.temp_password || '',
          standard: s.standard_name || '',
          email: s.email || '',
          phone: s.phone || '',
          parent_phone: s.parent_phone || '',
        }))
      : (data?.students || [])
          .filter(s => s.status !== 'error' && s.matched_standard_id)
          .map(s => ({
            student_code: '',
            name: s.raw_name || '',
            username: s.generated_username || '',
            temp_password: s.temp_password || '',
            standard: s.matched_standard_name || s.raw_standard || '',
            email: s.raw_email || '',
            phone: s.raw_phone || '',
            parent_phone: s.raw_parent_phone || '',
          }));

    const wsData = [
      ['Student ID', 'Name', 'Username', 'Temporary Password', 'Standard', 'Email', 'Phone', 'Parent Phone', 'Login URL'],
      ...rows.map(r => [r.student_code, r.name, r.username, r.temp_password, r.standard, r.email, r.phone, r.parent_phone, 'https://tutoria.app/login']),
    ];

    await downloadAoaWorkbook(wsData, {
      filename: `Student_Credentials_${new Date().toISOString().split('T')[0]}`,
      cols: [{wch: 16}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 25}],
      sheetName: 'Credentials',
    });
  };

  const groupByStandard = (students) => {
    return students.reduce((acc, student) => {
      const key = student.matched_standard_name || 'Unmatched Standards';
      if (!acc[key]) acc[key] = [];
      acc[key].push(student);
      return acc;
    }, {});
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={step === 'importing' ? undefined : onClose} title="Bulk Student Import" size="4xl">
      
      {/* STEP 1: UPLOAD */}
      {step === 'upload' && (
        <div className="py-8">
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-300 rounded-2xl p-12 text-center cursor-pointer hover:bg-neutral-50/50 hover:border-neutral-400 transition-colors bg-white/30"
          >
            {parsing ? (
              <div className="flex flex-col items-center">
                <Loader2 size={40} className="text-blue-500 animate-spin mb-4" />
                <h3 className="text-lg font-semibold">Parsing File...</h3>
                <p className="text-sm text-neutral-500 mt-2">Extracting rows and matching columns</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <FileUp size={32} />
                </div>
                <h3 className="text-lg font-semibold">Click or drag file to upload</h3>
                <p className="text-sm text-neutral-500 mt-2 max-w-sm">
                  Upload an Excel (.xlsx, .xls), CSV, or Word (.docx) file containing your student list.
                </p>
                <div className="mt-6 flex items-center gap-4 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  <span>Name</span> • <span>Email</span> • <span>Phone</span> • <span>Class</span>
                </div>
              </div>
            )}
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls,.docx" onChange={handleFileDrop} />
          </div>
          <div className="flex justify-center mt-4">
            <button
              onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Download size={13} />
              Download Excel Template
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW */}
      {step === 'preview' && data && (
        <div className="space-y-6 flex flex-col max-h-[70vh]">
          
          <div className="flex items-center justify-between glass-panel p-4 rounded-xl">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-neutral-900">{data.ready_count}</span>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500">Ready</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-amber-600">{data.warning_count}</span>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-600/70">Warnings</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-red-600">{data.error_count}</span>
                <span className="text-[11px] uppercase tracking-wider font-semibold text-red-600/70">Errors</span>
              </div>
            </div>
            <div className="text-right text-xs text-neutral-500">
              <p>Detected columns: <span className="font-semibold text-neutral-900">{Object.values(data.column_map).filter(Boolean).join(', ')}</span></p>
              {data.unrecognised_standards.length > 0 && (
                <p className="text-red-500 mt-1 flex items-center justify-end gap-1"><AlertTriangle size={12}/> Unmatched standards detected</p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {Object.entries(groupByStandard(data.students)).map(([stdName, studs]) => (
              <div key={stdName}>
                <h4 className={`text-sm font-bold mb-2 flex items-center gap-2 ${stdName === 'Unmatched Standards' ? 'text-red-600' : 'text-neutral-900'}`}>
                  {stdName === 'Unmatched Standards' ? <AlertTriangle size={16}/> : null}
                  {stdName} <span className="text-neutral-400 font-normal text-xs">({studs.length} students)</span>
                </h4>
                <div className="glass-panel rounded-xl overflow-hidden divide-y divide-white/40">
                  {studs.map((s, i) => (
                    <div key={i} className="p-3 flex items-start gap-3 hover:bg-white/40 transition-colors">
                      <div className="mt-0.5 flex-shrink-0">
                        {s.status === 'ready' && <CheckCircle2 size={16} className="text-green-500" />}
                        {s.status === 'warning' && <AlertTriangle size={16} className="text-amber-500" />}
                        {s.status === 'error' && <XCircle size={16} className="text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-4 gap-4 items-center">
                        <div className="col-span-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${!s.raw_name ? 'text-red-500 italic' : ''}`}>
                            {s.raw_name || 'Missing Name'}
                          </p>
                          {s.generated_username && <p className="text-xs text-neutral-500 truncate">@{s.generated_username}</p>}
                        </div>
                        <div className="col-span-1 text-sm text-neutral-600 truncate">{s.raw_email || '—'}</div>
                        <div className="col-span-1 text-sm text-neutral-600 truncate">
                          {s.raw_phone && <div>S: {s.raw_phone}</div>}
                          {s.raw_parent_phone && <div className="text-xs text-neutral-400">P: {s.raw_parent_phone}</div>}
                          {!s.raw_phone && !s.raw_parent_phone && '—'}
                        </div>
                        <div className="col-span-1 text-xs">
                          {s.errors.map(err => <p key={err} className="text-red-600">{err}</p>)}
                          {s.warnings.map(warn => <p key={warn} className="text-amber-600">{warn}</p>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
            <Btn variant="outline" onClick={() => setStep('upload')}>Cancel</Btn>
            <Btn variant="primary" onClick={handleImport} disabled={data.error_count > 0} icon={Upload}>
              Import {data.ready_count + data.warning_count} students
            </Btn>
          </div>
        </div>
      )}

      {/* STEP 3: IMPORTING */}
      {step === 'importing' && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 size={48} className="text-blue-600 animate-spin mb-6" />
          <h3 className="text-xl font-bold mb-2">Creating accounts...</h3>
          <p className="text-neutral-500 mb-6">Please do not close this window.</p>
          
          <div className="w-full max-w-md bg-neutral-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm font-medium mt-3 text-neutral-600">
            {progress.current} of {progress.total} students processed
          </p>
        </div>
      )}

      {/* STEP 4: DONE */}
      {step === 'done' && (
        <div className="py-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-6 shadow-sm">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Import Complete!</h2>
          <p className="text-neutral-600 mb-8 max-w-sm">
            Successfully imported {progress.successes} students.
            {progress.skipped > 0 && <span className="text-amber-600 ml-1">{progress.skipped} already existed and were skipped.</span>}
            {progress.errors > 0 && <span className="text-red-600 ml-1">Failed to import {progress.errors} students.</span>}
          </p>
          
          <div className="glass-panel p-6 rounded-2xl border-white/60 w-full max-w-md flex flex-col items-center">
            <UserPlus size={24} className="text-blue-600 mb-3" />
            <h4 className="font-semibold mb-1">Student Credentials</h4>
            <p className="text-sm text-neutral-500 mb-5 text-center">
              Download the credentials sheet now. You will need to share these temporary passwords with your students.
            </p>
            <Btn variant="primary" onClick={downloadCredentials} icon={Download} className="w-full justify-center">
              Download Credentials (.xlsx)
            </Btn>
          </div>
          
          <button onClick={onClose} className="mt-8 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
            Close and return to dashboard
          </button>
        </div>
      )}

    </Modal>
  );
}
