import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader } from 'lucide-react';
import { WatermarkLayer } from './shared/ScreenshotGuard';

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, onLeave }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [showPrintWarn, setShowPrintWarn] = useState(false);
  const initialized = useRef(false);
  const zoomRef = useRef(null);
  const printTimerRef = useRef(null);

  const isStudent = role === 0;

  useEffect(() => {
    if (!isStudent) return;  // teachers are not restricted
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
    // Show the #zmmtg-root div that lives in index.html (outside React's DOM)
    const root = document.getElementById('zmmtg-root');
    if (root) root.style.display = 'block';

    if (!initialized.current) {
      initialized.current = true;
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
      const { ZoomMtg } = await import('@zoom/meetingsdk');
      zoomRef.current = ZoomMtg;

      // Use Zoom's own CDN for AV/WASM files — avoids needing to copy files to /public
      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.x.x/lib', 'https://source.zoom.us/3.x.x/lib/av');
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      setStatus('joining');

      ZoomMtg.init({
        leaveUrl: window.location.origin,
        patchJsMedia: true,
        success: () => {
          ZoomMtg.join({
            meetingNumber: String(meeting_id).replace(/\s/g, ''),
            userName: display_name,
            userEmail: '',
            signature: signature,
            sdkKey: sdk_key,
            passWord: '',
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
      setError('Failed to load Zoom SDK. Please check your internet connection and try again.');
      setStatus('error');
    }
  }

  function handleLeave() {
    try {
      zoomRef.current?.leaveMeeting({
        success: () => onLeave(),
        error: () => onLeave(),
      });
    } catch { onLeave(); }
  }

  // #zmmtg-root is in index.html and rendered by Zoom SDK itself.
  // This component just provides the loading/error overlay and the leave button.
  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Watermark only for students — teachers need to see clearly */}
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
