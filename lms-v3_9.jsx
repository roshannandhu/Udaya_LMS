import React, { useState, useMemo, useEffect } from 'react';
import {
  Home, BookOpen, Users, MessageSquare, MoreHorizontal,
  Search, Plus, ChevronRight, ChevronLeft, ChevronDown, X, Check,
  Play, Pause, Video, FileQuestion, FileText, Layers, Upload, Download,
  Send, Paperclip, Pin, Edit2, Trash2, Clock, Calendar, Bell,
  AlertCircle, Sparkles, Trophy, Target, TrendingUp, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Eye, EyeOff, Lock,
  GraduationCap, Settings, LogOut, UserPlus, QrCode, Shield,
  Filter, ArrowLeft, MoreVertical, School, Flag, Activity,
  CheckCircle2, Circle, ArrowRight, Mail, Phone, Smartphone, Zap
} from 'lucide-react';

// ============================================================
// DESIGN TOKENS — Notion-inspired
// ============================================================
const COLORS = {
  bg: '#FFFFFF',
  bgSubtle: '#FAFAF9',
  bgHover: '#F5F4F2',
  border: '#EBEAE7',
  borderStrong: '#DDDCD9',
  text: '#1A1A19',
  textMuted: '#787774',
  textSubtle: '#A4A29E',
  accent: '#2383E2',
  accentSubtle: '#E6F0FA',
  red: '#E03E3E',
  redSubtle: '#FDEBEC',
  amber: '#CB912F',
  amberSubtle: '#FBF3DB',
  green: '#0F7B6C',
  greenSubtle: '#DDEDEA',
  purple: '#6940A5',
  purpleSubtle: '#EAE4F2',
  pink: '#AD1A72',
  pinkSubtle: '#F4DFEB',
};

const fonts = {
  display: '"Inter", "SF Pro Display", -apple-system, sans-serif',
  body: '"Inter", "SF Pro Text", -apple-system, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
};

// ============================================================
// DATA
// ============================================================
const mockStandards = [
  { id: 1, name: '10th Standard', short: '10', emoji: '📐' },
  { id: 2, name: '11th Standard', short: '11', emoji: '⚗️' },
  { id: 3, name: '12th Standard', short: '12', emoji: '🎓' },
  { id: 4, name: '9th Standard', short: '9', emoji: '📚' },
];

const mockSubjectClasses = [
  { id: 1, standardId: 1, name: 'Mathematics', emoji: '📐', videoCount: 24, endDate: '2026-12-15' },
  { id: 2, standardId: 1, name: 'Physics', emoji: '⚛️', videoCount: 18, endDate: '2026-12-15' },
  { id: 3, standardId: 1, name: 'Chemistry', emoji: '⚗️', videoCount: 22, endDate: '2026-12-15' },
  { id: 4, standardId: 2, name: 'Mathematics', emoji: '📐', videoCount: 18, endDate: '2026-12-20' },
  { id: 5, standardId: 2, name: 'Physics', emoji: '⚛️', videoCount: 15, endDate: '2026-12-20' },
  { id: 6, standardId: 3, name: 'Physics', emoji: '⚛️', videoCount: 31, endDate: '2027-03-01' },
  { id: 7, standardId: 3, name: 'Mathematics', emoji: '📐', videoCount: 28, endDate: '2027-03-01' },
  { id: 8, standardId: 4, name: 'English', emoji: '📖', videoCount: 12, endDate: '2027-01-31' },
];

const mockStudents = [
  { id: 1, name: 'Aarav Sharma', username: 'aarav.s', email: 'aarav@email.com', phone: '+91 98765 43210', standardId: 1, points: 1240, attendance: 92, lastSeen: '2 hours ago', avgScore: 87, blocked: false },
  { id: 2, name: 'Diya Patel', username: 'diya.p', email: 'diya@email.com', phone: '+91 98765 43211', standardId: 1, points: 1580, attendance: 96, lastSeen: '30 min ago', avgScore: 94, blocked: false },
  { id: 3, name: 'Arjun Kumar', username: 'arjun.k', email: 'arjun@email.com', phone: '+91 98765 43212', standardId: 1, points: 890, attendance: 78, lastSeen: '1 day ago', avgScore: 72, blocked: false },
  { id: 4, name: 'Ananya Singh', username: 'ananya.s', email: 'ananya@email.com', phone: '+91 98765 43213', standardId: 1, points: 1420, attendance: 88, lastSeen: '5 hours ago', avgScore: 89, blocked: false },
  { id: 5, name: 'Vihaan Gupta', username: 'vihaan.g', email: 'vihaan@email.com', phone: '+91 98765 43214', standardId: 1, points: 620, attendance: 65, lastSeen: '3 days ago', avgScore: 58, blocked: false },
  { id: 6, name: 'Saanvi Reddy', username: 'saanvi.r', email: 'saanvi@email.com', phone: '+91 98765 43215', standardId: 1, points: 1390, attendance: 91, lastSeen: '1 hour ago', avgScore: 86, blocked: false },
  { id: 7, name: 'Reyansh Iyer', username: 'reyansh.i', email: 'reyansh@email.com', phone: '+91 98765 43216', standardId: 3, points: 1100, attendance: 84, lastSeen: '4 hours ago', avgScore: 81, blocked: false },
  { id: 8, name: 'Myra Joshi', username: 'myra.j', email: 'myra@email.com', phone: '+91 98765 43217', standardId: 3, points: 1670, attendance: 98, lastSeen: '15 min ago', avgScore: 96, blocked: false },
  { id: 9, name: 'Ishaan Verma', username: 'ishaan.v', email: 'ishaan@email.com', phone: '+91 98765 43218', standardId: 2, points: 1320, attendance: 90, lastSeen: '1 hour ago', avgScore: 85, blocked: false },
  { id: 10, name: 'Kiara Mehta', username: 'kiara.m', email: 'kiara@email.com', phone: '+91 98765 43219', standardId: 4, points: 980, attendance: 82, lastSeen: '6 hours ago', avgScore: 76, blocked: false },
];

const mockVideos = [
  { id: 1, title: 'Quadratic Equations — Introduction', classId: 1, duration: '24:30', uploaded: '2 days ago', watched: 24, total: 28, size: '142 MB' },
  { id: 2, title: 'Solving by Factorization', classId: 1, duration: '31:15', uploaded: '5 days ago', watched: 22, total: 28, size: '198 MB' },
  { id: 3, title: 'Discriminant & Nature of Roots', classId: 1, duration: '28:45', uploaded: '1 week ago', watched: 27, total: 28, size: '178 MB' },
  { id: 4, title: 'Newton\'s Laws Overview', classId: 2, duration: '32:10', uploaded: '3 days ago', watched: 24, total: 26, size: '215 MB' },
  { id: 5, title: 'Atomic Structure', classId: 3, duration: '27:55', uploaded: '4 days ago', watched: 20, total: 25, size: '188 MB' },
  { id: 6, title: 'Organic Reactions', classId: 3, duration: '35:20', uploaded: '6 days ago', watched: 18, total: 25, size: '241 MB' },
  { id: 7, title: 'Wave Optics', classId: 6, duration: '38:45', uploaded: '2 days ago', watched: 19, total: 22, size: '256 MB' },
];

const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
const fmtSchedule = (d) => d.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const mockTests = [
  { id: 1, title: 'Weekly Test — Algebra', classId: 1, questions: 20, duration: 30, attempted: 26, totalStudents: 28, avg: 78, status: 'completed', flagged: 2, negativeMarking: true, penalty: 0.25, totalMarks: 20 },
  { id: 2, title: 'Chapter Test — Quadratics', classId: 1, questions: 25, duration: 45, attempted: 27, totalStudents: 28, avg: 82, status: 'completed', flagged: 0, negativeMarking: false, penalty: 0, totalMarks: 25 },
  { id: 3, title: 'Monthly Assessment', classId: 1, questions: 40, duration: 60, attempted: 0, totalStudents: 28, avg: 0, status: 'scheduled', scheduledFor: tomorrow.toISOString(), flagged: 0, negativeMarking: true, penalty: 0.5, totalMarks: 40 },
  { id: 4, title: 'Newton\'s Laws Test', classId: 2, questions: 15, duration: 25, attempted: 24, totalStudents: 26, avg: 76, status: 'completed', flagged: 1, negativeMarking: true, penalty: 0.25, totalMarks: 15 },
  { id: 5, title: 'Atomic Structure Quiz', classId: 3, questions: 10, duration: 15, attempted: 0, totalStudents: 25, avg: 0, status: 'scheduled', scheduledFor: tomorrow.toISOString(), flagged: 0, negativeMarking: false, penalty: 0, totalMarks: 10 },
];

const mockTestAttempts = {
  1: { 1: { score: 85, correct: 17, total: 20 }, 2: { score: 92, correct: 18, total: 20 }, 3: { score: 65, correct: 13, total: 20 }, 4: { score: 88, correct: 18, total: 20 }, 5: { score: 55, correct: 11, total: 20 }, 6: { score: 84, correct: 17, total: 20 } },
};

const initialBroadcastsByStandard = {
  1: [
    { id: 1, text: 'Welcome to the new term, 10th standard! All your subjects are now active.', sender: 'Priya Mathur', senderRole: 'Class Teacher', time: '10:30 AM', pinned: true, attachments: [], edited: false, deleted: false, readBy: 26 },
    { id: 2, text: 'Solutions to yesterday\'s practice problems are uploaded.', sender: 'Priya Mathur', senderRole: 'Maths Teacher', time: '4:15 PM', pinned: false, attachments: [{ name: 'practice-solutions.pdf', size: '2.4 MB' }], edited: false, deleted: false, readBy: 24 },
  ],
  2: [{ id: 100, text: 'Lab session this Friday at 2 PM.', sender: 'Priya Mathur', senderRole: 'Class Teacher', time: '9:00 AM', pinned: false, attachments: [], edited: false, deleted: false, readBy: 18 }],
  3: [{ id: 200, text: 'Board exam timetable attached.', sender: 'Priya Mathur', senderRole: 'Class Teacher', time: 'Yesterday', pinned: true, attachments: [{ name: 'timetable.pdf', size: '1.2 MB' }], edited: false, deleted: false, readBy: 20 }],
  4: [],
};

const mockQuestions = [
  { id: 1, q: 'What is the discriminant of x² − 5x + 6 = 0?', options: ['1', '25', '24', '−1'], correct: 0 },
  { id: 2, q: 'The roots of x² + 4x + 4 = 0 are:', options: ['Real and distinct', 'Real and equal', 'Imaginary', 'None of these'], correct: 1 },
  { id: 3, q: 'If α and β are roots of x² − 7x + 12 = 0, then α + β =', options: ['7', '12', '−7', '−12'], correct: 0 },
];

// Helpers
const getStudentsInStandard = (stdId) => mockStudents.filter(s => s.standardId === stdId);
const getClassesInStandard = (stdId) => mockSubjectClasses.filter(c => c.standardId === stdId);

// ============================================================
// PRIMITIVE COMPONENTS — Notion-style flat, minimal
// ============================================================

const Btn = ({ children, variant = 'default', size = 'md', icon: Icon, onClick, className = '', disabled = false, type = 'button' }) => {
  const variants = {
    primary: 'bg-neutral-900 text-white hover:bg-neutral-800 border border-neutral-900',
    default: 'bg-white text-neutral-900 hover:bg-neutral-50 border border-neutral-200',
    ghost: 'text-neutral-700 hover:bg-neutral-100 border border-transparent',
    danger: 'text-red-600 hover:bg-red-50 border border-transparent',
    dangerSolid: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2 text-sm' };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
};

const Input = ({ label, type = 'text', placeholder, value, onChange, autoFocus = false, ...rest }) => (
  <div>
    {label && <label className="text-xs font-medium text-neutral-600 mb-1.5 block">{label}</label>}
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} autoFocus={autoFocus} {...rest}
      className="w-full px-3 py-2 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm transition-all placeholder:text-neutral-400" />
  </div>
);

const Textarea = ({ label, placeholder, value, onChange, rows = 3, ...rest }) => (
  <div>
    {label && <label className="text-xs font-medium text-neutral-600 mb-1.5 block">{label}</label>}
    <textarea placeholder={placeholder} value={value} onChange={onChange} rows={rows} {...rest}
      className="w-full px-3 py-2 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm transition-all placeholder:text-neutral-400 resize-none" />
  </div>
);

const Avatar = ({ name, size = 'md' }) => {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-xl' };
  const colors = ['#FDEBEC', '#FBF3DB', '#DDEDEA', '#E6F0FA', '#EAE4F2', '#F4DFEB'];
  const textColors = ['#E03E3E', '#CB912F', '#0F7B6C', '#2383E2', '#6940A5', '#AD1A72'];
  const idx = (name?.charCodeAt(0) || 0) % colors.length;
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
      style={{ background: colors[idx], color: textColors[idx] }}>
      {initials}
    </div>
  );
};

