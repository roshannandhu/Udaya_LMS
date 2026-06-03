import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader } from 'lucide-react';
import { WatermarkLayer } from './shared/ScreenshotGuard';

/**
 * Zoom **Client View** loaded from Zoom's CDN (global `window.ZoomMtg`).
 *
 * Why CDN and not `import '@zoom/meetingsdk'`: the Client View bundle expects
 * GLOBAL `Redux`/`React`/`ReactDOM`/`lodash` (its internal module is literally
 * `exports = Redux`). Bundling it with Vite leaves those undefined, so it crashes
 * at init with "middleware is not a function". Loading the vendor globals + the
 * SDK from the CDN provides them and renders Zoom's true full-screen native UI.
 *
 * Component View (`@zoom/meetingsdk/embedded`) bundles fine but is a floating
 * widget that renders the video as a strip — it cannot go full-screen — so we
 * don't use it.
 */

const ZOOM_VERSION = '6.0.2';
const ZOOM_CDN = `https://source.zoom.us/${ZOOM_VERSION}`;

// Vendor globals MUST load before the meeting bundle (which references window.Redux etc.).
const ZOOM_SCRIPTS = [
  `${ZOOM_CDN}/lib/vendor/react.min.js`,
  `${ZOOM_CDN}/lib/vendor/react-dom.min.js`,
  `${ZOOM_CDN}/lib/vendor/redux.min.js`,
  `${ZOOM_CDN}/lib/vendor/redux-thunk.min.js`,
  `${ZOOM_CDN}/lib/vendor/lodash.min.js`,
  `${ZOOM_CDN}/zoom-meeting-${ZOOM_VERSION}.min.js`,
];

let _zoomLoadPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Reuse a tag if it's already on the page.
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserve execution order
    s.addEventListener('load', () => { s.dataset.loaded = 'true'; resolve(); });
    s.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(s);
  });
}

// Inject the CDN scripts in order, once, and resolve with window.ZoomMtg.
function loadZoomClientView() {
  if (window.ZoomMtg) return Promise.resolve(window.ZoomMtg);
  if (_zoomLoadPromise) return _zoomLoadPromise;
  _zoomLoadPromise = (async () => {
    for (const src of ZOOM_SCRIPTS) {
      await loadScript(src);
    }
    if (!window.ZoomMtg) throw new Error('Zoom SDK failed to initialize.');
    return window.ZoomMtg;
  })().catch((e) => { _zoomLoadPromise = null; throw e; });
  return _zoomLoadPromise;
}

// Warm the 5.6 MB Zoom SDK in the background (call on the live-classes pages at
// idle) so the first "Watch" click doesn't pay the full download. Safe to call
// repeatedly — loadZoomClientView() de-dupes via the shared promise.
export function preloadZoomSDK() {
  try { loadZoomClientView(); } catch { /* best-effort */ }
}

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, passcode, zak, onLeave }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [showPrintWarn, setShowPrintWarn] = useState(false);
  const zoomRef = useRef(null);
  const startedRef = useRef(false);
  const printTimerRef = useRef(null);

  const isStudent = role === 0;

  // Student-only PrintScreen deterrent
  useEffect(() => {
    if (!isStudent) return;
    const onKey = (e) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        try { navigator.clipboard.writeText(''); } catch {}
        setShowPrintWarn(true);
        if (printTimerRef.current) clearTimeout(printTimerRef.current);
        printTimerRef.current = setTimeout(() => setShowPrintWarn(false), 3000);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (printTimerRef.current) clearTimeout(printTimerRef.current); };
  }, [isStudent]);

  useEffect(() => {
    // Reveal the full-screen #zmmtg-root that lives in index.html (outside React).
    const root = document.getElementById('zmmtg-root');
    if (root) root.style.display = 'block';

    if (!startedRef.current) {
      startedRef.current = true;
      initZoomMeeting();
    }

    return () => {
      try { zoomRef.current?.leaveMeeting({}); } catch { /* ignore */ }
      const r = document.getElementById('zmmtg-root');
      if (r) r.style.display = 'none';
    };
  }, []);

  async function initZoomMeeting() {
    try {
      setStatus('loading');
      const ZoomMtg = await loadZoomClientView();
      zoomRef.current = ZoomMtg;

      // Load AV/WASM from Zoom's CDN; version must match the SDK + the CSS in index.html.
      ZoomMtg.setZoomJSLib(`${ZOOM_CDN}/lib`, '/av');
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      setStatus('joining');

      ZoomMtg.init({
        leaveUrl: window.location.origin,
        patchJsMedia: true,
        // Default to speaker view so the host (owner) fills the screen.
        defaultView: 'speaker',
        success: () => {
          ZoomMtg.join({
            meetingNumber: String(meeting_id).replace(/\s/g, ''),
            userName: display_name,
            userEmail: '',
            signature,
            sdkKey: sdk_key,
            passWord: passcode || '',
            // Viewers receive no zak; only a host would.
            zak: zak || '',
            success: () => setStatus('joined'),
            error: (e) => {
              setError(e?.errorMessage || e?.reason || 'Could not join the meeting. Please try again.');
              setStatus('error');
            },
          });
        },
        error: (e) => {
          setError(e?.errorMessage || 'Could not initialize Zoom. Please check your connection.');
          setStatus('error');
        },
      });
    } catch (err) {
      console.error('Zoom SDK error:', err);
      setError(`Failed to load Zoom: ${err?.message || String(err)}`);
      setStatus('error');
    }
  }

  function handleLeave() {
    try {
      zoomRef.current?.leaveMeeting({});
    } catch { /* ignore */ }
    onLeave();
  }

  // #zmmtg-root (in index.html) hosts Zoom's own full-screen UI. This component
  // adds the loading/error overlay, the student watermark, and a Leave button.
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Watermark only for students — teachers/admins watch unobstructed */}
      {isStudent && <WatermarkLayer label={display_name || 'student'} />}

      {/* PrintScreen warning — students only */}
      {isStudent && showPrintWarn && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, background: '#dc2626', color: '#fff',
          padding: '10px 20px', borderRadius: 12, display: 'flex', alignItems: 'center',
          gap: 8, fontSize: 14, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(220,38,38,0.45)',
        }}>
          ⚠ Screenshot attempt detected
        </div>
      )}

      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 z-[110] pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-white text-sm rounded-full hover:bg-black/80 transition-colors"
      >
        <ArrowLeft size={14} />
        Leave
      </button>

      {(status === 'loading' || status === 'joining') && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 pointer-events-auto">
          {status === 'loading' ? (
            <>
              <Loader size={28} className="text-white/60 animate-spin" />
              <p className="text-white/60 text-sm">Loading Zoom...</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-white/60 text-sm">Connecting to class...</p>
              <p className="text-white/40 text-xs">This may take a few seconds</p>
            </>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-4 px-8 text-center pointer-events-auto">
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-white text-sm leading-relaxed">{error}</p>
          <button
            onClick={onLeave}
            className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            Go back
          </button>
        </div>
      )}
    </div>
  );
}
