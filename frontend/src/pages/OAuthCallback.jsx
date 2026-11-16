import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const OAuthCallback = () => {
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return undefined;
    }

    let active = true;
    let unsubscribe;

    const exchangeSession = async (session) => {
      if (!active || !session?.access_token) return;
      try {
        const res = await api.post('/auth/oauth-exchange', {
          access_token: session.access_token,
        });
        if (!active) return;
        login(res.data.user);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        if (!active) return;
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            'Could not complete sign-in. Please try again.'
        );
        setToast('OAuth session exchange failed.');
      }
    };

    const finish = (result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (result.data?.session) {
        exchangeSession(result.data.session);
        return;
      }
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        exchangeSession(session);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    };

    supabase.auth.getSession().then(finish).catch((err) => {
      if (active) setError(err.message || 'Could not read the OAuth session.');
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Toast message={toast} onClose={() => setToast('')} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="frosted-card w-full max-w-md rounded-3xl p-8 text-center shadow-2xl"
      >
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
              <AlertCircle className="text-red-400" size={30} />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Sign-in failed</h2>
            <p className="mb-6 text-sm text-zinc-400">{error}</p>
            <Link
              to="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-cyan-500 font-bold text-obsidian transition-colors hover:bg-cyan-400"
            >
              Back to Sign In
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10">
              <Loader2 className="animate-spin text-cyan-400" size={30} />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Completing sign-in</h2>
            <p className="text-sm text-zinc-400">Securing your BotNoob session…</p>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default OAuthCallback;
