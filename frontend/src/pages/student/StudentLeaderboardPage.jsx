import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TopBar from '../../components/shared/TopBar';
import LeaderboardPanel from '../../components/shared/LeaderboardPanel';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { fadeUp } from '../../lib/motion';

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
      <motion.div
        className="px-5 md:px-8 py-6 max-w-2xl mx-auto"
        variants={fadeUp} initial="hidden" animate="show"
      >
        {ready && <LeaderboardPanel standardId={standardId} highlightId={user?.id} />}
      </motion.div>
    </div>
  );
}
