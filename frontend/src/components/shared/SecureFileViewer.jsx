import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, AlertTriangle, FileText, ChevronLeft, ChevronRight, Lock, Smartphone, Download, Check, Trash2, WifiOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { fetchSecureBlob } from '../../lib/api';
import ScreenshotGuard from './ScreenshotGuard';
import { useAuthStore } from '../../lib/auth';
import {
  isFileSaved, saveFileOffline, removeFileOffline, getCachedFile, formatBytes,
} from '../../lib/offlineFiles';

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
 * Props: open, onClose, endpoint (e.g. `/notes/{id}/file`), title,
 *        offlineKey? (stable id, e.g. `note-123`, to enable "save for offline").
 */
export default function SecureFileViewer({ open, onClose, endpoint, title = 'Document', offlineKey = null }) {
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

  // Offline-in-app cache (native only; sandboxed bytes, not a device download).
  const canOffline = IS_NATIVE && !!offlineKey;
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSize, setSavedSize] = useState(null);

  const canvasRef = useRef(null);
  const objUrlRef = useRef(null);
  const pdfRef    = useRef(null);

  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { if (open && offlineKey) setSaved(isFileSaved(offlineKey)); }, [open, offlineKey]);

  // Load + classify the file whenever the viewer opens for a new endpoint.
  useEffect(() => {
    if (!open || !endpoint || mustUseApp) return;  // never fetch bytes on student web
    let cancelled = false;
    setLoading(true); setError(''); setKind(null); setHtml(''); setImgUrl(null);
    setPdf(null); setPage(1); setNumPages(0);

    (async () => {
      // Step 1 — get the bytes (network/offline errors are reported as such).
      let blob, type;
      try {
        let src = null;
        if (canOffline && (saved || !navigator.onLine)) {
          src = await getCachedFile(offlineKey);
        }
        if (!src) {
          if (!navigator.onLine) throw new Error('You are offline. Save this file while online to view it later.');
          src = await fetchSecureBlob(endpoint);
        }
        ({ blob, type } = src);
      } catch (err) {
        if (!cancelled) { setError(err?.message || 'Could not load this file.'); setLoading(false); }
        return;
      }
      if (cancelled) return;

      // Step 2 — classify. Trust the magic bytes over the content-type so a file
      // served as application/octet-stream still renders correctly.
      let buf;
      try { buf = await blob.arrayBuffer(); } catch { buf = null; }
      const head = buf ? new Uint8Array(buf.slice(0, 4)) : new Uint8Array();
      const isPdf = (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) // %PDF
        || (type || '').toLowerCase().includes('pdf');
      const t = (type || '').toLowerCase();

      try {
        if (isPdf && buf) {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          if (cancelled) return;
          pdfRef.current = doc;
          setPdf(doc); setNumPages(doc.numPages); setKind('pdf');
        } else if (t.startsWith('image/')) {
          const url = URL.createObjectURL(blob);
          objUrlRef.current = url;
          setImgUrl(url); setKind('image');
        } else if (t.includes('word') || t.includes('officedocument') || t.includes('msword')) {
          const mammoth = (await import('mammoth')).default || (await import('mammoth'));
          const res = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (cancelled) return;
          setHtml(res.value || '<p>Empty document.</p>'); setKind('html');
        } else {
          setKind('unsupported');
        }
      } catch (err) {
        // Rendering failed (e.g. the pdf.js worker couldn't load) — distinct from a
        // network failure so the message is actionable.
        if (!cancelled) setError('Could not display this file. Please try again.');
        console.error('SecureFileViewer render error:', err);
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
  }, [open, endpoint, mustUseApp, canOffline, saved, offlineKey, isOnline]);

  const handleSaveOffline = async () => {
    if (!canOffline || saving) return;
    setSaving(true);
    try {
      const size = await saveFileOffline(endpoint, offlineKey);
      setSaved(true);
      setSavedSize(formatBytes(size));
    } catch (err) {
      setError(err?.message || 'Could not save for offline.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOffline = async () => {
    if (!offlineKey) return;
    await removeFileOffline(offlineKey);
    setSaved(false);
    setSavedSize(null);
  };

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
        {!isOnline && <span className="flex items-center gap-1 text-[11px] text-amber-300"><WifiOff size={12} /> Offline</span>}

        {/* Save-for-offline (in-app only; sandboxed bytes, not a device download) */}
        {canOffline && (
          saved ? (
            <button onClick={handleRemoveOffline} title="Remove offline copy"
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium hover:bg-emerald-500/30 transition-colors">
              <Check size={12} /> Saved{savedSize ? ` · ${savedSize}` : ''} <Trash2 size={11} className="ml-0.5 opacity-70" />
            </button>
          ) : (
            <button onClick={handleSaveOffline} disabled={saving || !isOnline} title={isOnline ? 'Save for offline' : 'Connect to save'}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-white text-[11px] font-medium hover:bg-white/20 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Save
            </button>
          )
        )}

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
