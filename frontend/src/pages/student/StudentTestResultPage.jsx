import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trophy, CheckCircle2, XCircle, MinusCircle, AlertTriangle, Star, BookOpen } from 'lucide-react';
import { Btn } from '../../components/ui';

export default function StudentTestResultPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const result = state?.result;

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-neutral-500">No result data found.</p>
        <Btn variant="primary" onClick={() => navigate('/student/tests')}>Back to tests</Btn>
      </div>
    );
  }

  const {
    score,           // raw marks obtained
    total_marks,     // total marks for test (from backend)
    percentage,      // backend returns this directly
    correct_count,
    wrong_count,
    points_earned,
    marks_deducted,
    total,           // total questions
    testTitle,
    auto,
    flagged,
  } = result;

  // Use backend's percentage if present, else calculate
  const scorePct = percentage ?? (total_marks ? Math.round((score / total_marks) * 100) : 0);

  const grade =
    scorePct >= 90 ? { label: 'Excellent! 🎉', color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' } :
    scorePct >= 75 ? { label: 'Great job! 🙌',  color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'  } :
    scorePct >= 50 ? { label: 'Good effort! 💪', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' } :
                     { label: 'Keep trying! 📚', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'   };

  const skipped = (total || 0) - (correct_count || 0) - (wrong_count || 0);

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">

        {/* Warnings */}
        {auto && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 text-sm mb-4">
            <AlertTriangle size={15} />
            <span>Test auto-submitted — time ran out.</span>
          </div>
        )}
        {flagged && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm mb-4">
            <AlertTriangle size={15} />
            <span>Your test was flagged for suspicious activity.</span>
          </div>
        )}

        {/* Score hero */}
        <div className={`${grade.bg} ${grade.border} border rounded-3xl p-8 text-center mb-5 backdrop-blur-sm`}>
          <Trophy size={36} className={`mx-auto mb-3 ${grade.color}`} />
          <p className="text-6xl font-bold tracking-tight mb-1">{Math.round(scorePct)}%</p>
          <p className={`text-lg font-semibold ${grade.color} mb-1`}>{grade.label}</p>
          {testTitle && <p className="text-sm text-neutral-500 mt-1">{testTitle}</p>}
          {total_marks && (
            <p className="text-xs text-neutral-400 mt-1">{score} / {total_marks} marks</p>
          )}
        </div>

        {/* Breakdown */}
        <div className="glass-panel rounded-2xl overflow-hidden mb-5">
          {[
            { icon: CheckCircle2, label: 'Correct',  value: correct_count,  color: 'text-green-600', sub: null },
            { icon: XCircle,      label: 'Wrong',    value: wrong_count,    color: 'text-red-500',   sub: marks_deducted > 0 ? `−${marks_deducted} marks deducted` : null },
            { icon: MinusCircle,  label: 'Skipped',  value: skipped < 0 ? 0 : skipped, color: 'text-neutral-400', sub: null },
          ].map((row, i) => (
            <div key={i} className={`flex items-center gap-3 px-5 py-3.5 ${i < 2 ? 'border-b border-white/40' : ''}`}>
              <row.icon size={18} className={row.color} />
              <div className="flex-1">
                <p className="text-sm">{row.label}</p>
                {row.sub && <p className="text-[10px] text-red-500">{row.sub}</p>}
              </div>
              <span className="font-semibold">
                {row.value}
                <span className="text-neutral-400 font-normal text-xs">{total ? `/${total}` : ''}</span>
              </span>
            </div>
          ))}

          {/* Points */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-t border-white/40 bg-amber-50/60 backdrop-blur-sm">
            <Star size={18} className="text-amber-500" />
            <span className="flex-1 text-sm font-medium text-amber-900">Points earned</span>
            <span className="font-bold text-amber-700 text-lg">+{points_earned || 0}</span>
          </div>
        </div>

        {/* Review Answers — navigates to dedicated review page */}
        {result?.test_id && (
          <button
            onClick={() => navigate('/student/tests/review', { state: { test_id: result.test_id, result } })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 glass-panel rounded-2xl text-sm font-medium hover:bg-white/40 transition-colors mb-5"
          >
            <BookOpen size={15} className="text-neutral-500" />
            Review Answers
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Btn variant="default" className="flex-1 justify-center" onClick={() => navigate('/student/tests')}>
            Back to tests
          </Btn>
          <Btn variant="primary" className="flex-1 justify-center" onClick={() => navigate('/student')}>
            Home
          </Btn>
        </div>
      </div>
    </div>
  );
}
