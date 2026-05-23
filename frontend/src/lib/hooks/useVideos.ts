import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../supabase/client';
import type { Video, VideoProgress } from '../types';

export function useVideos(classId: string) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/videos?class_id=${classId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch videos');
      const data = await response.json();
      setVideos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (video: Omit<Video, 'id' | 'created_at'>) => {
    const token = getAuthToken();
    const response = await fetch('/api/videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(video)
    });
    if (!response.ok) throw new Error('Failed to create video');
    await fetch();
    return response.json();
  };

  const remove = async (id: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/videos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to delete video');
    await fetch();
  };

  return { videos, loading, error, refetch: fetch, create, remove };
}

export function useVideoProgress(videoId: string) {
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!videoId) return;
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/video-progress/${videoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (progress_secs: number, completed?: boolean) => {
    const token = getAuthToken();
    await fetch('/api/video-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ video_id: videoId, progress_secs, completed })
    });
    await fetch();
  };

  return { progress, loading, update };
}