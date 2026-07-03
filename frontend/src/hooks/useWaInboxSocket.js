import { useEffect, useRef } from 'react';
import { getApiBaseUrl } from '../lib/api';

/**
 * Live WhatsApp parent-chat stream for the teacher's Chats screen.
 * Mirrors useBroadcastSocket: auto-reconnect with fixed backoff, freshest token
 * re-read from localStorage on every attempt, onMessage kept in a ref so callers
 * can pass a new closure each render without rebuilding the socket.
 */
export default function useWaInboxSocket(onMessage, enabled = true) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    const wsBase = getApiBaseUrl().replace(/^http/, 'ws');

    let ws = null;
    let reconnectTimer = null;
    let mounted = true;

    const connect = () => {
      const token = localStorage.getItem('tutoria_token') || '';
      ws = new WebSocket(`${wsBase}/ws/whatsapp/inbox?token=${encodeURIComponent(token)}`);

      ws.onmessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        onMessageRef.current?.(data);
      };

      ws.onclose = () => {
        if (mounted) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* ignore */ }
      }
    };
  }, [enabled]);
}
