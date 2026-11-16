import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Github, MessageSquare, Globe, Play, Square, Eye, EyeOff, Share2,
  Cpu, ShieldCheck, RotateCw, Trash2, Terminal, Settings2, Code2,
  X, Copy, KeyRound, Loader2, AlertCircle, Crown, LifeBuoy, Ticket, CheckCircle, Send
} from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';

const emptyBot = {
  name: '',
  platform: 'telegram',
  bot_token: '',
  github_repo_url: '',
  template: 'starter',
  code: '',
  env_vars: {}
};

const detectKeyProvider = (value) => {
  const key = String(value || '').trim();
  if (key.startsWith('AIza') || key.startsWith('AQ.')) return 'gemini';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  return null;
};

const providerLabels = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };

const providerBadgeClasses = {
  gemini: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  openai: 'text-green-400 border-green-500/30 bg-green-500/10',
  anthropic: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'
};

const errorMessage = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error || err.message || fallback;

let envRowCounter = 0;
const createEnvRow = (key = '', value = '') => ({
  id: `env-${(envRowCounter += 1)}`,
  key,
  value,
  reveal: false
});

const Dashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [bots, setBots] = useState([]);
  const [slots, setSlots] = useState({ used: 0, limit: 10 });
  const [keys, setKeys] = useState([]);
  const [keySlots, setKeySlots] = useState({ used: 0, limit: 10 });
  const [mcpUrl, setMcpUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState('error');
  const [revealedBot, setRevealedBot] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBot, setNewBot] = useState(emptyBot);
  const [isByokModalOpen, setIsByokModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);
  
  // Upgrade States
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState('byok_pro');
  const [upgradeCoupon, setUpgradeCoupon] = useState('');
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [livePlans, setLivePlans] = useState([]);
  
  // Support Ticket States
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [newTicket, setNewTicket] = useState({ subject: '', message: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const logsEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const didMountRef = useRef(false);

  const showToast = (message, variant = 'error') => {
    setToastVariant(variant);
    setToast(message);
  };

  const loadBots = useCallback(async () => {
    try {
      const res = await api.get('/bots');
      setBots(res.data.bots || []);
      setSlots(res.data.slots || { used: 0, limit: 10 });
    } catch (err) {
      showToast(errorMessage(err, 'Failed to load bots.'));
    }
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      const res = await api.get('/ai/keys');
      setKeys(res.data.keys || []);
      setKeySlots(res.data.slots || { used: 0, limit: 10 });
      setMcpUrl(res.data.mcpUrl || '');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to load BYOK keys.'));
    }
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const res = await api.get('/support/tickets');
      const nextTickets = Array.isArray(res.data) ? res.data : [];
      setTickets(nextTickets);
      setSelectedTicket((current) => {
        if (!current) return current;
        return nextTickets.find((ticket) => ticket.id === current.id) || current;
      });
    } catch (err) {}
  }, []);

  const loadPlans = async () => {
    try {
      const res = await api.get('/billing/plans');
      const plans = Array.isArray(res.data) ? res.data : [];
      setLivePlans(plans.filter((plan) => plan.plan_name !== 'free_byok'));
    } catch (err) {}
  };

  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    Promise.all([loadBots(), loadKeys(), loadTickets(), loadPlans()]).finally(() => setLoading(false));

    // Handle generated bot from Home.jsx
    if (location.state?.generatedBot) {
      const { generatedBot } = location.state;
      setNewBot({
        ...emptyBot,
        name: generatedBot.name || '',
        platform: generatedBot.platform || 'telegram',
        code: generatedBot.code || '',
        env_vars: (generatedBot.env_vars || []).reduce((acc, v) => ({ ...acc, [v]: '' }), {})
      });
      setIsCreateOpen(true);
      // Clear state so it doesn't re-open on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [loadBots, loadKeys, loadTickets, location.state, navigate, location.pathname]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies]);

  useEffect(() => {
    if (!isSupportOpen) return undefined;
    loadTickets();
    const interval = setInterval(loadTickets, 5000);
    return () => clearInterval(interval);
  }, [isSupportOpen, loadTickets]);

  const botAction = async (bot, action) => {
    const key = `${bot.id}:${action}`;
    setBusy(key);
    try {
      const res = await api.post(`/bots/${bot.id}/${action}`);
      showToast(res.data.message || `Bot ${action} requested.`, 'success');
      await loadBots();
    } catch (err) {
      showToast(errorMessage(err, `Failed to ${action} bot.`));
    } finally {
      setBusy('');
    }
  };

  const deleteBot = async (bot) => {
    if (!window.confirm(`Delete "${bot.name}" permanently?`)) return;
    setBusy(`${bot.id}:delete`);
    try {
      await api.delete(`/bots/${bot.id}`);
      showToast(`"${bot.name}" deleted.`, 'success');
      await loadBots();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete bot.'));
    } finally {
      setBusy('');
    }
  };

  const deployBot = async (e) => {
    e.preventDefault();
    setBusy('deploy');
    try {
      const res = await api.post('/bots/deploy', newBot);
      showToast(`"${res.data.bot?.name || newBot.name}" is live.`, 'success');
      setIsCreateOpen(false);
      setNewBot(emptyBot);
      await loadBots();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to deploy bot.'));
    } finally {
      setBusy('');
    }
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    setSubmittingTicket(true);
    try {
      const res = await api.post('/support/tickets', newTicket);
      showToast('Support ticket submitted.', 'success');
      setNewTicket({ subject: '', message: '' });
      if (res.data) {
        setTickets((current) => [res.data, ...current]);
        setSelectedTicket(res.data);
      }
      loadTickets();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to submit ticket.'));
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      const res = await api.post(`/support/tickets/${selectedTicket.id}/reply`, { message: replyText.trim() });
      setReplyText('');
      if (res.data) {
        setSelectedTicket(res.data);
        setTickets((current) => current.map((ticket) => (ticket.id === res.data.id ? res.data : ticket)));
      }
      loadTickets();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to send reply.'));
    } finally {
      setReplying(false);
    }
  };

  const toggleTicketStatus = async (ticket) => {
    if (!ticket) return;
    const nextStatus = ticket.status === 'resolved' ? 'open' : 'resolved';
    try {
      const res = await api.patch(`/support/tickets/${ticket.id}/status`, { status: nextStatus });
      const updated = res.data;
      if (updated) {
        setSelectedTicket((current) => (current && current.id === updated.id ? updated : current));
        setTickets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
      showToast(nextStatus === 'resolved' ? 'Ticket marked as resolved.' : 'Ticket reopened.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to update ticket status.'));
    }
  };

  const openUpgrade = () => {
    setUpgradeError('');
    setIsUpgradeOpen(true);
    loadPlans();
  };

  const startUpgrade = async (e) => {
    e.preventDefault();
    setUpgradeBusy(true);
    try {
      const res = await api.post('/billing/create-order', { plan_name: upgradePlan, coupon_code: upgradeCoupon });
      if (res.data?.checkout_url) window.location.assign(res.data.checkout_url);
    } catch (err) {
      setUpgradeError(errorMessage(err, 'Checkout failed.'));
    } finally {
      setUpgradeBusy(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
      <Toast message={toast} variant={toastVariant} onClose={() => setToast('')} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Workspace</h1>
          <p className="text-zinc-500 text-sm">Active Bots: <span className="text-cyan-400 font-bold">{slots.used} / {slots.limit}</span> BYOK Slots</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <button onClick={() => setIsSupportOpen(true)} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-all flex items-center gap-2">
            <LifeBuoy size={14} /> Support / Help
          </button>
          <button onClick={openUpgrade} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-2">
            <Crown size={14} /> Upgrade Plan
          </button>
          <button onClick={() => setIsByokModalOpen(true)} className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 hover:border-cyan-500/50 transition-all flex items-center gap-2">
            <Cpu size={14} /> BYOK & MCP
          </button>
          <button onClick={() => setIsCreateOpen(true)} disabled={slots.used >= slots.limit} className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-obsidian rounded-xl text-sm font-bold transition-all flex items-center gap-2">
            <Plus size={18} /> New Bot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button onClick={() => setIsCreateOpen(true)} disabled={slots.used >= slots.limit} className="frosted-card rounded-3xl p-8 border-dashed border-zinc-700 flex flex-col items-center justify-center text-center hover:border-cyan-500/50 disabled:opacity-50 transition-all group">
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-cyan-400 mb-4 transition-colors"><Github size={32} /></div>
          <h3 className="font-bold mb-1">Import from GitHub</h3>
          <p className="text-xs text-zinc-500">Deploy an existing repo or template.</p>
        </button>

        {loading ? (
          <div className="frosted-card rounded-3xl p-8 border-zinc-800 flex items-center justify-center text-sm text-zinc-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading...</div>
        ) : bots.map((bot) => (
          <motion.div key={bot.id} layout className="frosted-card rounded-3xl p-6 border-zinc-800 relative group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center ${bot.platform === 'telegram' ? 'text-cyan-400' : 'text-indigo-400'}`}>{bot.platform === 'telegram' ? <MessageSquare size={20} /> : <Globe size={20} />}</div>
                <div><h3 className="font-bold">{bot.name}</h3><span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">{bot.status}</span></div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => botAction(bot, bot.status === 'active' ? 'stop' : 'start')} className={`flex-grow py-2 rounded-lg border text-xs font-bold transition-all ${bot.status === 'active' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>{bot.status === 'active' ? 'Stop' : 'Start'}</button>
              <button onClick={() => deleteBot(bot)} className="p-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isSupportOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSupportOpen(false)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl frosted-card rounded-3xl p-8 shadow-2xl overflow-hidden h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="text-indigo-400" /> Support Center</h2>
                 <button onClick={() => setIsSupportOpen(false)} className="text-zinc-500 hover:text-white"><X /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow overflow-hidden">
                 <form onSubmit={submitTicket} className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">New Ticket</h3>
                    <input required value={newTicket.subject} onChange={(e) => setNewTicket({...newTicket, subject: e.target.value})} placeholder="Subject" className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500" />
                    <textarea required value={newTicket.message} onChange={(e) => setNewTicket({...newTicket, message: e.target.value})} placeholder="How can we help?" className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 h-32" />
                    <button type="submit" disabled={submittingTicket} className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-obsidian font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">{submittingTicket ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Submit Ticket</button>
                 </form>
                 <div className="flex flex-col overflow-hidden">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">My History</h3>
                    <div className="space-y-4 overflow-y-auto custom-scrollbar flex-grow">
                       {tickets.map(t => (
                         <div key={t.id} onClick={() => setSelectedTicket(t)} className={`bg-obsidian border rounded-xl p-4 cursor-pointer transition-all ${selectedTicket?.id === t.id ? 'border-indigo-500/50' : 'border-zinc-800 hover:border-zinc-700'}`}>
                            <div className="flex justify-between items-start mb-1">
                               <h4 className="font-bold text-xs truncate pr-2">{t.subject}</h4>
                               <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase ${t.status === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{t.status}</span>
                            </div>
                            <p className="text-[10px] text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</p>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              {selectedTicket && (
                 <div className="absolute inset-x-0 bottom-0 top-[100px] bg-zinc-950/95 z-10 flex flex-col">
                    <div className="p-4 border-b border-zinc-800 flex justify-between items-center gap-3">
                       <div className="min-w-0">
                          <h3 className="font-bold text-sm truncate">{selectedTicket.subject}</h3>
                          <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedTicket.status === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{selectedTicket.status}</span>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleTicketStatus(selectedTicket)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${selectedTicket.status === 'resolved' ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10' : 'border-green-500/30 text-green-300 hover:bg-green-500/10'}`}>
                             {selectedTicket.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                          </button>
                          <button onClick={() => setSelectedTicket(null)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
                       </div>
                    </div>
                    <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
                       <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl max-w-[85%]">
                          <p className="text-xs text-zinc-300">{selectedTicket.message}</p>
                          <p className="text-[8px] text-zinc-500 mt-2 font-bold uppercase tracking-widest">Original Message</p>
                       </div>
                       {(selectedTicket.replies || []).map((r, i) => (
                         <div key={i} className={`flex flex-col ${['super_admin', 'employee'].includes(r.sender_role) ? 'items-start' : 'items-end'}`}>
                            <div className={`p-3 rounded-xl max-w-[85%] border ${['super_admin', 'employee'].includes(r.sender_role) ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-100' : 'bg-zinc-900 border border-zinc-800 text-zinc-300'}`}>
                               <p className="text-xs">{r.message}</p>
                            </div>
                            <span className="text-[8px] text-zinc-600 mt-1 uppercase font-bold">{['super_admin', 'employee'].includes(r.sender_role) ? 'Support' : 'You'}</span>
                         </div>
                       ))}
                       <div ref={chatEndRef} />
                    </div>
                    <form onSubmit={handleSendReply} className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex gap-2">
                       <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Send a message..." className="flex-grow bg-obsidian border border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:border-indigo-500" />
                       <button type="submit" disabled={replying || !replyText.trim()} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-obsidian p-2 rounded-xl"><Send size={16} /></button>
                    </form>
                 </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isUpgradeOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUpgradeOpen(false)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.form onSubmit={startUpgrade} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg frosted-card rounded-3xl p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2"><Crown className="text-cyan-400" /> Upgrade Plan</h3>
                <button type="button" onClick={() => setIsUpgradeOpen(false)} className="text-zinc-500 hover:text-white"><X /></button>
              </div>
              <div className="space-y-3 mb-6">
                {livePlans.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-4">Live plans are unavailable right now. Please try again in a moment.</p>
                )}
                {livePlans.map(p => (
                  <button key={p.plan_name} type="button" onClick={() => setUpgradePlan(p.plan_name)} className={`w-full p-4 rounded-2xl border text-left transition-all ${upgradePlan === p.plan_name ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-800 bg-obsidian'}`}>
                    <div className="flex justify-between items-center font-bold mb-1"><span className="capitalize">{p.plan_name.replace('_', ' ')}</span><span className="text-cyan-400">₹{p.price_monthly}/mo</span></div>
                    <p className="text-[10px] text-zinc-500">Up to {p.max_bots} concurrent bots with priority CPU.</p>
                  </button>
                ))}
              </div>
              <input value={upgradeCoupon} onChange={(e) => setUpgradeCoupon(e.target.value)} placeholder="Coupon Code" className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm mb-6 outline-none focus:border-cyan-500" />
              {upgradeError && <p className="text-red-400 text-xs mb-4 text-center">{upgradeError}</p>}
              <button type="submit" disabled={upgradeBusy} className="w-full py-4 bg-cyan-500 text-obsidian font-bold rounded-2xl flex items-center justify-center gap-2 transition-all hover:bg-cyan-400 disabled:opacity-50">{upgradeBusy ? <Loader2 className="animate-spin" size={20} /> : <Crown size={18} />} Pay with SwiftUPI</button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreateOpen(false)} className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm"></motion.div>
            <motion.form onSubmit={deployBot} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-lg frosted-card rounded-3xl p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Deploy a Bot</h2>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <input required value={newBot.name} onChange={(e) => setNewBot({ ...newBot, name: e.target.value })} placeholder="Bot Name" className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-sm" />
                <select value={newBot.platform} onChange={(e) => setNewBot({ ...newBot, platform: e.target.value })} className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-sm"><option value="telegram">Telegram</option><option value="discord">Discord</option></select>
                <input required type="password" value={newBot.bot_token} onChange={(e) => setNewBot({ ...newBot, bot_token: e.target.value })} placeholder="Bot Token" className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-xs font-mono" />
              </div>
              <div className="mt-8 flex gap-4">
                <button type="submit" disabled={busy === 'deploy'} className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2 disabled:opacity-60">{busy === 'deploy' ? <Loader2 size={16} className="animate-spin" /> : 'Deploy Bot'}</button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
