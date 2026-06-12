import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2, UserCircle2 } from 'lucide-react';
import { useAuthStore } from '../../lib/auth';
import AvatarPresetPicker from '../../components/student/AvatarPresetPicker';

export default function StudentChangePasswordPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { changePassword, verifyWithBackend, user, role, setUser } = useAuthStore();
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ new: false, confirm: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Step 2 (students only): choose a profile icon right after setting the password.
  const [step, setStep] = useState('password');          // 'password' | 'avatar'
  const [pickedAvatar, setPickedAvatar] = useState(undefined); // undefined = untouched

  const finishToApp = () => navigate(role === 'teacher' ? '/teacher' : '/student', { replace: true });

  const handleSubmit = async () => {
    if (!passwords.new.trim()) {
      setError('Please enter a new password.');
      return;
    }
    if (passwords.new.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await changePassword(passwords.new);
      if (result.success) {
        await verifyWithBackend();
        // Students pick their profile icon right after the password —
        // teachers (rare on this page) go straight in.
        if (role === 'teacher') finishToApp();
        else setStep('avatar');
      } else {
        setError(result.error || 'Failed to change password');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-transparent">
      <motion.div
        className="w-full max-w-sm"
        key={step}
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Lock size={18} className="text-white" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Udaya</span>
        </div>

        {step === 'avatar' ? (
        <div className="glass-panel border border-white/60 p-8 rounded-2xl shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2 mb-1">
            <UserCircle2 size={18} className="text-neutral-700" />
            <h1 className="text-xl font-semibold">Pick your profile icon</h1>
          </div>
          <p className="text-sm text-neutral-500 mb-6">Choose an icon for your profile. You can upload your own photo later from your Profile page.</p>

          <AvatarPresetPicker
            value={pickedAvatar === undefined ? user?.avatar_url : pickedAvatar}
            size="lg"
            onSaved={(url) => {
              setPickedAvatar(url);
              // Keep the in-memory session in sync so the top bar updates instantly.
              if (user) setUser({ ...user, avatar_url: url }, role);
            }}
          />

          <button
            onClick={finishToApp}
            className="w-full mt-8 py-2 bg-ink text-white rounded-pill font-medium hover:bg-neutral-800 transition-colors text-sm"
          >
            {pickedAvatar !== undefined ? 'Continue' : 'Skip for now'}
          </button>
        </div>
        ) : (
        <div className="glass-panel border border-white/60 p-8 rounded-2xl shadow-lg backdrop-blur-md">
          <h1 className="text-xl font-semibold mb-1">Create New Password</h1>
          <p className="text-sm text-neutral-500 mb-6">You must change your password before continuing</p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">New Password</label>
              <div className="relative">
                <input
                  type={showPwd.new ? 'text' : 'password'}
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                  className="w-full px-3 py-2 pr-9 rounded-lg bg-white/50 border border-white/60 focus:border-neutral-400 focus:ring-2 focus:ring-white/50 outline-none text-sm backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd({ ...showPwd, new: !showPwd.new })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 p-1"
                >
                  {showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPwd.confirm ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full px-3 py-2 pr-9 rounded-lg bg-white/50 border border-white/60 focus:border-neutral-400 focus:ring-2 focus:ring-white/50 outline-none text-sm backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd({ ...showPwd, confirm: !showPwd.confirm })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 p-1"
                >
                  {showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {passwords.new && passwords.confirm && passwords.new === passwords.confirm && (
              <div className="text-xs text-green-600 flex items-center gap-1.5">
                <CheckCircle size={12} /> Passwords match
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle size={12} /> {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2 bg-ink text-white rounded-pill font-medium hover:bg-neutral-800 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Saving...' : 'Set Password & Continue'}
            </button>
          </div>
        </div>
        )}

        <p className="text-center text-xs text-neutral-400 mt-6">Udaya · A learning platform built for tuition</p>
      </motion.div>
    </div>
  );
}