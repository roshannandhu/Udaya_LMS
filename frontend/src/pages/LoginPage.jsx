import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore, ROLES } from '../lib/auth';
import { useSettingsStore } from '../store';

export default function LoginPage() {
  const [mode, setMode] = useState('teacher');
  const [showPwd, setShowPwd] = useState(false);
  const [creds, setCreds] = useState({ email: '', phone: '', pwd: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, enforceSingleDevice } = useAuthStore();
  const { lmsName, lmsLogo } = useSettingsStore();

  useEffect(() => { document.title = lmsName || 'Udaya'; }, [lmsName]);

  const handleSubmit = async () => {
    const identifier = mode === 'teacher' ? creds.email : creds.phone;
    if (!identifier.trim() || !creds.pwd.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await login(identifier.trim(), creds.pwd);

      if (result.success) {
        if (result.role === ROLES.STUDENT && !result.requiresPasswordChange) {
          const { user } = useAuthStore.getState();
          const deviceCheck = await enforceSingleDevice(user?.id || identifier);
          if (!deviceCheck.allowed) {
            setError(deviceCheck.message);
            setLoading(false);
            return;
          }
        }

        if (result.requiresPasswordChange) {
          navigate('/student/change-password', { replace: true });
        } else {
          navigate(result.role === ROLES.TEACHER ? '/teacher' : '/student', { replace: true });
        }
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-transparent">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-4 mb-10 justify-center">
          {lmsLogo
            ? <img src={lmsLogo} alt="logo" className="w-16 h-16 rounded-2xl object-cover shadow-sm border border-neutral-200" />
            : <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-lg ring-4 ring-indigo-50/50">
                <GraduationCap size={32} className="text-white drop-shadow-md" />
              </div>
          }
          <span 
            className="font-black text-4xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-500 text-center drop-shadow-sm"
            style={{ fontFamily: '"Outfit", "Plus Jakarta Sans", "Inter", sans-serif' }}
          >
            {lmsName || 'Udaya'}
          </span>
        </div>

        <div className="glass-panel p-8">
          <h1 className="text-2xl font-semibold mb-1">Welcome back</h1>
          <p className="text-sm text-neutral-500 mb-6">Sign in to continue</p>

          <div className="flex p-1 bg-[#F4F2EF] rounded-pill mb-6 border border-[#EFEDEA]">
            {['teacher', 'student'].map((r) => (
              <button
                key={r}
                onClick={() => { setMode(r); setError(''); }}
                className={`flex-1 py-1.5 rounded-pill text-sm font-medium capitalize transition-all
                  ${mode === r ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {mode === 'student' && (
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Email or phone number</label>
                <input
                  value={creds.phone}
                  onChange={(e) => setCreds({ ...creds, phone: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="student@email.com or 9876543210"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none text-sm"
                />
              </div>
            )}

            {mode === 'teacher' && (
              <div>
                <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={creds.email}
                  onChange={(e) => setCreds({ ...creds, email: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="priya@academy.com"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none text-sm"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={creds.pwd}
                  onChange={(e) => setCreds({ ...creds, pwd: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-white border border-[#EFEDEA] focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 p-1"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle size={12} /> {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2.5 bg-ink text-white rounded-pill font-medium hover:bg-neutral-800 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          {mode === 'student' && (
            <div className="mt-5 p-3 rounded-xl bg-pastel-sky border border-black/5 text-xs text-neutral-700 leading-relaxed">
              Sign in with your email or phone number and the password your teacher gave you.
            </div>
          )}
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">{lmsName || 'Udaya'} · A learning platform built for tuition</p>
      </div>
    </div>
  );
}