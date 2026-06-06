import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, Download, Share2, CheckCircle2 } from 'lucide-react';
import { Modal, Btn, Avatar } from '../ui';
import { reportApi } from '../../lib/api';
import StudentReportCard, { shareReportText } from '../shared/StudentReportCard';

const PERIODS = [
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

export default function StudentReportModal({ open, onClose, studentId }) {
  const [period, setPeriod]   = useState('overall');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    setError(null);
    reportApi.getV2(studentId, period)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [open, studentId, period]);

  const handleDownloadPDF = useCallback(async (reportData) => {
    if (!reportData) return;
    try {
      const jsPDFModule = await import('jspdf');
      await import('jspdf-autotable');
      const JsPDFConstructor = jsPDFModule.default || jsPDFModule.jsPDF;
      const doc = new JsPDFConstructor();
      const s = reportData.student || {};
    doc.setFontSize(20); doc.text('Student Report Card', 14, 20);
    doc.setFontSize(12);
    doc.text(`Name: ${s.name}  |  Username: @${s.username}`, 14, 30);
    doc.text(
      `Period: ${period.charAt(0).toUpperCase() + period.slice(1)}  |  Avg Score: ${s.avg_score || 0}%  |  Attendance: ${s.attendance_pct || 0}%  |  Rank: ${reportData.rank ? `${reportData.rank}/${reportData.total_students}` : 'N/A'}`,
      14, 38
    );
    const subjectRadar = reportData.subject_radar || [];
    if (subjectRadar.length > 0) {
      doc.setFontSize(14); doc.text('Subject Performance', 14, 52);
      doc.autoTable({
        startY: 56,
        head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance']],
        body: subjectRadar.map(r => [
          `${r.emoji || ''} ${r.subject}`,
          r.test_count > 0 ? `${Math.round(r.test_avg || 0)}%` : '—',
          r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—',
          r.att_total > 0 ? `${Math.round(r.attendance_pct || 0)}%` : '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
      });
    }
    const safeName = (s.name || 'Student').replace(/\s+/g, '_');
    doc.save(`${safeName}_Report_${period || 'overall'}.pdf`);
    } catch (e) {
      console.error("Failed to generate PDF", e);
      alert("Failed to generate PDF. Please ensure you have a stable connection.");
    }
  }, [period]);

  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async (reportData) => {
    if (!reportData) return;
    const text = shareReportText(reportData, period);
    if (!text) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${reportData.student?.name || 'Student'} - Report Card`,
          text: text,
        });
        return;
      } catch (err) {
        console.error('Share dialog closed or failed', err);
        return; // Do not fallback to copy if share was cancelled
      }
    }
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy report: ', err);
    }
  }, [period]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="" size="xl">
      {/* Modal header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-neutral-100 mb-2">
        <div className="flex items-center gap-3">
          {data?.student && <Avatar name={data.student.name} src={data.student.avatar_url} size="sm" />}
          <div>
            <h3 className="text-base font-bold text-neutral-900 uppercase tracking-wide">
              {data?.student?.name || 'Report Card'}
            </h3>
            {data?.student?.username && (
              <p className="text-xs text-neutral-400">@{data.student.username}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 p-1 bg-neutral-100/80 rounded-xl">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${period === p.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {data && (
            <>
              <Btn size="sm" variant="default" icon={copied ? CheckCircle2 : Share2} onClick={() => handleShare(data)}>
                {copied ? 'Copied!' : 'Share'}
              </Btn>
              <Btn size="sm" variant="default" icon={Download} onClick={() => handleDownloadPDF(data)}>
                PDF
              </Btn>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-neutral-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : data ? (
        <StudentReportCard
          data={data}
          period={period}
          onPeriodChange={setPeriod}
          showHeader={false}
          onDownloadPDF={handleDownloadPDF}
        />
      ) : null}
    </Modal>
  );
}
