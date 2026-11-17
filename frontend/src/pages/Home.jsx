import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Zap, Globe, Github, MessageSquare, Terminal, QrCode, Cpu, Code2, Check, Loader2, X, Copy, ArrowRight, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSEO } from '../hooks/useSEO';

const techBadges = [
  { label: 'Telegram API', icon: MessageSquare, to: '/docs' },
  { label: 'Discord.js', icon: Globe, to: '/docs' },
  { label: 'GitHub Sync', icon: Github, to: '/templates' },
  { label: 'Claude/Gemini BYOK', icon: Cpu, vault: true },
  { label: 'Lovable MCP', icon: Code2, vault: true },
  { label: 'SwiftUPI', icon: Terminal, to: '/pricing' }
];

const Home = () => {
  useSEO({
    title: 'Flagship AI Bot Studio & Automation Platform',
    description: 'Deploy professional AI bots in seconds. The ultimate studio for Telegram, Discord, and Web automation using advanced AI models.',
    keywords: 'AI bot studio, telegram bots, discord automation, Botnoob, AI agents',
    path: '/'
  });

  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [activePreview, setActivePreview] = useState('telegram');
  const [typingText, setTypingText] = useState('');
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const fullText = activePreview === 'telegram' ? '/create_bot' : '!deploy-mcp';

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypingText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) i = 0;
    }, 200);
    return () => clearInterval(interval);
  }, [activePreview]);

  useEffect(() => {
    let active = true;
    api.get('/billing/plans')
      .then((res) => {
        if (active) setPlans(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) setPlans([]);
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const generateBot = async (e) => {
    e.preventDefault();
    const description = prompt.trim();
    if (!description || generating || authLoading) return;

    if (!user) {
      setGenError('Sign in to generate a bot with your saved BYOK key.');
      return;
    }

    setGenerating(true);
    setGenError('');
    try {
      const res = await api.post(
        '/ai/generate-bot',
        { prompt: description },
        { timeout: 60000 }
      );
      setGenerated(res.data);
    } catch (err) {
      setGenError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Generation failed. Please try again.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = async () => {
    if (!generated?.code) return;
    try {
      await navigator.clipboard.writeText(generated.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setGenError('Could not copy the code. Select it manually.');
    }
  };

  const deployGenerated = () => {
    if (!generated) return;
    if (!user) {
      navigate('/login');
      return;
    }
    navigate('/dashboard', { state: { generatedBot: generated } });
  };

  return (
    <div className="relative">
      {/* Radial Spotlight Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto z-10">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Link
              to="/docs"
              aria-label="View documentation for version 2.0"
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-cyan-400 hover:border-cyan-500/50 transition-colors"
            >
              <Zap size={14} />
              <span>v2.0: Now with native MCP & SwiftUPI support</span>
            </Link>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-6"
          >
            Build AI Bots with <br />
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent cyan-glow">
              Zero-Lag Precision
            </span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto mb-10"
          >
            The world's most advanced AI bot studio. Deploy Telegram and Discord bots 
            with 1-click GitHub hosting, BYOK intelligence, and native SwiftUPI webhooks.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <div className="w-full max-w-md">
              <form onSubmit={generateBot} className="relative w-full">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your bot (e.g. A crypto news bot for Telegram)..."
                  className="w-full h-14 pl-12 pr-28 sm:pr-32 bg-zinc-900/50 border border-zinc-800 rounded-xl focus:border-cyan-500/50 outline-none text-sm transition-all"
                />
                <Bot className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
                <button
                  type="submit"
                  disabled={generating || authLoading || !prompt.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-cyan-500 text-obsidian text-sm font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : null}
                  {generating ? 'Generating' : 'Generate'}
                </button>
              </form>
              <p className="text-[10px] text-zinc-500 mt-2 text-center">Uses your BYOK key · 5 generations/hour</p>
              {genError && <p className="text-xs text-red-400 mt-2 text-center">{genError}</p>}
            </div>
            <Link
              to="/templates"
              className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-cyan-500/50 transition-colors"
            >
              <Github size={20} className="text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">Quick-Deploy Repo</span>
              <ArrowRight size={16} className="text-zinc-500" />
            </Link>
          </motion.div>
        </div>

        {/* Stack Bar */}
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-70 hover:opacity-100 transition-all duration-500 py-8 border-y border-zinc-900/50 mb-20" role="list">
          {techBadges.map(({ label, icon: Icon, to, vault }) => (
            <Link
              key={label}
              to={vault ? (user ? '/dashboard?openVault=true' : '/login') : to}
              aria-label={`Learn more about ${label}`}
              className="flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-cyan-400 transition-colors"
              role="listitem"
            >
              <Icon size={18} aria-hidden="true" /> {label}
            </Link>
          ))}
        </div>

        {/* Interactive Live Preview Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-32">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold mb-6">Real-Time Interaction Preview</h2>
            <p className="text-zinc-400 mb-8">
              Test your bot's logic instantly. See how your SwiftUPI components render 
              on mobile devices via live QR sync. Zero lag, 100% precision.
            </p>
            <div className="flex gap-4 mb-8">
              <button 
                onClick={() => setActivePreview('telegram')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activePreview === 'telegram' ? 'bg-cyan-500 text-obsidian' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
              >
                Telegram
              </button>
              <button 
                onClick={() => setActivePreview('discord')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activePreview === 'discord' ? 'bg-indigo-500 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
              >
                Discord
              </button>
            </div>
            
            <div className="frosted-card rounded-2xl p-6 aspect-video flex flex-col relative overflow-hidden">
               <div className="flex items-center gap-2 mb-4 border-b border-zinc-800 pb-4">
                  <div className={`w-3 h-3 rounded-full ${activePreview === 'telegram' ? 'bg-cyan-500' : 'bg-indigo-500'}`}></div>
                  <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{activePreview} LIVE PREVIEW</span>
               </div>
               <div className="flex-grow font-mono text-sm space-y-4">
                  <div className="flex gap-3">
                    <span className="text-zinc-600">User:</span>
                    <span className="text-zinc-300">{typingText}<span className="animate-pulse">|</span></span>
                  </div>
                  {typingText.length === fullText.length && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <span className={`${activePreview === 'telegram' ? 'text-cyan-500' : 'text-indigo-400'}`}>Botnoob:</span>
                      <span className="text-zinc-300">Initializing secure session... SwiftUPI component ready.</span>
                    </motion.div>
                  )}
               </div>
               {/* Mobile QR Shadow */}
               <div className="absolute bottom-4 right-4 w-16 h-16 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">
                  <QrCode size={24} className="text-cyan-400 opacity-50" />
               </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
             <div className="absolute -inset-4 bg-cyan-500/20 blur-3xl rounded-full z-0"></div>
             <div className="relative bg-zinc-900 border border-zinc-800 rounded-3xl p-2 z-10">
                <div className="bg-obsidian rounded-2xl p-8 border border-zinc-800">
                   <div className="flex items-center justify-between mb-8">
                      <div className="space-y-1">
                        <h4 className="font-bold text-xl">SwiftUPI Preview</h4>
                        <p className="text-xs text-zinc-500">Live render on iOS/Android</p>
                      </div>
                      <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                        <QrCode size={40} className="text-cyan-400" />
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div className="h-12 w-full bg-zinc-900 rounded-xl border border-zinc-800 flex items-center px-4 justify-between">
                         <span className="text-sm font-medium">Bot Status</span>
                         <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded">ACTIVE</span>
                      </div>
                      <div className="h-12 w-full bg-zinc-900 rounded-xl border border-zinc-800 flex items-center px-4 justify-between">
                         <span className="text-sm font-medium">MCP Nodes</span>
                         <span className="text-sm font-mono text-zinc-500">4 Connected</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="h-24 bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-2xl p-4">
                            <p className="text-[10px] text-cyan-400 font-bold uppercase mb-2">Memory</p>
                            <p className="text-2xl font-bold">128MB</p>
                         </div>
                         <div className="h-24 bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 rounded-2xl p-4">
                            <p className="text-[10px] text-indigo-400 font-bold uppercase mb-2">Requests</p>
                            <p className="text-2xl font-bold">12.4k</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </motion.div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-32">
          <Link to="/pricing" className="md:col-span-2 frosted-card rounded-3xl p-8 hover:border-cyan-500/30 transition-all group">
             <Bot className="text-cyan-500 mb-6 group-hover:scale-110 transition-transform" size={32} />
             <h3 className="text-2xl font-bold mb-2">10 Free BYOK Bots</h3>
             <p className="text-zinc-500">Bring your own keys (Claude, Gemini, OpenAI) and host up to 10 bots on our high-performance edge network for free.</p>
          </Link>
          <Link to="/templates" className="frosted-card rounded-3xl p-8 hover:border-cyan-500/30 transition-all group">
             <Github className="text-white mb-6 group-hover:scale-110 transition-transform" size={32} />
             <h3 className="text-xl font-bold mb-2">1-Click Hosting</h3>
             <p className="text-zinc-500 text-sm">Seamless GitHub sync. Push code, we deploy. Automatic CI/CD included.</p>
          </Link>
          <Link to="/studio-app" className="frosted-card rounded-3xl p-8 hover:border-cyan-500/30 transition-all group">
             <Terminal className="text-indigo-400 mb-6 group-hover:scale-110 transition-transform" size={32} />
             <h3 className="text-xl font-bold mb-2">Zero-Lag Studio</h3>
             <p className="text-zinc-500 text-sm">Download our native desktop app for a latency-free development experience.</p>
          </Link>
          <Link to="/pricing" className="md:col-span-4 frosted-card rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 hover:border-cyan-500/30 transition-all group">
             <div>
                <h3 className="text-3xl font-bold mb-2">Native SwiftUPI Webhooks</h3>
                <p className="text-zinc-500 max-w-xl">Render complex UI components directly inside Telegram and Discord. Native performance, no external webviews required.</p>
             </div>
             <div className="flex gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-cyan-400 font-bold border border-zinc-700">JS</div>
                <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-indigo-400 font-bold border border-zinc-700">TS</div>
                <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-white font-bold border border-zinc-700">PY</div>
             </div>
          </Link>
        </div>

        {/* Live Pricing */}
        <div className="mb-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Live Pricing</h2>
            <p className="text-zinc-500">Prices and bot limits load directly from the Super Admin pricing config.</p>
          </div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-10 text-zinc-500">
              <Loader2 className="animate-spin mr-2" size={20} /> Loading live plans...
            </div>
          ) : plans.length === 0 ? (
            <div className="frosted-card rounded-2xl p-8 text-center text-sm text-zinc-500">
              Live pricing is temporarily unavailable. Visit the pricing page to retry.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const features = [
                  `Up to ${plan.max_bots} bots`,
                  plan.features?.byok ? 'Bring Your Own Keys' : null,
                  plan.features?.uptime_24_7 ? '24/7 Uptime' : null,
                  plan.features?.built_in_ai ? 'Built-in AI Credits' : null,
                  plan.features?.mcp ? 'MCP Support' : null
                ].filter(Boolean);

                return (
                  <Link
                    key={plan.plan_name}
                    to="/pricing"
                    className={`frosted-card rounded-3xl p-6 hover:border-cyan-500/50 transition-all ${
                      plan.plan_name === 'byok_pro' ? 'border-cyan-500/40' : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold capitalize">{plan.plan_name.replace('_', ' ')}</h3>
                      {plan.plan_name === 'byok_pro' && (
                        <span className="text-[9px] font-bold uppercase text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="mb-5">
                      <span className="text-3xl font-bold">₹{plan.price_monthly}</span>
                      <span className="text-zinc-500 text-sm">/month</span>
                    </div>
                    <ul className="space-y-2">
                      {features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-xs text-zinc-400">
                          <Check size={14} className="text-cyan-500 shrink-0" /> {feature}
                        </li>
                      ))}
                    </ul>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="text-center mt-8">
            <Link to="/pricing" className="text-sm font-bold text-cyan-400 hover:text-cyan-300">
              View full pricing &rarr;
            </Link>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {generated && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGenerated(null)}
              className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative w-full max-w-3xl frosted-card rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                    <Sparkles size={12} /> AI generated bot
                  </p>
                  <h2 className="text-2xl font-bold mt-1">{generated.name}</h2>
                </div>
                <button onClick={() => setGenerated(null)} className="text-zinc-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                  {generated.platform}
                </span>
                <span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  {generated.env_vars?.length || 0} env vars
                </span>
                {generated.provider && (
                  <span className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    {generated.provider} / {generated.model}
                  </span>
                )}
              </div>

              <div className="bg-obsidian border border-zinc-800 rounded-2xl overflow-hidden flex-grow min-h-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">bot.js</span>
                  <button onClick={copyCode} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 text-[11px] leading-relaxed font-mono text-zinc-300 overflow-auto max-h-[42vh] custom-scrollbar">
                  <code>{generated.code}</code>
                </pre>
              </div>

              {generated.env_vars?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-2">Suggested env vars</p>
                  <div className="flex flex-wrap gap-2">
                    {generated.env_vars.map((name) => (
                      <code key={name} className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-cyan-300">
                        {name}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-amber-400/80 mt-4">
                Review the code before deploying. It runs with your bot token and the env vars you provide.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  onClick={copyCode}
                  className="flex-1 py-3 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-300 hover:border-cyan-500/40 transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />} Copy code
                </button>
                <button
                  onClick={deployGenerated}
                  className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-obsidian text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {user ? '1-Click Deploy to Dashboard' : 'Sign in to Deploy'} <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;
