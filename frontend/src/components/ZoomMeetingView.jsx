import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AlertCircle, Loader } from 'lucide-react';

export default function ZoomMeetingView({ meeting_id, signature, sdk_key, role, display_name, onLeave }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const initialized = useRef(false);
  const zoomRef = useRef(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initZoomMeeting();

    return () => {
      try { zoomRef.current?.leaveMeeting({}); } catch { /* ignore */ }
    };
  }, []);

  async function initZoomMeeting() {
    try {
      setStatus('loading');
      const { ZoomMtg } = await import('@zoom/meetingsdk');
      zoomRef.current = ZoomMtg;

      ZoomMtg.setZoomJSLib('https://source.zoom.us/3.x.x/lib', '/av');
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      setStatus('joining');

      ZoomMtg.init({
        leaveUrl: window.location.href,
        patchJsMedia: true,
        success: () => {
          ZoomMtg.join({
            meetingNumber: meeting_id,
            userName: display_name,
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
      setError('Failed to load Zoom. Please check your internet connection and try again.');
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

  return (
    <div className="fixed inset-0 z-50 bg-black">

      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 z-[60] flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm text-white text-sm rounded-full hover:bg-black/80 transition-colors"
      >
        <ArrowLeft size={14} />
        Leave
      </button>

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader size={28} className="text-white/60 animate-spin" />
          <p className="text-white/60 text-sm">Loading Zoom...</p>
        </div>
      )}

      {status === 'joining' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Connecting to class...</p>
          <p className="text-white/40 text-xs">This may take a few seconds</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
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

      <div id="zmmtg-root" className="w-full h-full" />

    </div>
  );
}
