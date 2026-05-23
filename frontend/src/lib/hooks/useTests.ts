import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../supabase/client';
import type { Test, Question, TestAttempt } from '../types';

export function useTests(classId?: string) {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const url = classId ? `/api/tests?class_id=${classId}` : '/api/tests';
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch tests');
      const data = await response.json();
      setTests(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (test: any) => {
    const token = getAuthToken();
    const response = await fetch('/api/tests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(test)
    });
    if (!response.ok) throw new Error('Failed to create test');
    await fetch();
    return response.json();
  };

  const update = async (id: string, updates: Partial<Test>) => {
    const token = getAuthToken();
    const response = await fetch(`/api/tests/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update test');
    await fetch();
  };

  const remove = async (id: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/tests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to delete test');
    await fetch();
  };

  return { tests, loading, error, refetch: fetch, create, update, remove };
}

export function useTestQuestions(testId: string) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/tests/${testId}/questions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { questions, loading, refetch: fetch };
}

export function useTestAttempts(testId: string) {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!testId) return;
    const fetchAttempts = async () => {
      const token = getAuthToken();
      const response = await fetch(`/api/tests/${testId}/attempts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setAttempts(data);
      }
      setLoading(false);
    };
    fetchAttempts();
  }, [testId]);

  return { attempts, loading };
}