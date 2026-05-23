import React, { useState, useEffect } from 'react';
import { Loader2, Download, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { Modal, Btn, Avatar } from '../ui';
import { apiClient } from '../../lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function StudentReportModal({ open, onClose, studentId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !studentId) return;
    
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient(`/students/${studentId}/report`);
        setData(res);
      } catch (err) {
        // Fallback if backend endpoint isn't working/restarted yet
        console.error(err);
        setError("Could not load full report. Make sure backend is restarted.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchReport();
  }, [open, studentId]);

  const handleDownloadPDF = () => {
    if (!data) return;
    
    const doc = new jsPDF();
    const student = data.student;
    
    // Header
    doc.setFontSize(22);
    doc.text("Student Performance Report", 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Name: ${student.name || 'Unknown'}`, 14, 30);
    doc.text(`Username: ${student.username || 'Unknown'}`, 14, 36);
    doc.text(`Overall Average Score: ${student.avg_score || 0}%`, 14, 42);
    doc.text(`Overall Attendance: ${student.attendance_pct || 0}%`, 14, 48);
    doc.text(`Total Points Earned: ${student.points || 0}`, 14, 54);
    
    // Test History Table
    if (data.history && data.history.length > 0) {
      doc.setFontSize(16);
      doc.text("Test History", 14, 70);
      
      const tableColumn = ["Date", "Test Title", "Score (%)", "Status"];
      const tableRows = [];
      
      data.history.forEach(item => {
        const date = new Date(item.date).toLocaleDateString();
        const status = item.flagged ? "Flagged (Cheating)" : "Clean";
        tableRows.push([date, item.test_title, item.score_pct + "%", status]);
      });
      
      doc.autoTable({
        startY: 75,
        head: [tableColumn],
        body: tableRows,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      });
    }
    
    doc.save(`${student.name || 'Student'}_Report.pdf`);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Student Report Card" size="lg">
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 size={32} className="animate-spin text-neutral-400" />
            <p className="text-sm text-neutral-500">Generating report...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5" />
            <p>{error}</p>
          </div>
        ) : data ? (
          <>
            {/* Header info */}
            <div className="flex items-center justify-between glass-panel p-5 rounded-xl border-white/60">
              <div className="flex items-center gap-4">
                <Avatar name={data.student.name} size="lg" />
                <div>
                  <h3 className="text-xl font-bold">{data.student.name}</h3>
                  <p className="text-sm text-neutral-500">@{data.student.username}</p>
                </div>
              </div>
              <Btn onClick={handleDownloadPDF} variant="primary" icon={Download}>
                Download PDF
              </Btn>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 glass-panel rounded-xl text-center">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Avg Score</p>
                <p className="text-2xl font-bold text-blue-600">{data.student.avg_score || 0}%</p>
              </div>
              <div className="p-4 glass-panel rounded-xl text-center">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Attendance</p>
                <p className={`text-2xl font-bold ${data.student.attendance_pct >= 75 ? 'text-green-600' : 'text-red-500'}`}>
                  {data.student.attendance_pct || 0}%
                </p>
              </div>
              <div className="p-4 glass-panel rounded-xl text-center">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Total Points</p>
                <p className="text-2xl font-bold text-amber-600">{data.student.points || 0}</p>
              </div>
            </div>
            
            {/* Chart */}
            {data.history && data.history.length > 0 ? (
              <div className="glass-panel p-5 rounded-xl border-white/60">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-neutral-500" /> Test Performance Trend
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                      <XAxis 
                        dataKey="test_title" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 11, fill: '#737373' }} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 11, fill: '#737373' }} 
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="score_pct" 
                        stroke="#2563eb" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorScore)" 
                        name="Score %"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-neutral-500 glass-panel rounded-xl">
                No test history available for this student.
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
