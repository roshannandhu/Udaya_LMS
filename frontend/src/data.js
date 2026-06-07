const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 0, 0, 0);

export const fmtSchedule = (d) =>
  d.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtDate = (d) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const mockStandards = [
  { id: 1, name: '10th Standard', short: '10', emoji: 'calculator' },
  { id: 2, name: '11th Standard', short: '11', emoji: 'flask' },
  { id: 3, name: '12th Standard', short: '12', emoji: 'graduation' },
  { id: 4, name: '9th Standard',  short: '9',  emoji: 'book' },
];

export const mockSubjectClasses = [
  { id: 1, standardId: 1, name: 'Mathematics', emoji: 'calculator', videoCount: 24, endDate: '2026-12-15' },
  { id: 2, standardId: 1, name: 'Physics',     emoji: 'atom', videoCount: 18, endDate: '2026-12-15' },
  { id: 3, standardId: 1, name: 'Chemistry',   emoji: 'flask', videoCount: 22, endDate: '2026-12-15' },
  { id: 4, standardId: 2, name: 'Mathematics', emoji: 'calculator', videoCount: 18, endDate: '2026-12-20' },
  { id: 5, standardId: 2, name: 'Physics',     emoji: 'atom', videoCount: 15, endDate: '2026-12-20' },
  { id: 6, standardId: 3, name: 'Physics',     emoji: 'atom', videoCount: 31, endDate: '2027-03-01' },
  { id: 7, standardId: 3, name: 'Mathematics', emoji: 'calculator', videoCount: 28, endDate: '2027-03-01' },
  { id: 8, standardId: 4, name: 'English',     emoji: 'book', videoCount: 12, endDate: '2027-01-31' },
];

export const mockStudents = [
  { id: 1,  name: 'Aarav Sharma',  username: 'aarav.s',    email: 'aarav@email.com',   phone: '+91 98765 43210', standardId: 1, points: 1240, attendance: 92, lastSeen: '2 hours ago',  avgScore: 87, blocked: false },
  { id: 2,  name: 'Diya Patel',    username: 'diya.p',     email: 'diya@email.com',    phone: '+91 98765 43211', standardId: 1, points: 1580, attendance: 96, lastSeen: '30 min ago',   avgScore: 94, blocked: false },
  { id: 3,  name: 'Arjun Kumar',   username: 'arjun.k',    email: 'arjun@email.com',   phone: '+91 98765 43212', standardId: 1, points: 890,  attendance: 78, lastSeen: '1 day ago',    avgScore: 72, blocked: false },
  { id: 4,  name: 'Ananya Singh',  username: 'ananya.s',   email: 'ananya@email.com',  phone: '+91 98765 43213', standardId: 1, points: 1420, attendance: 88, lastSeen: '5 hours ago',  avgScore: 89, blocked: false },
  { id: 5,  name: 'Vihaan Gupta',  username: 'vihaan.g',   email: 'vihaan@email.com',  phone: '+91 98765 43214', standardId: 1, points: 620,  attendance: 65, lastSeen: '3 days ago',   avgScore: 58, blocked: false },
  { id: 6,  name: 'Saanvi Reddy',  username: 'saanvi.r',   email: 'saanvi@email.com',  phone: '+91 98765 43215', standardId: 1, points: 1390, attendance: 91, lastSeen: '1 hour ago',   avgScore: 86, blocked: false },
  { id: 7,  name: 'Reyansh Iyer',  username: 'reyansh.i',  email: 'reyansh@email.com', phone: '+91 98765 43216', standardId: 3, points: 1100, attendance: 84, lastSeen: '4 hours ago',  avgScore: 81, blocked: false },
  { id: 8,  name: 'Myra Joshi',    username: 'myra.j',     email: 'myra@email.com',    phone: '+91 98765 43217', standardId: 3, points: 1670, attendance: 98, lastSeen: '15 min ago',   avgScore: 96, blocked: false },
  { id: 9,  name: 'Ishaan Verma',  username: 'ishaan.v',   email: 'ishaan@email.com',  phone: '+91 98765 43218', standardId: 2, points: 1320, attendance: 90, lastSeen: '1 hour ago',   avgScore: 85, blocked: false },
  { id: 10, name: 'Kiara Mehta',   username: 'kiara.m',    email: 'kiara@email.com',   phone: '+91 98765 43219', standardId: 4, points: 980,  attendance: 82, lastSeen: '6 hours ago',  avgScore: 76, blocked: false },
];

