import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Video, FileQuestion, FileText, CheckCircle2, Clock, MapPin, Loader2, LayoutGrid, List
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns';
import { useAuthStore } from '../../lib/auth';
import { apiClient, liveClassApi } from '../../lib/api';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeJoin, setActiveJoin] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Warm Zoom SDK
  useEffect(() => {
    const ric = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : (fn) => setTimeout(fn, 1500);
    const cancel = window.cancelIdleCallback ? window.cancelIdleCallback.bind(window) : clearTimeout;
    const id = ric(() => preloadZoomSDK());
    return () => cancel(id);
  }, []);

  const handleJoinLive = async (lcId) => {
    if (joiningId) return;
    setJoiningId(lcId);
    preloadZoomSDK();
    try {
      const res = await liveClassApi.getJoinToken(lcId);
      setActiveJoin({ ...res });
    } catch (err) {
      alert(err?.message || 'Failed to join class.');
    } finally {
      setJoiningId(null);
    }
  };

  // Fetch events for the current month
  useEffect(() => {
    let isMounted = true;
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        
        // Fetch slightly wider range to cover the week view properly
        const queryStart = format(subDays(start, 7), 'yyyy-MM-dd');
        const queryEnd = format(addDays(end, 7), 'yyyy-MM-dd');

        const data = await apiClient(`/student/calendar-events?start_date=${queryStart}&end_date=${queryEnd}`);
        if (isMounted) {
          setEvents(data || []);
        }
      } catch (err) {
        console.error("Failed to load events", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchEvents();
    return () => { isMounted = false; };
  }, [currentDate]);

  // Generators for calendar views
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfMonth(currentDate);
    const days = [];
    let current = start;
    while (current <= end || days.length % 7 !== 0) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [currentDate]);

  const selectedDateEvents = useMemo(() => {
    const selDateStr = format(selectedDate, 'yyyy-MM-dd');
    return events.filter(e => {
      const eDateStr = format(parseISO(e.date), 'yyyy-MM-dd');
      return eDateStr === selDateStr;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedDate, events]);

  const handlePrev = () => {
    if (viewMode === 'week') setCurrentDate(prev => subWeeks(prev, 1));
    else setCurrentDate(prev => startOfMonth(subDays(startOfMonth(prev), 1)));
  };

  const handleNext = () => {
    if (viewMode === 'week') setCurrentDate(prev => addWeeks(prev, 1));
    else setCurrentDate(prev => addDays(endOfMonth(prev), 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const hasEvents = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.some(e => format(parseISO(e.date), 'yyyy-MM-dd') === dateStr);
  };

  const getEventDots = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => format(parseISO(e.date), 'yyyy-MM-dd') === dateStr);
    
    // Get unique types
    const types = [...new Set(dayEvents.map(e => e.type))];
    
    return types.map(type => {
      if (type === 'test') return <div key={type} className="w-1.5 h-1.5 rounded-full bg-[#f48fb1]"></div>;
      if (type === 'live') return <div key={type} className="w-1.5 h-1.5 rounded-full bg-[#81d4fa]"></div>;
      if (type === 'assignment') return <div key={type} className="w-1.5 h-1.5 rounded-full bg-[#a5d6a7]"></div>;
      return <div key={type} className="w-1.5 h-1.5 rounded-full bg-[#ce93d8]"></div>;
    });
  };

  const handleEventClick = (evt) => {
    if (evt.type === 'test') {
      navigate(`/student/tests/${evt.id}/take`);
    } else if (evt.type === 'video' && evt.class_id) {
      navigate(`/student/subjects/${evt.class_id}/video/${evt.id}`);
    } else if (evt.type === 'assignment' && evt.class_id) {
      navigate(`/student/subjects/${evt.class_id}`);
    } else if (evt.type === 'live') {
      // Zoom class has a dedicated join button, but clicking the card can take them to the live-classes tab
      navigate('/student/live-classes');
    }
  };

  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 0}
        display_name={user?.name || 'Student'}
        passcode={activeJoin.passcode}
        zak={activeJoin.zak}
        onLeave={() => setActiveJoin(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] pb-24 md:pb-8">
      {/* Header */}
      <div className="bg-white px-6 py-8 md:py-10 shadow-sm border-b border-neutral-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-black text-neutral-900 tracking-tight flex items-center gap-3">
                <CalendarIcon className="text-[#00acc1]" size={32} />
                Calendar
              </h1>
              <p className="text-neutral-500 mt-1 font-medium">Keep track of your classes, tests, and assignments.</p>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
              <div className="bg-neutral-100 p-1 rounded-xl flex items-center shrink-0">
                <button 
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'week' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <List size={16} className="inline-block mr-2" />
                  Week
                </button>
                <button 
                  onClick={() => setViewMode('month')}
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${viewMode === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <LayoutGrid size={16} className="inline-block mr-2" />
                  Month
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-8 flex flex-col md:flex-row gap-8">
        
        {/* Left Side: Calendar UI */}
        <div className="flex-1">
          
          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-neutral-100">
            <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-4">
              <button onClick={handlePrev} className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-600">
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-xl font-bold text-neutral-800 w-40 text-center">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <button onClick={handleNext} className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-600">
                <ChevronRight size={20} />
              </button>
            </div>
            <button 
              onClick={handleToday}
              className="px-4 py-2 bg-[#e0f7fa] text-[#00acc1] font-bold rounded-xl text-sm hover:bg-[#b2ebf2] transition-colors w-full sm:w-auto"
            >
              Today
            </button>
          </div>

          {/* Calendar Rendering */}
          <div className="bg-white p-3 md:p-6 rounded-3xl shadow-sm border border-neutral-100 relative min-h-[300px]">
            {loading && (
              <div className="absolute inset-0 z-10 bg-white/50 backdrop-blur-sm flex items-center justify-center rounded-3xl">
                <Loader2 size={32} className="animate-spin text-[#00acc1]" />
              </div>
            )}

            {viewMode === 'week' && (
              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {weekDays.map(day => {
                  const isSel = isSameDay(day, selectedDate);
                  const isTod = isToday(day);
                  
                  return (
                    <div 
                      key={day.toISOString()}
                      onClick={() => { setSelectedDate(day); setCurrentDate(day); }}
                      className={`flex flex-col items-center gap-1 md:gap-2 py-2 md:p-2 rounded-xl md:rounded-2xl cursor-pointer group transition-all`}
                    >
                      <span className={`text-[10px] md:text-xs font-bold ${isTod ? 'text-[#00acc1]' : 'text-neutral-400'}`}>
                        {format(day, 'EEE')}
                      </span>
                      <div className={`w-8 h-8 md:w-12 md:h-12 flex items-center justify-center rounded-full text-sm md:text-lg font-bold transition-all
                        ${isSel 
                          ? 'bg-neutral-800 text-white shadow-md scale-110' 
                          : isTod 
                            ? 'text-[#00acc1] bg-[#e0f7fa] hover:bg-[#b2ebf2]' 
                            : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {format(day, 'd')}
                      </div>
                      <div className="flex flex-wrap justify-center gap-0.5 md:gap-1 mt-1 h-2 max-w-full px-1">
                        {getEventDots(day)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewMode === 'month' && (
              <div className="w-full">
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <div key={d} className="text-center text-xs font-bold text-neutral-400 py-2">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {monthDays.map(day => {
                    const isSel = isSameDay(day, selectedDate);
                    const isTod = isToday(day);
                    const isCurMonth = isSameMonth(day, currentDate);

                    return (
                      <div 
                        key={day.toISOString()}
                        onClick={() => { setSelectedDate(day); setCurrentDate(day); }}
                        className={`aspect-square flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all border-2
                          ${!isCurMonth ? 'opacity-30 border-transparent' : 'border-transparent'}
                          ${isSel 
                            ? 'bg-neutral-800 text-white shadow-md scale-105 border-neutral-800' 
                            : isTod 
                              ? 'text-[#00acc1] bg-[#e0f7fa] border-[#e0f7fa] hover:bg-[#b2ebf2]' 
                              : 'text-neutral-700 hover:bg-neutral-50 hover:border-neutral-200'
                          }`}
                      >
                        <span className={`text-xs md:text-base font-bold ${isSel ? 'text-white' : ''}`}>
                          {format(day, 'd')}
                        </span>
                        <div className="flex flex-wrap gap-0.5 md:gap-1 mt-0.5 md:mt-1 h-1.5 md:h-2 items-center justify-center w-full px-0.5 md:px-1">
                          {getEventDots(day)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Daily Agenda */}
        <div className="w-full md:w-96 flex-shrink-0">
          <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-6 sticky top-32">
            <h3 className="text-xl font-bold text-neutral-900 mb-6 flex items-center gap-2">
              Agenda for {format(selectedDate, 'MMM d, yyyy')}
              {isToday(selectedDate) && <span className="bg-[#e0f7fa] text-[#00acc1] text-xs px-2 py-0.5 rounded-md ml-2">Today</span>}
            </h3>

            {loading ? (
              <div className="py-12 flex justify-center text-neutral-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : selectedDateEvents.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl bg-neutral-50 border border-dashed border-neutral-200">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <CheckCircle2 size={24} className="text-[#a5d6a7]" />
                </div>
                <h4 className="font-bold text-neutral-800 mb-1">No events scheduled</h4>
                <p className="text-sm text-neutral-500">You're all clear for this day. Enjoy your free time!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDateEvents.map((evt, idx) => {
                  
                  let icon = <CheckCircle2 size={20} />;
                  let bgColor = 'bg-neutral-100';
                  let iconColor = 'text-neutral-500';
                  let timeStr = format(parseISO(evt.date), 'h:mm a');

                  if (evt.type === 'test') {
                    icon = <FileQuestion size={20} />;
                    bgColor = 'bg-[#fce4ec]';
                    iconColor = 'text-[#d81b60]';
                  } else if (evt.type === 'live') {
                    icon = <Video size={20} />;
                    bgColor = 'bg-[#e1f5fe]';
                    iconColor = 'text-[#0288d1]';
                  } else if (evt.type === 'assignment') {
                    icon = <FileText size={20} />;
                    bgColor = 'bg-[#e8f5e9]';
                    iconColor = 'text-[#388e3c]';
                  } else if (evt.type === 'video') {
                    icon = <Video size={20} />;
                    bgColor = 'bg-[#f3e5f5]';
                    iconColor = 'text-[#8e24aa]';
                  }

                  return (
                    <div 
                      key={`${evt.id}-${idx}`} 
                      className="flex gap-4 p-4 rounded-2xl border border-neutral-100 hover:shadow-md transition-shadow bg-white cursor-pointer"
                      onClick={() => handleEventClick(evt)}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${bgColor} ${iconColor}`}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <h4 className="font-bold text-neutral-900 text-sm leading-tight">{evt.title}</h4>
                        </div>
                        <p className="text-xs font-bold text-neutral-500 mt-1">{evt.subject}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className="flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-100 px-2 py-1 rounded-md">
                            <Clock size={12} /> {timeStr}
                          </span>
                          {evt.duration && (
                            <span className="text-xs font-medium text-neutral-500">
                              {evt.duration} mins
                            </span>
                          )}
                        </div>
                        {evt.type === 'live' && evt.link && (
                          <button onClick={(e) => { e.stopPropagation(); handleJoinLive(evt.id); }} className="mt-3 block text-center w-full bg-[#0288d1] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#0277bd] transition-colors relative">
                            {joiningId === evt.id ? <><Loader2 size={14} className="animate-spin inline mr-1 -mt-0.5" /> Joining...</> : 'Join Zoom Class'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