const Tag = ({ children, color = 'gray' }) => {
  const colors = {
    gray: { bg: '#F1F1EF', text: '#1A1A19' },
    blue: { bg: '#E6F0FA', text: '#2383E2' },
    green: { bg: '#DDEDEA', text: '#0F7B6C' },
    amber: { bg: '#FBF3DB', text: '#CB912F' },
    red: { bg: '#FDEBEC', text: '#E03E3E' },
    purple: { bg: '#EAE4F2', text: '#6940A5' },
    pink: { bg: '#F4DFEB', text: '#AD1A72' },
  };
  const c = colors[color];
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ background: c.bg, color: c.text }}>{children}</span>;
};

const Divider = ({ className = '' }) => <div className={`h-px bg-neutral-200 ${className}`} />;

const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 animate-in fade-in" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`w-full ${sizes[size]} max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-2xl border border-neutral-200`}>
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-neutral-100"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const Sheet = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex md:items-center md:justify-end bg-neutral-900/40 animate-in fade-in" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="absolute bottom-0 md:bottom-auto md:right-0 md:top-0 md:bottom-0 w-full md:w-[480px] bg-white md:rounded-l-2xl rounded-t-2xl md:rounded-t-none shadow-2xl flex flex-col max-h-[92vh] md:max-h-none animate-in slide-up md:slide-left">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 p-1 rounded hover:bg-neutral-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};

const EmojiTile = ({ emoji, size = 'md' }) => {
  const sizes = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-xl', lg: 'w-14 h-14 text-2xl', xl: 'w-20 h-20 text-4xl' };
  return <div className={`${sizes[size]} rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0`}>{emoji}</div>;
};

const Toggle = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
  </button>
);

// Section header — Notion-style
const SectionHeader = ({ title, action, count }) => (
  <div className="flex items-center justify-between mb-3 px-1">
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {count !== undefined && <span className="text-xs text-neutral-400">{count}</span>}
    </div>
    {action}
  </div>
);

