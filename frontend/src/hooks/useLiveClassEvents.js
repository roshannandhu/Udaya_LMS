import { useEffect } from 'react';
import { useAuthStore } from '../lib/auth';

const getWsBaseUrl = () => {
  const isDev = import.meta.env.DEV;
  // If explicitly configured (e.g. staging/prod), use it
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) return envUrl;
  
  const httpUrl = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:8001/api' : '/api');
  return httpUrl.replace(/^http/, 'ws').replace(/\/api$/, '');
};

export default function useLiveClassEvents() {
  const { user, token } = useAuthStore();

  useEffect(() => {
    if (!user || !token) return;

    // Student connects to their standard_id, Teacher connects to "teacher"
    const standardId = user.role === 'teacher' ? 'teacher' : user.standard_id;
    if (!standardId) return;

    const wsBase = getWsBaseUrl();
    const wsUrl = `${wsBase}/api/ws/live-classes/${standardId}`;
    
    let ws = null;
    let reconnectTimer = null;
    let isComponentMounted = true;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status_update') {
            // Dispatch a global event so any mounted LiveClasses component can react
            window.dispatchEvent(new CustomEvent('live-class-update', { detail: data }));
          }
        } catch (err) {
          console.error('Failed to parse live class event', err);
        }
      };

      ws.onclose = () => {
        if (isComponentMounted) {
          // Reconnect with backoff
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isComponentMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // Prevent reconnect after unmount
        ws.close();
      }
    };
  }, [user?.id, user?.standard_id, token]);
}
