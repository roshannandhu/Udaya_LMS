import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../lib/auth';

export default function StudentChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword, verifyWithBackend, user, role } = useAuthStore();
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [showPwd, setShowPwd] = useState({ new: false, confirm: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        navigate(role === 'teacher' ? '/teacher' : '/student', { replace: true });
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
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center">
            <Lock size={18} className="text-white" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Udaya</span>
        </div>

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
              className="w-full py-2 bg-neutral-900 text-white rounded-md font-medium hover:bg-neutral-800 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Saving...' : 'Set Password & Continue'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-neutral-400 mt-6">Udaya · A learning platform built for tuition</p>
      </div>
    </div>
  );
}