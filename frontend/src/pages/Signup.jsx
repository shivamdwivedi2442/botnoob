import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, Mail, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import api from '../services/api';
import Toast from '../components/Toast';
import { supabase, isSupabaseConfigured, startOAuth } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

const Signup = () => {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState('error');
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const showToast = (message, variant = 'error') => {
    setToastVariant(variant);
    setToast(message);
  };

  const handleOAuth = async (provider) => {
    setError('');
    try {
      await startOAuth(provider, `${window.location.origin}/auth/callback`);
    } catch (err) {
      showToast(err.message || 'Social sign-in is unavailable right now.');
    }
  };

  const handleCheckUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/check-user', { email: email.trim().toLowerCase() });
      if (res.data.exists) {
        setAlreadyRegistered(true);
      } else {
        setAlreadyRegistered(false);
        setStep(2);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'System verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: undefined },
      });
      if (signUpError) throw signUpError;
      setResendCooldown(60);
      setStep(3);
    } catch (err) {
      setError(err?.message || err.response?.data?.message || err.response?.data?.error || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError('');
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      if (resendError) throw resendError;
      setResendCooldown(60);
      showToast('A new verification code has been sent to your email.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const token = otp.join('');
    if (token.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      setLoading(false);
      return;
    }
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: 'signup',
      });
      if (verifyError) throw verifyError;
      if (!data?.session?.access_token) {
        throw new Error('Email verification did not return a session. Please try again.');
      }
      const res = await api.post('/auth/session/exchange', {
        session_token: data.session.access_token,
        turnstile_token: turnstileToken,
        password,
      });
      login(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err?.message ||
          'Invalid OTP code.'
      );
    } finally {
      setLoading(false);
    }
  };

  const calculatePasswordStrength = (pass) => {
    if (!pass) return 0;
    let strength = 0;
    if (pass.length > 8) strength += 25;
    if (/[A-Z]/.test(pass)) strength += 25;
    if (/[0-9]/.test(pass)) strength += 25;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 25;
    return strength;
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toast message={toast} variant={toastVariant} onClose={() => setToast('')} />
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="frosted-card rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-3xl font-bold mb-2">Create Account</h2>
              <p className="text-zinc-500 text-sm mb-8">Deploy your first AI bot in under 60 seconds.</p>

              <div className="space-y-4 mb-8">
                <button
                  type="button"
                  onClick={() => handleOAuth('github')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-obsidian rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                >
                  <Github size={20} /> Continue with GitHub
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 text-white rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                >
                  <Mail size={20} /> Continue with Google
                </button>
              </div>

              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-900 px-2 text-zinc-500">Or continue with email</span></div>
              </div>

              <form onSubmit={handleCheckUser} className="space-y-6">
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
                  {alreadyRegistered && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
                      <AlertCircle size={12} /> Already registered. <Link to="/login" className="underline font-bold">Sign In instead?</Link>
                    </motion.p>
                  )}
                </div>

                <Turnstile siteKey={turnstileSiteKey} onSuccess={setTurnstileToken} className="flex justify-center" />

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
                >
                  {loading ? 'Verifying...' : <>Continue <ArrowRight size={18} /></>}
                </button>
              </form>

              <p className="mt-8 text-center text-xs text-zinc-500">
                By signing up, you agree to our <Link to="/terms" className="text-zinc-300 underline">Terms of Service</Link> and <Link to="/privacy" className="text-zinc-300 underline">Privacy Policy</Link>.
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="frosted-card rounded-3xl p-8 shadow-2xl"
            >
              <button onClick={() => setStep(1)} className="text-xs font-bold text-cyan-400 mb-6 flex items-center gap-1">
                ← Back to email
              </button>
              <h2 className="text-3xl font-bold mb-2">Secure Your Account</h2>
              <p className="text-zinc-500 text-sm mb-8">Set a password for {email}</p>

              <form onSubmit={handleSignup} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Password</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none transition-all"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="mt-3 flex gap-1 h-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`flex-grow rounded-full transition-all ${calculatePasswordStrength(password) >= i * 25 ? 'bg-cyan-500' : 'bg-zinc-800'}`}></div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Password Strength</p>
                </div>

                {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12}/> {error}</p>}

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
                >
                  {loading ? 'Creating Account...' : <>Complete Signup <ShieldCheck size={18} /></>}
                </button>
              </form>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="frosted-card rounded-3xl p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/20">
                  <Mail className="text-cyan-400" size={32} />
                </div>
                <h2 className="text-3xl font-bold mb-2">Check Your Email</h2>
                <p className="text-zinc-500 text-sm">We sent a 6-digit verification code to <br /><span className="text-white font-bold">{email}</span></p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-8">
                <div className="flex justify-between gap-2">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const newOtp = [...otp];
                        newOtp[i] = e.target.value;
                        setOtp(newOtp);
                        if (e.target.value && e.target.nextSibling) e.target.nextSibling.focus();
                      }}
                      className="w-12 h-14 text-center bg-obsidian border border-zinc-800 rounded-xl text-xl font-bold focus:border-cyan-500 outline-none transition-all"
                    />
                  ))}
                </div>

                {error && <p className="text-red-400 text-xs text-center flex items-center justify-center gap-1"><AlertCircle size={12}/> {error}</p>}

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
                >
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>

                <p className="text-center text-xs text-zinc-500">
                  Didn't receive the code?{' '}
                  <button
                    type="button"
                    onClick={handleResendOtp}
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
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Signup;
