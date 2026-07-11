import React, { useState, useRef, useEffect } from 'react';
import {
  Loader2, FileText, Image, Sparkles, Check, RefreshCw,
  Upload, X, AlertCircle, ChevronDown,
} from 'lucide-react';
import pdfjsLib from '../../lib/pdfjs';

const IMG_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];
const isImageFile = (f) => f && IMG_EXTS.some(e => f.name.toLowerCase().endsWith(e));
const isPdfFile = (f) => f && (
  f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
);
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
    <div className={`rounded-xl border p-3 space-y-2 transition-all ${
      flagged ? 'border-red-300 bg-red-50/40' : 'border-[#EBEAE7] bg-white'
    }`}>
      {/* Row: number + difficulty + redo button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-neutral-400 flex-shrink-0">Q{index + 1}</span>
          <DiffBadge diff={question.difficulty} />
        </div>
        <button
          onClick={onToggle}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium transition-colors flex-shrink-0 ${
            flagged
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'
          }`}
        >
          {flagged ? <><X size={10} />Undo</> : <><RefreshCw size={10} />Redo</>}
        </button>
      </div>

      {/* Question stem */}
      <p className="text-sm font-medium text-neutral-800 leading-snug">
        {question.question}
      </p>

      {/* Options */}
      <div className="space-y-0.5">
        {(question.options || []).map((opt, oi) => (
          <div key={oi} className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1 ${
            oi === question.correct_idx
              ? 'bg-green-100 text-green-800 font-medium'
              : 'text-neutral-500'
          }`}>
            <span className="font-bold w-3.5 flex-shrink-0 text-neutral-400">
              {String.fromCharCode(65 + oi)}
            </span>
            <span className="flex-1">{opt}</span>
            {oi === question.correct_idx && <Check size={11} className="text-green-600 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// PDF thumbnails render only when they are close to the scroll viewport. This
// keeps long textbooks usable on phones without drawing every page at once.
function PdfPageThumbnail({ doc, pageNumber, selected, onToggle }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [isNearViewport, setIsNearViewport] = useState(pageNumber <= 4);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!wrapperRef.current || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (entry) setIsNearViewport(entry.isIntersecting);
      },
      { rootMargin: '240px' },
    );
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const releaseCanvas = () => {
      if (!canvas) return;
      canvas.width = 1;
      canvas.height = 1;
    };

    if (!isNearViewport || !doc) {
      setRendered(false);
      releaseCanvas();
      return undefined;
    }

    let cancelled = false;
    let renderTask;
    let page;
    setRenderError(false);
    setRendered(false);

    (async () => {
      try {
        page = await doc.getPage(pageNumber);
        const initialViewport = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const scale = (220 / initialViewport.width) * pixelRatio;
        const viewport = page.getViewport({ scale });
        if (cancelled || !canvas) return;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({
          canvasContext: canvas.getContext('2d', { alpha: false }),
          viewport,
        });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') setRenderError(true);
      }
    })();

    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* render already completed */ }
      try { page?.cleanup(); } catch { /* page already released */ }
      releaseCanvas();
    };
  }, [doc, pageNumber, isNearViewport]);

  return (
    <button
      ref={wrapperRef}
      type="button"
      onClick={() => onToggle(pageNumber)}
      aria-pressed={selected}
      aria-label={`${selected ? 'Deselect' : 'Select'} PDF page ${pageNumber}`}
      className={`group relative min-h-44 overflow-hidden rounded-xl border-2 bg-neutral-100 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${
        selected
          ? 'border-neutral-900 shadow-md'
          : 'border-transparent hover:border-neutral-300 active:border-neutral-400'
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-white flex items-center justify-center">
        {renderError ? (
          <div className="px-3 text-center text-[11px] text-neutral-400">Preview unavailable</div>
        ) : (
          <>
            {!rendered && <div className="absolute inset-0 animate-pulse bg-neutral-100" />}
            <canvas
              ref={canvasRef}
              width="1"
              height="1"
              aria-hidden="true"
              className={`block h-full w-full object-contain transition-opacity ${rendered ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        )}
      </div>
      <div className={`flex min-h-11 items-center justify-between gap-2 px-3 text-xs font-semibold ${
        selected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600'
      }`}>
        <span>Page {pageNumber}</span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          selected ? 'border-white bg-white text-neutral-900' : 'border-neutral-300 text-transparent'
        }`}>
          <Check size={12} strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}

function getRangeError(fromValue, toValue, pageCount) {
  if (!fromValue && !toValue) return '';
  if (!fromValue || !toValue) return 'Enter both From and To page numbers.';

  const from = Number(fromValue);
  const to = Number(toValue);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return 'Use whole page numbers.';
  if (from < 1 || to < 1) return 'Page numbers must start at 1.';
  if (from > to) return 'From page cannot be after To page.';
  if (pageCount && (from > pageCount || to > pageCount)) {
    return `This PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`;
  }
  return '';
}

function summarizePages(pages) {
  const ranges = [];
  pages.forEach((page) => {
    const last = ranges[ranges.length - 1];
    if (last && page === last[1] + 1) last[1] = page;
    else ranges.push([page, page]);
  });
  const labels = ranges.map(([start, end]) => start === end ? String(start) : `${start}-${end}`);
  return labels.length > 8
    ? `${labels.slice(0, 8).join(', ')} and ${labels.length - 8} more range${labels.length - 8 === 1 ? '' : 's'}`
    : labels.join(', ');
}

function PdfPageSelector({ file, selectedPages, onSelectedPagesChange, onPageCountChange }) {
  const [doc, setDoc] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    setDoc(null);
    setPageCount(0);
    setLoading(true);
    setLoadError('');
    setRangeFrom('');
    setRangeTo('');

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const nextDoc = await loadingTask.promise;
        if (cancelled) return;
        setDoc(nextDoc);
        setPageCount(nextDoc.numPages);
        onPageCountChange(nextDoc.numPages);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF page preview failed:', err);
          setLoadError('Could not preview this PDF. You can close page selection and generate from the full file.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy().catch(() => {});
    };
  }, [file, onPageCountChange]);

  const sortedSelected = [...selectedPages].sort((a, b) => a - b);
  const rangeError = getRangeError(rangeFrom, rangeTo, pageCount);
  const canAddRange = Boolean(rangeFrom && rangeTo && pageCount && !rangeError);

  const togglePage = (pageNumber) => {
    const next = new Set(selectedPages);
    if (next.has(pageNumber)) next.delete(pageNumber);
    else next.add(pageNumber);
    onSelectedPagesChange(next);
  };

  const addRange = () => {
    if (!canAddRange) return;
    const next = new Set(selectedPages);
    for (let page = Number(rangeFrom); page <= Number(rangeTo); page += 1) next.add(page);
    onSelectedPagesChange(next);
    setRangeFrom('');
    setRangeTo('');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E4E2DE] bg-[#FAFAF9]">
      <div className="space-y-3 border-b border-[#E4E2DE] p-3 sm:p-4">
        <div>
          <p className="text-xs font-semibold text-neutral-700">Add a page range</p>
          <p className="mt-0.5 text-[11px] text-neutral-400">Ranges and tapped pages are combined.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="min-w-0 space-y-1">
            <span className="text-[11px] font-medium text-neutral-500">From</span>
            <input
              type="number"
              min="1"
              max={pageCount || undefined}
              inputMode="numeric"
              value={rangeFrom}
              onChange={event => setRangeFrom(event.target.value)}
              aria-invalid={Boolean(rangeError)}
              aria-describedby={rangeError ? 'pdf-page-range-error' : undefined}
              placeholder="1"
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
            />
          </label>
          <label className="min-w-0 space-y-1">
            <span className="text-[11px] font-medium text-neutral-500">To</span>
            <input
              type="number"
              min="1"
              max={pageCount || undefined}
              inputMode="numeric"
              value={rangeTo}
              onChange={event => setRangeTo(event.target.value)}
              aria-invalid={Boolean(rangeError)}
              aria-describedby={rangeError ? 'pdf-page-range-error' : undefined}
              placeholder={pageCount ? String(pageCount) : '10'}
              className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200"
            />
          </label>
          <button
            type="button"
            onClick={addRange}
            disabled={!canAddRange}
            className="mt-auto min-h-11 rounded-xl bg-neutral-900 px-4 text-xs font-semibold text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 min-[360px]:col-span-2 sm:col-span-1"
          >
            Add range
          </button>
        </div>
        {rangeError && (
          <p id="pdf-page-range-error" role="alert" className="text-[11px] font-medium text-red-600">
            {rangeError}
          </p>
        )}
      </div>

      <div className="max-h-[46vh] overflow-y-auto overscroll-contain custom-scrollbar">
        <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[#E4E2DE] bg-white/95 px-3 py-2 backdrop-blur sm:px-4">
          <div>
            <p className="text-xs font-bold text-neutral-800">
              {selectedPages.size
                ? `${selectedPages.size} page${selectedPages.size === 1 ? '' : 's'} selected`
                : 'Full PDF by default'}
            </p>
            <p className="text-[10px] text-neutral-400">
              {pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'} total` : 'Reading page count...'}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!pageCount || selectedPages.size === pageCount}
              onClick={() => onSelectedPagesChange(new Set(Array.from({ length: pageCount }, (_, i) => i + 1)))}
              className="min-h-11 rounded-lg px-3 text-[11px] font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={!selectedPages.size}
              onClick={() => onSelectedPagesChange(new Set())}
              className="min-h-11 rounded-lg px-3 text-[11px] font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
            >
              Clear
            </button>
          </div>
        </div>

        {loading && (
          <div role="status" className="flex min-h-48 items-center justify-center gap-2 p-6 text-sm text-neutral-500">
            <Loader2 size={18} className="animate-spin" />
            Loading PDF pages...
          </div>
        )}

        {loadError && (
          <div role="alert" className="m-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:m-4">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {!loading && !loadError && doc && (
          <div className="grid grid-cols-1 gap-3 p-3 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:p-4">
            {Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <PdfPageThumbnail
                  key={pageNumber}
                  doc={doc}
                  pageNumber={pageNumber}
                  selected={selectedPages.has(pageNumber)}
                  onToggle={togglePage}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[#E4E2DE] bg-white px-3 py-2.5 text-[11px] text-neutral-500 sm:px-4">
        {sortedSelected.length
          ? `AI will read page${sortedSelected.length === 1 ? '' : 's'} ${summarizePages(sortedSelected)}.`
          : 'No pages selected means AI will read the full PDF.'}
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
  const [pageSelectorOpen, setPageSelectorOpen] = useState(false);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [pdfPageCount, setPdfPageCount] = useState(0);
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
      setPageSelectorOpen(false);
      setSelectedPages(new Set());
      setPdfPageCount(0);
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
      const selectedPageList = isPdfFile(pdfFile)
        ? [...selectedPages].sort((a, b) => a - b)
        : [];
      const data = await testApi.generateFromPdf(pdfFile, count, subjectHint, selectedPageList);
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
          <div className="space-y-4">

            {/* Compact how-it-works strip */}
            <div className="flex items-center gap-2 text-[11px] text-neutral-500 bg-neutral-50 border border-[#EBEAE7] rounded-xl px-3 py-2.5">
              <span className="flex-shrink-0 text-base">🤖</span>
              <span><strong className="text-neutral-700">Upload → AI generates → You review.</strong> AI runs up to 4 quality loops, then you flag bad questions for instant replacement.</span>
            </div>

            {/* Privacy warning */}
            <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <span className="flex-shrink-0 mt-0.5">⚠️</span>
              <span><strong>Study material only.</strong> Upload textbooks, notes, or question papers. Do not upload marksheets, attendance registers, or any file containing student names or personal details — the file content is processed by an external AI service.</span>
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
                      PDF · JPG · PNG · WEBP
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  setPdfFile(e.target.files[0] || null);
                  setPageSelectorOpen(false);
                  setSelectedPages(new Set());
                  setPdfPageCount(0);
                  setError('');
                }}
              />
            </label>

            {/* Optional PDF page scope */}
            {isPdfFile(pdfFile) && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setPageSelectorOpen(value => !value)}
                  aria-expanded={pageSelectorOpen}
                  aria-controls="pdf-page-selector"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#E4E2DE] bg-white px-3.5 py-2.5 text-left transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                      <FileText size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-neutral-800">Choose PDF pages</span>
                      <span className="block truncate text-[11px] text-neutral-400">
                        {selectedPages.size
                          ? `${selectedPages.size} of ${pdfPageCount || '...'} pages selected`
                          : 'Optional - AI reads the full PDF by default'}
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    size={17}
                    className={`shrink-0 text-neutral-400 transition-transform ${pageSelectorOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {pageSelectorOpen && (
                  <div id="pdf-page-selector">
                    <PdfPageSelector
                      file={pdfFile}
                      selectedPages={selectedPages}
                      onSelectedPagesChange={setSelectedPages}
                      onPageCountChange={setPdfPageCount}
                    />
                  </div>
                )}
              </div>
            )}

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

            <div className="sticky bottom-0 z-20 -mx-1 bg-gradient-to-t from-white via-white to-white/80 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2">
              <Btn
                onClick={handleGenerate}
                disabled={!pdfFile}
                variant="primary"
                size="lg"
                className="w-full min-h-11"
              >
                <Sparkles size={16} />
                Generate {count} Questions
                {isPdfFile(pdfFile) && (
                  selectedPages.size
                    ? ` from ${selectedPages.size} Page${selectedPages.size === 1 ? '' : 's'}`
                    : ' from Full PDF'
                )}
              </Btn>
            </div>
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

            {/* Question cards */}
            <div className="max-h-[48vh] sm:max-h-[50vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
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
            <div className="space-y-2 pt-2 border-t border-[#EBEAE7] sticky bottom-0 bg-white pb-1">
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
