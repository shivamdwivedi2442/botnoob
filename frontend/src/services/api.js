import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// CSRF & Interceptors
api.interceptors.request.use(async (config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('X-CSRF-Token='))
    ?.split('=')[1];

  if (csrfToken) {
    config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
  }

  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRequest = /\/auth\/(login|signup|verify-otp|check-user|oauth-exchange|session\/exchange|session\/sync-password|refresh)/.test(
      originalRequest?.url || ''
    );

    // If Supabase session is active, don't try local /refresh
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
       return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;
      try {
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
