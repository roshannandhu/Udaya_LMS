import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useAuthStore, ROLES } from '../lib/auth';
import { useSettingsStore } from '../store';
import { apiClient } from '../lib/api';

export default function LoginPage() {
  const [mode, setMode] = useState('teacher');
  const [showPwd, setShowPwd] = useState(false);
  const [creds, setCreds] = useState({ email: '', phone: '', pwd: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  // Two-step verification (teachers on new devices): { pendingId, emailMasked }
  const [otpStage, setOtpStage] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendWait, setResendWait] = useState(0);
  const navigate = useNavigate();
  const { login, verifyOtp, resendOtp } = useAuthStore();
  const { lmsName, lmsLogo, applyBranding } = useSettingsStore();

  // Resend cooldown ticker
  useEffect(() => {
    if (resendWait <= 0) return;
    const id = setInterval(() => setResendWait(w => (w > 1 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendWait > 0]);

  useEffect(() => { document.title = lmsName || 'Udaya'; }, [lmsName]);

  // Pull branding from the public endpoint so the logo/name appear on any device
  // (localStorage may be empty on a fresh browser).
  useEffect(() => {
    apiClient('/branding')
      .then(applyBranding)
      .catch(() => {});
  }, [applyBranding]);

  // If the student was auto-logged-out (account opened on another device), explain why.
  useEffect(() => {
    const reason = localStorage.getItem('tutoria_logout_reason');
    if (reason) {
      setNotice(reason);
      setMode('student');
      localStorage.removeItem('tutoria_logout_reason');
    }
  }, []);

  const handleSubmit = async () => {
    const identifier = mode === 'teacher' ? creds.email : creds.phone;
    if (!identifier.trim() || !creds.pwd.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);

    try {
      const result = await login(identifier.trim(), creds.pwd);

      if (result.success) {
        if (result.requiresOTP) {
          // Teacher 2FA: show the code step; tokens arrive after verifyOtp().
          setOtpStage({ pendingId: result.pendingId, emailMasked: result.emailMasked });
          setOtpCode('');
          setResendWait(60);
          return;
        }
        // Single-device enforcement is handled by ProtectedStudentRoute on mount
        // (and its 30s poll). A separate check here would just be a redundant
        // round-trip — login() already wrote this device's fingerprint server-side.
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

  const handleVerifyOtp = async () => {
    const code = otpCode.trim();
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await verifyOtp(otpStage.pendingId, code);
      if (result.success) {
        navigate(result.role === ROLES.TEACHER ? '/teacher' : '/student', { replace: true });
      } else {
        setError(result.error || 'Verification failed');
        // Pending entry gone (expired / too many attempts) → back to login.
        if (/log in again/i.test(result.error || '')) { setOtpStage(null); setOtpCode(''); }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendWait > 0 || loading) return;
    setError('');
    const result = await resendOtp(otpStage.pendingId);
    if (result.success) {
      setResendWait(60);
      setNotice('A new code has been sent.');
      setTimeout(() => setNotice(''), 3000);
    } else {
      setError(result.error || 'Could not resend code');
      if (/log in again/i.test(result.error || '')) { setOtpStage(null); setOtpCode(''); }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F4F7F6] relative overflow-hidden">
      
      {/* Decorative Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#F8E1FB] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#EAF3EB] rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-[#FFF6D8] rounded-full mix-blend-multiply filter blur-[60px] opacity-60 animate-pulse" style={{ animationDuration: '7s' }} />

      <div className="w-full max-w-[420px] relative z-10">
        
        {/* Branding */}
        <div className="flex flex-col items-center gap-5 mb-10 justify-center">
          {lmsLogo
            ? <img src={lmsLogo} alt="logo" className="w-20 h-20 rounded-[24px] object-cover shadow-md border-[4px] border-white" />
            : <div className="w-20 h-20 rounded-[24px] bg-white shadow-md border-[4px] border-white flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#F8E1FB] to-[#EAF3EB] opacity-50" />
                <GraduationCap size={36} className="text-neutral-800 drop-shadow-sm relative z-10" />
              </div>
          }
          <span 
            className="font-extrabold text-[40px] tracking-tight text-neutral-900 text-center drop-shadow-sm leading-none"
          >
            {lmsName || 'Udaya'}
          </span>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 backdrop-blur-2xl p-8 sm:p-10 rounded-[40px] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border-[3px] border-white">
          {otpStage ? (
            <>
              {/* ── Two-step verification step ── */}
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={22} className="text-green-600" />
                <h1 className="text-[24px] font-extrabold text-neutral-900 tracking-tight">Check your email</h1>
              </div>
              <p className="text-[15px] text-neutral-500 mb-8 font-medium">
                We sent a 6-digit code to <span className="font-bold text-neutral-700">{otpStage.emailMasked}</span>
              </p>

              {notice && (
                <div className="flex items-start gap-2 p-4 mb-6 bg-[#EAF3EB]/70 border-2 border-white rounded-[20px] text-[13px] font-bold text-green-900 shadow-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
                  <span>{notice}</span>
                </div>
              )}

              <div className="space-y-5">
                <input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                  inputMode="numeric"
                  autoFocus
                  placeholder="••••••"
                  className="w-full px-5 py-4 rounded-[20px] bg-white/60 border-0 shadow-inner focus:bg-white focus:ring-4 focus:ring-green-500/10 outline-none text-[28px] font-extrabold tracking-[0.5em] text-center text-neutral-800 transition-all placeholder:text-neutral-300"
                />

                {error && (
                  <div className="flex items-start gap-2 p-4 bg-[#FFEBE5] border-2 border-white rounded-[20px] text-[13px] font-bold text-red-700 shadow-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otpCode.length !== 6}
                  className="w-full py-4 rounded-[24px] bg-neutral-900 text-white font-extrabold text-[16px] shadow-xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Verifying...' : 'Verify & sign in'}
                </button>

                <div className="flex items-center justify-between text-[13px] font-bold">
                  <button
                    onClick={() => { setOtpStage(null); setOtpCode(''); setError(''); }}
                    className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    <ArrowLeft size={14} /> Back to login
                  </button>
                  <button
                    onClick={handleResendOtp}
                    disabled={resendWait > 0}
                    className="text-neutral-500 hover:text-neutral-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resendWait > 0 ? `Resend code in ${resendWait}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            </>
          ) : (
          <>
          <h1 className="text-[26px] font-extrabold mb-1 text-neutral-900 tracking-tight">Welcome back</h1>
          <p className="text-[15px] text-neutral-500 mb-8 font-medium">Sign in to continue your journey</p>

          {notice && (
            <div className="flex items-start gap-2 p-4 mb-6 bg-[#E5F2FE]/70 border-2 border-white rounded-[20px] text-[13px] font-bold text-blue-900 shadow-sm animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-blue-600" />
              <span>{notice}</span>
            </div>
          )}

          {/* Role Toggle */}
          <div className="flex p-1.5 bg-neutral-100/80 rounded-[24px] mb-8 shadow-inner">
            {['teacher', 'student'].map((r) => (
              <button
                key={r}
                onClick={() => { setMode(r); setError(''); }}
                className={`flex-1 py-3 rounded-[20px] text-[14px] font-bold capitalize transition-all duration-300
                  ${mode === r ? 'bg-white text-neutral-900 shadow-md scale-100' : 'text-neutral-500 hover:text-neutral-800 scale-95'}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {mode === 'student' && (
              <div>
                <label className="text-[13px] font-bold text-neutral-700 mb-2 block ml-1">Email, phone, or Student ID</label>
                <input
                  value={creds.phone}
                  onChange={(e) => setCreds({ ...creds, phone: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Email, phone, or Student ID"
                  className="w-full px-5 py-4 rounded-[20px] bg-white/60 border-0 shadow-inner focus:bg-white focus:ring-4 focus:ring-purple-500/10 outline-none text-[15px] font-medium text-neutral-800 transition-all placeholder:text-neutral-400"
                />
              </div>
            )}

            {mode === 'teacher' && (
              <div>
                <label className="text-[13px] font-bold text-neutral-700 mb-2 block ml-1">Email</label>
                <input
                  type="email"
                  value={creds.email}
                  onChange={(e) => setCreds({ ...creds, email: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="teacher@academy.com"
                  className="w-full px-5 py-4 rounded-[20px] bg-white/60 border-0 shadow-inner focus:bg-white focus:ring-4 focus:ring-purple-500/10 outline-none text-[15px] font-medium text-neutral-800 transition-all placeholder:text-neutral-400"
                />
              </div>
            )}

            <div>
              <label className="text-[13px] font-bold text-neutral-700 mb-2 block ml-1">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={creds.pwd}
                  onChange={(e) => setCreds({ ...creds, pwd: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Enter your password"
                  className="w-full pl-5 pr-12 py-4 rounded-[20px] bg-white/60 border-0 shadow-inner focus:bg-white focus:ring-4 focus:ring-purple-500/10 outline-none text-[15px] font-medium text-neutral-800 transition-all placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-800 p-2 transition-colors bg-white rounded-full shadow-sm"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-[#FFEBE5] border-2 border-white rounded-[20px] text-[13px] font-bold text-red-700 shadow-sm animate-in slide-in-from-top-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full mt-4 py-4 rounded-[24px] bg-neutral-900 text-white font-extrabold text-[16px] shadow-xl hover:bg-black hover:shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-xl flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          {mode === 'student' && (
            <div className="mt-6 p-5 rounded-[24px] bg-[#E5F2FE]/50 border-2 border-white text-[13px] font-medium text-blue-900/80 leading-relaxed text-center shadow-sm">
              Use the login details provided by your teacher to access your dashboard.
            </div>
          )}
          </>
          )}
        </div>

        <p className="text-center text-[13px] font-semibold text-neutral-400 mt-8 tracking-wide">
          {lmsName || 'Udaya'} · Built for modern learning
        </p>
      </div>
    </div>
  );
}