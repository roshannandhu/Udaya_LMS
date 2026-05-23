import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../supabase/client';
import { supabase } from '../supabase/client';
import type { Broadcast, BroadcastRead } from '../types';

export function useBroadcasts(standardId: string) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!standardId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/broadcasts?standard_id=${standardId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch broadcasts');
      const data = await response.json();
      setBroadcasts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [standardId]);

  useEffect(() => { fetch(); }, [fetch]);

  const subscribe = useCallback(() => {
    const channel = supabase
      .channel(`broadcasts:${standardId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'broadcasts',
        filter: `standard_id=eq.${standardId}`
      }, (payload) => {
        setBroadcasts(prev => [payload.new as Broadcast, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [standardId]);

  const create = async (broadcast: { standard_id: string; text?: string; attachments?: any[] }) => {
    const token = getAuthToken();
    const response = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(broadcast)
    });
    if (!response.ok) throw new Error('Failed to create broadcast');
    return response.json();
  };

  const markRead = async (broadcastId: string) => {
    const token = getAuthToken();
    await fetch('/api/broadcasts/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ broadcast_id: broadcastId })
    });
  };

  return { broadcasts, loading, error, refetch: fetch, subscribe, create, markRead };
}

export function useBroadcastReads(broadcastId: string) {
  const [reads, setReads] = useState<BroadcastRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!broadcastId) return;
    const fetchReads = async () => {
      const token = getAuthToken();
      const response = await fetch(`/api/broadcasts/${broadcastId}/reads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReads(data);
      }
      setLoading(false);
    };
    fetchReads();
  }, [broadcastId]);

  return { reads, loading };
}