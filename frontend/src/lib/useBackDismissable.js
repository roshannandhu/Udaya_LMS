import { useEffect, useRef } from 'react';
import { useOverlayStack } from '../store';

/**
 * Register an open overlay so the Android hardware back button closes IT first
 * (instead of navigating the page away / exiting the app). Call from any modal,
 * sheet, or file/image viewer with its open flag + onClose.
 *
 *   useBackDismissable(open, onClose);
 *
 * Safe on web (the overlay stack is just unused there). LIFO: the most recently
 * opened overlay closes first.
 */
export function useBackDismissable(open, onClose) {
  const id = useRef(Math.random().toString(36).slice(2)).current;
  // Keep the latest onClose without re-subscribing on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => { try { closeRef.current?.(); } catch { /* ignore */ } };
    useOverlayStack.getState().push(id, close);
    return () => useOverlayStack.getState().remove(id);
  }, [open, id]);
}