export const mockVideos = [
  { id: 1, title: 'Quadratic Equations — Introduction', classId: 1, duration: '24:30', uploaded: '2 days ago',  watched: 24, total: 28, size: '142 MB' },
  { id: 2, title: 'Solving by Factorization',           classId: 1, duration: '31:15', uploaded: '5 days ago',  watched: 22, total: 28, size: '198 MB' },
  { id: 3, title: 'Discriminant & Nature of Roots',     classId: 1, duration: '28:45', uploaded: '1 week ago',  watched: 27, total: 28, size: '178 MB' },
  { id: 4, title: "Newton's Laws Overview",             classId: 2, duration: '32:10', uploaded: '3 days ago',  watched: 24, total: 26, size: '215 MB' },
  { id: 5, title: 'Atomic Structure',                   classId: 3, duration: '27:55', uploaded: '4 days ago',  watched: 20, total: 25, size: '188 MB' },
  { id: 6, title: 'Organic Reactions',                  classId: 3, duration: '35:20', uploaded: '6 days ago',  watched: 18, total: 25, size: '241 MB' },
  { id: 7, title: 'Wave Optics',                        classId: 6, duration: '38:45', uploaded: '2 days ago',  watched: 19, total: 22, size: '256 MB' },
];

export const mockTests = [
  { id: 1, title: 'Weekly Test — Algebra',    classId: 1, questions: 20, duration: 30, attempted: 26, totalStudents: 28, avg: 78, status: 'completed', flagged: 2, negativeMarking: true,  penalty: 0.25, totalMarks: 20 },
  { id: 2, title: 'Chapter Test — Quadratics',classId: 1, questions: 25, duration: 45, attempted: 27, totalStudents: 28, avg: 82, status: 'completed', flagged: 0, negativeMarking: false, penalty: 0,    totalMarks: 25 },
  { id: 3, title: 'Monthly Assessment',        classId: 1, questions: 40, duration: 60, attempted: 0,  totalStudents: 28, avg: 0,  status: 'scheduled', flagged: 0, negativeMarking: true,  penalty: 0.5,  totalMarks: 40, scheduledFor: tomorrow.toISOString() },
  { id: 4, title: "Newton's Laws Test",        classId: 2, questions: 15, duration: 25, attempted: 24, totalStudents: 26, avg: 76, status: 'completed', flagged: 1, negativeMarking: true,  penalty: 0.25, totalMarks: 15 },
  { id: 5, title: 'Atomic Structure Quiz',     classId: 3, questions: 10, duration: 15, attempted: 0,  totalStudents: 25, avg: 0,  status: 'scheduled', flagged: 0, negativeMarking: false, penalty: 0,    totalMarks: 10, scheduledFor: tomorrow.toISOString() },
];

export const mockTestAttempts = {
  1: {
    1: { score: 85, correct: 17, total: 20 },
    2: { score: 92, correct: 18, total: 20 },
    3: { score: 65, correct: 13, total: 20 },
    4: { score: 88, correct: 18, total: 20 },
    5: { score: 55, correct: 11, total: 20 },
    6: { score: 84, correct: 17, total: 20 },
  },
};

export const mockQuestions = [
  { id: 1, q: 'What is the discriminant of x² − 5x + 6 = 0?',             options: ['1', '25', '24', '−1'],                                        correct: 0 },
  { id: 2, q: 'The roots of x² + 4x + 4 = 0 are:',                        options: ['Real and distinct', 'Real and equal', 'Imaginary', 'None of these'], correct: 1 },
  { id: 3, q: 'If α and β are roots of x² − 7x + 12 = 0, then α + β =',   options: ['7', '12', '−7', '−12'],                                        correct: 0 },
];

export const getStudentsInStandard = (stdId) => mockStudents.filter((s) => s.standardId === stdId);
export const getClassesInStandard  = (stdId) => mockSubjectClasses.filter((c) => c.standardId === stdId);
