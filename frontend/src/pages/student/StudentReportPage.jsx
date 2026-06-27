import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { reportApi } from '../../lib/api';
import StudentReportCard from '../../components/shared/StudentReportCard';

export default function StudentReportPage() {
  const [searchParams] = useSearchParams();
  const autoOpenAI = searchParams.get('ai') === '1'; // home "AI Mentor" shortcut
  const [period, setPeriod] = useState('overall');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let ignore = false; // drop out-of-order responses on rapid period switches
    setLoading(true);
    setError(null);
    reportApi.getMy(period)
      .then(d => { if (!ignore) setData(d); })
      .catch(e => { if (!ignore) setError(e.message || 'Failed to load report'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [period]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 min-h-screen">
        <Loader2 size={28} className="animate-spin mb-3 text-neutral-300" />
        <p className="text-sm">Loading your report card...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 p-6 min-h-screen">
        <div className="max-w-md mx-auto p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-3">
          <AlertTriangle size={18} /> {error}
        </div>
      </div>
    );
  }

  // Keep the current report on screen (dimmed) while another period loads —
  // blanking the whole page into a spinner on every period click feels broken.
  return (
    <div className={`relative transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
      {loading && (
        <div className="fixed top-4 inset-x-0 flex justify-center z-50">
          <span className="inline-flex items-center gap-2 bg-white shadow-card rounded-full px-3 py-1.5 text-[11px] font-bold text-neutral-500">
            <Loader2 size={13} className="animate-spin" /> Updating…
          </span>
        </div>
      )}
      <StudentReportCard
        data={data}
        period={period}
        onPeriodChange={setPeriod}
        showHeader={true}
        canExport={false}
        autoOpenAI={autoOpenAI}
      />
    </div>
  );
}
