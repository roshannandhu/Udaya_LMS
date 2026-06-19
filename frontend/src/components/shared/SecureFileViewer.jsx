import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, AlertTriangle, FileText, ChevronLeft, ChevronRight, Lock, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { fetchSecureBlob } from '../../lib/api';
import ScreenshotGuard from './ScreenshotGuard';
import { useAuthStore } from '../../lib/auth';

// Screenshots can only be truly blocked inside the native app (Android FLAG_SECURE).
// So protected files are STUDENT-app-only: a student on web/desktop is told to open
// the app; teachers (content owners) keep full web access for managing materials.
const IS_NATIVE = Capacitor.isNativePlatform();

// pdf.js (lazy worker). v6 ships an ESM worker; Vite resolves the ?url import.
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * SecureFileViewer — view-only, no-download, in-app file viewer.
 *
 *  - Streams bytes from an AUTHED endpoint (no public URL, no new tab, no save).
 *  - PDF  → rendered to <canvas> via pdf.js (no browser PDF toolbar/print/save).
 *  - Image → <img> from an object URL (revoked on close, not draggable).
 *  - Docx → converted to read-only HTML via mammoth.
 *  - Wrapped in ScreenshotGuard (APK already blocks via FLAG_SECURE; web deters).
 *
 * Props: open, onClose, endpoint (e.g. `/notes/{id}/file`), title, cachedBlob? (offline).
 */
export default function SecureFileViewer({ open, onClose, endpoint, title = 'Document', cachedBlob = null }) {
  const user = useAuthStore(s => s.user);
  const role = useAuthStore(s => s.role);
  // Students may only view protected files inside the app (where screenshots are
  // blocked); on web they're shown an "open in the app" notice instead.
  const mustUseApp = role === 'student' && !IS_NATIVE;
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [kind, setKind]       = useState(null);   // 'pdf' | 'image' | 'html' | 'unsupported'
  const [imgUrl, setImgUrl]   = useState(null);
  const [html, setHtml]       = useState('');
  const [pdf, setPdf]         = useState(null);    // pdf.js document
  const [page, setPage]       = useState(1);
  const [numPages, setNumPages] = useState(0);

  const canvasRef = useRef(null);
  const objUrlRef = useRef(null);
  const pdfRef    = useRef(null);

  // Load + classify the file whenever the viewer opens for a new endpoint.
  useEffect(() => {
    if (!open || !endpoint || mustUseApp) return;  // never fetch bytes on student web
    let cancelled = false;
    setLoading(true); setError(''); setKind(null); setHtml(''); setImgUrl(null);
    setPdf(null); setPage(1); setNumPages(0);

    (async () => {
      try {
        const { blob, type } = cachedBlob
          ? { blob: cachedBlob, type: cachedBlob.type }
          : await fetchSecureBlob(endpoint);
        if (cancelled) return;

        const t = (type || '').toLowerCase();
        if (t.includes('pdf')) {
          const buf = await blob.arrayBuffer();
          const doc = await pdfjsLib.getDocument({ data: buf }).promise;
          if (cancelled) return;
          pdfRef.current = doc;
          setPdf(doc); setNumPages(doc.numPages); setKind('pdf');
        } else if (t.startsWith('image/')) {
          const url = URL.createObjectURL(blob);
          objUrlRef.current = url;
          setImgUrl(url); setKind('image');
        } else if (t.includes('word') || t.includes('officedocument') || t.includes('msword')) {
          const mammoth = (await import('mammoth')).default || (await import('mammoth'));
          const buf = await blob.arrayBuffer();
          const res = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (cancelled) return;
          setHtml(res.value || '<p>Empty document.</p>'); setKind('html');
        } else {
          setKind('unsupported');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not open this file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null; }
      try { pdfRef.current?.destroy?.(); } catch { /* ignore */ }
      pdfRef.current = null;
    };
  }, [open, endpoint, cachedBlob, mustUseApp]);

  // Render the current PDF page to the canvas.
  const renderPage = useCallback(async () => {
    const doc = pdfRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    try {
      const pg = await doc.getPage(page);
      // Fit width to the container while staying crisp on high-DPI screens.
      const containerW = canvas.parentElement?.clientWidth || 800;
      const baseViewport = pg.getViewport({ scale: 1 });
      const scale = Math.min(2.5, (containerW - 8) / baseViewport.width);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: scale * dpr });
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      await pg.render({ canvasContext: ctx, viewport }).promise;
    } catch { /* ignore transient render races */ }
  }, [page]);

  useEffect(() => { if (kind === 'pdf') renderPage(); }, [kind, page, renderPage]);

  if (!open) return null;

  const guardLabel = user?.username || user?.name || 'student';

  // Student on web/desktop → protected files are app-only (so screenshots stay
  // blocked). Show an "open in the app" notice instead of the file.
  if (mustUseApp) {
    return (
      <div className="fixed inset-0 z-[120] bg-black/85 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900 text-white flex-shrink-0">
          <FileText size={18} className="text-white/70 flex-shrink-0" />
          <p className="flex-1 min-w-0 truncate text-sm font-medium">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
            <Smartphone size={30} className="text-white/80" />
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Open in the Udaya app</p>
            <p className="text-white/60 text-sm max-w-xs leading-relaxed">
              For your security, notes and study materials can only be viewed in the Udaya mobile app.
              Please open this lesson on your phone.
            </p>
          </div>
          <button onClick={onClose} className="mt-1 px-5 py-2.5 rounded-full bg-white text-neutral-900 text-sm font-semibold hover:bg-neutral-100 transition-colors">
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 flex flex-col" onContextMenu={e => e.preventDefault()}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-900 text-white flex-shrink-0">
        <FileText size={18} className="text-white/70 flex-shrink-0" />
        <p className="flex-1 min-w-0 truncate text-sm font-medium">{title}</p>
        <span className="hidden sm:flex items-center gap-1 text-[11px] text-white/50"><Lock size={11} /> View only</span>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <ScreenshotGuard label={guardLabel} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto bg-neutral-800 select-none" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-white/60 text-sm gap-2">
              <Loader2 className="animate-spin" size={18} /> Loading…
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-8 text-center">
              <AlertTriangle size={28} className="text-white/40" />
              <p className="text-white/70 text-sm">{error}</p>
            </div>
          ) : kind === 'pdf' ? (
            <div className="flex flex-col items-center py-4 px-2">
              <canvas ref={canvasRef} className="shadow-2xl rounded bg-white max-w-full" draggable={false} />
            </div>
          ) : kind === 'image' ? (
            <div className="h-full flex items-center justify-center p-4">
              <img src={imgUrl} alt={title} draggable={false} className="max-w-full max-h-full object-contain shadow-2xl rounded select-none pointer-events-none" />
            </div>
          ) : kind === 'html' ? (
            <div className="max-w-3xl mx-auto my-4 bg-white rounded-lg shadow-2xl p-6 sm:p-8 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-8 text-center text-white/60">
              <FileText size={28} className="text-white/30" />
              <p className="text-sm">This file type can't be previewed in-app.</p>
            </div>
          )}
        </div>

        {/* PDF pager */}
        {kind === 'pdf' && numPages > 1 && (
          <div className="flex items-center justify-center gap-4 py-2.5 bg-neutral-900 text-white flex-shrink-0">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronLeft size={20} /></button>
            <span className="text-xs tabular-nums">Page {page} / {numPages}</span>
            <button onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}
              className="p-1.5 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronRight size={20} /></button>
          </div>
        )}
      </ScreenshotGuard>
    </div>
  );
}
