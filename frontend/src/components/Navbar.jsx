import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutGrid, User, LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-obsidian/80 backdrop-blur-lg border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent font-mono">
                Botnoob
              </span>
              <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                <div className="systems-pulse"></div>
                <span className="text-[10px] uppercase tracking-wider text-green-500 font-bold">Systems Operational</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400 font-medium">
              <Link to="/templates" className="hover:text-cyan-400 transition-colors">Templates</Link>
              <Link to="/how-it-works" className="hover:text-cyan-400 transition-colors">How It Works</Link>
              <Link to="/studio-app" className="hover:text-cyan-400 transition-colors">Studio App</Link>
              <Link to="/plugins" className="hover:text-cyan-400 transition-colors">Plugins</Link>
              <Link to="/pricing" className="hover:text-cyan-400 transition-colors">Pricing</Link>
              <Link to="/docs" className="hover:text-cyan-400 transition-colors">Docs</Link>
              <Link to="/blog" className="hover:text-cyan-400 transition-colors">Blog</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {!user ? (
              <>
                <Link to="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Sign In</Link>
                <Link to="/signup" className="px-4 py-2 text-sm font-bold bg-cyan-500 hover:bg-cyan-400 text-obsidian rounded-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                  Get Started
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link to="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-zinc-900 border border-zinc-800 text-cyan-400 rounded-lg hover:border-cyan-500/50 transition-all shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                  <LayoutGrid size={16} />
                  Dashboard
                </Link>
                
                <div className="relative">
                  <button 
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 p-1 rounded-full hover:bg-zinc-800 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 p-[1px]">
                      <div className="w-full h-full rounded-full bg-obsidian flex items-center justify-center">
                        <User size={16} className="text-zinc-400" />
                      </div>
                    </div>
                    <ChevronDown size={14} className={`text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 frosted-card rounded-xl py-2 shadow-2xl z-[60]"
                      >
                        <div className="px-4 py-2 border-b border-zinc-800 mb-2">
                          <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        </div>
                        <Link 
                          to="/dashboard" 
                          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-cyan-400 transition-colors"
                          onClick={() => setDropdownOpen(false)}
                        >
                          <LayoutGrid size={14} /> My Workspace
                        </Link>
                        { user.role === 'super_admin' && (
                          <Link 
                            to="/super-admin" 
                            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-cyan-400 transition-colors"
                            onClick={() => setDropdownOpen(false)}
                          >
                            <User size={14} /> Super Admin
                          </Link>
                        )}
                        <button 
                          onClick={() => { logout(); setDropdownOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors text-left"
                        >
                          <LogOut size={14} /> Logout
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
