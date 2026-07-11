import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle, Camera, MonitorOff } from 'lucide-react';

/* getDisplayMedia is patched per-session (student only) inside the
   component's useEffect — not at module load — so teachers are unaffected. */
let _displayMediaPatched = false;
const _originalGetDisplayMedia = typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia
  ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
  : null;

function patchDisplayMedia() {
  if (_displayMediaPatched || !navigator.mediaDevices?.getDisplayMedia) return;
  _displayMediaPatched = true;
  navigator.mediaDevices.getDisplayMedia = async (...args) => {
    window.dispatchEvent(new CustomEvent('udaya:screenshare-attempt'));
    throw new DOMException('Screen capture is not permitted.', 'NotAllowedError');
  };
}

function unpatchDisplayMedia() {
  if (!_displayMediaPatched || !_originalGetDisplayMedia) return;
  _displayMediaPatched = false;
  navigator.mediaDevices.getDisplayMedia = _originalGetDisplayMedia;
}

/**
 * ScreenshotGuard — wraps protected content with:
 *  - PrintScreen key detection → clears clipboard + warning toast
 *  - getDisplayMedia interception (blocks browser screen-share)
 *  - Right-click / long-press context menu disable
 *  - visibilitychange → brief black screen on return (mobile deterrent)
 *
 * Props:
 *  label        — watermark text (student username)
 *  enabled      — default true
 *  mobileOverlay — brief black cover on visibility return (default false)
 *  onAttempt    — callback({ type }) when attempt detected
 *  className    — forwarded to wrapper div
 */
export default function ScreenshotGuard({
  children,
  label,
  enabled = true,
  mobileOverlay = false,
  onAttempt,
  className = '',
}) {
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [showShareWarning, setShowShareWarning] = useState(false);
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);
  const printTimerRef  = useRef(null);
  const shareTimerRef  = useRef(null);
  const mobileTimerRef = useRef(null);
  const wasHiddenRef   = useRef(false);

  const triggerPrintWarning = useCallback(() => {
    try { navigator.clipboard.writeText(''); } catch {}
    setShowPrintWarning(true);
    clearTimeout(printTimerRef.current);
    printTimerRef.current = setTimeout(() => setShowPrintWarning(false), 3000);
    if (onAttempt) onAttempt({ type: 'printscreen' });
  }, [onAttempt]);

  const triggerShareWarning = useCallback(() => {
    setShowShareWarning(true);
    clearTimeout(shareTimerRef.current);
    shareTimerRef.current = setTimeout(() => setShowShareWarning(false), 4000);
    if (onAttempt) onAttempt({ type: 'screenshare' });
  }, [onAttempt]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        triggerPrintWarning();
      }
    };

    const onShareAttempt = () => triggerShareWarning();

    const onVisibility = () => {
      if (document.hidden) {
        wasHiddenRef.current = true;
      } else if (wasHiddenRef.current) {
        wasHiddenRef.current = false;
        if (mobileOverlay) {
          setShowMobileOverlay(true);
          clearTimeout(mobileTimerRef.current);
          mobileTimerRef.current = setTimeout(() => setShowMobileOverlay(false), 800);
        }
        if (onAttempt) onAttempt({ type: 'visibility_return' });
      }
    };

    patchDisplayMedia();  // only active while a student-guarded component is mounted
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('udaya:screenshare-attempt', onShareAttempt);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unpatchDisplayMedia();
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('udaya:screenshare-attempt', onShareAttempt);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(printTimerRef.current);
      clearTimeout(shareTimerRef.current);
      clearTimeout(mobileTimerRef.current);
    };
  }, [enabled, mobileOverlay, triggerPrintWarning, triggerShareWarning, onAttempt]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className={`relative ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {children}

      {/* PrintScreen toast */}
      {showPrintWarning && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, background: '#dc2626', color: '#fff',
          padding: '10px 20px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(220,38,38,0.45)',
        }}>
          <AlertTriangle size={16} />
          Screenshot attempt detected
        </div>
      )}

      {/* Screen share blocked toast */}
      {showShareWarning && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, background: '#7c3aed', color: '#fff',
          padding: '10px 20px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 8px 32px rgba(124,58,237,0.45)',
        }}>
          <MonitorOff size={16} />
          Screen recording is not allowed
        </div>
      )}

      {/* Mobile visibility overlay */}
      {showMobileOverlay && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99998, background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 14,
        }}>
          <Camera size={42} style={{ color: '#ef4444' }} />
          <p style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: 0 }}>
            Screen capture is not allowed
          </p>
        </div>
      )}
    </div>
  );
}
