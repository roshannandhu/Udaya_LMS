import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, BookOpen, FileQuestion, Calendar, AlertCircle, Upload, MessageSquare, UserPlus, Activity, GraduationCap } from 'lucide-react';
import { Avatar, Skeleton } from '../../components/ui';
import StatCard from '../../components/cards/StatCard';
import RoadmapNode from '../../components/cards/RoadmapNode';
import RoadmapTrack from '../../components/cards/RoadmapTrack';
import EventCard from '../../components/cards/EventCard';
import Card from '../../components/cards/Card';
import { apiClient, attendanceApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import NotificationBell from '../../components/shared/NotificationBell';
import { fadeUp, staggerChildren } from '../../lib/motion';

function getCachedStats() {
  try { return JSON.parse(sessionStorage.getItem('tutoria_dash_stats') || 'null'); } catch { return null; }
}
function setCachedStats(data) {
  try { sessionStorage.setItem('tutoria_dash_stats', JSON.stringify(data)); } catch {}
}
function getCachedActivity() {
  try { return JSON.parse(sessionStorage.getItem('tutoria_dash_activity') || 'null'); } catch { return null; }
}
function setCachedActivity(data) {
  try { sessionStorage.setItem('tutoria_dash_activity', JSON.stringify(data)); } catch {}
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const standards       = useAppCache(s => s.standards);
  const subjects        = useAppCache(s => s.subjects);
  const students        = useAppCache(s => s.students);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const refreshSubjects  = useAppCache(s => s.refreshSubjects);
  const refreshStudents  = useAppCache(s => s.refreshStudents);

  const [stats, setStats]       = useState(() => getCachedStats());
  const [activities, setActivities] = useState(() => getCachedActivity() || []);
  const [statsLoading, setStatsLoading] = useState(!getCachedStats());
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);

  const now = new Date();
  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    refreshStandards();
    refreshSubjects?.();
    refreshStudents?.();
    const fetchData = async () => {
      try {
        const [statsData, activityData, lowAttData] = await Promise.all([
          apiClient('/dashboard/stats'),
          apiClient('/dashboard/activity'),
          attendanceApi.getLowAttendance('all', 75).catch(() => ({ count: 0 }))
        ]);
        setStats(statsData);
        setCachedStats(statsData);
        setLowAttendanceCount(lowAttData?.count || 0);
        const acts = activityData.activities || [];
        setActivities(acts);
        setCachedActivity(acts);
      } catch (err) {
        console.error('Dashboard error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Needs-attention events (reuse existing signals).
  const todayEvents = [];
  if (stats) {
    if (stats.scheduled_tests_count > 0)
      todayEvents.push({ color: 'cream', icon: Calendar, kicker: 'Tests scheduled', title: `${stats.scheduled_tests_count} test${stats.scheduled_tests_count > 1 ? 's' : ''} coming up`, to: '/teacher/tests' });
    if (lowAttendanceCount > 0)
      todayEvents.push({ color: 'peach', icon: AlertCircle, kicker: 'Attention', title: `${lowAttendanceCount} students below attendance threshold`, to: '/teacher/reports' });
    if (stats.students_count === 0)
      todayEvents.push({ color: 'sky', icon: UserPlus, kicker: 'Get started', title: 'Add your first student', to: '/teacher/students' });
  }

  const quickActions = [
    { label: 'Upload video',   icon: Upload,        to: '/teacher/subjects',   color: 'mint' },
    { label: 'Create test',    icon: FileQuestion,  to: '/teacher/tests',      color: 'lavender' },
    { label: 'Send broadcast', icon: MessageSquare, to: '/teacher/broadcasts', color: 'sky' },
    { label: 'Add student',    icon: UserPlus,      to: '/teacher/students',   color: 'peach' },
  ];

  const countFor = (standardId) => ({
    subjects: subjects.filter(s => s.standard_id === standardId).length,
    students: students.filter(s => s.standard_id === standardId).length,
  });

  return (
    <div>
      {/* Mobile header (desktop uses the TopNav) */}
      <div className="lg:hidden sticky top-0 z-30 bg-canvas">
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-neutral-500">{greeting},</p>
            <h1 className="text-base font-semibold leading-tight">{displayName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/teacher/attendance')} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 rounded-full transition-colors">
              <Calendar size={20} />
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: class journey ── */}
        <div className="lg:col-span-2">
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <p className="hidden lg:block text-sm text-neutral-500">{greeting}, {displayName}</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2"
              style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
              My Classes <GraduationCap size={24} className="text-neutral-700" />
            </h1>
          </motion.div>

          <motion.div variants={staggerChildren} initial="hidden" animate="show" className="grid grid-cols-3 gap-3 mb-6">
            {statsLoading && !stats ? (
              <>{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-card" />)}</>
            ) : (
              <>
                <StatCard value={stats?.students_count ?? 0} label="Students" icon={Users} color="mint" emphasis />
                <StatCard value={stats?.subjects_count ?? 0} label="Subjects" icon={BookOpen} color="lavender" />
                <StatCard value={stats?.scheduled_tests_count ?? 0} label="Tests scheduled" icon={FileQuestion} color="cream" />
              </>
            )}
          </motion.div>

          {standards.length > 0 ? (
            <RoadmapTrack>
              {standards.map((s, i) => {
                const c = countFor(s.id);
                return (
                  <RoadmapNode
                    key={s.id}
                    title={s.name}
                    description={s.short || 'Manage subjects, students and content.'}
                    status={i === 0 ? 'active' : 'upcoming'}
                    meta={[
                      { icon: Users, label: `${c.students} students` },
                      { icon: BookOpen, label: `${c.subjects} subjects` },
                    ]}
                    onClick={() => navigate(`/teacher/subjects/${s.id}`)}
                  />
                );
              })}
            </RoadmapTrack>
          ) : (
            <div className="glass-panel p-8 text-center">
              <p className="text-sm text-neutral-500 mb-4">No classes yet. Create your first class to get started.</p>
              <button onClick={() => navigate('/teacher/subjects')} className="px-4 py-2 bg-ink text-white rounded-pill text-sm font-medium">
                Create class
              </button>
            </div>
          )}
        </div>

        {/* ── Right: Today ── */}
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="space-y-3">
          <motion.h2 variants={fadeUp} className="text-xl font-semibold tracking-tight flex items-center gap-2 mb-1"
            style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            Today <span>🗓️</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="text-xs text-neutral-500 mb-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
          </motion.p>

          {todayEvents.map((e, i) => (
            <EventCard key={i} color={e.color} icon={e.icon} kicker={e.kicker} title={e.title} onClick={() => navigate(e.to)} />
          ))}

          {/* Quick actions */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 pt-1">
            {quickActions.map((a, i) => (
              <Card key={i} as="button" color={a.color} interactive padded={false}
                onClick={() => navigate(a.to)} className="p-4 flex flex-col items-start gap-2">
                <a.icon size={18} />
                <span className="text-xs font-semibold">{a.label}</span>
              </Card>
            ))}
          </motion.div>

          {/* Recent activity */}
          <motion.div variants={fadeUp}>
            <Card padded={false} className="overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EFEDEA] flex items-center gap-2">
                <Activity size={14} className="text-neutral-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent activity</span>
              </div>
              {statsLoading && activities.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex-1"><Skeleton className="h-4 w-40 mb-1" /><Skeleton className="h-3 w-20" /></div>
                    </div>
                  ))}
                </div>
              ) : activities.length > 0 ? (
                activities.slice(0, 5).map((a, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < Math.min(activities.length, 5) - 1 ? 'border-b border-[#F2F1EE]' : ''}`}>
                    <Avatar name={a.student} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate"><span className="font-medium">{a.student}</span><span className="text-neutral-500"> {a.detail}</span></p>
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{a.video_title || a.test_title || 'Activity'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-neutral-500">No recent activity yet.</div>
              )}
            </Card>
          </motion.div>
        </motion.div>
      </div>
      </div>
    </div>
  );
}
