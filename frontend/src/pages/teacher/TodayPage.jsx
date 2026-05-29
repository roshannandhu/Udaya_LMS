import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BookOpen, Activity, ArrowRight, Calendar, AlertCircle, Upload, FileQuestion, MessageSquare, UserPlus } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { Avatar, SectionHeader, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';

// Persist dashboard stats in sessionStorage so page feels instant on tab-switch
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
  const standards        = useAppCache(s => s.standards);
  const refreshStandards  = useAppCache(s => s.refreshStandards);

  // Hydrate instantly from sessionStorage — no loading flicker
  const [stats, setStats]       = useState(() => getCachedStats());
  const [activities, setActivities] = useState(() => getCachedActivity() || []);
  const [statsLoading, setStatsLoading] = useState(!getCachedStats());
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);

  const now = new Date();
  const displayName = user?.name || 'Teacher';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    refreshStandards();

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

  const todayActions = [];
  if (stats) {
    if (stats.scheduled_tests_count > 0)
      todayActions.push({ label: `${stats.scheduled_tests_count} tests scheduled`, icon: Calendar, color: 'amber', to: '/teacher/tests' });
    if (lowAttendanceCount > 0)
      todayActions.push({ label: `${lowAttendanceCount} students below attendance threshold`, icon: AlertCircle, color: 'red', to: '/teacher/reports' });
    if (stats.students_count === 0)
      todayActions.push({ label: 'Add your first student', icon: UserPlus, color: 'blue', to: '/teacher/students' });
  }

  const quickActions = [
    { label: 'Upload video',    icon: Upload,       to: '/teacher/subjects' },
    { label: 'Create test',     icon: FileQuestion, to: '/teacher/tests' },
    { label: 'Send broadcast',  icon: MessageSquare,to: '/teacher/broadcasts' },
    { label: 'Add student',     icon: UserPlus,     to: '/teacher/students' },
  ];

  const colorMap = { red: 'text-red-600', amber: 'text-amber-700', blue: 'text-blue-600' };

  // Stat card — shows skeleton only while loading and NO cached value exists
  const StatCard = ({ icon: Icon, value, label }) => (
    <div className="p-4 glass-panel rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <Icon size={14} className="text-neutral-500" />
      </div>
      {statsLoading && value == null
        ? <><Skeleton className="h-8 w-8 mb-2" /><Skeleton className="h-3 w-20" /></>
        : <><p className="text-2xl font-semibold tracking-tight">{value ?? 0}</p><p className="text-xs text-neutral-600">{label}</p></>
      }
    </div>
  );

  return (
    <div>
      <TopBar
        title="Today"
        subtitle={now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
      />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold tracking-tight mb-1">{greeting}, {displayName}</h2>
        <p className="text-sm text-neutral-500 mb-8">Here's what's happening across your classes.</p>

        {/* Quick stats — instant from sessionStorage cache */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <StatCard icon={Users}        value={stats?.students_count}        label="Total students" />
          <StatCard icon={BookOpen}     value={stats?.subjects_count}        label="Subjects" />
          <StatCard icon={FileQuestion} value={stats?.scheduled_tests_count} label="Scheduled tests" />
          <StatCard icon={Activity}     value={stats?.broadcasts_count}      label="Broadcasts" />
        </div>

        {/* Needs attention */}
        {todayActions.length > 0 && (
          <div className="mb-10">
            <SectionHeader title="Needs attention" count={todayActions.length} />
            <div className="space-y-1.5">
              {todayActions.map((a, i) => (
                <button key={i} onClick={() => navigate(a.to)}
                  className="w-full flex items-center gap-3 p-3 glass-panel rounded-xl hover:bg-white/70 transition-all text-left group">
                  <a.icon size={16} className={colorMap[a.color] || 'text-neutral-500'} />
                  <span className="flex-1 text-sm">{a.label}</span>
                  <ArrowRight size={14} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="mb-10">
          <SectionHeader title="Quick actions" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {quickActions.map((a, i) => (
              <button key={i} onClick={() => navigate(a.to)}
                className="p-3 glass-panel rounded-xl hover:bg-white/70 transition-all flex flex-col items-start gap-2">
                <a.icon size={16} className="text-neutral-600" />
                <span className="text-xs font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="mb-10">
          <SectionHeader title="Recent activity" />
          <div className="glass-panel rounded-xl overflow-hidden">
            {statsLoading && activities.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1"><Skeleton className="h-4 w-48 mb-1" /><Skeleton className="h-3 w-24" /></div>
                  </div>
                ))}
              </div>
            ) : activities.length > 0 ? (
              activities.map((a, i) => (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < activities.length - 1 ? 'border-b border-white/40' : ''}`}>
                  <Avatar name={a.student} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-medium">{a.student}</span>
                      <span className="text-neutral-500"> {a.detail}</span>
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {a.video_title || a.test_title || 'Activity'} · {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : 'Recently'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-neutral-500">
                No recent activity yet. Students will appear here as they use the platform.
              </div>
            )}
          </div>
        </div>

        {/* Classes overview — instant from Zustand cache */}
        <div>
          <SectionHeader
            title="Your classes"
            count={standards.length}
            action={<button onClick={() => navigate('/teacher/subjects')} className="text-xs text-neutral-500 hover:text-neutral-900">View all →</button>}
          />
          {standards.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {standards.map(s => (
                <button key={s.id} onClick={() => navigate(`/teacher/subjects/${s.id}`)}
                  className="p-4 glass-panel rounded-xl hover:bg-white/40 hover:border-neutral-300 transition-all text-left">
                  <div className="text-2xl mb-2">{s.emoji || '📚'}</div>
                  <p className="text-sm font-medium mb-0.5">{s.name}</p>
                  <p className="text-xs text-neutral-500">{s.short || ''}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-8 text-center">
              <p className="text-sm text-neutral-500 mb-4">No classes yet. Create your first class to get started.</p>
              <button onClick={() => navigate('/teacher/subjects')} className="px-4 py-2 bg-neutral-900 text-white rounded-md text-sm font-medium">
                Create class
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}