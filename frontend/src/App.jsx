import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicOnlyRoute, MetaTags } from './components/RouteGuards';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Pages
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Templates from './pages/Templates';
import HowItWorks from './pages/HowItWorks';
import StudioApp from './pages/StudioApp';
import Plugins from './pages/Plugins';
import Pricing from './pages/Pricing';
import Docs from './pages/Docs';
import Blog from './pages/Blog';
import Dashboard from './pages/Dashboard';
import SuperAdmin from './pages/SuperAdmin';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-obsidian flex flex-col relative overflow-hidden">
          <Navbar />
          <main className="flex-grow">
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
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
