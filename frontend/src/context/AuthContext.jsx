import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkUser = async () => {
    try {
      let supabaseToken = null;
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        supabaseToken = data?.session?.access_token || null;
      }

      const res = await api.get('/auth/me', {
        headers: supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : undefined,
      });
      setUser(res.data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  const login = (userData) => setUser(userData);
  const logout = async () => {
    try {
      await api.post('/auth/logout');
      setUser(null);
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
