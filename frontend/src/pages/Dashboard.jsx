import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Github, MessageSquare, Globe, Eye, EyeOff, Cpu, RotateCw, Trash2,
  Terminal, Code2, X, Copy, KeyRound, Loader2, AlertCircle, Crown, LifeBuoy,
  Send, FileKey, Save, RefreshCw, ShieldCheck
} from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';

const emptyBot = {
  name: '',
  platform: 'telegram',
  bot_token: '',
  github_repo_url: '',
  template: '',
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

const modalShell = 'fixed inset-0 flex items-center justify-center p-4 sm:p-6';
const modalCard = 'relative w-full frosted-card rounded-3xl shadow-2xl border-zinc-800 overflow-hidden flex flex-col';

const Dashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bots, setBots] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [slots, setSlots] = useState({ used: 0, limit: 10 });
  const [activePlan, setActivePlan] = useState({ name: 'free_byok', expires_at: null, max_bots: null });
  const [keys, setKeys] = useState([]);
  const [keySlots, setKeySlots] = useState({ used: 0, limit: 10 });
  const [mcpUrl, setMcpUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [toastVariant, setToastVariant] = useState('error');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBot, setNewBot] = useState(emptyBot);
  const githubInputRef = useRef(null);

  const [isByokModalOpen, setIsByokModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [savingKeys, setSavingKeys] = useState(false);

  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState('byok_pro');
  const [upgradeCoupon, setUpgradeCoupon] = useState('');
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [livePlans, setLivePlans] = useState([]);

  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [newTicket, setNewTicket] = useState({ subject: '', message: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const [codeBot, setCodeBot] = useState(null);
  const [codeFile, setCodeFile] = useState('bot.js');
  const [codeValue, setCodeValue] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeSaving, setCodeSaving] = useState(false);

  const [envBot, setEnvBot] = useState(null);
  const [envRows, setEnvRows] = useState([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);

  const [logsBot, setLogsBot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

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
      setActivePlan(
        res.data.plan || {
          name: 'free_byok',
          expires_at: null,
          max_bots: res.data.slots?.limit ?? null
        }
      );
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

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/templates');
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
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

  const openDeploy = useCallback(({ template = null, github = false } = {}) => {
    const selected = template || templates[0] || null;
    const base = { ...emptyBot };
    if (selected) {
      base.template = String(selected.id);
      base.code = selected.starter_code || '';
      base.platform = selected.platform === 'discord' ? 'discord' : 'telegram';
    }
    setNewBot(base);
    setIsCreateOpen(true);
    if (github) {
      setTimeout(() => githubInputRef.current?.focus(), 80);
    }
  }, [templates]);

  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    Promise.all([loadBots(), loadKeys(), loadTemplates(), loadTickets(), loadPlans()]).finally(() => setLoading(false));

    if (location.state?.generatedBot) {
      const { generatedBot } = location.state;
      setNewBot({
        ...emptyBot,
        name: generatedBot.name || '',
        platform: generatedBot.platform || 'telegram',
        template: '',
        code: generatedBot.code || '',
        env_vars: (generatedBot.env_vars || []).reduce((acc, v) => ({ ...acc, [v]: '' }), {})
      });
      setIsCreateOpen(true);
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
    }
  }, [loadBots, loadKeys, loadTemplates, loadTickets, location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (templatesLoading) return;
    const templateId = searchParams.get('template');
    const openVault = searchParams.get('openVault');
    const openSupport = searchParams.get('openSupport');
    if (!templateId && openVault !== 'true' && openSupport !== 'true') return;

    if (openVault === 'true') setIsByokModalOpen(true);
    if (openSupport === 'true') setIsSupportOpen(true);
    if (templateId) {
      const match = templates.find(
        (item) => String(item.id) === templateId || String(item.name).toLowerCase() === templateId.toLowerCase()
      );
      openDeploy({ template: match });
      if (!match) showToast('That template is no longer available. Showing the default.', 'error');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('template');
    next.delete('openVault');
    next.delete('openSupport');
    setSearchParams(next, { replace: true });
  }, [templatesLoading, templates, searchParams, setSearchParams, openDeploy]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies]);

  useEffect(() => {
    if (!isSupportOpen) return undefined;
    loadTickets();
    const interval = setInterval(loadTickets, 5000);
    return () => clearInterval(interval);
  }, [isSupportOpen, loadTickets]);

  useEffect(() => {
    if (!logsBot) return undefined;
    let active = true;
    const fetchLogs = async () => {
      try {
        const res = await api.get(`/bots/${logsBot.id}/logs`);
        if (active) setLogs(Array.isArray(res.data.logs) ? res.data.logs : []);
      } catch (err) {
        if (active) setLogs((current) => (current.length ? current : [`Unable to load logs: ${errorMessage(err, 'request failed')}`]));
      } finally {
        if (active) setLogsLoading(false);
      }
    };
    setLogsLoading(true);
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [logsBot]);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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

  const pullAndRestart = async (bot) => {
    setBusy(`${bot.id}:restart`);
    try {
      const res = await api.post(`/bots/${bot.id}/restart`);
      showToast(res.data.message || 'Repository pulled and bot restarted.', 'success');
      await loadBots();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to pull and restart bot.'));
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

  const applyTemplate = (templateId) => {
    const template = templates.find((item) => String(item.id) === String(templateId));
    setNewBot((current) => ({
      ...current,
      template: templateId,
      code: template?.starter_code || '',
      platform: template?.platform === 'discord' ? 'discord' : template?.platform === 'telegram' ? 'telegram' : current.platform
    }));
  };

  const deployBot = async (e) => {
    e.preventDefault();
    setBusy('deploy');
    try {
      const githubRepoUrl = newBot.github_repo_url.trim();
      const selectedTemplate = templates.find((item) => String(item.id) === String(newBot.template));
      const payload = {
        name: newBot.name,
        platform: newBot.platform,
        bot_token: newBot.bot_token,
        github_repo_url: githubRepoUrl,
        template: newBot.template || undefined,
        env_vars: newBot.env_vars
      };
      if (!githubRepoUrl) {
        payload.code = newBot.code || selectedTemplate?.starter_code || undefined;
      }
      const res = await api.post('/bots/deploy', payload, { timeout: 120000 });
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

  const saveKey = async (e) => {
    e.preventDefault();
    const provider = detectKeyProvider(keyInput);
    if (!provider) {
      showToast('Enter a valid Gemini, OpenAI, or Anthropic API key.', 'error');
      return;
    }
    setSavingKeys(true);
    try {
      await api.post('/ai/keys', { provider, key: keyInput.trim() });
      setKeyInput('');
      await loadKeys();
      showToast('BYOK key saved to your vault.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to save BYOK key.'));
    } finally {
      setSavingKeys(false);
    }
  };

  const deleteKey = async (key) => {
    if (!window.confirm(`Remove your ${providerLabels[key.provider] || key.provider} key?`)) return;
    try {
      await api.delete(`/ai/keys/${key.id}`);
      await loadKeys();
      showToast('BYOK key removed.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete BYOK key.'));
    }
  };

  const copyMcpUrl = async () => {
    if (!mcpUrl) return;
    try {
      await navigator.clipboard.writeText(mcpUrl);
      showToast('MCP URL copied.', 'success');
    } catch (err) {
      showToast('Could not copy the MCP URL.');
    }
  };

  const openCodeEditor = async (bot) => {
    if (bot.github_repo_url) return;
    setCodeBot(bot);
    setCodeLoading(true);
    setCodeValue('');
    try {
      const res = await api.get(`/bots/${bot.id}/config`);
      setCodeValue(res.data.code || '');
      setCodeFile(res.data.file || 'bot.js');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to load bot code.'));
      setCodeBot(null);
    } finally {
      setCodeLoading(false);
    }
  };

  const saveCode = async () => {
    if (!codeBot) return;
    setCodeSaving(true);
    try {
      await api.put(`/bots/${codeBot.id}/config`, { code: codeValue });
      showToast('bot.js saved. Restart the bot to apply changes.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to save bot code.'));
    } finally {
      setCodeSaving(false);
    }
  };

  const openEnvVault = async (bot) => {
    setEnvBot(bot);
    setEnvLoading(true);
    setEnvRows([]);
    try {
      const res = await api.get(`/bots/${bot.id}/config`);
      const rows = Object.entries(res.data.env_vars || {}).map(([key, value]) => createEnvRow(key, value));
      setEnvRows(rows);
    } catch (err) {
      showToast(errorMessage(err, 'Failed to load environment variables.'));
      setEnvBot(null);
    } finally {
      setEnvLoading(false);
    }
  };

  const updateEnvRow = (id, patch) => {
    setEnvRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const saveEnvVars = async () => {
    if (!envBot) return;
    const envVars = {};
    for (const row of envRows) {
      const key = row.key.trim();
      if (!key) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        showToast(`"${key}" is not a valid environment variable name.`, 'error');
        return;
      }
      envVars[key] = row.value;
    }
    setEnvSaving(true);
    try {
      await api.put(`/bots/${envBot.id}/config`, { env_vars: envVars });
      showToast('Environment variables saved.', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to save environment variables.'));
    } finally {
      setEnvSaving(false);
    }
  };

  const openLogs = (bot) => {
    setLogs([]);
    setLogsBot(bot);
  };

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <Toast message={toast} variant={toastVariant} onClose={() => setToast('')} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">My Workspace</h1>
          <p className="text-zinc-500 text-sm">
            Active Bots: <span className="text-cyan-400 font-bold">{slots.used} / {slots.limit}</span> BYOK Slots
            {activePlan?.name && (
              <>
                {' · '}Plan: <span className="text-cyan-400 font-bold capitalize">{String(activePlan.name).replace(/_/g, ' ')}</span>
              </>
            )}
            {activePlan?.expires_at && activePlan.name !== 'free_byok' && activePlan.name !== 'free' && (
              <>
                {' · '}Expires{' '}
                <span className="text-zinc-300 font-bold">
                  {new Date(activePlan.expires_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button onClick={() => setIsSupportOpen(true)} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 transition-all flex items-center gap-2">
            <LifeBuoy size={14} /> Support / Help
          </button>
          <button onClick={openUpgrade} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-2">
            <Crown size={14} /> Upgrade Plan
          </button>
          <button onClick={() => setIsByokModalOpen(true)} className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 hover:border-cyan-500/50 transition-all flex items-center gap-2">
            <Cpu size={14} /> BYOK & MCP
          </button>
          <button onClick={() => openDeploy()} disabled={slots.used >= slots.limit} className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-obsidian rounded-xl text-sm font-bold transition-all flex items-center gap-2">
            <Plus size={18} /> New Bot
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <button onClick={() => openDeploy({ github: true })} disabled={slots.used >= slots.limit} className="frosted-card rounded-3xl p-8 border-dashed border-zinc-700 flex flex-col items-center justify-center text-center hover:border-cyan-500/50 disabled:opacity-50 transition-all group min-h-[210px]">
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-cyan-400 mb-4 transition-colors"><Github size={32} /></div>
          <h3 className="font-bold mb-1">Import from GitHub</h3>
          <p className="text-xs text-zinc-500">Deploy an existing repo or template.</p>
        </button>

        {loading ? (
          <div className="frosted-card rounded-3xl p-8 border-zinc-800 flex items-center justify-center text-sm text-zinc-500 min-h-[210px]"><Loader2 className="animate-spin mr-2" size={18} /> Loading...</div>
        ) : bots.map((bot) => (
          <motion.div key={bot.id} layout className="frosted-card rounded-3xl p-6 border-zinc-800 relative group flex flex-col">
            <div className="flex justify-between items-start mb-5 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 shrink-0 rounded-xl bg-zinc-900 flex items-center justify-center ${bot.platform === 'telegram' ? 'text-cyan-400' : 'text-indigo-400'}`}>{bot.platform === 'telegram' ? <MessageSquare size={20} /> : <Globe size={20} />}</div>
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{bot.name}</h3>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">{bot.status}</span>
                </div>
              </div>
              {bot.github_repo_url && (
                <a href={bot.github_repo_url} target="_blank" rel="noreferrer" title="GitHub repository" className="shrink-0 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors">
                  <Github size={14} />
                </a>
              )}
            </div>

            <div className="mt-auto space-y-3">
              <div className="flex flex-wrap gap-2">
                {!bot.github_repo_url && (
                  <button onClick={() => openCodeEditor(bot)} className="flex-1 min-w-[84px] py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] font-bold text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-400 transition-all flex items-center justify-center gap-1.5">
                    <Code2 size={13} /> bot.js
                  </button>
                )}
                <button onClick={() => openEnvVault(bot)} className="flex-1 min-w-[84px] py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] font-bold text-zinc-300 hover:border-amber-500/40 hover:text-amber-400 transition-all flex items-center justify-center gap-1.5">
                  <FileKey size={13} /> .env
                </button>
                <button onClick={() => openLogs(bot)} className="flex-1 min-w-[84px] py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] font-bold text-zinc-300 hover:border-indigo-500/40 hover:text-indigo-400 transition-all flex items-center justify-center gap-1.5">
                  <Terminal size={13} /> Logs
                </button>
              </div>

              <div className="flex gap-2">
                <button onClick={() => botAction(bot, bot.status === 'active' ? 'stop' : 'start')} className={`flex-grow py-2 rounded-lg border text-xs font-bold transition-all ${bot.status === 'active' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-green-500/10 border-green-500/20 text-green-500'}`}>{bot.status === 'active' ? 'Stop' : 'Start'}</button>
                <button onClick={() => deleteBot(bot)} className="p-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Support modal */}
      <AnimatePresence>
        {isSupportOpen && (
          <div className={`${modalShell} z-[120]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSupportOpen(false)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`${modalCard} max-w-2xl h-[85vh] sm:h-[80vh] p-4 sm:p-8`}>
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><LifeBuoy className="text-indigo-400" /> Support Center</h2>
                 <button onClick={() => setIsSupportOpen(false)} className="text-zinc-500 hover:text-white"><X /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 flex-grow min-h-0 overflow-hidden">
                 <form onSubmit={submitTicket} className="space-y-4">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">New Ticket</h3>
                    <input required value={newTicket.subject} onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })} placeholder="Subject" className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500" />
                    <textarea required value={newTicket.message} onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })} placeholder="How can we help?" className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-indigo-500 h-28 sm:h-32" />
                    <button type="submit" disabled={submittingTicket} className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-obsidian font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">{submittingTicket ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Submit Ticket</button>
                 </form>
                 <div className="flex flex-col overflow-hidden min-h-0">
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">My History</h3>
                    <div className="space-y-4 overflow-y-auto custom-scrollbar flex-grow max-h-[30vh] md:max-h-none">
                       {tickets.length === 0 && <p className="text-xs text-zinc-500">No tickets yet.</p>}
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
                 <div className="absolute inset-x-0 bottom-0 top-[86px] sm:top-[100px] bg-zinc-950/95 z-10 flex flex-col">
                    <div className="p-4 border-b border-zinc-800 flex justify-between items-center gap-3">
                       <div className="min-w-0">
                          <h3 className="font-bold text-sm truncate">{selectedTicket.subject}</h3>
                          <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedTicket.status === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{selectedTicket.status}</span>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleTicketStatus(selectedTicket)} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${selectedTicket.status === 'resolved' ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10' : 'border-green-500/30 text-green-300 hover:bg-green-500/10'}`}>
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
                       <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Send a message..." className="flex-grow min-w-0 bg-obsidian border border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:border-indigo-500" />
                       <button type="submit" disabled={replying || !replyText.trim()} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-obsidian p-2 rounded-xl"><Send size={16} /></button>
                    </form>
                 </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upgrade modal */}
      <AnimatePresence>
        {isUpgradeOpen && (
          <div className={`${modalShell} z-[130]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsUpgradeOpen(false)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.form onSubmit={startUpgrade} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`${modalCard} max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar p-6 sm:p-8`}>
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
                    <div className="flex justify-between items-center font-bold mb-1"><span className="capitalize">{p.plan_name.replace('_', ' ')}</span><span className="text-cyan-400">₹{p.price_monthly} / {p.duration_days || 30} days</span></div>
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

      {/* Deploy modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className={`${modalShell} z-[100]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreateOpen(false)} className="absolute inset-0 bg-obsidian/80 backdrop-blur-sm"></motion.div>
            <motion.form onSubmit={deployBot} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`${modalCard} max-w-lg p-6 sm:p-8 max-h-[90vh] overflow-y-auto custom-scrollbar`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold">Deploy a Bot</h2>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Bot Name</label>
                  <input required value={newBot.name} onChange={(e) => setNewBot({ ...newBot, name: e.target.value })} placeholder="My Bot" className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Platform</label>
                  <select value={newBot.platform} onChange={(e) => setNewBot({ ...newBot, platform: e.target.value })} className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-sm"><option value="telegram">Telegram</option><option value="discord">Discord</option></select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Bot Token</label>
                  <input required type="password" value={newBot.bot_token} onChange={(e) => setNewBot({ ...newBot, bot_token: e.target.value })} placeholder="Paste your bot token" className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">GitHub Repository URL</label>
                  <input ref={githubInputRef} type="url" value={newBot.github_repo_url} onChange={(e) => setNewBot({ ...newBot, github_repo_url: e.target.value })} placeholder="https://github.com/user/repo" className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-xs font-mono" />
                  <p className="text-[10px] text-zinc-500 mt-2">Public HTTPS repositories only. We pull the repo and use its start script.</p>
                </div>
                {!newBot.github_repo_url.trim() ? (
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Starter Template</label>
                    <select value={newBot.template} onChange={(e) => applyTemplate(e.target.value)} disabled={templatesLoading || templates.length === 0} className="w-full px-4 py-3 bg-obsidian border border-zinc-800 rounded-xl focus:border-cyan-500 outline-none text-sm disabled:opacity-60">
                      {templatesLoading && <option value="">Loading templates...</option>}
                      {!templatesLoading && templates.length === 0 && <option value="">No templates available</option>}
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name} · {template.platform}</option>
                      ))}
                    </select>
                    {newBot.code && <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1"><Code2 size={11} /> Starter code will be deployed as bot.js</p>}
                  </div>
                ) : (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] text-cyan-300 flex items-start gap-2">
                    <Github size={14} className="mt-0.5 shrink-0" /> GitHub mode: the starter template is skipped and your repository code is deployed.
                  </div>
                )}
              </div>
              <div className="mt-8 flex gap-3">
                <button type="submit" disabled={busy === 'deploy'} className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-obsidian font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-center gap-2 disabled:opacity-60">{busy === 'deploy' ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />} Deploy Bot</button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* bot.js editor modal */}
      <AnimatePresence>
        {codeBot && (
          <div className={`${modalShell} z-[110]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCodeBot(null)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={`${modalCard} max-w-3xl max-h-[90vh] p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5"><Code2 size={12} /> In-browser editor</p>
                  <h2 className="text-lg sm:text-xl font-bold mt-1 truncate">{codeBot.name} · {codeFile}</h2>
                </div>
                <button onClick={() => setCodeBot(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              {codeLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-zinc-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading code...</div>
              ) : (
                <textarea value={codeValue} onChange={(e) => setCodeValue(e.target.value)} spellCheck={false} className="w-full h-[45vh] sm:h-[50vh] bg-obsidian border border-zinc-800 rounded-2xl p-4 text-xs font-mono text-zinc-200 outline-none focus:border-cyan-500 resize-none custom-scrollbar" />
              )}
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <button onClick={() => setCodeBot(null)} className="sm:w-32 py-3 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-300 hover:border-zinc-700 transition-colors">Close</button>
                <button onClick={saveCode} disabled={codeSaving || codeLoading} className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-obsidian text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{codeSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save bot.js</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* .env vault modal */}
      <AnimatePresence>
        {envBot && (
          <div className={`${modalShell} z-[110]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEnvBot(null)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={`${modalCard} max-w-2xl max-h-[90vh] p-5 sm:p-6 overflow-y-auto custom-scrollbar`}>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5"><FileKey size={12} /> Encrypted env vault</p>
                  <h2 className="text-lg sm:text-xl font-bold mt-1 truncate">{envBot.name} · .env</h2>
                </div>
                <button onClick={() => setEnvBot(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-[11px] text-zinc-500 mb-5">Values are encrypted at rest. GitHub imports should add their .env values here since the repository usually excludes them.</p>

              {envLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-zinc-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading variables...</div>
              ) : (
                <div className="space-y-3">
                  {envRows.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">No environment variables yet.</p>}
                  {envRows.map((row) => (
                    <div key={row.id} className="flex flex-col sm:flex-row gap-2">
                      <input value={row.key} onChange={(e) => updateEnvRow(row.id, { key: e.target.value })} placeholder="KEY" className="w-full sm:w-2/5 bg-obsidian border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-amber-500" />
                      <div className="relative flex-grow">
                        <input type={row.reveal ? 'text' : 'password'} value={row.value} onChange={(e) => updateEnvRow(row.id, { value: e.target.value })} placeholder="value" className="w-full bg-obsidian border border-zinc-800 rounded-xl pl-3 pr-10 py-2 text-xs font-mono outline-none focus:border-amber-500" />
                        <button type="button" onClick={() => updateEnvRow(row.id, { reveal: !row.reveal })} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">{row.reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      </div>
                      <button type="button" onClick={() => setEnvRows((current) => current.filter((item) => item.id !== row.id))} className="self-end sm:self-auto p-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setEnvRows((current) => [...current, createEnvRow()])} className="w-full py-2.5 rounded-xl border border-dashed border-zinc-700 text-xs font-bold text-zinc-400 hover:border-amber-500/40 hover:text-amber-400 transition-all flex items-center justify-center gap-2"><Plus size={14} /> Add variable</button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                {envBot.github_repo_url && (
                  <button onClick={() => pullAndRestart(envBot)} disabled={busy === `${envBot.id}:restart`} className="sm:w-44 py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-bold hover:bg-indigo-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                    {busy === `${envBot.id}:restart` ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />} Pull & Restart
                  </button>
                )}
                <button onClick={() => setEnvBot(null)} className="sm:w-28 py-3 rounded-xl border border-zinc-800 text-xs font-bold text-zinc-300 hover:border-zinc-700 transition-colors">Close</button>
                <button onClick={saveEnvVars} disabled={envSaving || envLoading} className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-obsidian text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{envSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save .env</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Logs modal */}
      <AnimatePresence>
        {logsBot && (
          <div className={`${modalShell} z-[110]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLogsBot(null)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={`${modalCard} max-w-3xl max-h-[90vh] p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5"><Terminal size={12} /> Live logs</p>
                  <h2 className="text-lg sm:text-xl font-bold mt-1 truncate">{logsBot.name}</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase text-zinc-500"><RefreshCw size={11} className={logsLoading ? 'animate-spin' : ''} /> Auto-refresh</span>
                  <button onClick={() => setLogsBot(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>
              </div>
              <div className="bg-obsidian border border-zinc-800 rounded-2xl overflow-hidden flex-grow min-h-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">stdout / stderr</span>
                  <span className="text-[10px] font-mono text-zinc-600">{logs.length} lines</span>
                </div>
                <pre className="p-4 text-[11px] leading-relaxed font-mono text-zinc-300 overflow-auto h-[45vh] sm:h-[50vh] custom-scrollbar whitespace-pre-wrap break-words">
                  <code>{logsLoading && logs.length === 0 ? 'Loading logs...' : logs.length === 0 ? 'No logs yet. Start the bot to stream output here.' : logs.join('\n')}</code>
                  <span ref={logsEndRef} />
                </pre>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <button onClick={() => setLogsBot(null)} className="sm:w-32 py-3 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-300 hover:border-zinc-700 transition-colors">Close</button>
                <button onClick={() => botAction(logsBot, logsBot.status === 'active' ? 'restart' : 'start')} disabled={busy === `${logsBot.id}:restart` || busy === `${logsBot.id}:start`} className="flex-1 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-obsidian text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">{busy === `${logsBot.id}:restart` || busy === `${logsBot.id}:start` ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />} {logsBot.status === 'active' ? 'Restart bot' : 'Start bot'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BYOK & MCP modal */}
      <AnimatePresence>
        {isByokModalOpen && (
          <div className={`${modalShell} z-[115]`}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsByokModalOpen(false)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={`${modalCard} max-w-2xl max-h-[90vh] p-5 sm:p-8 overflow-y-auto custom-scrollbar`}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-cyan-400" /> BYOK & MCP</h2>
                  <p className="text-xs text-zinc-500 mt-1">Keys: <span className="text-cyan-400 font-bold">{keySlots.used} / {keySlots.limit}</span></p>
                </div>
                <button onClick={() => setIsByokModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
              </div>

              <form onSubmit={saveKey} className="space-y-3 mb-6">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Add AI Provider Key</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-grow">
                    <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-... / AIza... / sk-ant-..." className="w-full bg-obsidian border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-xs font-mono outline-none focus:border-cyan-500" />
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  </div>
                  <button type="submit" disabled={savingKeys || !keyInput.trim()} className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-obsidian text-xs font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">{savingKeys ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save Key</button>
                </div>
                {detectKeyProvider(keyInput) && (
                  <p className="text-[10px] text-zinc-500">Detected provider: <span className={`px-2 py-0.5 rounded-full border font-bold uppercase ${providerBadgeClasses[detectKeyProvider(keyInput)]}`}>{providerLabels[detectKeyProvider(keyInput)]}</span></p>
                )}
              </form>

              <div className="space-y-2 mb-6">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Saved Keys</label>
                {keys.length === 0 && <p className="text-xs text-zinc-500">No BYOK keys saved yet.</p>}
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between gap-3 bg-obsidian border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="min-w-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase ${providerBadgeClasses[key.provider] || 'text-zinc-400 border-zinc-700 bg-zinc-900'}`}>{providerLabels[key.provider] || key.provider}</span>
                      <p className="text-[10px] font-mono text-zinc-500 mt-1 truncate">{key.hint}</p>
                    </div>
                    <button onClick={() => deleteKey(key)} className="shrink-0 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/30 transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu size={15} className="text-indigo-400" />
                  <h3 className="text-sm font-bold">MCP Endpoint</h3>
                </div>
                <p className="text-[11px] text-zinc-500 mb-3">Connect Claude or Lovable MCP clients to your personal bot workspace.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input readOnly value={mcpUrl || 'MCP URL unavailable'} className="flex-grow min-w-0 bg-obsidian border border-zinc-800 rounded-xl px-3 py-2 text-[11px] font-mono text-indigo-300 outline-none" />
                  <button onClick={copyMcpUrl} disabled={!mcpUrl} className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:border-indigo-500/40 hover:text-indigo-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"><Copy size={13} /> Copy</button>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 text-[10px] text-zinc-500">
                <AlertCircle size={13} className="text-amber-500 shrink-0" /> Keys are encrypted at rest and never shown in full.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
