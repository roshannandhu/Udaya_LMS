import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, Loader2, Download } from 'lucide-react';
import { testApi } from '../../lib/api';
import { Reveal } from '../../components/bits';

export default function StudentTestReviewPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const test_id = state?.test_id;
  const result = state?.result;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const handleDownloadPdf = async () => {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { buildExamResultPdf } = await import('../../lib/reportPdf');
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await buildExamResultPdf({
        reviewData: data,
        result,
        student: {
          name:         user.name,
          student_code: user.student_code,
          standard_name:user.standard_name,
          avatar_url:   user.avatar_url,
          username:     user.username,
        },
        testMeta: { title: result?.testTitle },
      });
    } catch (e) {
      console.error('PDF error', e);
      alert('Failed to generate PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    if (!test_id) { setLoading(false); return; }
    testApi.getAttemptReview(test_id)
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load review'))
      .finally(() => setLoading(false));
  }, [test_id]);

  const goBack = () => {
    if (state?.source === 'result-page') {
      navigate('/student/tests/result', { state: { result } });
    } else {
      navigate('/student/tests');
    }
  };

  if (!test_id) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-neutral-500">No review data found.</p>
        <button onClick={() => navigate('/student/tests')} className="text-sm font-medium underline text-neutral-700">Back to tests</button>
      </div>
    );
  }

  const scorePct = result?.percentage ?? (result?.total_marks ? Math.round((result.score / result.total_marks) * 100) : null);

  const qs = data?.questions || [];
  const ans = data?.answers || {};

  const correctCount = qs.filter(q => { const a = ans[String(q.id)]; return a !== undefined && a !== null && a === q.correct_idx; }).length;
  const wrongCount   = qs.filter(q => { const a = ans[String(q.id)]; return a !== undefined && a !== null && a !== q.correct_idx; }).length;
  const skippedCount = qs.filter(q => ans[String(q.id)] === undefined || ans[String(q.id)] === null).length;

  return (
    <div className="min-h-screen bg-transparent">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={goBack} className="p-2 -ml-1 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-lg transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{result?.testTitle || 'Answer Review'}</h1>
            {!loading && data && (
              <p className="text-[11px] text-neutral-400">{qs.length} questions</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {scorePct !== null && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                scorePct >= 75 ? 'bg-green-100 text-green-700' :
                scorePct >= 50 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-600'
              }`}>
                {Math.round(scorePct)}%
              </span>
            )}
            {data && (
              <button
                onClick={handleDownloadPdf}
                disabled={pdfBusy}
                title="Download PDF result"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
              >
                {pdfBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-2xl mx-auto">
        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-neutral-300" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-500 text-center py-10 bg-red-50 rounded-2xl border border-red-100">
            {error}
          </div>
        )}

        {/* Summary strip */}
        {data && (
          <>
            <div className="flex gap-2 mb-5 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-100 rounded-xl text-xs font-semibold text-green-700">
                <CheckCircle2 size={13} /> {correctCount} Correct
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs font-semibold text-red-600">
                <XCircle size={13} /> {wrongCount} Wrong
              </div>
              {skippedCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-500">
                  <MinusCircle size={13} /> {skippedCount} Skipped
                </div>
              )}
            </div>

            {/* Question cards */}
            <div className="space-y-4">
              {qs.map((q, qi) => {
                const studentAnswer = ans[String(q.id)];
                const answered = studentAnswer !== undefined && studentAnswer !== null;
                const isCorrect = answered && studentAnswer === q.correct_idx;
                const isSkipped = !answered;

                return (
                  <Reveal key={q.id}>
                  <div
                    className={`rounded-2xl overflow-hidden border ${
                      isCorrect  ? 'border-green-200' :
                      isSkipped  ? 'border-neutral-200' :
                                   'border-red-200'
                    }`}
                  >
                    {/* Question header */}
                    <div className={`px-4 py-3 flex items-start justify-between gap-3 ${
                      isCorrect  ? 'bg-green-50' :
                      isSkipped  ? 'bg-neutral-50' :
                                   'bg-red-50'
                    }`}>
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isCorrect  ? 'bg-green-200 text-green-800' :
                          isSkipped  ? 'bg-neutral-200 text-neutral-600' :
                                       'bg-red-200 text-red-700'
                        }`}>{qi + 1}</span>
                        <p className="text-sm font-medium leading-snug">{q.question}</p>
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {isCorrect && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
                            <CheckCircle2 size={12} /> Correct
                          </span>
                        )}
                        {!isCorrect && !isSkipped && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500">
                            <XCircle size={12} /> Wrong
                          </span>
                        )}
                        {isSkipped && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400">
                            <MinusCircle size={12} /> Skipped
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Options */}
                    <div className="p-3 space-y-2 bg-white/70">
                      {q.options.map((opt, oi) => {
                        const isCorrectOpt  = oi === q.correct_idx;
                        const isStudentPick = answered && oi === studentAnswer;

                        // Determine style
                        let rowCls = 'bg-white border-neutral-100 text-neutral-500';
                        let iconEl = (
                          <span className="w-5 h-5 rounded-full border-2 border-neutral-200 flex-shrink-0" />
                        );
                        let rightLabel = null;

                        if (isCorrectOpt && isStudentPick) {
                          // Student chose correctly
                          rowCls = 'bg-green-50 border-green-300 text-green-800 font-medium';
                          iconEl = <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />;
                        } else if (isCorrectOpt) {
                          // Correct option but student didn't choose it
                          rowCls = 'bg-green-50/60 border-green-200 text-green-700';
                          iconEl = <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />;
                          rightLabel = (
                            <span className="text-[10px] font-bold text-green-600 flex-shrink-0 uppercase tracking-wide">Correct</span>
                          );
                        } else if (isStudentPick) {
                          // Student chose this but it's wrong
                          rowCls = 'bg-red-50 border-red-300 text-red-700';
                          iconEl = <XCircle size={18} className="text-red-400 flex-shrink-0" />;
                          rightLabel = (
                            <span className="text-[10px] font-bold text-red-500 flex-shrink-0 uppercase tracking-wide">Your answer</span>
                          );
                        }

                        return (
                          <div key={oi} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${rowCls}`}>
                            {iconEl}
                            <span className="flex-1 leading-snug">{opt}</span>
                            {rightLabel}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </Reveal>
                );
              })}
            </div>

            {/* Bottom back button */}
            <div className="mt-8 pb-6">
              <button
                onClick={goBack}
                className="w-full py-3 rounded-2xl glass-panel text-sm font-medium text-neutral-700 hover:bg-[#F4F2EF] transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft size={15} /> Back to results
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
