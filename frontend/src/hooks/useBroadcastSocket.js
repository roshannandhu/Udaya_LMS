import { useEffect, useRef } from 'react';
import { getApiBaseUrl } from '../lib/api';

/**
 * Subscribe to a standard's broadcast WebSocket with auto-reconnect.
 *
 * The previous inline `new WebSocket(...)` effects had no reconnect — `return () =>
 * ws.close()` only — so the very first drop (mobile background/foreground, a
 * network blip, or an expired token → server closes 4001) silently killed live
 * updates until a manual page refresh. This hook mirrors useLiveClassEvents:
 * reconnect with a fixed backoff, and re-read the freshest token from localStorage
 * on every attempt (so a token refreshed elsewhere is picked up automatically).
 *
 * `onMessage` is kept in a ref so the consumer can pass a fresh closure each render
 * without tearing down and rebuilding the socket.
 */
export default function useBroadcastSocket(standardId, onMessage) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!standardId) return;
    const wsBase = getApiBaseUrl().replace(/^http/, 'ws');

    let ws = null;
    let reconnectTimer = null;
    let mounted = true;

    const connect = () => {
      const token = localStorage.getItem('udaya_token') || '';
      ws = new WebSocket(`${wsBase}/ws/broadcasts/${standardId}?token=${encodeURIComponent(token)}`);

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        onMessageRef.current?.(data);
      };

      ws.onclose = () => {
        if (mounted) reconnectTimer = setTimeout(connect, 3000);
      };

      // An errored socket fires onclose right after, so let onclose drive the retry.
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;   // stop reconnect after unmount / standard change
        try { ws.close(); } catch { /* ignore */ }
      }
    };
  }, [standardId]);
}
