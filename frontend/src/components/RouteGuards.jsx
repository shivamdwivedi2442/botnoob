import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect } from 'react';

export const ProtectedRoute = ({ adminOnly = false }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-obsidian flex items-center justify-center text-cyan-500">Loading...</div>;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export const PublicOnlyRoute = () => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-obsidian flex items-center justify-center text-cyan-500">Loading...</div>;

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export const MetaTags = ({ noIndex = false }) => {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = noIndex ? 'noindex, nofollow' : 'index, follow';
  }, [noIndex]);

  return null;
};
