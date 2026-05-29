import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { reportApi } from '../../lib/api';
import StudentReportCard from '../../components/shared/StudentReportCard';

export default function StudentReportPage() {
  const [period, setPeriod] = useState('overall');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    reportApi.getMy(period)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 min-h-screen">
        <Loader2 size={28} className="animate-spin mb-3 text-neutral-300" />
        <p className="text-sm">Loading your report card...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 min-h-screen">
        <div className="max-w-md mx-auto p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-3">
          <AlertTriangle size={18} /> {error}
        </div>
      </div>
    );
  }

  return (
    <StudentReportCard
      data={data}
      period={period}
      onPeriodChange={setPeriod}
      showHeader={true}
    />
  );
}
