import { useState, useEffect } from 'react';
import { apiClient } from '../api';

export function useDashboard() {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, activityData] = await Promise.all([
          apiClient('/dashboard/stats'),
          apiClient('/dashboard/activity')
        ]);
        setStats(statsData);
        setActivities(activityData.activities || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return { stats, activities, loading, error };
}