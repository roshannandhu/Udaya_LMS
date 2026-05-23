import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../supabase/client';
import type { Student } from '../types';

export function useStudents(standardId?: string) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const url = standardId ? `/api/students?standard_id=${standardId}` : '/api/students';
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      setStudents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [standardId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (student: { name: string; username: string; email?: string; standard_id: string }) => {
    const token = getAuthToken();
    const response = await fetch('/api/admin/create-student', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(student)
    });
    if (!response.ok) throw new Error('Failed to create student');
    await fetch();
    return response.json();
  };

  const update = async (id: string, updates: Partial<Student>) => {
    const token = getAuthToken();
    const response = await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update student');
    await fetch();
  };

  const remove = async (id: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/students/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to delete student');
    await fetch();
  };

  return { students, loading, error, refetch: fetch, create, update, remove };
}