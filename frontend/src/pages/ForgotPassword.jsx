import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowRight, Mail } from 'lucide-react';
import Toast from '../components/Toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const RESET_REDIRECT_URL = 'https://botnoob.new.tg/reset-password';

const ForgotPassword = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState('error');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const showToast = (message, variant = 'error') => {
    setToastVariant(variant);
    setToast(message);
  };

  const sendResetLink = async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: RESET_REDIRECT_URL }
    );
    if (resetError) throw resetError;
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await sendResetLink();
      setResendCooldown(60);
      setStep(2);
    } catch (err) {
      setError(err?.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      await sendResetLink();
      setResendCooldown(60);
      showToast('A new password reset link has been sent to your email.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to resend reset link.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toast message={toast} variant={toastVariant} onClose={() => setToast('')} />
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="frosted-card rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-3xl font-bold mb-2">Reset Password</h2>
              <p className="text-zinc-500 text-sm mb-8">Enter your email and we'll send you a secure reset link.</p>

              <form onSubmit={handleRequestReset} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none transition-all"
                    placeholder="name@company.com"
                  />
                </div>

                {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12}/> {error}</p>}

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
                >
                  {loading ? 'Sending...' : <>Send Reset Link <ArrowRight size={18} /></>}
                </button>
              </form>

              <p className="mt-8 text-center text-xs text-zinc-500">
                Remember your password? <Link to="/login" className="text-cyan-400 font-bold hover:underline">Sign In</Link>
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="frosted-card rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyan-500/20">
                <Mail className="text-cyan-400" size={32} />
              </div>
              <h2 className="text-3xl font-bold mb-2">Check Your Email</h2>
              <p className="text-zinc-500 text-sm mb-8">
                We sent a password reset link to <br />
                <span className="text-white font-bold">{email.trim().toLowerCase()}</span>
              </p>

              <p className="text-center text-xs text-zinc-500 mb-6">
                Didn't receive the link?{' '}
                <button
                  type="button"
                  onClick={handleResendLink}
                  disabled={resendCooldown > 0 || resending}
                  className="text-cyan-400 font-bold hover:underline disabled:text-zinc-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {resending
                    ? 'Sending...'
                    : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend'}
                </button>
              </p>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
                className="text-xs font-bold text-zinc-400 hover:text-cyan-400"
              >
                Use a different email
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ForgotPassword;
