import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, MetaTags } from './components/RouteGuards';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Pages
import Home from './pages/Home';
import Signup from './pages/Signup';
import OAuthCallback from './pages/OAuthCallback';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import HowItWorks from './pages/HowItWorks';
import StudioApp from './pages/StudioApp';

// Lazy Loaded Pages
const Login = lazy(() => import('./pages/Login'));
const Templates = lazy(() => import('./pages/Templates'));
const Plugins = lazy(() => import('./pages/Plugins'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Docs = lazy(() => import('./pages/Docs'));
const Blog = lazy(() => import('./pages/Blog'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-obsidian flex flex-col relative overflow-x-hidden">
          <Navbar />
          <main className="flex-grow min-w-0">
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Public Pages */}
                <Route path="/" element={<><MetaTags /><Home /></>} />
                <Route path="/templates" element={<><MetaTags /><Templates /></>} />
                <Route path="/how-it-works" element={<><MetaTags /><HowItWorks /></>} />
                <Route path="/studio-app" element={<><MetaTags /><StudioApp /></>} />
                <Route path="/plugins" element={<><MetaTags /><Plugins /></>} />
                <Route path="/pricing" element={<><MetaTags /><Pricing /></>} />
                <Route path="/docs" element={<><MetaTags /><Docs /></>} />
                <Route path="/blog" element={<><MetaTags /><Blog /></>} />
                <Route path="/auth/callback" element={<><MetaTags noIndex /><OAuthCallback /></>} />
                <Route path="/reset-password" element={<><MetaTags noIndex /><ResetPassword /></>} />

                {/* Public Only (Auth) */}
                <Route element={<PublicOnlyRoute />}>
                  <Route path="/signup" element={<><MetaTags noIndex /><Signup /></>} />
                  <Route path="/login" element={<><MetaTags noIndex /><Login /></>} />
                  <Route path="/forgot-password" element={<><MetaTags noIndex /><ForgotPassword /></>} />
                </Route>

                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<><MetaTags noIndex /><Dashboard /></>} />
                </Route>
                
                <Route element={<ProtectedRoute adminOnly />}>
                  <Route path="/super-admin" element={<><MetaTags noIndex /><SuperAdmin /></>} />
                </Route>
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
