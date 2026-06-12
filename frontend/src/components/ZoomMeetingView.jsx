import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader, Video } from 'lucide-react';
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
  // Swallow the async rejection too (offline / CDN blocked) so the idle preload
  // never surfaces as an "Uncaught (in promise)" error on the live-classes pages.
  try { loadZoomClientView().catch(() => {}); } catch { /* best-effort */ }
}

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, passcode, zak, onLeave, viewerRole }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [showPrintWarn, setShowPrintWarn] = useState(false);
  const zoomRef = useRef(null);
  const startedRef = useRef(false);
  const printTimerRef = useRef(null);

  // role is 0 for ALL portal watchers (teachers watch view-only too), so the
  // student lockdowns key off the explicit viewerRole prop from the caller.
  // Default to the strict student treatment when the prop is missing.
  const isStudent = viewerRole ? viewerRole === 'student' : role === 0;

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

  // Students must only ever watch the host: block every pin path inside Zoom's
  // UI. Double-click and right-click pin are stopped in capture phase; the CSS
  // below hides the tile ellipsis menus, the participants-row menus and the
  // gallery/speaker View switcher (everyone but the host is muted + camera-off,
  // so Speaker view always shows the host). Selectors target the pinned SDK
  // version (ZOOM_VERSION) — the JS guards are the hard backstop.
  useEffect(() => {
    if (!isStudent) return;
    const root = document.getElementById('zmmtg-root');
    if (!root) return;
    const block = (e) => { e.stopPropagation(); e.preventDefault(); };
    root.addEventListener('dblclick', block, true);
    root.addEventListener('contextmenu', block, true);

    const style = document.createElement('style');
    style.id = 'zoom-student-lockdown';
    style.textContent = `
      #zmmtg-root [class*="video-avatar__avatar-action"],
      #zmmtg-root [class*="more-button"],
      #zmmtg-root [class*="full-screen-widget"] button[aria-label*="View" i],
      #zmmtg-root button[title*="View" i][class*="full-screen"],
      #zmmtg-root .participants-item__buttons { display: none !important; }
    `;
    document.head.appendChild(style);

    return () => {
      root.removeEventListener('dblclick', block, true);
      root.removeEventListener('contextmenu', block, true);
      document.getElementById('zoom-student-lockdown')?.remove();
    };
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
        // No one in the web view may copy/share the meeting link. Zoom's own UI
        // otherwise exposes it twice: the Invite button and the meeting-info
        // panel (invite link + meeting ID + passcode with a Copy action).
        disableInvite: true,
        meetingInfo: ['topic', 'host'],
        // Students can never share their screen or rearrange tiles — only the
        // host's (phone) share should ever be visible to the class.
        ...(isStudent ? { screenShare: false, videoDrag: false } : {}),
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
          <AlertCircle size={16} /> Screenshot attempt detected
        </div>
      )}

      <button
        onClick={handleLeave}
        className="absolute top-6 left-6 z-[110] pointer-events-auto flex items-center gap-2 px-5 py-2.5 bg-white/90 backdrop-blur-md shadow-lg text-neutral-800 text-[14px] font-bold rounded-full hover:bg-white hover:scale-105 hover:shadow-xl transition-all"
      >
        <ArrowLeft size={18} />
        Leave Classroom
      </button>

      {(status === 'loading' || status === 'joining') && (
        <div className="absolute inset-0 bg-[#F4F7F6] flex items-center justify-center pointer-events-auto z-[105] overflow-hidden">
          {/* Decorative background blobs */}
          <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#EAF3EB] rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '4s' }}></div>
          <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#F8E1FB] rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '5s' }}></div>
          <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] bg-[#FFF6D8] rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '6s' }}></div>

          <div className="relative w-[90%] max-w-md bg-white p-10 rounded-[48px] shadow-2xl flex flex-col items-center text-center transform scale-100 transition-all">
            
            {/* Pulsing avatar/icon area */}
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 bg-[#EAF3EB] rounded-full animate-ping opacity-60"></div>
              <div className="absolute inset-2 bg-[#EAF3EB] rounded-full animate-pulse"></div>
              <div className="absolute inset-4 bg-white rounded-full shadow-lg flex items-center justify-center z-10 border-4 border-[#EAF3EB]">
                {status === 'loading' ? (
                  <Video className="w-10 h-10 text-green-600 animate-pulse" />
                ) : (
                  <div className="w-10 h-10 border-[4px] border-green-100 border-t-green-600 rounded-full animate-spin" />
                )}
              </div>
              
              {/* Fake floating student avatars joining */}
              <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full border-4 border-white bg-[#F8E1FB] flex items-center justify-center shadow-md z-20 animate-bounce" style={{ animationDelay: '100ms' }}>
                <span className="text-[16px]">👧🏽</span>
              </div>
              <div className="absolute bottom-2 -left-4 w-12 h-12 rounded-full border-4 border-white bg-[#FFF6D8] flex items-center justify-center shadow-md z-20 animate-bounce" style={{ animationDelay: '500ms' }}>
                <span className="text-[20px]">👦🏻</span>
              </div>
              <div className="absolute -bottom-4 right-4 w-9 h-9 rounded-full border-[3px] border-white bg-[#E5F2FE] flex items-center justify-center shadow-md z-20 animate-bounce" style={{ animationDelay: '900ms' }}>
                <span className="text-[14px]">👩🏿</span>
              </div>
            </div>

            <h2 className="text-[26px] font-extrabold text-neutral-900 mb-3 tracking-tight leading-tight">
              {status === 'loading' ? 'Preparing your live class...' : 'Connecting you now...'}
            </h2>
            <p className="text-[15px] font-medium text-neutral-500 mb-8 leading-relaxed">
              {status === 'loading' ? 'Setting up the interactive whiteboard and video streams.' : 'Securing your connection to the live session.'}
            </p>

            <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden shadow-inner">
              <div className={`h-full bg-green-500 rounded-full transition-all duration-1000 ease-out ${status === 'loading' ? 'w-2/5' : 'w-4/5'}`}></div>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 bg-[#F4F7F6] flex items-center justify-center pointer-events-auto z-[105] overflow-hidden">
          <div className="relative w-[90%] max-w-md bg-[#FFEBE5] p-10 rounded-[48px] shadow-2xl flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center mb-6">
              <AlertCircle size={40} className="text-red-500" />
            </div>
            <h2 className="text-[26px] font-extrabold text-red-950 mb-3 tracking-tight">Connection Failed</h2>
            <p className="text-[15px] font-medium text-red-900/70 mb-8 leading-relaxed px-4">{error}</p>
            <button
              onClick={onLeave}
              className="px-8 py-3.5 bg-black text-white text-[15px] font-bold rounded-full shadow-xl hover:bg-neutral-800 hover:-translate-y-1 transition-all w-full"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
