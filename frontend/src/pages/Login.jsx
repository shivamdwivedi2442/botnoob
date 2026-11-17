import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Github, Mail, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import api from '../services/api';
import Toast from '../components/Toast';
import { startOAuth } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleOAuth = async (provider) => {
    setError('');
    try {
      await startOAuth(provider, `${window.location.origin}/auth/callback`);
    } catch (err) {
      setToast(err.message || 'Social sign-in is unavailable right now.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      login(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toast message={toast} onClose={() => setToast('')} />
      <div className="w-full max-w-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="frosted-card rounded-3xl p-8 shadow-2xl"
        >
          <h2 className="text-3xl font-bold mb-2">Welcome Back</h2>
          <p className="text-zinc-500 text-sm mb-8">Access your bot studio and workspace.</p>

          <div className="space-y-4 mb-8">
            <button
              type="button"
              onClick={() => handleOAuth('github')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-obsidian rounded-xl font-bold hover:bg-zinc-200 transition-colors"
            >
              <Github size={20} /> Sign In with GitHub
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 text-white rounded-xl font-bold hover:bg-zinc-700 transition-colors"
            >
              <Mail size={20} /> Sign In with Google
            </button>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-900 px-2 text-zinc-500">Or email login</span></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Email</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none transition-all"
                placeholder="name@company.com"
              />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Password</label>
                <Link to="/forgot-password" size={12} className="text-xs font-bold text-cyan-400 hover:underline">Forgot?</Link>
              </div>
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
            </div>

            {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12}/> {error}</p>}

            <Turnstile siteKey={turnstileSiteKey} className="flex justify-center" />

            <button 
              type="submit" 
              disabled={loading}
              className="w-full h-14 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2"
            >
              {loading ? 'Authenticating...' : <>Sign In <ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500">
            New to Botnoob? <Link to="/signup" className="text-cyan-400 font-bold hover:underline">Create an account</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
