import React, { useState, useEffect } from 'react';
import TopBar from '../../components/shared/TopBar';
import LeaderboardPanel from '../../components/shared/LeaderboardPanel';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';

export default function StudentLeaderboardPage() {
  const { user } = useAuthStore();
  const [standardId, setStandardId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiClient('/auth/me')
      .then(me => setStandardId(me?.standard_id || null))
      .catch(err => console.error(err))
      .finally(() => setReady(true));
  }, []);

  return (
    <div>
      <TopBar title="Leaderboard" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
        {ready && <LeaderboardPanel standardId={standardId} highlightId={user?.id} />}
      </div>
    </div>
  );
}
