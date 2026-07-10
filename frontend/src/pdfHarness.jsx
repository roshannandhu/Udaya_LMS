// Dev-only harness: renders a button that generates the student report PDF
// from realistic mock data, so layout/pagination can be inspected without
// logging in. Not part of the app build — delete freely.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildStudentReportPdf } from './lib/reportPdf';
import './index.css';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const attendanceHeatmap = Array.from({ length: 70 }, (_, i) => {
  const idx = 69 - i;
  const dow = new Date(daysAgo(idx)).getDay();
  if (dow === 0) return null; // Sunday: no class
  const roll = (idx * 7) % 10;
  return {
    date: daysAgo(idx),
    present: roll < 8 ? 1 : 0,
    late: roll === 8 ? 1 : 0,
    absent: roll === 9 ? 1 : 0,
    total: 1,
  };
}).filter(Boolean);

const mockData = {
  student: {
    id: 'stu-harness-1',
    name: 'Priya Sharma',
    username: 'priya10',
    student_code: '25UDAYA100007',
    standard_name: '10th Standard',
    avatar_url: null,
    avg_score: 68,
    attendance_pct: 82,
    points: 340,
  },
  period: 'overall',
  rank: 4,
  total_students: 32,
  period_points: 340,
  total_tests_in_standard: 12,
  topic_mastery_pct: 55,
  subject_radar: [
    { subject_id: 's1', subject: 'Mathematics', test_avg: 74, test_count: 4, attendance_pct: 85, video_pct: 80, video_done: 8, video_total: 10, assignment_submitted: 3, assignment_total: 4 },
    { subject_id: 's2', subject: 'Physics', test_avg: 62, test_count: 3, attendance_pct: 78, video_pct: 60, video_done: 6, video_total: 10, assignment_submitted: 2, assignment_total: 3 },
    { subject_id: 's3', subject: 'Chemistry', test_avg: 71, test_count: 3, attendance_pct: 84, video_pct: 70, video_done: 7, video_total: 10, assignment_submitted: 2, assignment_total: 2 },
    { subject_id: 's4', subject: 'Biology', test_avg: 48, test_count: 2, attendance_pct: 80, video_pct: 40, video_done: 4, video_total: 10, assignment_submitted: 1, assignment_total: 2 },
    { subject_id: 's5', subject: 'English', test_avg: 83, test_count: 2, attendance_pct: 88, video_pct: 90, video_done: 9, video_total: 10, assignment_submitted: 1, assignment_total: 1 },
  ],
  test_timeline: [
    { test_id: 't1', test_title: 'Algebra Unit Test', date: daysAgo(55), score_pct: 54, class_avg_score_pct: 58, rank: 12, total_attempts: 30 },
    { test_id: 't2', test_title: 'Motion & Laws Quiz', date: daysAgo(48), score_pct: 60, class_avg_score_pct: 55, rank: 9, total_attempts: 28 },
    { test_id: 't3', test_title: 'Periodic Table Test', date: daysAgo(41), score_pct: 66, class_avg_score_pct: 62, rank: 8, total_attempts: 31 },
    { test_id: 't4', test_title: 'Trigonometry Mock', date: daysAgo(33), score_pct: 62, class_avg_score_pct: 59, rank: 10, total_attempts: 29 },
    { test_id: 't5', test_title: 'Cell Biology Quiz', date: daysAgo(26), score_pct: 51, class_avg_score_pct: 57, rank: 15, total_attempts: 30 },
    { test_id: 't6', test_title: 'Grammar & Comprehension', date: daysAgo(19), score_pct: 81, class_avg_score_pct: 68, rank: 3, total_attempts: 32 },
    { test_id: 't7', test_title: 'Electricity Unit Test', date: daysAgo(12), score_pct: 70, class_avg_score_pct: 61, rank: 6, total_attempts: 30 },
    { test_id: 't8', test_title: 'Quadratic Equations Test', date: daysAgo(5), score_pct: 78, class_avg_score_pct: 63, rank: 4, total_attempts: 31 },
  ],
  topic_map: [
    { topic: 'Cell Structure', subject: 'Biology', score_pct: 42, video_completed: false },
    { topic: 'Trigonometric Ratios', subject: 'Mathematics', score_pct: 55, video_completed: false },
    { topic: 'Chemical Bonding', subject: 'Chemistry', score_pct: 58, video_completed: true },
    { topic: 'Newton’s Laws', subject: 'Physics', score_pct: 61, video_completed: true },
    { topic: 'Quadratic Equations', subject: 'Mathematics', score_pct: 78, video_completed: true },
    { topic: 'Ohm’s Law', subject: 'Physics', score_pct: 70, video_completed: false },
    { topic: 'Reading Comprehension', subject: 'English', score_pct: 84, video_completed: true },
  ],
  attendance_heatmap: attendanceHeatmap,
  assignment_stats: { submitted: 9, total: 12, avg_marks_pct: 71 },
  live_classes_stats: { attended: 14, total: 18, attendance_pct: 78 },
  class_averages: { avg_score: 61, attendance_pct: 76, points: 285 },
};

function Harness() {
  const [status, setStatus] = useState('idle');
  const run = async (period) => {
    setStatus(`generating ${period}...`);
    try {
      await buildStudentReportPdf({ data: mockData, period });
      setStatus(`done: ${period}`);
    } catch (e) {
      setStatus(`error: ${e.message}`);
      console.error('[pdf-harness]', e);
    }
  };
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>PDF Harness</h1>
      <p id="status" data-status={status}>Status: {status}</p>
      <button id="gen-overall" onClick={() => run('overall')} style={{ padding: '10px 20px', marginRight: 10 }}>Generate Overall PDF</button>
      <button id="gen-weekly" onClick={() => run('weekly')} style={{ padding: '10px 20px' }}>Generate Weekly PDF</button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
