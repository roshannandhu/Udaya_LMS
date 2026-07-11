// Dev-only harness: renders buttons to generate both PDFs from mock data.
// Tests all avatar types: preset:male, preset:female, null (neutral), and real URL.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildStudentReportPdf, buildExamResultPdf } from './lib/reportPdf';
import './index.css';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const attendanceHeatmap = Array.from({ length: 70 }, (_, i) => {
  const idx = 69 - i;
  const dow = new Date(daysAgo(idx)).getDay();
  if (dow === 0) return null;
  const roll = (idx * 7) % 10;
  return {
    date: daysAgo(idx),
    present: roll < 8 ? 1 : 0,
    late: roll === 8 ? 1 : 0,
    absent: roll === 9 ? 1 : 0,
    total: 1,
  };
}).filter(Boolean);

const mockStudent = {
  id: 'stu-harness-1',
  name: 'Priya Sharma',
  username: 'priya10',
  student_code: '25UDAYA100007',
  standard_name: '10th Standard',
  avatar_url: null,
  avg_score: 68,
  attendance_pct: 82,
  points: 340,
};

const mockReportData = {
  student: mockStudent,
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
    { topic: "Newton's Laws", subject: 'Physics', score_pct: 61, video_completed: true },
    { topic: 'Quadratic Equations', subject: 'Mathematics', score_pct: 78, video_completed: true },
    { topic: "Ohm's Law", subject: 'Physics', score_pct: 70, video_completed: false },
    { topic: 'Reading Comprehension', subject: 'English', score_pct: 84, video_completed: true },
  ],
  attendance_heatmap: attendanceHeatmap,
  assignment_stats: { submitted: 9, total: 12, avg_marks_pct: 71 },
  live_classes_stats: { attended: 14, total: 18, attendance_pct: 78 },
  class_averages: { avg_score: 61, attendance_pct: 76, points: 285 },
};

// MCQ questions for exam PDF test
const mockQuestions = Array.from({ length: 20 }, (_, i) => ({
  id: `q${i + 1}`,
  question: i === 2
    ? 'A long question about quadratic equations — if ax² + bx + c = 0 and the discriminant b² − 4ac is negative, what can we conclude about the nature of the roots of this equation?'
    : `Question ${i + 1}: What is the value of x in the equation ${i + 1}x + ${i * 2} = ${i * 3 + 5}?`,
  options: [`Option A for Q${i + 1}`, `Option B — a moderately long answer choice for question ${i + 1}`, `Option C for Q${i + 1}`, `Option D for Q${i + 1}`],
  correct_idx: i % 4,
}));

const mockAnswers = Object.fromEntries(
  mockQuestions.map((q, i) => [
    q.id,
    i < 14 ? (i % 4 === 0 ? 0 : i % 4) : undefined, // 14 answered, 6 skipped
  ]).filter(([, v]) => v !== undefined)
);

const mockResult = {
  id: 'exam-harness-1',
  score: 56,
  total_marks: 80,
  percentage: 70,
  correct_count: 14,
  wrong_count: 4,
  total: 20,
  marks_deducted: 2,
  rank: 3,
  total_attempts: 28,
  points_earned: 140,
  class_avg_score_pct: 61,
  highest_score_pct: 88,
  submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 28 * 60 * 1000).toISOString(),
};

const mockTestMeta = {
  title: 'Mathematics Unit Test — Quadratic Equations',
  subject_name: 'Mathematics',
  duration_mins: 30,
  scheduled_for: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  topic_tag: 'Quadratic Equations',
};

// Short exam (5 questions) — tests sparse page 2 filling
const shortQuestions = mockQuestions.slice(0, 5);
const shortAnswers = { q1: 0, q2: 1, q3: 3, q4: 0 }; // q5 skipped
const shortResult = { ...mockResult, score: 30, total_marks: 40, percentage: 75, correct_count: 3, wrong_count: 1, total: 5, marks_deducted: 1, rank: 2 };

