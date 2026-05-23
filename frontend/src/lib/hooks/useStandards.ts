import { useState, useEffect, useCallback } from 'react';
import { apiClient, getApiToken } from '../api';
import type { Standard } from '../types';

export function useStandards() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient('/standards');
      setStandards(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (standard: { name: string; short?: string; emoji?: string }) => {
    const result = await apiClient('/standards', {
      method: 'POST',
      body: JSON.stringify(standard)
    });
    await fetch();
    return result;
  };

  const update = async (id: string, updates: Partial<Standard>) => {
    await apiClient(`/standards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    await fetch();
  };

  const remove = async (id: string) => {
    await apiClient(`/standards/${id}`, { method: 'DELETE' });
    await fetch();
  };

  return { standards, loading, error, refetch: fetch, create, update, remove };
}

export function useSubjects(standardId: string) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!standardId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient(`/subjects?standard_id=${standardId}`);
      setSubjects(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [standardId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (subject: { name: string; emoji?: string; standard_id: string }) => {
    const result = await apiClient('/subjects', {
      method: 'POST',
      body: JSON.stringify(subject)
    });
    await fetch();
    return result;
  };

  const update = async (id: string, updates: any) => {
    await apiClient(`/subjects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    await fetch();
  };

  const remove = async (id: string) => {
    await apiClient(`/subjects/${id}`, { method: 'DELETE' });
    await fetch();
  };

  return { subjects, loading, error, refetch: fetch, create, update, remove };
}