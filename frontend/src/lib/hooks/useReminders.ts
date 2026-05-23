import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../supabase/client';
import type { Reminder } from '../types';

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch('/api/reminders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch reminders');
      const data = await response.json();
      setReminders(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (reminder: Omit<Reminder, 'id' | 'created_at'>) => {
    const token = getAuthToken();
    const response = await fetch('/api/reminders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(reminder)
    });
    if (!response.ok) throw new Error('Failed to create reminder');
    await fetch();
    return response.json();
  };

  const toggle = async (id: string, done: boolean) => {
    const token = getAuthToken();
    const response = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ done })
    });
    if (!response.ok) throw new Error('Failed to update reminder');
    await fetch();
  };

  const remove = async (id: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/reminders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to delete reminder');
    await fetch();
  };

  return { reminders, loading, error, refetch: fetch, create, toggle, remove };
}