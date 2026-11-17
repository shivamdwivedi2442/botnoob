import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutGrid, User, LogOut, ChevronDown, Menu, X, Cpu } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { label: 'Templates', to: '/templates' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Studio App', to: '/studio-app' },
  { label: 'Plugins', to: '/plugins' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' }
];

const Navbar = () => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenus = () => {
    setDropdownOpen(false);
    setMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-obsidian/80 backdrop-blur-lg border-b border-zinc-800" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-8 min-w-0">
            <Link to="/" onClick={closeMenus} className="flex items-center gap-2 min-w-0" aria-label="Botnoob home">
              <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent font-mono">
                Botnoob
              </span>
              <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                <div className="systems-pulse"></div>
                <span className="text-[10px] uppercase tracking-wider text-green-500 font-bold whitespace-nowrap">Systems Operational</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400 font-medium">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} className="hover:text-cyan-400 transition-colors">{link.label}</Link>
              ))}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 shrink-0">
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
                    aria-label="User profile menu"
                    aria-haspopup="true"
                    aria-expanded={dropdownOpen}
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
                          onClick={closeMenus}
                        >
                          <LayoutGrid size={14} /> My Workspace
                        </Link>
                        <Link 
                          to="/dashboard?openVault=true" 
                          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-cyan-400 transition-colors"
                          onClick={closeMenus}
                        >
                          <Cpu size={14} /> BYOK &amp; MCP
                        </Link>
                        {user.role === 'super_admin' && (
                          <Link 
                            to="/super-admin" 
                            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-cyan-400 transition-colors"
                            onClick={closeMenus}
                          >
                            <User size={14} /> Super Admin
                          </Link>
                        )}
                        <button 
                          onClick={() => { logout(); closeMenus(); }}
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

          <button
            type="button"
            onClick={() => { setMenuOpen((open) => !open); setDropdownOpen(false); }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="md:hidden p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-cyan-400 transition-colors shrink-0"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden border-t border-zinc-800 bg-obsidian/95 backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={closeMenus}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-3 border-t border-zinc-800 space-y-2">
                {!user ? (
                  <>
                    <Link to="/login" onClick={closeMenus} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors">Sign In</Link>
                    <Link to="/signup" onClick={closeMenus} className="block px-3 py-2.5 rounded-lg text-sm font-bold text-center bg-cyan-500 text-obsidian hover:bg-cyan-400 transition-colors">Get Started</Link>
                  </>
                ) : (
                  <>
                    <p className="px-3 text-xs text-zinc-500 truncate">{user.email}</p>
                    <Link to="/dashboard" onClick={closeMenus} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400 transition-colors"><LayoutGrid size={15} /> Dashboard</Link>
                    <Link to="/dashboard?openVault=true" onClick={closeMenus} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400 transition-colors"><Cpu size={15} /> BYOK &amp; MCP</Link>
                    <Link to="/dashboard?openSupport=true" onClick={closeMenus} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400 transition-colors"><User size={15} /> Support</Link>
                    {user.role === 'super_admin' && (
                      <Link to="/super-admin" onClick={closeMenus} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-900 hover:text-cyan-400 transition-colors"><User size={15} /> Super Admin</Link>
                    )}
                    <button onClick={() => { logout(); closeMenus(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-zinc-900 transition-colors text-left"><LogOut size={15} /> Logout</button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