// ============================================================
// LOGIN (unchanged in spirit, simpler & cleaner)
// ============================================================
const LoginScreen = ({ onLogin }) => {
  const [mode, setMode] = useState('teacher');
  const [showPwd, setShowPwd] = useState(false);
  const [creds, setCreds] = useState({ user: '', pwd: '' });
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!creds.user.trim() || !creds.pwd.trim()) { setError('Please fill in both fields.'); return; }
    setError(''); onLogin(mode);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50" style={{ fontFamily: fonts.body }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center"><GraduationCap size={18} className="text-white" /></div>
          <span className="font-semibold tracking-tight text-lg">Udaya</span>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-8 shadow-sm">
          <h1 className="text-xl font-semibold mb-1">Welcome back</h1>
          <p className="text-sm text-neutral-500 mb-6">Sign in to continue</p>

          <div className="flex p-1 bg-neutral-100 rounded-md mb-6">
            {['teacher', 'student'].map(r => (
              <button key={r} onClick={() => setMode(r)}
                className={`flex-1 py-1.5 rounded text-sm font-medium capitalize transition-all ${mode === r ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                {r}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <Input label={mode === 'teacher' ? 'Email or username' : 'Username'} value={creds.user} onChange={e => setCreds({ ...creds, user: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder={mode === 'teacher' ? 'priya@academy.com' : 'aarav.s'} />
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Password</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={creds.pwd} onChange={e => setCreds({ ...creds, pwd: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="••••••••"
                  className="w-full px-3 py-2 pr-9 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 outline-none text-sm" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 p-1">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {error && <div className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</div>}
            <button onClick={handleSubmit} className="w-full py-2 bg-neutral-900 text-white rounded-md font-medium hover:bg-neutral-800 transition-colors text-sm">Sign in</button>
          </div>

          {mode === 'student' && (
            <div className="mt-5 p-3 rounded-md bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 leading-relaxed">
              First time? Use the credentials your teacher provided.
            </div>
          )}
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">Udaya · A learning platform built for tuition</p>
      </div>
    </div>
  );
};

// ============================================================
// TEACHER PORTAL — Notion-style, task-oriented
// ============================================================

// Top bar — clean, just title + search + actions
const TopBar = ({ title, subtitle, action, navigate, showSearch = true }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
      <div className="px-5 md:px-8 py-4 flex items-center gap-3 max-w-5xl mx-auto">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-neutral-500 truncate mt-0.5">{subtitle}</p>}
        </div>
        {showSearch && (
          <button onClick={() => setSearchOpen(true)} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <Search size={16} />
          </button>
        )}
        {action}
      </div>
      {navigate && <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} navigate={navigate} />}
    </div>
  );
};

// Bottom tab bar — mobile-app style, but works on desktop too
const BottomNav = ({ active, setActive }) => {
  const items = [
    { id: 'today', label: 'Today', icon: Home },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'broadcasts', label: 'Inbox', icon: MessageSquare },
    { id: 'more', label: 'More', icon: MoreHorizontal },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200">
      <div className="max-w-5xl mx-auto flex">
        {items.map(item => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${isActive ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
};

// Search palette — Notion-style ⌘K
const SearchPalette = ({ open, onClose, navigate }) => {
  const [query, setQuery] = useState('');
  useEffect(() => { if (open) setQuery(''); }, [open]);
  if (!open) return null;
  const results = query ? [
    ...mockStudents.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || s.username.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 4).map(s => ({ type: 'Student', label: s.name, sub: `@${s.username}`, go: () => navigate('student-detail', { studentId: s.id }) })),
    ...mockSubjectClasses.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 4).map(c => ({ type: 'Subject', label: c.name, sub: mockStandards.find(s => s.id === c.standardId)?.name, go: () => navigate('subject-detail', { classId: c.id }) })),
    ...mockTests.filter(t => t.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 4).map(t => ({ type: 'Test', label: t.title, sub: `${t.questions} questions`, go: () => navigate('tests') })),
  ] : [
    { type: 'Quick action', label: 'Create new test', icon: FileQuestion, go: () => navigate('tests') },
    { type: 'Quick action', label: 'Upload video', icon: Upload, go: () => navigate('subjects') },
    { type: 'Quick action', label: 'Send broadcast', icon: MessageSquare, go: () => navigate('broadcasts') },
    { type: 'Quick action', label: 'Add student', icon: UserPlus, go: () => navigate('students') },
  ];

  const handlePick = (r) => { r.go(); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-neutral-900/30" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
          <Search size={16} className="text-neutral-400" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) handlePick(results[0]); }}
            placeholder="Search students, subjects, tests..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-400" />
          <kbd className="text-[10px] text-neutral-400 px-1.5 py-0.5 bg-neutral-100 rounded">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-neutral-500">No matches for "{query}"</div>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => handlePick(r)} className="w-full px-4 py-2.5 hover:bg-neutral-50 flex items-center gap-3 text-left">
              {r.icon ? <r.icon size={14} className="text-neutral-500" /> : <div className="w-3.5" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{r.label}</p>
                {r.sub && <p className="text-xs text-neutral-500 truncate">{r.sub}</p>}
              </div>
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider">{r.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TODAY (home) — task-oriented, what needs attention
// ============================================================
const TodayScreen = ({ navigate }) => {
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const stats = useMemo(() => {
    const activeToday = mockStudents.filter(s => s.lastSeen.includes('hour') || s.lastSeen.includes('min')).length;
    const flaggedTests = mockTests.reduce((sum, t) => sum + t.flagged, 0);
    const lowPerformers = mockStudents.filter(s => s.avgScore < 70).length;
    const scheduledTests = mockTests.filter(t => t.status === 'scheduled').length;
    return { activeToday, flaggedTests, lowPerformers, scheduledTests };
  }, []);

  const todayActions = [
    stats.flaggedTests > 0 && { label: `Review ${stats.flaggedTests} flagged test attempts`, icon: Flag, color: 'red', action: () => navigate('tests') },
    stats.scheduledTests > 0 && { label: `${stats.scheduledTests} tests scheduled for tomorrow`, icon: Calendar, color: 'amber', action: () => navigate('tests') },
    stats.lowPerformers > 0 && { label: `${stats.lowPerformers} students scoring below 70%`, icon: AlertCircle, color: 'amber', action: () => navigate('students') },
  ].filter(Boolean);

  const recentActivity = [
    { who: 'Diya Patel', what: 'completed Weekly Test', when: '12 min ago', emoji: '✓' },
    { who: 'Aarav Sharma', what: 'watched Discriminant', when: '2 hours ago', emoji: '▶' },
    { who: 'Vihaan Gupta', what: 'didn\'t attempt Chapter Test', when: '3 hours ago', emoji: '!' },
    { who: 'Myra Joshi', what: 'completed Newton\'s Laws', when: '5 hours ago', emoji: '✓' },
  ];

  return (
    <div>
      <TopBar
        title="Today"
        subtitle={now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
        navigate={navigate}
      />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight mb-1">{greeting}, Priya</h2>
        <p className="text-sm text-neutral-500 mb-8">Here's what's happening across your classes.</p>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {[
            { label: 'Active now', value: stats.activeToday, icon: Activity, sub: 'students online' },
            { label: 'Total students', value: mockStudents.length, icon: Users, sub: 'across standards' },
            { label: 'Subjects', value: mockSubjectClasses.length, icon: BookOpen, sub: `in ${mockStandards.length} standards` },
            { label: 'Avg score', value: '83%', icon: TrendingUp, sub: '+3% this week', trend: 'up' },
          ].map((s, i) => (
            <div key={i} className="p-4 bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <s.icon size={14} className="text-neutral-400" />
                {s.trend && <ArrowUpRight size={12} className="text-green-600" />}
              </div>
              <p className="text-2xl font-semibold tracking-tight mb-0.5">{s.value}</p>
              <p className="text-xs text-neutral-500">{s.label}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Needs attention */}
        {todayActions.length > 0 && (
          <div className="mb-10">
            <SectionHeader title="Needs attention" count={todayActions.length} />
            <div className="space-y-1.5">
              {todayActions.map((a, i) => {
                const colorMap = { red: 'text-red-600', amber: 'text-amber-700', blue: 'text-blue-600' };
                return (
                  <button key={i} onClick={a.action}
                    className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all text-left group">
                    <a.icon size={16} className={colorMap[a.color]} />
                    <span className="flex-1 text-sm">{a.label}</span>
                    <ArrowRight size={14} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="mb-10">
          <SectionHeader title="Quick actions" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Upload video', icon: Upload, action: () => navigate('subjects') },
              { label: 'Create test', icon: FileQuestion, action: () => navigate('tests') },
              { label: 'Send broadcast', icon: MessageSquare, action: () => navigate('broadcasts') },
              { label: 'Add student', icon: UserPlus, action: () => navigate('students') },
            ].map((a, i) => (
              <button key={i} onClick={a.action}
                className="p-3 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all flex flex-col items-start gap-2">
                <a.icon size={16} className="text-neutral-500" />
                <span className="text-xs font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="mb-10">
          <SectionHeader title="Recent activity" action={<button className="text-xs text-neutral-500 hover:text-neutral-900">View all →</button>} />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {recentActivity.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < recentActivity.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <Avatar name={a.who} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate"><span className="font-medium">{a.who}</span> <span className="text-neutral-500">{a.what}</span></p>
                  <p className="text-xs text-neutral-400 mt-0.5">{a.when}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Standards overview */}
        <div>
          <SectionHeader title="Your standards" count={mockStandards.length} action={<button onClick={() => navigate('subjects')} className="text-xs text-neutral-500 hover:text-neutral-900">View all →</button>} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {mockStandards.map(s => {
              const studentCount = getStudentsInStandard(s.id).length;
              const subjectCount = getClassesInStandard(s.id).length;
              return (
                <button key={s.id} onClick={() => navigate('subjects', { standardId: s.id })}
                  className="p-4 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all text-left">
                  <div className="text-2xl mb-2">{s.emoji}</div>
                  <p className="text-sm font-medium mb-0.5">{s.name}</p>
                  <p className="text-xs text-neutral-500">{subjectCount} subjects · {studentCount} students</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SUBJECTS — grouped by standard, expand/collapse
// ============================================================
const SubjectsScreen = ({ navigate, initialStandardId }) => {
  const [expanded, setExpanded] = useState(() => {
    if (initialStandardId) return { [initialStandardId]: true };
    return mockStandards.reduce((acc, s) => ({ ...acc, [s.id]: true }), {});
  });
  const [search, setSearch] = useState('');
  const [newStdOpen, setNewStdOpen] = useState(false);
  const [newSubjectOpen, setNewSubjectOpen] = useState(null); // holds standardId

  const filteredStandards = mockStandards.map(std => {
    const classes = getClassesInStandard(std.id).filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
    return { ...std, classes };
  }).filter(std => !search || std.classes.length > 0);

  return (
    <div>
      <TopBar
        title="Subjects"
        subtitle={`${mockSubjectClasses.length} subjects across ${mockStandards.length} standards`}
        action={<Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewStdOpen(true)}>Standard</Btn>}
        navigate={navigate}
      />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Search */}
        <div className="mb-6 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects..."
            className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 outline-none text-sm placeholder:text-neutral-400" />
        </div>

        {/* Standards as collapsible groups */}
        <div className="space-y-2">
          {filteredStandards.map(std => {
            // When searching, force-expand groups that have matches
            const isOpen = search ? std.classes.length > 0 : expanded[std.id];
            const studentCount = getStudentsInStandard(std.id).length;
            return (
              <div key={std.id} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                <div className="flex items-center gap-3 px-2 hover:bg-neutral-50 transition-colors">
                  <button onClick={() => !search && setExpanded({ ...expanded, [std.id]: !isOpen })}
                    className="flex-1 flex items-center gap-3 px-2 py-3 text-left min-w-0">
                    <ChevronDown size={14} className={`text-neutral-400 transition-transform flex-shrink-0 ${isOpen ? '' : '-rotate-90'}`} />
                    <span className="text-xl flex-shrink-0">{std.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{std.name}</p>
                      <p className="text-xs text-neutral-500">{std.classes.length} subjects · {studentCount} students</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0 pr-1">
                    <button onClick={() => setNewSubjectOpen(std.id)} title="Add subject"
                      className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
                      <Plus size={16} />
                    </button>
                    <button onClick={() => navigate('standard-detail', { standardId: std.id })} title="Open standard"
                      className="px-2 py-1.5 rounded text-xs font-medium text-neutral-700 hover:bg-neutral-100 flex items-center gap-1">
                      <span className="hidden sm:inline">Open</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-neutral-100">
                    {std.classes.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-neutral-500">
                        No subjects yet.
                        <button onClick={() => setNewSubjectOpen(std.id)} className="ml-1 text-neutral-900 underline">Add one</button>
                      </div>
                    ) : (
                      std.classes.map((c, i) => {
                        const testCount = mockTests.filter(t => t.classId === c.id).length;
                        return (
                          <button key={c.id} onClick={() => navigate('subject-detail', { classId: c.id })}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left ${i < std.classes.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                            <span className="ml-6 text-base">{c.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-neutral-500">{c.videoCount} videos · {testCount} tests</p>
                            </div>
                            <ChevronRight size={14} className="text-neutral-400" />
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredStandards.length === 0 && (
          <div className="text-center py-12 text-sm text-neutral-500">No subjects match "{search}"</div>
        )}
      </div>

      <NewStandardModal open={newStdOpen} onClose={() => setNewStdOpen(false)} />
      <NewSubjectModal open={!!newSubjectOpen} onClose={() => setNewSubjectOpen(null)} standardId={newSubjectOpen} />
    </div>
  );
};

const NewStandardModal = ({ open, onClose }) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📚');
  const emojis = ['📚', '📐', '⚗️', '🔬', '📖', '🎓', '✏️', '🧪', '🌍', '🎨'];
  return (
    <Modal open={open} onClose={onClose} title="New standard">
      <p className="text-sm text-neutral-600 mb-5">Create a new standard. You can add subjects to it afterwards.</p>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-md flex items-center justify-center text-lg transition-all ${emoji === e ? 'bg-neutral-900 ring-2 ring-neutral-300' : 'bg-neutral-50 hover:bg-neutral-100'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Input label="Name" placeholder="10th Standard" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create</Btn>
        </div>
      </div>
    </Modal>
  );
};

const NewSubjectModal = ({ open, onClose, standardId }) => {
  const std = mockStandards.find(s => s.id === standardId);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📐');
  const emojis = ['📐', '⚗️', '🔬', '📖', '🌍', '🎨', '🎵', '💻', '🧬', '📊'];
  return (
    <Modal open={open} onClose={onClose} title={`New subject ${std ? `in ${std.name}` : ''}`}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-9 h-9 rounded-md flex items-center justify-center text-lg transition-all ${emoji === e ? 'bg-neutral-900 ring-2 ring-neutral-300' : 'bg-neutral-50 hover:bg-neutral-100'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Input label="Subject name" placeholder="Mathematics" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start date" type="date" />
          <Input label="End date" type="date" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onClose}>Create</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ============================================================
// STANDARD DETAIL — task: pick a subject or manage students
// ============================================================
const StandardDetailScreen = ({ standardId, navigate, goBack }) => {
  const [studentMenuId, setStudentMenuId] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [blockedIds, setBlockedIds] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);
  const [tab, setTab] = useState('students');

  const std = mockStandards.find(s => s.id === standardId) || mockStandards[0];
  const subjects = getClassesInStandard(std.id);
  const allStudents = getStudentsInStandard(std.id).filter(s => !removedIds.includes(s.id));
  const filteredStudents = allStudents.filter(s =>
    !studentSearch ||
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.username.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const toggleBlock = (id) => setBlockedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'subjects', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xl">{std.emoji}</span>
            <h1 className="text-base font-semibold truncate">{std.name}</h1>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Stats row */}
        <div className="flex items-center gap-6 mb-6 pb-6 border-b border-neutral-200">
          <div>
            <p className="text-2xl font-semibold tracking-tight">{allStudents.length}</p>
            <p className="text-xs text-neutral-500">students</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">{subjects.length}</p>
            <p className="text-xs text-neutral-500">subjects</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">{blockedIds.length}</p>
            <p className="text-xs text-neutral-500">blocked</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Btn variant="default" size="sm" icon={QrCode} onClick={() => setInviteOpen(true)}>Invite</Btn>
            <Btn variant="primary" size="sm" icon={UserPlus} onClick={() => setAddStudentOpen(true)}>Add student</Btn>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-5 -mx-1">
          {['students', 'subjects'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${tab === t ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}>
              {t === 'students' ? `Students (${allStudents.length})` : `Subjects (${subjects.length})`}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          <>
            {/* Search row */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search students..."
                  className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 outline-none text-sm" />
                {studentSearch && <button onClick={() => setStudentSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900"><X size={14} /></button>}
              </div>
              <Btn variant="default" size="sm" icon={Download}>Export</Btn>
            </div>

            {/* Students list — table-like rows */}
            {filteredStudents.length === 0 && allStudents.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
                <Users size={32} className="mx-auto mb-3 text-neutral-300" />
                <h3 className="font-medium mb-1">No students yet</h3>
                <p className="text-sm text-neutral-500 mb-5">Add students or share the invite link.</p>
                <div className="flex gap-2 justify-center">
                  <Btn variant="default" icon={QrCode} onClick={() => setInviteOpen(true)}>Share link</Btn>
                  <Btn variant="primary" icon={UserPlus} onClick={() => setAddStudentOpen(true)}>Add student</Btn>
                </div>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-sm text-neutral-500">No students match your search.</div>
            ) : (
              <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                {filteredStudents.map((s, i) => {
                  const isBlocked = blockedIds.includes(s.id);
                  return (
                    <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < filteredStudents.length - 1 ? 'border-b border-neutral-100' : ''} ${isBlocked ? 'opacity-60' : ''} hover:bg-neutral-50 transition-colors group`}>
                      <Avatar name={s.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigate('student-detail', { studentId: s.id })} className="text-sm font-medium truncate hover:underline text-left">{s.name}</button>
                          {isBlocked && <Tag color="amber">Blocked</Tag>}
                        </div>
                        <p className="text-xs text-neutral-500 truncate">@{s.username} · {s.lastSeen}</p>
                      </div>
                      <div className="hidden md:flex items-center gap-6 text-xs">
                        <div>
                          <p className="text-neutral-400 text-[10px] uppercase tracking-wider">Score</p>
                          <p className="font-medium">{s.avgScore}%</p>
                        </div>
                        <div>
                          <p className="text-neutral-400 text-[10px] uppercase tracking-wider">Attendance</p>
                          <p className="font-medium">{s.attendance}%</p>
                        </div>
                        <div>
                          <p className="text-neutral-400 text-[10px] uppercase tracking-wider">Points</p>
                          <p className="font-medium">{s.points}</p>
                        </div>
                      </div>
                      <div className="relative">
                        <button onClick={() => setStudentMenuId(studentMenuId === s.id ? null : s.id)} className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded hover:bg-neutral-100">
                          <MoreVertical size={14} />
                        </button>
                        {studentMenuId === s.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setStudentMenuId(null)} />
                            <div className="absolute right-0 top-9 w-48 py-1 z-50 rounded-md bg-white border border-neutral-200 shadow-lg">
                              <button onClick={() => { navigate('student-detail', { studentId: s.id }); setStudentMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                                <Users size={13} /> View profile
                              </button>
                              <button onClick={() => setStudentMenuId(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                                <Edit2 size={13} /> Edit details
                              </button>
                              <button onClick={() => { toggleBlock(s.id); setStudentMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                                <Lock size={13} /> {isBlocked ? 'Unblock' : 'Block'}
                              </button>
                              <Divider className="my-1" />
                              <button onClick={() => { setConfirmRemove(s); setStudentMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600">
                                <Trash2 size={13} /> Remove
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'subjects' && (
          <div>
            <p className="text-xs text-neutral-500 mb-3">Each subject has its own videos and tests. All {allStudents.length} students in {std.name} are enrolled in every subject.</p>
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              {subjects.map((c, i) => {
                const tests = mockTests.filter(t => t.classId === c.id).length;
                return (
                  <button key={c.id} onClick={() => navigate('subject-detail', { classId: c.id })}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < subjects.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                    <span className="text-xl">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-neutral-500">{c.videoCount} videos · {tests} tests · Ends {fmtDate(new Date(c.endDate))}</p>
                    </div>
                    <ChevronRight size={14} className="text-neutral-400" />
                  </button>
                );
              })}
              <button onClick={() => setNewSubjectOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left border-t border-neutral-100 text-neutral-500">
                <Plus size={16} />
                <span className="text-sm font-medium">Add subject to {std.name}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} standard={std} />
      <AddStudentModal open={addStudentOpen} onClose={() => setAddStudentOpen(false)} standard={std} />
      <NewSubjectModal open={newSubjectOpen} onClose={() => setNewSubjectOpen(false)} standardId={std.id} />
      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove student?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">
          Remove <strong>{confirmRemove?.name}</strong> from <strong>{std.name}</strong>?
        </p>
        <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects. Test results and video progress are kept.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Btn>
          <Btn variant="dangerSolid" onClick={() => { setRemovedIds(p => [...p, confirmRemove.id]); setConfirmRemove(null); }}>Remove</Btn>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// SUBJECT DETAIL — tabs: videos, tests, students
// ============================================================
const SubjectDetailScreen = ({ classId, navigate, goBack }) => {
  const c = mockSubjectClasses.find(x => x.id === classId) || mockSubjectClasses[0];
  const std = mockStandards.find(s => s.id === c.standardId);
  const [tab, setTab] = useState('videos');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [resultsTest, setResultsTest] = useState(null);

  const videos = mockVideos.filter(v => v.classId === c.id);
  const tests = mockTests.filter(t => t.classId === c.id);
  const students = getStudentsInStandard(c.standardId);

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'standard-detail', params: { standardId: c.standardId } })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xl">{c.emoji}</span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">{c.name}</h1>
              <p className="text-xs text-neutral-500">{std?.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-5">
          {[
            { id: 'videos', label: 'Videos', count: videos.length },
            { id: 'tests', label: 'Tests', count: tests.length },
            { id: 'students', label: 'Students', count: students.length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.id ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}>
              {t.label} <span className="text-neutral-400">{t.count}</span>
            </button>
          ))}
          <div className="ml-auto">
            {tab === 'videos' && <Btn variant="primary" size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>Upload</Btn>}
            {tab === 'tests' && <Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewTestOpen(true)}>New test</Btn>}
          </div>
        </div>

        {tab === 'videos' && (
          <>
            {videos.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
                <Video size={32} className="mx-auto mb-3 text-neutral-300" />
                <h3 className="font-medium mb-1">No videos yet</h3>
                <p className="text-sm text-neutral-500 mb-5">Upload your first video to {c.name}.</p>
                <Btn variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>Upload video</Btn>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                {videos.map((v, i) => (
                  <div key={v.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors ${i < videos.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                    <div className="w-12 h-12 rounded-md bg-neutral-100 flex items-center justify-center flex-shrink-0">
                      <Play size={16} className="text-neutral-600" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <p className="text-xs text-neutral-500">{v.duration} · {v.size} · {v.uploaded}</p>
                    </div>
                    <div className="hidden sm:block text-right flex-shrink-0">
                      <p className="text-xs text-neutral-400">Watched</p>
                      <p className="text-sm font-medium">{v.watched}/{v.total}</p>
                    </div>
                    <button className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded hover:bg-neutral-100"><MoreVertical size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'tests' && (
          <>
            {tests.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
                <FileQuestion size={32} className="mx-auto mb-3 text-neutral-300" />
                <h3 className="font-medium mb-1">No tests yet</h3>
                <p className="text-sm text-neutral-500 mb-5">Create your first test for {c.name}.</p>
                <Btn variant="primary" icon={Plus} onClick={() => setNewTestOpen(true)}>Create test</Btn>
              </div>
            ) : (
              <div className="space-y-2">
                {tests.map(t => (
                  <button key={t.id} onClick={() => setResultsTest(t)}
                    className="w-full bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-300 transition-colors text-left">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-medium text-sm">{t.title}</h4>
                          {t.negativeMarking && <Tag color="red">−{t.penalty}</Tag>}
                          {t.flagged > 0 && <Tag color="amber"><Flag size={10} className="mr-1 inline" />{t.flagged}</Tag>}
                        </div>
                        <p className="text-xs text-neutral-500">{t.questions} questions · {t.duration} mins · {t.totalMarks} marks</p>
                      </div>
                      {t.status === 'completed' ? <Tag color="green">Completed</Tag> : <Tag color="amber">Scheduled</Tag>}
                    </div>
                    {t.status === 'completed' && (
                      <div className="flex items-center gap-6 text-xs pt-2 border-t border-neutral-100">
                        <div><span className="text-neutral-500">Attempted</span> <span className="font-medium ml-1">{t.attempted}/{t.totalStudents}</span></div>
                        <div><span className="text-neutral-500">Avg</span> <span className="font-medium ml-1">{t.avg}%</span></div>
                      </div>
                    )}
                    {t.status === 'scheduled' && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 pt-2 border-t border-neutral-100">
                        <Clock size={12} /> {fmtSchedule(new Date(t.scheduledFor))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'students' && (
          <>
            <div className="p-3 mb-4 rounded-md bg-blue-50 border border-blue-100 flex items-start gap-2 text-sm">
              <Shield size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-blue-900">
                <p className="font-medium">Enrollment is at standard level</p>
                <p className="text-xs text-blue-700">Everyone in {std?.name} is in this subject. Manage students from the standard.</p>
              </div>
              <Btn variant="default" size="sm" onClick={() => navigate('standard-detail', { standardId: c.standardId })}>Open standard</Btn>
            </div>
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              {students.map((s, i) => (
                <button key={s.id} onClick={() => navigate('student-detail', { studentId: s.id })}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < students.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500">@{s.username}</p>
                  </div>
                  <span className="text-xs text-neutral-500 flex-shrink-0">{s.avgScore}%</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <UploadVideoModal open={uploadOpen} onClose={() => setUploadOpen(false)} subjectName={c.name} />
      <NewTestModal open={newTestOpen} onClose={() => setNewTestOpen(false)} defaultClassId={c.id} />
      <TestResultsSheet open={!!resultsTest} onClose={() => setResultsTest(null)} test={resultsTest} />
    </div>
  );
};

// ============================================================
// STUDENTS — flat list across all standards, searchable
// ============================================================
const StudentsScreen = ({ navigate }) => {
  const [search, setSearch] = useState('');
  const [stdFilter, setStdFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const filtered = useMemo(() => {
    let list = [...mockStudents];
    if (stdFilter !== 'all') list = list.filter(s => s.standardId === Number(stdFilter));
    if (search) list = list.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.username.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'score') return b.avgScore - a.avgScore;
      if (sortBy === 'attendance') return b.attendance - a.attendance;
      if (sortBy === 'points') return b.points - a.points;
      return 0;
    });
    return list;
  }, [search, stdFilter, sortBy]);

  return (
    <div>
      <TopBar
        title="Students"
        subtitle={`${filtered.length} of ${mockStudents.length}`}
        navigate={navigate}
      />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, username, email..."
              className="w-full pl-9 pr-3 py-2 rounded-md bg-white border border-neutral-200 focus:border-neutral-400 outline-none text-sm" />
          </div>
          <select value={stdFilter} onChange={e => setStdFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-white border border-neutral-200 outline-none text-sm hover:border-neutral-300">
            <option value="all">All standards</option>
            {mockStandards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-md bg-white border border-neutral-200 outline-none text-sm hover:border-neutral-300">
            <option value="name">Name</option>
            <option value="score">Avg score</option>
            <option value="attendance">Attendance</option>
            <option value="points">Points</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-500">No students found.</div>
        ) : (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {filtered.map((s, i) => {
              const std = mockStandards.find(x => x.id === s.standardId);
              return (
                <button key={s.id} onClick={() => navigate('student-detail', { studentId: s.id })}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < filtered.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <Tag color="gray">{std?.short}</Tag>
                    </div>
                    <p className="text-xs text-neutral-500 truncate">@{s.username} · {s.lastSeen}</p>
                  </div>
                  <div className="hidden md:flex items-center gap-6 text-xs">
                    <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Score</p><p className="font-medium">{s.avgScore}%</p></div>
                    <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Attend</p><p className="font-medium">{s.attendance}%</p></div>
                    <div><p className="text-neutral-400 text-[10px] uppercase tracking-wider">Points</p><p className="font-medium">{s.points}</p></div>
                  </div>
                  <ChevronRight size={14} className="text-neutral-400" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// STUDENT DETAIL
// ============================================================
const StudentDetailScreen = ({ studentId, navigate, goBack }) => {
  const baseStudent = mockStudents.find(x => x.id === studentId) || mockStudents[0];
  const [s, setS] = useState(baseStudent);
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editForm, setEditForm] = useState({ name: s.name, email: s.email, phone: s.phone });
  const [removed, setRemoved] = useState(false);
  const std = mockStandards.find(x => x.id === s.standardId);
  const subjects = getClassesInStandard(s.standardId);

  const handleSave = () => {
    setS({ ...s, ...editForm });
    setEditOpen(false);
  };

  if (removed) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <button onClick={() => goBack({ screen: 'students', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
              <ArrowLeft size={16} />
            </button>
            <h1 className="text-base font-semibold truncate">Student removed</h1>
          </div>
        </div>
        <div className="px-5 md:px-8 py-16 max-w-5xl mx-auto text-center">
          <CheckCircle2 size={32} className="mx-auto mb-3 text-green-500" />
          <h3 className="font-medium mb-1">{s.name} has been removed</h3>
          <p className="text-sm text-neutral-500 mb-5">They no longer have access to {std?.name}.</p>
          <Btn variant="primary" onClick={() => goBack({ screen: 'students', params: {} })}>Back to students</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'students', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold truncate">Student profile</h1>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Profile card */}
        <div className="flex items-start gap-4 mb-8 pb-8 border-b border-neutral-200">
          <Avatar name={s.name} size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold mb-1">{s.name}</h2>
            <p className="text-sm text-neutral-500 mb-3">@{s.username}</p>
            <div className="flex items-center gap-3 text-xs text-neutral-600 flex-wrap">
              <span className="flex items-center gap-1"><Mail size={12} /> {s.email}</span>
              <span className="flex items-center gap-1"><Phone size={12} /> {s.phone}</span>
              <Tag color="gray">{std?.emoji} {std?.name}</Tag>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 relative">
            <Btn variant="default" size="sm" icon={Edit2} onClick={() => setEditOpen(true)}>Edit</Btn>
            <Btn variant="default" size="sm" icon={MoreVertical} onClick={() => setMenuOpen(!menuOpen)} />
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 w-48 py-1 z-50 rounded-md bg-white border border-neutral-200 shadow-lg">
                  <button onClick={() => { navigate('broadcasts'); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                    <MessageSquare size={13} /> Message standard
                  </button>
                  <button onClick={() => { setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                    <Download size={13} /> Export profile
                  </button>
                  <button onClick={() => { setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left">
                    <Lock size={13} /> Reset password
                  </button>
                  <Divider className="my-1" />
                  <button onClick={() => { setConfirmRemove(true); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600">
                    <Trash2 size={13} /> Remove from standard
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Avg score', value: `${s.avgScore}%`, icon: Target },
            { label: 'Attendance', value: `${s.attendance}%`, icon: CheckCircle2 },
            { label: 'Points', value: s.points, icon: Trophy },
            { label: 'Subjects', value: subjects.length, icon: BookOpen },
          ].map((stat, i) => (
            <div key={i} className="p-4 bg-white rounded-lg border border-neutral-200">
              <stat.icon size={14} className="text-neutral-400 mb-2" />
              <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
              <p className="text-xs text-neutral-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Enrolled subjects */}
        <div className="mb-8">
          <SectionHeader title="Enrolled in" count={subjects.length} />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {subjects.map((c, i) => (
              <button key={c.id} onClick={() => navigate('subject-detail', { classId: c.id })}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left ${i < subjects.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <span className="text-lg">{c.emoji}</span>
                <p className="flex-1 text-sm font-medium truncate">{c.name}</p>
                <ChevronRight size={14} className="text-neutral-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <SectionHeader title="Recent activity" />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {[
              { what: 'Completed Weekly Test', detail: '85%', when: '2h ago', icon: FileQuestion },
              { what: 'Watched Discriminant', when: '5h ago', icon: Play },
              { what: 'Watched Word Problems', when: '1d ago', icon: Play },
            ].map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < 2 ? 'border-b border-neutral-100' : ''}`}>
                <a.icon size={14} className="text-neutral-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{a.what} {a.detail && <span className="text-neutral-500">· {a.detail}</span>}</p>
                </div>
                <p className="text-xs text-neutral-400">{a.when}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit student">
        <div className="space-y-4">
          <Input label="Full name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
          <Input label="Email" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label="Phone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSave}>Save</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove student?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">Remove <strong>{s.name}</strong> from <strong>{std?.name}</strong>?</p>
        <p className="text-sm text-neutral-600 mb-5">They'll lose access to all subjects. Test results and video progress are kept.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Btn>
          <Btn variant="dangerSolid" onClick={() => { setRemoved(true); setConfirmRemove(false); }}>Remove</Btn>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// BROADCASTS — WhatsApp-like, per standard
// ============================================================
const BroadcastsScreen = ({ broadcastsByStandard, setBroadcastsByStandard, navigate }) => {
  const [activeStdId, setActiveStdId] = useState(mockStandards[0]?.id);
  const [paneView, setPaneView] = useState('list'); // 'list' or 'thread' (mobile only)
  const std = mockStandards.find(s => s.id === activeStdId);

  // Guard: no standards
  if (!std) {
    return (
      <div>
        <TopBar title="Inbox" navigate={navigate} />
        <div className="px-5 md:px-8 py-16 max-w-5xl mx-auto text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-neutral-300" />
          <h3 className="font-medium mb-1">No standards yet</h3>
          <p className="text-sm text-neutral-500">Create a standard first to send broadcasts.</p>
        </div>
      </div>
    );
  }

  const showList = paneView === 'list';
  const showThread = paneView === 'thread';

  return (
    <div>
      <TopBar
        title={showThread ? std.name : 'Inbox'}
        subtitle={showThread ? `${getStudentsInStandard(std.id).length} students` : 'Standard broadcasts'}
        showSearch={!showThread}
        navigate={navigate}
      />
      <div className="max-w-5xl mx-auto">
        <div className="flex h-[calc(100vh-180px)] md:h-[calc(100vh-130px)]">
          {/* Standards list */}
          <div className={`${showList ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-80 md:border-r border-neutral-200 overflow-y-auto flex-shrink-0`}>
            {mockStandards.map(s => {
              const broadcasts = (broadcastsByStandard[s.id] || []).filter(b => !b.deleted);
              const lastMsg = broadcasts[broadcasts.length - 1];
              const isActive = s.id === activeStdId;
              return (
                <button key={s.id} onClick={() => { setActiveStdId(s.id); setPaneView('thread'); }}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition-colors text-left ${isActive ? 'bg-neutral-50' : ''}`}>
                  <div className="w-11 h-11 rounded-lg bg-neutral-100 flex items-center justify-center text-xl flex-shrink-0">{s.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{s.name}</p>
                      {lastMsg && <span className="text-[10px] text-neutral-400 flex-shrink-0">{lastMsg.time}</span>}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">
                      {lastMsg ? lastMsg.text : 'No messages yet'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Thread */}
          <div className={`${showThread ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
            <BroadcastThread
              key={activeStdId}
              std={std}
              broadcasts={broadcastsByStandard[std.id] || []}
              onUpdate={(updater) => setBroadcastsByStandard({ ...broadcastsByStandard, [std.id]: updater(broadcastsByStandard[std.id] || []) })}
              onBack={() => setPaneView('list')}
              showBackBtn={showThread}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const BroadcastThread = ({ std, broadcasts, onUpdate, onBack, showBackBtn }) => {
  const [msg, setMsg] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const studentCount = getStudentsInStandard(std.id).length;

  const handleSend = () => {
    if (!msg.trim() && attachments.length === 0) return;
    const time = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (editingId) {
      onUpdate(list => list.map(b => {
        if (b.id !== editingId) return b;
        const textChanged = b.text !== msg;
        const attachmentsChanged = attachments.length > 0 && JSON.stringify(b.attachments) !== JSON.stringify(attachments);
        return {
          ...b,
          text: msg,
          attachments: attachments.length ? attachments : b.attachments,
          edited: b.edited || textChanged || attachmentsChanged,
        };
      }));
      setEditingId(null);
    } else {
      onUpdate(list => [...list, { id: Date.now(), text: msg, sender: 'Priya Mathur', senderRole: 'Class Teacher', time, pinned: false, attachments, edited: false, deleted: false, readBy: 0 }]);
    }
    setMsg(''); setAttachments([]);
  };

  return (
    <>
      {showBackBtn && (
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-white">
          <button onClick={onBack} className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded hover:bg-neutral-100">
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{std.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{std.name}</p>
            <p className="text-[11px] text-neutral-500">{studentCount} students</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-neutral-50">
        {broadcasts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 px-6">
            <MessageSquare size={28} className="mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No messages yet</p>
            <p className="text-xs">Send your first broadcast to {std.name}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {broadcasts.map(b => b.deleted ? (
              <div key={b.id} className="px-3 py-2 rounded-lg bg-neutral-200/50 text-xs italic text-neutral-500 flex items-center gap-1.5 max-w-md">
                <X size={11} /> This message was deleted
              </div>
            ) : (
              <div key={b.id} className="max-w-md group relative">
                <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-sm">
                  {b.pinned && <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1.5"><Pin size={9} /> Pinned</div>}
                  <p className="text-xs font-semibold text-neutral-900 mb-0.5">{b.sender} <span className="text-neutral-500 font-normal">· {b.senderRole}</span></p>
                  <p className="text-sm text-neutral-800 leading-relaxed pr-6">{b.text}</p>
                  {b.attachments?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {b.attachments.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-neutral-50 rounded text-xs border border-neutral-200">
                          <FileText size={12} className="text-neutral-500" />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-neutral-400">{a.size}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-neutral-400">
                    <span>{b.time}</span>
                    {b.edited && <span>· edited</span>}
                    <span>·</span>
                    <span>Read {b.readBy || 0}/{studentCount}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === b.id ? null : b.id); }}
                    className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-neutral-100">
                    <MoreVertical size={12} />
                  </button>
                  {menuId === b.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
                      <div className="absolute right-2 top-9 w-44 py-1 z-50 rounded-md bg-white border border-neutral-200 shadow-lg">
                        <button onClick={() => { setEditingId(b.id); setMsg(b.text); setAttachments(b.attachments || []); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left"><Edit2 size={13} /> Edit</button>
                        <button onClick={() => { onUpdate(list => list.map(x => x.id === b.id ? { ...x, pinned: !x.pinned } : x)); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 text-left"><Pin size={13} /> {b.pinned ? 'Unpin' : 'Pin'}</button>
                        <button onClick={() => { onUpdate(list => list.map(x => x.id === b.id ? { ...x, deleted: true, text: '', attachments: [], pinned: false } : x)); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600"><Trash2 size={13} /> Delete for everyone</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editing indicator */}
      {editingId && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Edit2 size={11} /> Editing message
          <button onClick={() => { setEditingId(null); setMsg(''); setAttachments([]); }} className="ml-auto hover:underline">Cancel</button>
        </div>
      )}

      {/* Pending attachments */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 space-y-1">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded text-xs border border-blue-200">
              <FileText size={11} className="text-blue-600" />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-neutral-400">{a.size}</span>
              <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="bg-white border-t border-neutral-200 px-3 py-2 flex items-end gap-2">
        <button onClick={() => setAttachOpen(true)} className="p-2 text-neutral-500 hover:text-neutral-900 rounded hover:bg-neutral-100"><Paperclip size={16} /></button>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Message ${std.name}...`}
          className="flex-1 px-3 py-2 rounded-md bg-neutral-100 outline-none text-sm placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-2 focus:ring-neutral-200" />
        <button onClick={handleSend} disabled={!msg.trim() && attachments.length === 0}
          className={`p-2 rounded-md transition-colors ${msg.trim() || attachments.length > 0 ? 'bg-neutral-900 text-white hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'}`}>
          <Send size={16} />
        </button>
      </div>

      <AttachPickerModal open={attachOpen} onClose={() => setAttachOpen(false)} onPick={(a) => setAttachments([...attachments, a])} />
    </>
  );
};

// ============================================================
// MORE — settings, tests, reports, reminders
// ============================================================
const MoreScreen = ({ navigate, onLogout }) => {
  const [profileEdit, setProfileEdit] = useState(false);
  const [profile, setProfile] = useState({ name: 'Priya Mathur', email: 'priya@academy.com', phone: '+91 98765 11111' });
  const [editForm, setEditForm] = useState(profile);

  const items = [
    { id: 'tests', label: 'All tests', icon: FileQuestion, sub: 'Manage tests across subjects' },
    { id: 'reports', label: 'Reports', icon: BarChart3, sub: 'Performance insights' },
    { id: 'reminders', label: 'Reminders', icon: Bell, sub: 'Your teaching reminders' },
    { id: 'settings', label: 'Settings', icon: Settings, sub: 'Account & preferences' },
  ];

  const handleSaveProfile = () => { setProfile(editForm); setProfileEdit(false); };
  const openEdit = () => { setEditForm(profile); setProfileEdit(true); };

  return (
    <div>
      <TopBar title="More" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Profile card */}
        <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-neutral-200 mb-6">
          <Avatar name={profile.name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{profile.name}</p>
            <p className="text-sm text-neutral-500 truncate">{profile.email}</p>
          </div>
          <Btn variant="default" size="sm" icon={Edit2} onClick={openEdit}>Edit</Btn>
        </div>

        {/* Menu items */}
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-6">
          {items.map((item, i) => (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < items.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <item.icon size={16} className="text-neutral-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-neutral-500">{item.sub}</p>
              </div>
              <ChevronRight size={14} className="text-neutral-400" />
            </button>
          ))}
        </div>

        <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-neutral-200 hover:bg-red-50 hover:border-red-100 transition-colors text-left text-red-600">
          <LogOut size={16} />
          <span className="text-sm font-medium">Sign out</span>
        </button>

        <p className="text-center text-xs text-neutral-400 mt-6">Udaya v1.0 Beta</p>
      </div>

      <Modal open={profileEdit} onClose={() => setProfileEdit(false)} title="Edit profile">
        <div className="space-y-4">
          <Input label="Full name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
          <Input label="Email" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
          <Input label="Phone" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setProfileEdit(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSaveProfile}>Save</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// TESTS / REPORTS / REMINDERS / SETTINGS
// ============================================================
const TestsScreen = ({ navigate, goBack }) => {
  const [filter, setFilter] = useState('all');
  const [resultsTest, setResultsTest] = useState(null);
  const [newTestOpen, setNewTestOpen] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return mockTests;
    return mockTests.filter(t => t.status === filter);
  }, [filter]);

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'more', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1">All tests</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewTestOpen(true)}>New test</Btn>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex gap-1 mb-5">
          {[
            { id: 'all', label: 'All', count: mockTests.length },
            { id: 'completed', label: 'Completed', count: mockTests.filter(t => t.status === 'completed').length },
            { id: 'scheduled', label: 'Scheduled', count: mockTests.filter(t => t.status === 'scheduled').length },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${filter === f.id ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}>
              {f.label} <span className="text-neutral-400">{f.count}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
            <FileQuestion size={32} className="mx-auto mb-3 text-neutral-300" />
            <p className="text-sm text-neutral-500">No {filter !== 'all' ? filter : ''} tests.</p>
          </div>
        ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const c = mockSubjectClasses.find(x => x.id === t.classId);
            const std = mockStandards.find(x => x.id === c?.standardId);
            return (
              <button key={t.id} onClick={() => setResultsTest(t)}
                className="w-full bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-300 transition-colors text-left">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-medium text-sm">{t.title}</h4>
                      {t.negativeMarking && <Tag color="red">−{t.penalty}</Tag>}
                      {t.flagged > 0 && <Tag color="amber"><Flag size={10} className="mr-1 inline" />{t.flagged}</Tag>}
                    </div>
                    <p className="text-xs text-neutral-500">
                      <span>{std?.emoji} {std?.short} · {c?.name}</span> · {t.questions} questions · {t.duration} mins
                    </p>
                  </div>
                  {t.status === 'completed' ? <Tag color="green">Completed</Tag> : <Tag color="amber">Scheduled</Tag>}
                </div>
                {t.status === 'completed' && (
                  <div className="flex items-center gap-6 text-xs pt-2 border-t border-neutral-100">
                    <div><span className="text-neutral-500">Attempted</span> <span className="font-medium ml-1">{t.attempted}/{t.totalStudents}</span></div>
                    <div><span className="text-neutral-500">Avg</span> <span className="font-medium ml-1">{t.avg}%</span></div>
                  </div>
                )}
                {t.status === 'scheduled' && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 pt-2 border-t border-neutral-100">
                    <Clock size={12} /> {fmtSchedule(new Date(t.scheduledFor))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        )}
      </div>
      <TestResultsSheet open={!!resultsTest} onClose={() => setResultsTest(null)} test={resultsTest} />
      <NewTestModal open={newTestOpen} onClose={() => setNewTestOpen(false)} />
    </div>
  );
};

const ReportsScreen = ({ navigate, goBack }) => {
  const top = useMemo(() => [...mockStudents].sort((a, b) => b.avgScore - a.avgScore).slice(0, 5), []);

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'more', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1">Reports</h1>
          <Btn variant="default" size="sm" icon={Download}>Export</Btn>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-8">
        <div>
          <SectionHeader title="Average by standard" />
          <div className="bg-white rounded-lg border border-neutral-200 p-5 space-y-4">
            {mockStandards.map(s => {
              const pct = 75 + (s.id * 4);
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1.5 text-sm">
                    <span className="flex items-center gap-2"><span>{s.emoji}</span><span className="font-medium">{s.name}</span></span>
                    <span className="text-neutral-500 tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-900 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <SectionHeader title="Top performers" />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {top.map((s, i) => {
              const std = mockStandards.find(x => x.id === s.standardId);
              return (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < top.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                  <span className="text-xs font-semibold text-neutral-500 w-4 tabular-nums">{i + 1}</span>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500">{std?.name}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{s.avgScore}%</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const RemindersScreen = ({ navigate, goBack }) => {
  const [reminders, setReminders] = useState([
    { id: 1, title: 'Set up Monthly Assessment', time: 'Tomorrow, 9:00 AM', context: '10th · Maths', done: false },
    { id: 2, title: 'Parent-teacher meeting prep', time: 'Monday, 3:00 PM', context: '12th · Physics', done: false },
    { id: 3, title: 'Submit grade reports', time: 'Wednesday', context: 'All standards', done: false },
    { id: 4, title: 'Review chapter 5 questions', time: 'Friday', context: '11th · Chemistry', done: true },
  ]);
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', date: '', time: '', context: '' });
  const toggle = (id) => setReminders(p => p.map(r => r.id === id ? { ...r, done: !r.done } : r));

  const handleCreate = () => {
    if (!newForm.title.trim()) return;
    const dateStr = newForm.date ? new Date(newForm.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const timeStr = newForm.time || '';
    const when = [dateStr, timeStr].filter(Boolean).join(', ') || 'No date set';
    setReminders(p => [...p, { id: Date.now(), title: newForm.title.trim(), time: when, context: newForm.context.trim() || '—', done: false }]);
    setNewForm({ title: '', date: '', time: '', context: '' });
    setNewOpen(false);
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'more', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1">Reminders</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewOpen(true)}>New</Btn>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {reminders.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
            <Bell size={32} className="mx-auto mb-3 text-neutral-300" />
            <h3 className="font-medium mb-1">No reminders</h3>
            <p className="text-sm text-neutral-500 mb-5">Set yourself a reminder for upcoming tasks.</p>
            <Btn variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>New reminder</Btn>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {reminders.map((r, i) => (
              <div key={r.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 ${r.done ? 'opacity-50' : ''} ${i < reminders.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <button onClick={() => toggle(r.id)} className="flex-shrink-0 text-neutral-400 hover:text-neutral-900">
                  {r.done ? <CheckCircle2 size={16} fill="currentColor" className="text-neutral-900" /> : <Circle size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${r.done ? 'line-through' : ''}`}>{r.title}</p>
                  <p className="text-xs text-neutral-500">{r.time} · {r.context}</p>
                </div>
                <button onClick={() => setReminders(p => p.filter(x => x.id !== r.id))} className="p-1.5 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New reminder">
        <div className="space-y-4">
          <Input label="What's the reminder?" placeholder="Set up Monthly Assessment" autoFocus value={newForm.title} onChange={e => setNewForm({ ...newForm, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={newForm.date} onChange={e => setNewForm({ ...newForm, date: e.target.value })} />
            <Input label="Time" type="time" value={newForm.time} onChange={e => setNewForm({ ...newForm, time: e.target.value })} />
          </div>
          <Input label="Context (optional)" placeholder="10th · Maths" value={newForm.context} onChange={e => setNewForm({ ...newForm, context: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleCreate} disabled={!newForm.title.trim()}>Create</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const SettingsScreen = ({ navigate, goBack }) => {
  const [notifPrefs, setNotifPrefs] = useState({ email: true, tests: true, broadcasts: false });
  const togglePref = (k) => setNotifPrefs(p => ({ ...p, [k]: !p[k] }));

  const notifItems = [
    { key: 'email', label: 'Email notifications', desc: 'Daily summary' },
    { key: 'tests', label: 'Test submissions', desc: 'When students complete tests' },
    { key: 'broadcasts', label: 'Broadcast read receipts', desc: 'When students read messages' },
  ];

  return (
    <div>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => goBack({ screen: 'more', params: {} })} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <div>
          <SectionHeader title="Account" />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {[
              { label: 'Profile', sub: 'Name, email, photo' },
              { label: 'Password', sub: 'Change password' },
              { label: 'Connected devices', sub: '2 active sessions' },
            ].map((item, i, arr) => (
              <button key={i} className={`w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 ${i < arr.length - 1 ? 'border-b border-neutral-100' : ''} text-left`}>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-neutral-500">{item.sub}</p>
                </div>
                <ChevronRight size={14} className="text-neutral-400" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader title="Notifications" />
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {notifItems.map((item, i) => (
              <div key={item.key} className={`flex items-center justify-between px-4 py-3 ${i < notifItems.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-neutral-500">{item.desc}</p>
                </div>
                <Toggle checked={notifPrefs[item.key]} onChange={() => togglePref(item.key)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MODALS
// ============================================================
const InviteModal = ({ open, onClose, standard }) => {
  const [copied, setCopied] = useState(false);
  const link = `udaya.app/join/${standard?.short || 'std'}-abc123`;
  return (
    <Modal open={open} onClose={onClose} title="Invite students">
      <p className="text-sm text-neutral-600 mb-2">
        Share this link or QR code. Students joining via this link enter <strong>{standard?.name}</strong> and are auto-enrolled in all its subjects.
      </p>
      <p className="text-xs text-neutral-500 mb-5">You approve each request manually.</p>

      <div className="flex justify-center mb-5">
        <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200">
          <div className="w-40 h-40 bg-white rounded relative overflow-hidden flex items-center justify-center">
            <div className="grid grid-cols-12 gap-0.5 p-2">
              {Array.from({ length: 144 }).map((_, i) => (
                <div key={i} className="aspect-square" style={{ background: (Math.sin(i * 7.3) + Math.cos(i * 2.1)) > 0 ? '#0F0F0E' : 'transparent' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <div className="flex-1 px-3 py-2 text-xs font-mono text-neutral-700 truncate rounded-md bg-neutral-50 border border-neutral-200">{link}</div>
        <Btn variant="primary" size="sm" icon={copied ? Check : QrCode} onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Copied' : 'Copy'}
        </Btn>
      </div>

      <div className="space-y-2 text-xs text-neutral-600">
        <div className="flex items-center gap-2"><Shield size={12} /> Link expires in 7 days</div>
        <div className="flex items-center gap-2"><Users size={12} /> Up to 50 uses</div>
        <div className="flex items-center gap-2"><Check size={12} /> Manual approval required</div>
      </div>
    </Modal>
  );
};

const AddStudentModal = ({ open, onClose, standard }) => {
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '' });
  return (
    <Modal open={open} onClose={onClose} title="Add student">
      <p className="text-sm text-neutral-600 mb-5">
        Student joins <strong>{standard?.name}</strong> and is automatically enrolled in all its subjects.
      </p>
      <div className="space-y-4">
        <Input label="Full name" placeholder="Aarav Sharma" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
        <Input label="Username" placeholder="aarav.s" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        <Input label="Email (optional)" type="email" placeholder="aarav@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="Phone (optional)" placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <div className="p-3 rounded-md bg-blue-50 border border-blue-100 text-xs text-blue-900 flex items-center gap-2">
          <Shield size={12} className="text-blue-600 flex-shrink-0" /> A temporary password will be generated. Student will be asked to change it on first login.
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={UserPlus} onClick={onClose}>Create student</Btn>
        </div>
      </div>
    </Modal>
  );
};

const UploadVideoModal = ({ open, onClose, subjectName }) => (
  <Modal open={open} onClose={onClose} title={`Upload to ${subjectName || 'subject'}`}>
    <div className="space-y-4">
      <div className="p-8 rounded-md border-2 border-dashed border-neutral-200 bg-neutral-50 text-center cursor-pointer hover:bg-neutral-100 hover:border-neutral-300 transition-colors">
        <Upload size={28} className="text-neutral-400 mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">Drop video or click to browse</p>
        <p className="text-xs text-neutral-500">MP4, MOV up to 2 GB</p>
      </div>
      <Input label="Title" placeholder="Quadratic Equations — Introduction" />
      <Textarea label="Description" placeholder="What this video covers..." />
      <div className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked id="dl" />
        <label htmlFor="dl" className="text-neutral-700">Allow students to download for offline viewing</label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon={Upload} onClick={onClose}>Upload</Btn>
      </div>
    </div>
  </Modal>
);

const NewTestModal = ({ open, onClose, defaultClassId }) => {
  const [form, setForm] = useState({ title: '', duration: 30, totalMarks: 20, classId: defaultClassId || mockSubjectClasses[0]?.id, schedDate: '', schedTime: '', negativeMarking: false, penalty: 0.25 });
  useEffect(() => { if (defaultClassId) setForm(f => ({ ...f, classId: defaultClassId })); }, [defaultClassId, open]);
  const presets = [0.25, 0.33, 0.5, 1];

  return (
    <Modal open={open} onClose={onClose} title="New test">
      <div className="space-y-4">
        <Input label="Title" placeholder="Weekly Test — Algebra" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Duration (min)" type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
          <Input label="Total marks" type="number" value={form.totalMarks} onChange={e => setForm({ ...form, totalMarks: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Subject</label>
          <select value={form.classId} onChange={e => setForm({ ...form, classId: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-md bg-white border border-neutral-200 outline-none text-sm">
            {mockStandards.map(std => (
              <optgroup key={std.id} label={std.name}>
                {mockSubjectClasses.filter(c => c.standardId === std.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Schedule date" type="date" value={form.schedDate} onChange={e => setForm({ ...form, schedDate: e.target.value })} />
          <Input label="Time" type="time" value={form.schedTime} onChange={e => setForm({ ...form, schedTime: e.target.value })} />
        </div>

        {/* Negative marking */}
        <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Negative marking</p>
              <p className="text-xs text-neutral-500">Deduct marks for wrong answers</p>
            </div>
            <Toggle checked={form.negativeMarking} onChange={v => setForm({ ...form, negativeMarking: v })} />
          </div>
          {form.negativeMarking && (
            <div className="mt-3 pt-3 border-t border-neutral-200">
              <label className="text-xs font-medium text-neutral-600 mb-2 block">Penalty per wrong answer</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {presets.map(p => (
                  <button key={p} onClick={() => setForm({ ...form, penalty: p })}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${form.penalty === p ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 hover:bg-neutral-50'}`}>
                    −{p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Custom:</span>
                <input type="number" step="0.05" min="0" value={form.penalty} onChange={e => setForm({ ...form, penalty: Number(e.target.value) })}
                  className="flex-1 px-2 py-1 rounded bg-white border border-neutral-200 outline-none text-xs" />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={Plus} onClick={onClose}>Create test</Btn>
        </div>
      </div>
    </Modal>
  );
};

const TestResultsSheet = ({ open, onClose, test }) => {
  if (!test) return null;
  const attempts = mockTestAttempts[test.id] || {};
  const list = Object.entries(attempts).map(([sid, r]) => ({ ...r, student: mockStudents.find(s => s.id === Number(sid)) })).filter(x => x.student).sort((a, b) => b.score - a.score);
  const isScheduled = test.status === 'scheduled';
  return (
    <Sheet open={open} onClose={onClose} title={test.title}>
      {isScheduled ? (
        <>
          <div className="p-4 rounded-md bg-amber-50 border border-amber-100 mb-5 flex items-start gap-2">
            <Clock size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900">Scheduled for {fmtSchedule(new Date(test.scheduledFor))}</p>
              <p className="text-xs text-amber-700 mt-0.5">This test hasn't started yet. Students will see it when scheduled time arrives.</p>
            </div>
          </div>
          <SectionHeader title="Test details" />
          <div className="bg-white rounded-md border border-neutral-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-neutral-100 flex justify-between">
              <span className="text-xs text-neutral-500">Questions</span>
              <span className="text-sm font-medium">{test.questions}</span>
            </div>
            <div className="px-3 py-2.5 border-b border-neutral-100 flex justify-between">
              <span className="text-xs text-neutral-500">Duration</span>
              <span className="text-sm font-medium">{test.duration} mins</span>
            </div>
            <div className="px-3 py-2.5 border-b border-neutral-100 flex justify-between">
              <span className="text-xs text-neutral-500">Total marks</span>
              <span className="text-sm font-medium">{test.totalMarks}</span>
            </div>
            <div className="px-3 py-2.5 flex justify-between">
              <span className="text-xs text-neutral-500">Negative marking</span>
              <span className="text-sm font-medium">{test.negativeMarking ? `Yes, −${test.penalty}` : 'No'}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Btn variant="default" icon={Edit2} className="flex-1">Edit</Btn>
            <Btn variant="danger" icon={Trash2}>Cancel test</Btn>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">Attempted</p>
              <p className="text-lg font-semibold tabular-nums">{test.attempted}/{test.totalStudents}</p>
            </div>
            <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">Avg</p>
              <p className="text-lg font-semibold tabular-nums">{test.avg}%</p>
            </div>
            <div className="p-3 rounded-md bg-neutral-50 border border-neutral-200">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">Flagged</p>
              <p className="text-lg font-semibold tabular-nums">{test.flagged}</p>
            </div>
          </div>
          {test.negativeMarking && (
            <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-100 text-xs text-red-900 flex items-center gap-2">
              <Minus size={12} /> Negative marking: −{test.penalty} per wrong answer
            </div>
          )}
          <SectionHeader title="Individual results" count={list.length} />
          {list.length === 0 ? (
            <div className="text-center py-8 text-sm text-neutral-500">No attempts yet.</div>
          ) : (
            <div className="space-y-1.5">
              {list.map((a, i) => (
                <div key={a.student.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-white border border-neutral-200">
                  <span className="text-xs font-semibold text-neutral-500 w-4 tabular-nums">{i + 1}</span>
                  <Avatar name={a.student.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.student.name}</p>
                    <p className="text-xs text-neutral-500">{a.correct}/{a.total} correct</p>
                  </div>
                  <Tag color={a.score >= 80 ? 'green' : a.score >= 60 ? 'blue' : 'amber'}>{a.score}%</Tag>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
};

const AttachPickerModal = ({ open, onClose, onPick }) => {
  const options = [
    { icon: FileText, label: 'PDF', ext: 'pdf' },
    { icon: FileText, label: 'Word', ext: 'docx' },
    { icon: Layers, label: 'PPT', ext: 'pptx' },
    { icon: FileText, label: 'Image', ext: 'png' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="Attach file" size="sm">
      <div className="grid grid-cols-2 gap-2">
        {options.map((o, i) => (
          <button key={i} onClick={() => { onPick({ name: `sample.${o.ext}`, size: '1.4 MB' }); onClose(); }}
            className="flex flex-col items-center gap-2 p-4 rounded-md border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors">
            <o.icon size={20} className="text-neutral-500" />
            <span className="text-sm font-medium">{o.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
};

// ============================================================
// STUDENT PORTAL — fully functional
// ============================================================
const StudentPortal = ({ broadcastsByStandard, onLogout }) => {
  const [active, setActive] = useState('home');
  const [studentView, setStudentView] = useState({ screen: 'home', params: {} });
  const [me, setMe] = useState(mockStudents[0]);
  const std = mockStandards.find(s => s.id === me.standardId);
  const myClasses = getClassesInStandard(me.standardId);
  const myBroadcasts = (broadcastsByStandard[me.standardId] || []).filter(b => !b.deleted);

  const navigate = (screen, params = {}) => {
    setStudentView({ screen, params });
    // Set bottom nav active state based on screen
    if (['home'].includes(screen)) setActive('home');
    else if (['subjects', 'subject-view', 'video-player'].includes(screen)) setActive('subjects');
    else if (['tests', 'test-taking', 'test-result'].includes(screen)) setActive('tests');
    else if (['broadcasts'].includes(screen)) setActive('broadcasts');
    else if (['profile'].includes(screen)) setActive('profile');
  };

  const setTab = (tab) => {
    setActive(tab);
    setStudentView({ screen: tab, params: {} });
  };

  const goBack = () => {
    // Simple back: go to parent of current
    if (studentView.screen === 'subject-view') navigate('subjects');
    else if (studentView.screen === 'video-player') navigate('subject-view', studentView.params);
    else if (studentView.screen === 'test-taking') navigate('tests');
    else if (studentView.screen === 'test-result') navigate('tests');
    else navigate('home');
  };

  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'tests', label: 'Tests', icon: FileQuestion },
    { id: 'broadcasts', label: 'Inbox', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: Users },
  ];

  // Hide bottom nav during test-taking
  const hideNav = studentView.screen === 'test-taking';

  return (
    <div className={`min-h-screen bg-neutral-50 ${hideNav ? '' : 'pb-16'}`} style={{ fontFamily: fonts.body }}>
      {studentView.screen === 'home' && <StudentHome me={me} std={std} myClasses={myClasses} myBroadcasts={myBroadcasts} navigate={navigate} />}
      {studentView.screen === 'subjects' && <StudentSubjects me={me} std={std} myClasses={myClasses} navigate={navigate} />}
      {studentView.screen === 'subject-view' && <StudentSubjectView classId={studentView.params.classId} me={me} navigate={navigate} goBack={goBack} />}
      {studentView.screen === 'video-player' && <StudentVideoPlayer videoId={studentView.params.videoId} navigate={navigate} goBack={goBack} />}
      {studentView.screen === 'tests' && <StudentTests me={me} myClasses={myClasses} navigate={navigate} />}
      {studentView.screen === 'test-taking' && <StudentTestTaking testId={studentView.params.testId} navigate={navigate} />}
      {studentView.screen === 'test-result' && <StudentTestResult result={studentView.params.result} navigate={navigate} />}
      {studentView.screen === 'broadcasts' && <StudentBroadcasts std={std} myBroadcasts={myBroadcasts} />}
      {studentView.screen === 'profile' && <StudentProfile me={me} setMe={setMe} std={std} onLogout={onLogout} />}

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200">
          <div className="max-w-5xl mx-auto flex">
            {items.map(item => {
              const isActive = active === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`}>
                  <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      )}
    </div>
  );
};

const StudentHome = ({ me, std, myClasses, myBroadcasts, navigate }) => {
  const recentBroadcast = myBroadcasts[myBroadcasts.length - 1];
  const pendingTests = mockTests.filter(t => myClasses.some(c => c.id === t.classId) && t.status === 'completed').length;
  const recentVideo = mockVideos.find(v => myClasses.some(c => c.id === v.classId));

  return (
    <>
      <TopBar title="Udaya" subtitle={`Hi, ${me.name.split(' ')[0]} · ${std?.name}`} showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-1">Good afternoon</h2>
        <p className="text-sm text-neutral-500 mb-6">Keep going. You're doing well.</p>

        <div className="grid grid-cols-3 gap-2 mb-8">
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Trophy size={12} className="text-neutral-400 mb-2" />
            <p className="text-xl font-semibold">{me.points}</p>
            <p className="text-xs text-neutral-500">Points</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Target size={12} className="text-neutral-400 mb-2" />
            <p className="text-xl font-semibold">{me.avgScore}%</p>
            <p className="text-xs text-neutral-500">Avg score</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <BookOpen size={12} className="text-neutral-400 mb-2" />
            <p className="text-xl font-semibold">{myClasses.length}</p>
            <p className="text-xs text-neutral-500">Subjects</p>
          </div>
        </div>

        {recentBroadcast && (
          <div className="mb-6">
            <SectionHeader title="Latest message" />
            <button onClick={() => navigate('broadcasts')} className="w-full text-left p-4 bg-white rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={recentBroadcast.sender} size="xs" />
                <p className="text-xs font-semibold">{recentBroadcast.sender}</p>
                <span className="text-[10px] text-neutral-400 ml-auto">{recentBroadcast.time}</span>
              </div>
              <p className="text-sm text-neutral-700 line-clamp-2">{recentBroadcast.text}</p>
            </button>
          </div>
        )}

        <SectionHeader title="My subjects" count={myClasses.length} />
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-6">
          {myClasses.map((c, i) => (
            <button key={c.id} onClick={() => navigate('subject-view', { classId: c.id })}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < myClasses.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-neutral-500">{c.videoCount} videos</p></div>
              <ChevronRight size={14} className="text-neutral-400" />
            </button>
          ))}
        </div>

        {recentVideo && (
          <>
            <SectionHeader title="Continue watching" />
            <button onClick={() => navigate('video-player', { videoId: recentVideo.id, classId: recentVideo.classId })}
              className="w-full text-left bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-neutral-800 to-neutral-900 relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Play size={18} className="text-white ml-0.5" fill="currentColor" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-white" style={{ width: '34%' }} />
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{recentVideo.title}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{recentVideo.duration} · 34% watched</p>
              </div>
            </button>
          </>
        )}
      </div>
    </>
  );
};

const StudentSubjects = ({ me, std, myClasses, navigate }) => (
  <>
    <TopBar title="Subjects" subtitle={std?.name} showSearch={false} />
    <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        {myClasses.map((c, i) => {
          const videoCount = mockVideos.filter(v => v.classId === c.id).length;
          const testCount = mockTests.filter(t => t.classId === c.id).length;
          return (
            <button key={c.id} onClick={() => navigate('subject-view', { classId: c.id })}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${i < myClasses.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <span className="text-xl">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-neutral-500">{videoCount} videos · {testCount} tests</p>
              </div>
              <ChevronRight size={14} className="text-neutral-400" />
            </button>
          );
        })}
      </div>
    </div>
  </>
);

const StudentSubjectView = ({ classId, me, navigate, goBack }) => {
  const [tab, setTab] = useState('videos');
  const c = mockSubjectClasses.find(x => x.id === classId);
  if (!c) return <div className="p-6 text-center text-sm text-neutral-500">Subject not found.</div>;
  const videos = mockVideos.filter(v => v.classId === c.id);
  const tests = mockTests.filter(t => t.classId === c.id);
  const classmates = mockStudents.filter(s => s.standardId === c.standardId).sort((a, b) => b.points - a.points);

  return (
    <>
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={goBack} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{c.emoji}</span>
          <h1 className="text-base font-semibold truncate">{c.name}</h1>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-1 mb-5">
          {[
            { id: 'videos', label: 'Videos', count: videos.length },
            { id: 'tests', label: 'Tests', count: tests.length },
            { id: 'leaderboard', label: 'Leaderboard', count: classmates.length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.id ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}>
              {t.label} <span className="text-neutral-400">{t.count}</span>
            </button>
          ))}
        </div>

        {tab === 'videos' && (
          videos.length === 0 ? (
            <div className="text-center py-12 text-sm text-neutral-500">No videos yet.</div>
          ) : (
            <div className="space-y-2">
              {videos.map(v => (
                <button key={v.id} onClick={() => navigate('video-player', { videoId: v.id, classId })}
                  className="w-full text-left bg-white rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors overflow-hidden flex items-center gap-3 p-3">
                  <div className="w-20 aspect-video rounded bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center flex-shrink-0">
                    <Play size={16} className="text-white ml-0.5" fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.title}</p>
                    <p className="text-xs text-neutral-500">{v.duration} · {v.uploaded}</p>
                  </div>
                  <ChevronRight size={14} className="text-neutral-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )
        )}

        {tab === 'tests' && (
          tests.length === 0 ? (
            <div className="text-center py-12 text-sm text-neutral-500">No tests yet.</div>
          ) : (
            <div className="space-y-2">
              {tests.map(t => {
                const myResult = mockTestAttempts[t.id]?.[me.id];
                const isCompleted = !!myResult;
                const isScheduled = t.status === 'scheduled';
                return (
                  <div key={t.id} className="bg-white rounded-lg border border-neutral-200 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-medium text-sm">{t.title}</h4>
                          {isCompleted && <Tag color="green">{myResult.score}%</Tag>}
                          {isScheduled && <Tag color="amber">Scheduled</Tag>}
                          {t.negativeMarking && <Tag color="red">−{t.penalty}</Tag>}
                        </div>
                        <p className="text-xs text-neutral-500">{t.questions} questions · {t.duration} mins{isScheduled ? ` · ${fmtSchedule(new Date(t.scheduledFor))}` : ''}</p>
                      </div>
                      {!isCompleted && !isScheduled && (
                        <Btn variant="primary" size="sm" onClick={() => navigate('test-taking', { testId: t.id })}>Start</Btn>
                      )}
                      {isScheduled && (
                        <Btn variant="default" size="sm" disabled icon={Lock}>Locked</Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {tab === 'leaderboard' && (
          <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
            {classmates.map((s, i) => {
              const isMe = s.id === me.id;
              return (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${i < classmates.length - 1 ? 'border-b border-neutral-100' : ''} ${isMe ? 'bg-amber-50' : ''}`}>
                  <span className="text-xs font-semibold text-neutral-500 w-5 tabular-nums">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}{isMe && <span className="text-xs text-neutral-500 ml-1">(you)</span>}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums flex items-center gap-1"><Trophy size={11} className="text-amber-500" />{s.points}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

const StudentVideoPlayer = ({ videoId, navigate, goBack }) => {
  const v = mockVideos.find(x => x.id === videoId);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(34);
  const [savedOffline, setSavedOffline] = useState(false);

  if (!v) return <div className="p-6 text-center text-sm text-neutral-500">Video not found.</div>;

  return (
    <>
      <div className="aspect-video bg-gradient-to-br from-neutral-900 via-neutral-800 to-black relative flex items-center justify-center">
        <button onClick={goBack} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60">
          <ArrowLeft size={16} />
        </button>
        <button onClick={() => setPlaying(!playing)} className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors">
          {playing ? <Pause size={24} className="text-white" fill="currentColor" /> : <Play size={24} className="text-white ml-1" fill="currentColor" />}
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="h-1 bg-white/20 rounded-full mb-3 cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setProgress(((e.clientX - rect.left) / rect.width) * 100);
          }}>
            <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-white text-xs">
            <span>{Math.floor((progress / 100) * 24)}:{String(Math.floor((progress / 100) * 30)).padStart(2, '0')} / {v.duration}</span>
            <span>HD</span>
          </div>
        </div>
      </div>
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold mb-1">{v.title}</h1>
        <p className="text-sm text-neutral-500 mb-4">{v.duration} · {v.uploaded} · {v.size}</p>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Btn variant={savedOffline ? 'default' : 'primary'} size="sm" icon={savedOffline ? Check : Download} onClick={() => setSavedOffline(!savedOffline)}>
            {savedOffline ? 'Saved offline' : 'Save offline'}
          </Btn>
          <Btn variant="default" size="sm" icon={Check} onClick={() => setProgress(100)}>Mark complete</Btn>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-medium mb-2">About this video</h3>
          <p className="text-sm text-neutral-600 leading-relaxed">An introduction to the topic, with worked examples and practice problems. Watch the whole video to earn points.</p>
        </div>
      </div>
    </>
  );
};

const StudentTests = ({ me, myClasses, navigate }) => {
  const myTests = mockTests.filter(t => myClasses.some(c => c.id === t.classId));
  const completed = myTests.filter(t => mockTestAttempts[t.id]?.[me.id]);
  const available = myTests.filter(t => !mockTestAttempts[t.id]?.[me.id] && t.status !== 'scheduled');
  const upcoming = myTests.filter(t => t.status === 'scheduled');

  const renderTest = (t) => {
    const myResult = mockTestAttempts[t.id]?.[me.id];
    const c = mockSubjectClasses.find(x => x.id === t.classId);
    const isCompleted = !!myResult;
    const isScheduled = t.status === 'scheduled';
    return (
      <div key={t.id} className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-medium text-sm">{t.title}</h4>
              {isCompleted && <Tag color="green">{myResult.score}%</Tag>}
              {t.negativeMarking && <Tag color="red">−{t.penalty}</Tag>}
            </div>
            <p className="text-xs text-neutral-500">{c?.emoji} {c?.name} · {t.questions} questions · {t.duration} mins{isScheduled ? ` · ${fmtSchedule(new Date(t.scheduledFor))}` : ''}</p>
          </div>
          {!isCompleted && !isScheduled && <Btn variant="primary" size="sm" onClick={() => navigate('test-taking', { testId: t.id })}>Start</Btn>}
          {isScheduled && <Btn variant="default" size="sm" disabled icon={Lock}>Locked</Btn>}
        </div>
      </div>
    );
  };

  return (
    <>
      <TopBar title="Tests" subtitle={`${available.length} available · ${completed.length} completed`} showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto space-y-6">
        {available.length > 0 && (
          <div>
            <SectionHeader title="Available now" count={available.length} />
            <div className="space-y-2">{available.map(renderTest)}</div>
          </div>
        )}
        {upcoming.length > 0 && (
          <div>
            <SectionHeader title="Upcoming" count={upcoming.length} />
            <div className="space-y-2">{upcoming.map(renderTest)}</div>
          </div>
        )}
        {completed.length > 0 && (
          <div>
            <SectionHeader title="Completed" count={completed.length} />
            <div className="space-y-2">{completed.map(renderTest)}</div>
          </div>
        )}
        {myTests.length === 0 && (
          <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
            <FileQuestion size={32} className="mx-auto mb-3 text-neutral-300" />
            <p className="text-sm text-neutral-500">No tests yet.</p>
          </div>
        )}
      </div>
    </>
  );
};

const StudentTestTaking = ({ testId, navigate }) => {
  const t = mockTests.find(x => x.id === testId) || mockTests[0];
  const questions = mockQuestions.slice(0, Math.min(t.questions, mockQuestions.length));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(t.duration * 60);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const i = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [timeLeft]);

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const q = questions[current];
  const answeredCount = Object.keys(answers).length;

  const handleSubmit = () => {
    let correct = 0, wrong = 0;
    questions.forEach((qq, i) => { if (answers[i] === qq.correct) correct++; else if (answers[i] !== undefined) wrong++; });
    const total = questions.length;
    const marksPerQ = (t.totalMarks || total) / total;
    const rawMarks = correct * marksPerQ;
    const penalty = t.negativeMarking ? wrong * t.penalty : 0;
    const finalMarks = Math.max(0, rawMarks - penalty);
    const score = Math.round((finalMarks / (t.totalMarks || total)) * 100);
    const points = Math.round(score * 0.6);
    navigate('test-result', { result: { testTitle: t.title, score, correct, wrong, total, incorrect: total - correct, points, classAvg: t.avg || 75, negativeMarking: t.negativeMarking, penalty: t.penalty, deducted: penalty } });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: fonts.body }}>
      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 px-5 md:px-8 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-red-100 flex items-center justify-center flex-shrink-0">
          <Lock size={14} className="text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{t.title}</p>
          <p className="text-xs text-neutral-500">Question {current + 1} of {questions.length}</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-md text-sm font-mono tabular-nums">
          <Clock size={12} /> {fmtTime(timeLeft)}
        </div>
      </div>

      <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 text-xs text-amber-900 flex items-center justify-center gap-2">
        <AlertCircle size={12} /> Don't switch apps or tabs. Activity is monitored.
      </div>
      {t.negativeMarking && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 text-xs text-red-900 flex items-center justify-center gap-2">
          <Minus size={12} /> Negative marking: −{t.penalty} per wrong answer
        </div>
      )}

      <div className="flex-1 px-5 md:px-8 py-8 max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">Question {current + 1}</p>
        <h2 className="text-lg md:text-xl font-medium leading-relaxed mb-6">{q.q}</h2>
        <div className="space-y-2 mb-8">
          {q.options.map((opt, i) => {
            const isSelected = answers[current] === i;
            return (
              <button key={i} onClick={() => setAnswers({ ...answers, [current]: i })}
                className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${isSelected ? 'border-neutral-900 bg-neutral-50 ring-2 ring-neutral-200' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${isSelected ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{String.fromCharCode(65 + i)}</div>
                <span className="text-sm">{opt}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Btn variant="ghost" icon={ChevronLeft} onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}>Previous</Btn>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`h-2 rounded-full transition-all ${i === current ? 'bg-neutral-900 w-8' : answers[i] !== undefined ? 'bg-green-500 w-2' : 'bg-neutral-300 w-2'}`} />
            ))}
          </div>
          {current === questions.length - 1
            ? <Btn variant="primary" onClick={() => setConfirmOpen(true)}>Submit</Btn>
            : <Btn variant="primary" onClick={() => setCurrent(current + 1)}>Next</Btn>}
        </div>
        <p className="text-center text-xs text-neutral-500 mt-4">Answered {answeredCount} of {questions.length}</p>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit test?" size="sm">
        <p className="text-sm text-neutral-600 mb-2">You've answered <strong>{answeredCount} of {questions.length}</strong> questions.</p>
        {answeredCount < questions.length && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-100 text-xs text-amber-900 mb-3 flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{questions.length - answeredCount} unanswered. {t.negativeMarking ? 'No penalty for unanswered.' : 'These will be marked wrong.'}</span>
          </div>
        )}
        <p className="text-sm text-neutral-600 mb-5">Once submitted, you cannot change your answers.</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={() => setConfirmOpen(false)}>Go back</Btn>
          <Btn variant="primary" onClick={handleSubmit}>Submit</Btn>
        </div>
      </Modal>
    </div>
  );
};

const StudentTestResult = ({ result, navigate }) => {
  if (!result) return <div className="p-6 text-center text-sm text-neutral-500">No result.</div>;
  const aboveAvg = result.score >= result.classAvg;
  return (
    <>
      <TopBar title="Result" showSearch={false} />
      <div className="px-5 md:px-8 py-8 max-w-2xl mx-auto">
        <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 mx-auto mb-4 flex items-center justify-center">
            <Sparkles size={24} className="text-amber-600" />
          </div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{result.testTitle}</p>
          <p className="text-5xl font-semibold tracking-tight mb-2">{result.score}<span className="text-neutral-300">/100</span></p>
          <p className="text-sm text-neutral-600 mb-1">{aboveAvg ? `Above class average (${result.classAvg}%)` : `Class average: ${result.classAvg}%`}</p>
          {result.negativeMarking && result.deducted > 0 && (
            <p className="text-xs text-red-600 mb-4">−{result.deducted.toFixed(2)} marks deducted from {result.wrong} wrong answer{result.wrong !== 1 ? 's' : ''}</p>
          )}
          <div className="grid grid-cols-3 gap-2 mb-6 mt-6">
            <div className="p-3 bg-green-50 rounded-md">
              <p className="text-xl font-semibold text-green-700">{result.correct}</p>
              <p className="text-xs text-green-700">Correct</p>
            </div>
            <div className="p-3 bg-red-50 rounded-md">
              <p className="text-xl font-semibold text-red-700">{result.negativeMarking ? result.wrong : result.incorrect}</p>
              <p className="text-xs text-red-700">{result.negativeMarking ? 'Wrong' : 'Incorrect'}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-md">
              <p className="text-xl font-semibold text-amber-700">+{result.points}</p>
              <p className="text-xs text-amber-700">Points</p>
            </div>
          </div>
          <Btn variant="primary" onClick={() => navigate('tests')}>Back to tests</Btn>
        </div>
      </div>
    </>
  );
};

const StudentBroadcasts = ({ std, myBroadcasts }) => (
  <>
    <TopBar title="Inbox" subtitle={`Messages for ${std?.name}`} showSearch={false} />
    <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
      {myBroadcasts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-neutral-200 rounded-lg">
          <MessageSquare size={32} className="mx-auto mb-3 text-neutral-300" />
          <p className="text-sm text-neutral-500">No messages yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myBroadcasts.map(b => (
            <div key={b.id} className="bg-white rounded-lg border border-neutral-200 p-4">
              {b.pinned && <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1.5"><Pin size={9} /> Pinned</div>}
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={b.sender} size="xs" />
                <div><p className="text-xs font-semibold">{b.sender}</p><p className="text-[10px] text-neutral-500">{b.senderRole}</p></div>
              </div>
              <p className="text-sm text-neutral-800 leading-relaxed">{b.text}</p>
              {b.attachments?.map((a, i) => (
                <div key={i} className="flex items-center gap-2 p-2 mt-2 bg-neutral-50 rounded text-xs border border-neutral-200 cursor-pointer hover:bg-neutral-100">
                  <FileText size={12} className="text-neutral-500" /><span className="flex-1 truncate">{a.name}</span><Download size={11} className="text-neutral-500" />
                </div>
              ))}
              <p className="text-[10px] text-neutral-400 mt-2">{b.time}{b.edited && ' · edited'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  </>
);

const StudentProfile = ({ me, setMe, std, onLogout }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [form, setForm] = useState({ name: me.name, email: me.email, phone: me.phone });
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdError, setPwdError] = useState('');

  const handleSaveProfile = () => {
    setMe({ ...me, name: form.name, email: form.email, phone: form.phone });
    setEditOpen(false);
  };
  const handleSavePwd = () => {
    if (!pwdForm.current || !pwdForm.next || !pwdForm.confirm) { setPwdError('Fill all fields.'); return; }
    if (pwdForm.next !== pwdForm.confirm) { setPwdError('New passwords do not match.'); return; }
    if (pwdForm.next.length < 6) { setPwdError('Password must be at least 6 characters.'); return; }
    setPwdError('');
    setPwdForm({ current: '', next: '', confirm: '' });
    setPwdOpen(false);
  };

  return (
    <>
      <TopBar title="Profile" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-200">
          <Avatar name={me.name} size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate">{me.name}</h2>
            <p className="text-sm text-neutral-500 truncate">@{me.username} · {std?.name}</p>
          </div>
          <Btn variant="default" size="sm" icon={Edit2} onClick={() => setEditOpen(true)}>Edit</Btn>
        </div>

        <SectionHeader title="Account" />
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-xs text-neutral-500 mb-0.5">Email</p>
            <p className="text-sm">{me.email}</p>
          </div>
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-xs text-neutral-500 mb-0.5">Phone</p>
            <p className="text-sm">{me.phone}</p>
          </div>
          <button onClick={() => setPwdOpen(true)} className="w-full px-4 py-3 hover:bg-neutral-50 transition-colors text-left flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Password</p>
              <p className="text-sm">••••••••</p>
            </div>
            <ChevronRight size={14} className="text-neutral-400" />
          </button>
        </div>

        <SectionHeader title="Stats" />
        <div className="grid grid-cols-2 gap-2 mb-6">
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Trophy size={12} className="text-neutral-400 mb-1" />
            <p className="text-lg font-semibold">{me.points}</p>
            <p className="text-xs text-neutral-500">Points</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Target size={12} className="text-neutral-400 mb-1" />
            <p className="text-lg font-semibold">{me.avgScore}%</p>
            <p className="text-xs text-neutral-500">Avg score</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Activity size={12} className="text-neutral-400 mb-1" />
            <p className="text-lg font-semibold">{me.attendance}%</p>
            <p className="text-xs text-neutral-500">Attendance</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-neutral-200">
            <Smartphone size={12} className="text-neutral-400 mb-1" />
            <p className="text-lg font-semibold">1</p>
            <p className="text-xs text-neutral-500">Active device</p>
          </div>
        </div>

        <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-neutral-200 hover:bg-red-50 transition-colors text-left text-red-600">
          <LogOut size={16} /><span className="text-sm font-medium">Sign out</span>
        </button>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
        <div className="space-y-4">
          <Input label="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSaveProfile}>Save</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={pwdOpen} onClose={() => { setPwdOpen(false); setPwdError(''); }} title="Change password">
        <div className="space-y-4">
          <Input label="Current password" type="password" value={pwdForm.current} onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })} autoFocus />
          <Input label="New password" type="password" value={pwdForm.next} onChange={e => setPwdForm({ ...pwdForm, next: e.target.value })} />
          <Input label="Confirm new password" type="password" value={pwdForm.confirm} onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })} />
          {pwdError && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} />{pwdError}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => { setPwdOpen(false); setPwdError(''); }}>Cancel</Btn>
            <Btn variant="primary" onClick={handleSavePwd}>Save password</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState({ screen: 'today', params: {} });
  const [history, setHistory] = useState([]);
  const [broadcastsByStandard, setBroadcastsByStandard] = useState(initialBroadcastsByStandard);

  const ROOT_SCREENS = ['today', 'subjects', 'students', 'broadcasts', 'more'];
  const navigate = (screen, params = {}) => {
    setHistory(h => ROOT_SCREENS.includes(screen) ? [] : [...h, view]);
    setView({ screen, params });
  };
  const goBack = (fallback) => {
    setHistory(h => {
      if (h.length === 0) {
        setView(fallback || { screen: 'today', params: {} });
        return [];
      }
      const last = h[h.length - 1];
      setView(last);
      return h.slice(0, -1);
    });
  };

  const handleLogin = (role) => { setUser(role); setView({ screen: role === 'teacher' ? 'today' : 'home', params: {} }); setHistory([]); };
  const handleLogout = () => { setUser(null); setView({ screen: 'today', params: {} }); setHistory([]); };

  // For bottom nav active state
  const navTab = (() => {
    if (['today'].includes(view.screen)) return 'today';
    if (['subjects', 'standard-detail', 'subject-detail'].includes(view.screen)) return 'subjects';
    if (['students', 'student-detail'].includes(view.screen)) return 'students';
    if (['broadcasts'].includes(view.screen)) return 'broadcasts';
    return 'more';
  })();

  const setNavTab = (tab) => {
    const map = { today: 'today', subjects: 'subjects', students: 'students', broadcasts: 'broadcasts', more: 'more' };
    setHistory([]);
    setView({ screen: map[tab], params: {} });
  };

  const fontStyles = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slide-left { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .animate-in.fade-in { animation: fade-in 150ms ease-out; }
    .animate-in.slide-up { animation: slide-up 200ms ease-out; }
    @media (min-width: 768px) {
      .animate-in.md\\:slide-left { animation: slide-left 200ms ease-out; }
    }
  `;

  if (!user) return <><style>{fontStyles}</style><LoginScreen onLogin={handleLogin} /></>;

  if (user === 'teacher') {
    return (
      <>
        <style>{fontStyles}</style>
        <div className="min-h-screen bg-neutral-50 pb-16" style={{ fontFamily: fonts.body, color: COLORS.text }}>
          {view.screen === 'today' && <TodayScreen navigate={navigate} />}
          {view.screen === 'subjects' && <SubjectsScreen navigate={navigate} initialStandardId={view.params.standardId} />}
          {view.screen === 'standard-detail' && <StandardDetailScreen standardId={view.params.standardId} navigate={navigate} goBack={goBack} />}
          {view.screen === 'subject-detail' && <SubjectDetailScreen classId={view.params.classId} navigate={navigate} goBack={goBack} />}
          {view.screen === 'students' && <StudentsScreen navigate={navigate} />}
          {view.screen === 'student-detail' && <StudentDetailScreen studentId={view.params.studentId} navigate={navigate} goBack={goBack} />}
          {view.screen === 'broadcasts' && <BroadcastsScreen broadcastsByStandard={broadcastsByStandard} setBroadcastsByStandard={setBroadcastsByStandard} navigate={navigate} />}
          {view.screen === 'more' && <MoreScreen navigate={navigate} onLogout={handleLogout} />}
          {view.screen === 'tests' && <TestsScreen navigate={navigate} goBack={goBack} />}
          {view.screen === 'reports' && <ReportsScreen navigate={navigate} goBack={goBack} />}
          {view.screen === 'reminders' && <RemindersScreen navigate={navigate} goBack={goBack} />}
          {view.screen === 'settings' && <SettingsScreen navigate={navigate} goBack={goBack} />}

          <BottomNav active={navTab} setActive={setNavTab} />
        </div>
      </>
    );
  }

  return <><style>{fontStyles}</style><StudentPortal broadcastsByStandard={broadcastsByStandard} onLogout={handleLogout} /></>;
}
