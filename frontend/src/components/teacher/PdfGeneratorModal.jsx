import React, { useState, useRef, useEffect } from 'react';
import {
  Loader2, FileText, Image, Sparkles, Check, RefreshCw,
  Upload, X, AlertCircle,
} from 'lucide-react';

const IMG_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];
const isImageFile = (f) => f && IMG_EXTS.some(e => f.name.toLowerCase().endsWith(e));
import { Modal, Btn } from '../ui';
import { testApi } from '../../lib/api';

// ── Loop status displayed during AI generation ───────────────────────────────
const LOOP_STEPS = [
  'Reading file...',
  'Generating questions...',
  'Evaluating quality & duplicates...',
  'Fixing weak questions...',
  'Balancing difficulty & finalising...',
];

// ── Difficulty badge ─────────────────────────────────────────────────────────
function DiffBadge({ diff }) {
  const cls = {
    easy:   'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    hard:   'bg-red-100 text-red-700',
  }[diff] || 'bg-neutral-100 text-neutral-500';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${cls}`}>
      {diff || 'medium'}
    </span>
  );
}

// ── Single question review card ──────────────────────────────────────────────
function QuestionCard({ index, question, flagged, onToggle }) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${
      flagged ? 'border-red-300 bg-red-50/40' : 'border-[#EBEAE7] bg-white'
    }`}>
      {/* Row: number + difficulty + redo button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-neutral-400 flex-shrink-0">Q{index + 1}</span>
          <DiffBadge diff={question.difficulty} />
        </div>
        <button
          onClick={onToggle}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex-shrink-0 ${
            flagged
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'
          }`}
        >
          {flagged ? <><X size={10} />Undo</> : <><RefreshCw size={10} />Redo</>}
        </button>
      </div>

      {/* Question stem */}
      <p className="text-sm font-medium text-neutral-800 leading-snug pl-3 sm:pl-8">
        {question.question}
      </p>

      {/* Options */}
      <div className="pl-3 sm:pl-8 space-y-1">
        {(question.options || []).map((opt, oi) => (
          <div key={oi} className={`flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 ${
            oi === question.correct_idx
              ? 'bg-green-100 text-green-800 font-medium'
              : 'text-neutral-500'
          }`}>
            <span className="text-xs font-bold w-4 flex-shrink-0 text-neutral-400">
              {String.fromCharCode(65 + oi)}
            </span>
            <span className="flex-1">{opt}</span>
            {oi === question.correct_idx && <Check size={12} className="text-green-600 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PdfGeneratorModal({ open, onClose, onQuestionsReady, subjectHint = '' }) {
  const [phase, setPhase]           = useState('upload'); // 'upload'|'generating'|'review'
  const [pdfFile, setPdfFile]       = useState(null);
  const [count, setCount]           = useState(10);
  const [questions, setQuestions]   = useState([]);
  const [sessionId, setSessionId]   = useState('');
  const [quality, setQuality]       = useState(null);
  const [flagged, setFlagged]       = useState(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [statusIdx, setStatusIdx]   = useState(0);
  const [humanLoops, setHumanLoops] = useState(0);
  const [error, setError]           = useState('');
  const fileRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase('upload');
      setPdfFile(null);
      setCount(10);
      setQuestions([]);
      setSessionId('');
      setQuality(null);
      setFlagged(new Set());
      setHumanLoops(0);
      setError('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open]);

  // Advance loop step label every 7 s during generation
  useEffect(() => {
    if (phase !== 'generating') { setStatusIdx(0); return; }
    const t = setInterval(() => setStatusIdx(i => Math.min(i + 1, LOOP_STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!pdfFile) return;
    setPhase('generating');
    setError('');
    setFlagged(new Set());
    setStatusIdx(0);
    try {
      const data = await testApi.generateFromPdf(pdfFile, count, subjectHint);
      setQuestions(data.questions || []);
      setSessionId(data.session_id || '');
      setQuality({
        quality10:  data.quality_out_of_10        || 0,
        iterations: data.iterations               || 1,
        difficulty: data.difficulty_distribution  || {},
      });
      setPhase('review');
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
      setPhase('upload');
    }
  };

  // ── Toggle flag on a question ─────────────────────────────────────────────
  const toggleFlag = (i) => {
    setFlagged(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // ── Regenerate only the flagged questions ─────────────────────────────────
  const handleRegenerateFlagged = async () => {
    if (!flagged.size) return;
    setRegenerating(true);
    setError('');
    try {
      const flaggedQuestions = [...flagged].sort((a, b) => a - b).map(i => questions[i]);
      const goodStems = questions
        .filter((_, i) => !flagged.has(i))
        .map(q => q.question.slice(0, 80));

      const data = await testApi.regenerateFlagged(sessionId, flaggedQuestions, goodStems, subjectHint);
      const replacements = data.questions || [];

      const next = [...questions];
      let ri = 0;
      [...flagged].sort((a, b) => a - b).forEach(i => {
        if (ri < replacements.length) next[i] = replacements[ri++];
      });

      setQuestions(next);
      setFlagged(new Set());
      setHumanLoops(h => h + 1);
      if (data.quality_out_of_10) {
        setQuality(prev => ({ ...prev, quality10: data.quality_out_of_10 }));
      }
    } catch (err) {
      setError(err.message || 'Regeneration failed. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  // ── Accept questions into the test editor ─────────────────────────────────
  const handleUse = () => {
    const mapped = questions.map((q, i) => ({
      id:          Date.now() + i,
      question:    q.question,
      options:     q.options,
      correct_idx: q.correct_idx,
      order_num:   i + 1,
    }));
    onQuestionsReady(mapped, quality);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Generate Questions from PDF" size="lg">
      <div className="space-y-4">

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── UPLOAD PHASE ─────────────────────────────────────────────── */}
        {phase === 'upload' && (
          <div className="space-y-5">

            {/* 3-step guidance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  n: 1, title: 'Upload File',
                  desc: 'PDF, photo of textbook, whiteboard shot, or scanned notes (JPG, PNG, WEBP)',
                },
                {
                  n: 2, title: 'AI Generates',
                  desc: '4-round quality loop scores & fixes every question automatically',
                },
                {
                  n: 3, title: 'You Review',
                  desc: 'Flag any question you dislike — AI regenerates only those',
                },
              ].map(({ n, title, desc }) => (
                <div key={n} className="bg-neutral-50 border border-[#EBEAE7] rounded-xl p-3 flex sm:block items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0 sm:mb-1.5">
                    <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {n}
                    </span>
                    <span className="text-xs font-semibold text-neutral-700 sm:hidden">{title}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-neutral-700 hidden sm:block mb-0.5">{title}</span>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Drop zone */}
            <label className={`block border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center cursor-pointer transition-colors ${
              pdfFile
                ? 'border-neutral-400 bg-neutral-50'
                : 'border-neutral-200 hover:border-neutral-400 bg-[#FAFAF9]'
            }`}>
              <div className="space-y-2">
                {pdfFile ? (
                  <>
                    {isImageFile(pdfFile)
                      ? <Image size={28} className="mx-auto text-neutral-600" />
                      : <FileText size={28} className="mx-auto text-neutral-600" />}
                    <p className="text-sm font-medium text-neutral-800">{pdfFile.name}</p>
                    <p className="text-xs text-neutral-400">
                      {(pdfFile.size / 1024).toFixed(0)} KB · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <Upload size={28} className="mx-auto text-neutral-300" />
                    <p className="text-sm font-medium text-neutral-600">
                      Drop a PDF or image here, or click to browse
                    </p>
                    <p className="text-xs text-neutral-400">
                      PDF · JPG · PNG · WEBP · Max 10 MB
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => { setPdfFile(e.target.files[0] || null); setError(''); }}
              />
            </label>

            {/* Question count pills */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-600">How many questions?</p>
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 15, 20, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      count === n
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <Btn
              onClick={handleGenerate}
              disabled={!pdfFile}
              variant="primary"
              size="lg"
              className="w-full"
            >
              <Sparkles size={16} />
              Generate {count} Questions
            </Btn>
          </div>
        )}

        {/* ── GENERATING PHASE ─────────────────────────────────────────── */}
        {phase === 'generating' && (
          <div className="py-6 sm:py-10 flex flex-col items-center space-y-6 sm:space-y-8">
            {/* Spinner */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-neutral-100 border-t-neutral-900 animate-spin" />
              <Sparkles size={18} className="absolute inset-0 m-auto text-neutral-400" />
            </div>

            <div className="text-center">
              <p className="font-semibold text-neutral-800">{LOOP_STEPS[statusIdx]}</p>
              <p className="text-xs text-neutral-400 mt-1">AI quality loop · up to 4 iterations</p>
            </div>

            {/* Loop step visualisation */}
            <div className="w-full max-w-xs space-y-2.5">
              {LOOP_STEPS.map((label, i) => (
                <div key={i} className={`flex items-center gap-3 text-sm transition-all ${
                  i < statusIdx
                    ? 'text-neutral-400'
                    : i === statusIdx
                      ? 'text-neutral-900 font-semibold'
                      : 'text-neutral-200'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    i < statusIdx
                      ? 'bg-green-100 text-green-600'
                      : i === statusIdx
                        ? 'bg-neutral-900 text-white animate-pulse'
                        : 'bg-neutral-100 text-neutral-300'
                  }`}>
                    {i < statusIdx ? <Check size={11} /> : i + 1}
                  </div>
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── REVIEW PHASE ─────────────────────────────────────────────── */}
        {phase === 'review' && (
          <div className="space-y-4">

            {/* Quality summary bar */}
            {quality && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-green-900">
                      Quality {quality.quality10}/10
                    </p>
                    <p className="text-xs text-green-600">
                      {quality.iterations} AI loop iteration{quality.iterations !== 1 ? 's' : ''}
                      {humanLoops > 0 && ` · ${humanLoops} manual refinement${humanLoops !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs text-green-700 bg-white/60 rounded-lg px-3 py-1.5 border border-green-200 flex-shrink-0">
                    <span>Easy&nbsp;{quality.difficulty?.easy ?? 0}</span>
                    <span className="text-green-300">·</span>
                    <span>Med&nbsp;{quality.difficulty?.medium ?? 0}</span>
                    <span className="text-green-300">·</span>
                    <span>Hard&nbsp;{quality.difficulty?.hard ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Inline tip */}
            <div className="text-xs text-neutral-500 bg-neutral-50 border border-[#EBEAE7] rounded-xl p-3 flex gap-2">
              <span className="flex-shrink-0">💡</span>
              <span>
                Click <strong className="text-neutral-700">Redo</strong> on any question you want replaced.
                The AI generates a fresh question on a different topic.
                You can do this as many times as you like.
              </span>
            </div>

            {/* Question cards */}
            <div className="max-h-[38vh] sm:max-h-[45vh] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {questions.map((q, i) => (
                <QuestionCard
                  key={i}
                  index={i}
                  question={q}
                  flagged={flagged.has(i)}
                  onToggle={() => toggleFlag(i)}
                />
              ))}
            </div>

            {/* Bottom actions */}
            <div className="space-y-2 pt-2 border-t border-[#EBEAE7]">
              {flagged.size > 0 && (
                <Btn
                  onClick={handleRegenerateFlagged}
                  disabled={regenerating}
                  variant="default"
                  className="w-full"
                >
                  {regenerating
                    ? <><Loader2 size={14} className="animate-spin" />Regenerating…</>
                    : <><RefreshCw size={14} />Regenerate {flagged.size} flagged question{flagged.size !== 1 ? 's' : ''}</>
                  }
                </Btn>
              )}
              <Btn onClick={handleUse} variant="primary" size="lg" className="w-full">
                <Check size={16} />
                Use These {questions.length} Questions
              </Btn>
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
