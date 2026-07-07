import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Check, FileText, Sparkles, RefreshCw } from 'lucide-react';
import { Modal, Input, Btn } from '../ui';
import { apiClient, testApi } from '../../lib/api';

export default function NewTestModal({ open, onClose, defaultClassId, onSuccess, editTestId }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Subject selector (used when no defaultClassId is provided)
  const [subjects, setSubjects] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  // Step 1: Settings
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [totalMarks, setTotalMarks] = useState(50);
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [penalty, setPenalty] = useState(0.25);
  const [scheduledFor, setScheduledFor] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Step 2: Questions
  const [questions, setQuestions] = useState([
    { id: 1, question: '', options: ['', '', '', ''], correct_idx: 0 }
  ]);

  const [fetchingTest, setFetchingTest] = useState(false);

  // PDF generator state
  const [pdfFile, setPdfFile]             = useState(null);
  const [pdfCount, setPdfCount]           = useState(10);
  const [pdfLoading, setPdfLoading]       = useState(false);
  const [pdfError, setPdfError]           = useState('');
  const [pdfStatusIdx, setPdfStatusIdx]   = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const pdfInputRef = useRef(null);

  // Matches the real loop phases: extract → generate → [evaluate → fix] × N
  const PDF_STATUS = [
    'Reading PDF...',
    'Generating questions...',
    'Evaluating quality...',
    'Fixing weak questions...',
    'Final quality check...',
  ];

  useEffect(() => {
    if (!pdfLoading) { setPdfStatusIdx(0); return; }
    // Advance message every 7s to roughly track the loop iterations
    const t = setInterval(() => setPdfStatusIdx(i => Math.min(i + 1, PDF_STATUS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [pdfLoading]);

  const [pdfResult, setPdfResult] = useState(null); // {iterations, avg_quality, count}

  const hasRealQuestions = questions.some(q => q.question.trim());

  const handleGenerateFromPdf = async (force = false) => {
    if (!pdfFile) return;
    if (hasRealQuestions && !force) { setConfirmReplace(true); return; }
    setConfirmReplace(false);
    setPdfLoading(true);
    setPdfError('');
    setPdfResult(null);
    try {
      const data = await testApi.generateFromPdf(pdfFile, pdfCount, title);
      const mapped = data.questions.map((q, i) => ({
        id: Date.now() + i,
        question: q.question,
        options: q.options,
        correct_idx: q.correct_idx,
        order_num: q.order_num,
      }));
      setQuestions(mapped);
      setPdfResult({
        count:       mapped.length,
        iterations:  data.iterations           || 1,
        quality10:   data.quality_out_of_10    || 0,
        difficulty:  data.difficulty_distribution || {},
      });
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    } catch (err) {
      setPdfError(err.message || 'Failed to generate questions. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // Reset form when modal closes/opens; fetch test details if in edit mode
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setError('');
      if (!defaultClassId) {
        apiClient('/subjects').then(data => setSubjects(Array.isArray(data) ? data : [])).catch(() => {});
      }
      
      if (editTestId) {
        setFetchingTest(true);
        testApi.getTestForEdit(editTestId).then(data => {
          const t = data.test;
          setTitle(t.title);
          setDuration(t.duration_mins);
          setTotalMarks(t.total_marks);
          setNegativeMarking(t.negative_marking);
          setPenalty(t.penalty || 0.25);
          
          const fmtDate = (d) => {
            if (!d) return '';
            const dt = new Date(d);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            return dt.toISOString().slice(0, 16);
          };
          
          setScheduledFor(fmtDate(t.scheduled_for));
          setExpiresAt(fmtDate(t.expires_at));
          setSelectedClassId(t.class_id);
          
          if (data.questions && data.questions.length > 0) {
            const parsedQuestions = data.questions.map(q => {
              let opts = q.options;
              if (typeof opts === 'string') {
                try { opts = JSON.parse(opts); } catch(e) { opts = ['', '', '', '']; }
              }
              return { ...q, options: Array.isArray(opts) ? opts : ['', '', '', ''] };
            });
            setQuestions(parsedQuestions);
          } else {
            setQuestions([{ id: Date.now(), question: '', options: ['', '', '', ''], correct_idx: 0 }]);
          }
        }).catch(err => setError(err.message || 'Failed to load test'))
          .finally(() => setFetchingTest(false));
      } else {
        setTitle('');
        setDuration(30);
        setTotalMarks(50);
        setNegativeMarking(false);
        setPenalty(0.25);
        setScheduledFor('');
        setExpiresAt('');
        setSelectedClassId(defaultClassId || '');
        setQuestions([{ id: Date.now(), question: '', options: ['', '', '', ''], correct_idx: 0 }]);
      }
    }
  }, [open, defaultClassId, editTestId]);

  const classId = defaultClassId || selectedClassId;

  const handleNext = () => {
    if (!classId) {
      setError('Please select a subject');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a test title');
      return;
    }
    if (!scheduledFor) {
      setError('Start Time is required');
      return;
    }
    if (!expiresAt) {
      setError('End Time is required');
      return;
    }
    if (new Date(expiresAt) <= new Date(scheduledFor)) {
      setError('End Time must be after Start Time');
      return;
    }
    setError('');
    setStep(2);
  };

  const addQuestion = () => {
    setQuestions([...questions, { id: Date.now(), question: '', options: ['', '', '', ''], correct_idx: 0 }]);
  };

  const removeQuestion = (idx) => {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, field, value) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (qIdx, optIdx, value) => {
    const updated = [...questions];
    const newOptions = [...updated[qIdx].options];
    newOptions[optIdx] = value;
    updated[qIdx] = { ...updated[qIdx], options: newOptions };
    setQuestions(updated);
  };

  const handleSubmit = async () => {
    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        setError(`Question ${i + 1} is empty`);
        return;
      }
      if (q.options.some(opt => !opt.trim())) {
        setError(`Please fill all options for Question ${i + 1}`);
        return;
      }
    }

    setLoading(true);
    setError('');
    try {
      const formattedQuestions = questions.map((q, idx) => ({
        id: typeof q.id === 'string' ? q.id : undefined,
        question: q.question,
        options: q.options,
        correct_idx: q.correct_idx,
        order_num: idx + 1
      }));

      const payload = {
        class_id: classId,
        title,
        duration_mins: parseInt(duration) || 30,
        total_marks: parseFloat(totalMarks) || 50,
        negative_marking: negativeMarking,
        penalty: negativeMarking ? (parseFloat(penalty) || 0.25) : 0,
        status: scheduledFor ? 'scheduled' : 'active',
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        questions: formattedQuestions
      };

      let created;
      if (editTestId) {
        created = await testApi.updateTestFull(editTestId, payload);
      } else {
        created = await testApi.createTestWithQuestions(payload);
      }

      onClose();
      if (onSuccess) onSuccess(created);
    } catch (err) {
      setError(err.message || 'Failed to create test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editTestId ? "Edit Test" : "Create New Test"} size="lg">
      {fetchingTest ? (
        <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-neutral-400" /></div>
      ) : (
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
        {error && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-md font-medium sticky top-0 z-10">{error}</div>}

        {step === 1 ? (
          <div className="space-y-4">
            {!defaultClassId && (
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Subject</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 outline-none text-sm"
                >
                  <option value="">— select a subject —</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Input label="Test title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly Quiz 1" />
            
            <div className="grid grid-cols-2 gap-4">
              <Input label="Duration (mins)" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
              <Input label="Total marks" type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
            </div>

            <div className="flex items-center justify-between p-3 glass-panel rounded-md">
              <div>
                <p className="text-sm font-medium">Negative marking</p>
                <p className="text-xs text-neutral-500">Deduct marks for wrong answers</p>
              </div>
              <button onClick={() => setNegativeMarking(!negativeMarking)}
                className={`w-11 h-6 rounded-full transition-colors ${negativeMarking ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-all ${negativeMarking ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </button>
            </div>

            {negativeMarking && (
              <Input label="Penalty per wrong answer" type="number" step="0.25" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Start Time" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
              <Input label="End Time" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <div className="flex justify-end pt-2">
              <Btn onClick={handleNext} variant="primary" className="w-full">
                Next: Add Questions <ArrowRight size={16} className="ml-2" />
              </Btn>
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── PDF Generator Card ─────────────────────────────────── */}
            <div className="p-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-700">Generate from PDF</span>
                <span className="text-xs text-neutral-400 ml-auto">Groq AI · Free</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg cursor-pointer hover:border-neutral-400 transition-colors text-sm text-neutral-500 min-w-0">
                  <FileText size={14} className="flex-shrink-0 text-neutral-400" />
                  <span className="truncate">{pdfFile ? pdfFile.name : 'Choose PDF file...'}</span>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={e => { setPdfFile(e.target.files[0] || null); setPdfError(''); setConfirmReplace(false); }}
                  />
                </label>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="text-xs text-neutral-500 whitespace-nowrap">Questions:</label>
                  <input
                    type="number"
                    min={3} max={30}
                    value={pdfCount}
                    onChange={e => setPdfCount(Math.max(3, Math.min(30, parseInt(e.target.value) || 10)))}
                    className="w-16 px-2 py-2 text-sm border border-neutral-200 rounded-lg bg-white text-center focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
                  />
                </div>
              </div>

              {confirmReplace && !pdfLoading && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="flex-1">This will replace your {questions.length} existing question{questions.length !== 1 ? 's' : ''}.</span>
                  <button onClick={() => handleGenerateFromPdf(true)} className="font-semibold underline">Replace</button>
                  <button onClick={() => setConfirmReplace(false)} className="text-neutral-500 ml-1">Cancel</button>
                </div>
              )}

              {pdfError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{pdfError}</p>
              )}

              {pdfResult && !pdfLoading && (
                <div className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <Check size={13} className="flex-shrink-0" />
                    <span>{pdfResult.count} questions · {pdfResult.iterations} loop iteration{pdfResult.iterations !== 1 ? 's' : ''} · quality {pdfResult.quality10}/10</span>
                  </div>
                  {pdfResult.difficulty && (
                    <div className="flex gap-3 text-green-600 pl-5">
                      <span>Easy: {pdfResult.difficulty.easy || 0}</span>
                      <span>Medium: {pdfResult.difficulty.medium || 0}</span>
                      <span>Hard: {pdfResult.difficulty.hard || 0}</span>
                    </div>
                  )}
                </div>
              )}

              <Btn
                onClick={() => handleGenerateFromPdf(false)}
                disabled={!pdfFile || pdfLoading}
                variant="default"
                className="w-full"
              >
                {pdfLoading
                  ? <><Loader2 size={14} className="animate-spin mr-2" />{PDF_STATUS[pdfStatusIdx]}</>
                  : <><RefreshCw size={14} className="mr-2" />{pdfResult ? 'Regenerate' : 'Generate Questions'}</>
                }
              </Btn>
            </div>
            {/* ────────────────────────────────────────────────────────── */}

            {questions.map((q, qIdx) => (
              <div key={q.id} className="p-4 glass-panel border-white/60 rounded-xl space-y-4 relative group">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-2">
                    {qIdx + 1}
                  </div>
                  <div className="flex-1">
                    <textarea 
                      className="w-full bg-white/50 border border-white/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20 placeholder-neutral-400 min-h-[80px]"
                      placeholder="Type your question here..."
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                    />
                  </div>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(qIdx)} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 absolute top-2 right-2">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="pl-9 space-y-2">
                  {q.options.map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <button 
                        onClick={() => updateQuestion(qIdx, 'correct_idx', optIdx)}
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${
                          q.correct_idx === optIdx ? 'bg-green-500 border-green-500 text-white' : 'border-neutral-300 hover:border-neutral-400 bg-white'
                        }`}
                        title="Mark as correct answer"
                      >
                        {q.correct_idx === optIdx && <Check size={12} strokeWidth={3} />}
                      </button>
                      <input 
                        type="text"
                        className="flex-1 bg-white/50 border border-white/60 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/20 placeholder-neutral-400"
                        placeholder={`Option ${optIdx + 1}`}
                        value={opt}
                        onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <Btn onClick={addQuestion} variant="default" className="w-full border-dashed border-2 py-6 text-neutral-500 hover:text-neutral-900 hover:border-neutral-400">
              <Plus size={18} className="mr-2" /> Add Question
            </Btn>

            <div className="flex gap-3 pt-4 border-t border-white/40 sticky bottom-0 bg-white/80 backdrop-blur-md p-3 -mx-2 rounded-xl">
              <Btn onClick={() => setStep(1)} variant="ghost" icon={ArrowLeft}>Back</Btn>
              <Btn variant="primary" onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
                {editTestId ? 'Save Changes' : `Publish Test (${questions.length} questions)`}
              </Btn>
            </div>
          </div>
        )}
      </div>
      )}
    </Modal>
  );
}
