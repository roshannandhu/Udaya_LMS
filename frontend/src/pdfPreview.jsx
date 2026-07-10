// Dev-only harness for visually verifying the exam result PDF template.
// Open http://localhost:3001/pdf-preview.html?case=normal|long|tiny|terminated|noreview
// window.__genPdf() triggers the real html2pdf download for the selected case.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ExamResultTemplateV3, buildExamResultPdf } from './lib/reportPdf';

const OPTIONS = ['The mitochondria', 'The nucleus', 'The ribosome', 'The cell membrane'];

const mkQuestions = (n, longText = false) =>
  Array.from({ length: n }).map((_, i) => ({
    id: String(i + 1),
    question: longText && i % 3 === 0
      ? `Q${i + 1}. A shopkeeper marks an article 40% above its cost price and then offers two successive discounts of 10% and 5% on the marked price during a festival sale season. If the final selling price is Rs. 1197, what was the original cost price of the article?`
      : `Q${i + 1}. Which part of the cell is responsible for producing energy?`,
    options: OPTIONS,
    correct_idx: i % 4,
    order_num: i + 1,
  }));

// answers: ~64% correct, some wrong, some skipped
const mkAnswers = (questions) => {
  const answers = {};
  questions.forEach((q, i) => {
    if (i % 5 === 4) return; // skipped
    answers[q.id] = i % 4 === 1 ? (q.correct_idx + 1) % 4 : q.correct_idx; // some wrong
  });
  return answers;
};

const mkCase = ({ n = 25, longText = false, review = true, over = {}, student = {}, meta = {} }) => {
  const questions = mkQuestions(n, longText);
  const answers = mkAnswers(questions);
  const correct = questions.filter(q => answers[q.id] === q.correct_idx).length;
  const wrong = Object.keys(answers).length - correct;
  const totalMarks = n * 2;
  const score = correct * 2 - wrong * 0.5;
  return {
    reviewData: review ? { questions, answers } : null,
    result: {
      id: 'attempt-demo-1',
      score,
      total_marks: totalMarks,
      percentage: (score / totalMarks) * 100,
      correct_count: correct,
      wrong_count: wrong,
      marks_deducted: wrong * 0.5,
      total: correct + wrong,
      flagged: false,
      cancelled: false,
      points_earned: correct * 10,
      rank: 4,
      total_attempts: 22,
      class_avg_score_pct: 61,
      highest_score_pct: 92,
      started_at: '2026-07-08T10:00:00Z',
      submitted_at: '2026-07-08T10:24:00Z',
      ...over,
    },
    student: {
      name: 'Ananya Ramachandran',
      student_code: '25UDAYA100003',
      standard_name: '10th Standard',
      avatar_url: null,
      username: 'ananya',
      ...student,
    },
    testMeta: {
      title: 'Algebra Unit Test — Quadratic Equations',
      subject_name: 'Mathematics',
      duration_mins: 30,
      total_marks: totalMarks,
      scheduled_for: '2026-07-08T10:00:00Z',
      topic_tag: 'Quadratic Equations',
      ...meta,
    },
  };
};

const CASES = {
  normal: mkCase({}),
  long: mkCase({
    n: 50,
    longText: true,
    student: { name: 'Venkatasubramanian Krishnamoorthy Iyer' },
    meta: { title: 'Half-Yearly Comprehensive Model Examination Paper II — Full Syllabus Revision Test' },
  }),
  tiny: mkCase({
    n: 1,
    over: { rank: null, total_attempts: null, class_avg_score_pct: undefined, highest_score_pct: undefined, marks_deducted: 0, started_at: null },
    student: { student_code: null },
    meta: { topic_tag: null },
  }),
  terminated: mkCase({ over: { cancelled: true, score: 0, percentage: 0, correct_count: 0, wrong_count: 0, marks_deducted: 0, points_earned: 0, rank: 22 } }),
  noreview: mkCase({ review: false }),
};

const key = new URLSearchParams(window.location.search).get('case') || 'normal';
const payload = CASES[key] || CASES.normal;

window.__genPdf = () => buildExamResultPdf(payload);

createRoot(document.getElementById('root')).render(
  <div style={{ background: '#e5e5e5', padding: 24, minHeight: '100vh' }}>
    <div style={{ margin: '0 auto', width: 720, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.15)' }}>
      <ExamResultTemplateV3 {...payload} />
    </div>
  </div>
);
