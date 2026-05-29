import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { reportApi } from '../../lib/api';
import ReportCardUI from '../../components/shared/ReportCardUI';

export default function StudentReportPage() {
  const [period, setPeriod] = useState('overall');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    setLoading(true); setError(null); setSuggestions(null);
    reportApi.getMy(period)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [period]);

  const handleGenerateSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await reportApi.generateSuggestions('me', period);
      setSuggestions(res.suggestions);
    } catch (e) {
      console.error(e);
      setSuggestions(["Failed to generate suggestions."]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const {
    radarData,
    performanceData,
    multiLineData,
    attHeatmap, attStats,
    vidHeatmap, vidStats
  } = useMemo(() => {
    if (!data) return {};

    const sr = (data.subject_radar || []).map(r => ({
      subject: r.subject,
      score: r.Score || 0,
      classAvg: r.classAvg || 0
    }));

    const stats = data.student || {};
    const attPct = Math.round(stats.attendance_pct || 0);
    const vp = data.video_heatmap || [];
    const videoPct = vp.length ? Math.round((vp.filter(d => d.minutes > 0).length / vp.length) * 100) : 0;
    const pd = [
      { subject: "Knowledge", score: Math.round(stats.avg_score || 0), classAvg: 65 },
      { subject: "Attendance", score: attPct, classAvg: 75 },
      { subject: "Activity", score: videoPct, classAvg: 60 },
      { subject: "Consistency", score: Math.round((stats.avg_score || 0) * 0.9), classAvg: 70 },
      { subject: "Points", score: Math.min(100, (stats.points || 0) / 10), classAvg: 50 },
    ];

    const tl = data.test_timeline || [];
    const mData = {};
    tl.forEach(t => {
      const sub = t.subject || 'Unknown';
      if (!mData[sub]) mData[sub] = { weeks: [], topics: {} };
      const dStr = t.date ? t.date.slice(5, 10) : 'Test'; 
      const wName = `${dStr} ${t.test_title.slice(0, 8)}`;
      if (!mData[sub].weeks.includes(wName)) mData[sub].weeks.push(wName);
      
      const topic = t.test_title || 'General';
      if (!mData[sub].topics[topic]) mData[sub].topics[topic] = [];
      mData[sub].topics[topic].push(t.score_pct);
    });

    Object.keys(mData).forEach(sub => {
      const targetLen = mData[sub].weeks.length;
      Object.keys(mData[sub].topics).forEach(top => {
        const arr = mData[sub].topics[top];
        while (arr.length < targetLen) arr.unshift(arr[0] || 0);
      });
    });

    const ah = data.attendance_heatmap || [];
    const aStats = {
      present: ah.reduce((a, d) => a + (d.present || 0), 0),
      absent: ah.reduce((a, d) => a + (d.absent || 0), 0),
      late: ah.reduce((a, d) => a + (d.late || 0), 0),
    };

    const vh = data.video_heatmap || [];
    const vStats = {
      days: vh.filter(d => d.minutes > 0).length,
      mins: Math.round(vh.reduce((a, d) => a + (d.minutes || 0), 0)),
    };

    const makeHeatmapGrid = (heatmapData, type) => {
      const dateMap = {};
      heatmapData.forEach(d => {
        if (type === 'attendance') {
           dateMap[d.date] = (d.present || 0) > 0 ? 3 : (d.late || 0) > 0 ? 2 : (d.absent || 0) > 0 ? 1 : 0;
        } else {
           dateMap[d.date] = d.minutes > 60 ? 4 : d.minutes > 30 ? 3 : d.minutes > 10 ? 2 : d.minutes > 0 ? 1 : 0;
        }
      });
      const grid = [];
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - (12 * 7 - 1));
      while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
      
      let currentWeek = [];
      for (let i = 0; i < 12 * 7; i++) {
        const dStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
        currentWeek.push(dateMap[dStr] || 0);
        if (currentWeek.length === 7) { grid.push(currentWeek); currentWeek = []; }
        start.setDate(start.getDate() + 1);
      }
      return grid;
    };

    return {
      radarData: sr,
      performanceData: pd,
      multiLineData: mData,
      attHeatmap: makeHeatmapGrid(ah, 'attendance'),
      attStats: aStats,
      vidHeatmap: makeHeatmapGrid(vh, 'video'),
      vidStats: vStats
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 min-h-screen bg-[#FAFAF9]">
        <Loader2 size={32} className="animate-spin mb-4 text-neutral-300" />
        <p className="text-sm">Loading your report card...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8 min-h-screen bg-[#FAFAF9]">
        <div className="max-w-md mx-auto p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-3">
          <AlertTriangle size={20} />{error}
        </div>
      </div>
    );
  }

  return (
    <ReportCardUI
      student={data?.student}
      period={period}
      onPeriodChange={setPeriod}
      radarData={radarData}
      performanceData={performanceData}
      multiLineData={multiLineData}
      attendanceGrid={attHeatmap}
      attendanceStats={attStats}
      videoGrid={vidHeatmap}
      videoStats={vidStats}
      suggestions={suggestions}
      loadingSuggestions={loadingSuggestions}
      onGenerateSuggestions={handleGenerateSuggestions}
    />
  );
}