function Harness() {
  const [status, setStatus] = useState('idle');

  const run = async (label, fn) => {
    setStatus(`generating ${label}...`);
    try {
      await fn();
      setStatus(`✓ done: ${label}`);
    } catch (e) {
      setStatus(`✗ error: ${e.message}`);
      console.error('[pdf-harness]', label, e);
    }
  };

  const btn = (id, label, fn) => (
    <button
      id={id}
      onClick={() => run(label, fn)}
      style={{ padding: '10px 18px', marginRight: 10, marginBottom: 10, background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 900 }}>
      <h1 style={{ fontSize: 22 }}>PDF Harness</h1>
      <p id="status" style={{ background: status.startsWith('✗') ? '#fee2e2' : status.startsWith('✓') ? '#dcfce7' : '#f3f4f6', padding: '8px 14px', borderRadius: 6, fontSize: 13 }}>
        Status: {status}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Student Report Card PDF</h2>
      <div>
        {btn('gen-overall', 'Overall Report (avatar: neutral)', () => buildStudentReportPdf({ data: { ...mockReportData, student: { ...mockStudent, avatar_url: null } }, period: 'overall' }))}
        {btn('gen-overall-male', 'Overall Report (avatar: boy)', () => buildStudentReportPdf({ data: { ...mockReportData, student: { ...mockStudent, avatar_url: 'preset:male' } }, period: 'overall' }))}
        {btn('gen-overall-female', 'Overall Report (avatar: girl)', () => buildStudentReportPdf({ data: { ...mockReportData, student: { ...mockStudent, avatar_url: 'preset:female' } }, period: 'overall' }))}
        {btn('gen-overall-upload', 'Overall Report (avatar: uploaded photo → fallback)', () => buildStudentReportPdf({ data: { ...mockReportData, student: { ...mockStudent, avatar_url: 'https://example.com/no-cors-photo.jpg' } }, period: 'overall' }))}
        {btn('gen-weekly', 'Weekly Report', () => buildStudentReportPdf({ data: mockReportData, period: 'weekly' }))}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Exam Result PDF (V3)</h2>
      <div>
        {btn('gen-exam-neutral', 'Exam PDF — 20 Qs (avatar: neutral)', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: mockAnswers }, result: mockResult, student: { ...mockStudent, avatar_url: null }, testMeta: mockTestMeta }))}
        {btn('gen-exam-male', 'Exam PDF — 20 Qs (avatar: boy)', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: mockAnswers }, result: mockResult, student: { ...mockStudent, avatar_url: 'preset:male' }, testMeta: mockTestMeta }))}
        {btn('gen-exam-female', 'Exam PDF — 20 Qs (avatar: girl)', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: mockAnswers }, result: mockResult, student: { ...mockStudent, avatar_url: 'preset:female' }, testMeta: mockTestMeta }))}
        {btn('gen-exam-upload', 'Exam PDF — uploaded photo → fallback', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: mockAnswers }, result: mockResult, student: { ...mockStudent, avatar_url: 'https://example.com/no-cors-photo.jpg' }, testMeta: mockTestMeta }))}
        {btn('gen-exam-short', 'Exam PDF — 5 Qs (sparse test)', () => buildExamResultPdf({ reviewData: { questions: shortQuestions, answers: shortAnswers }, result: shortResult, student: mockStudent, testMeta: { ...mockTestMeta, title: 'Short Quiz' } }))}
        {btn('gen-exam-pass', 'Exam PDF — Passing (72%)', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: mockAnswers }, result: { ...mockResult, percentage: 72 }, student: mockStudent, testMeta: mockTestMeta }))}
        {btn('gen-exam-fail', 'Exam PDF — Failed (28%)', () => buildExamResultPdf({ reviewData: { questions: mockQuestions, answers: { q1: 1, q2: 2, q3: 1 } }, result: { ...mockResult, score: 12, percentage: 28, correct_count: 3, wrong_count: 3, marks_deducted: 3 }, student: mockStudent, testMeta: mockTestMeta }))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
