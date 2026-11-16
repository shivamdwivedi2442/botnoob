import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState('error');
  const { checkUser } = useAuth();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setCheckingSession(false);
      return undefined;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionReady(true);
        setCheckingSession(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSessionReady(Boolean(data?.session));
        setCheckingSession(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Could not validate the password reset link.');
        setCheckingSession(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const showToast = (message, variant = 'error') => {
    setToastVariant(variant);
    setToast(message);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your reset link is invalid or has expired. Request a new one.');
      }

      const accessToken = session.access_token;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      await api.post('/auth/session/sync-password', {
        access_token: accessToken,
        password: newPassword,
      });

      await checkUser();
      setDone(true);
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err?.message ||
        'Could not update your password. Please request a new reset link.';
      setError(message);
      showToast(message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center text-cyan-500">
        Validating reset link...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toast message={toast} variant={toastVariant} onClose={() => setToast('')} />
      <div className="w-full max-w-md">
        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="frosted-card rounded-3xl p-8 shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/20">
              <CheckCircle2 className="text-green-500" size={32} />
            </div>
            <h2 className="text-3xl font-bold mb-2">Password Updated</h2>
            <p className="text-zinc-500 text-sm mb-8">
              Your new password is active everywhere. Sign in with it from now on.
            </p>
            <Link
              to="/dashboard"
              className="w-full inline-flex h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] items-center justify-center"
            >
              Continue to Dashboard
            </Link>
          </motion.div>
        ) : !sessionReady ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="frosted-card rounded-3xl p-8 shadow-2xl text-center"
          >
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertCircle className="text-red-400" size={32} />
            </div>
            <h2 className="text-3xl font-bold mb-2">Invalid Reset Link</h2>
            <p className="text-zinc-500 text-sm mb-8">
              {error || 'This password reset link is invalid or has expired.'}
            </p>
            <Link
              to="/forgot-password"
              className="w-full inline-flex h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] items-center justify-center"
            >
              Request a New Link
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="frosted-card rounded-3xl p-8 shadow-2xl"
          >
            <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyan-500/20">
              <ShieldCheck className="text-cyan-400" size={32} />
            </div>
            <h2 className="text-3xl font-bold mb-2 text-center">Choose a New Password</h2>
            <p className="text-zinc-500 text-sm mb-8 text-center">Your reset link is verified. Enter a new password below.</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none transition-all"
                    placeholder="Enter at least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none transition-all"
                  placeholder="Re-enter your new password"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
