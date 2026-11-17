import { Search, Puzzle, Star, ExternalLink, X, Copy, Check, BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSEO } from '../hooks/useSEO';

const plugins = [
  {
    name: 'Redis Cache Layer',
    author: '@botnoob',
    installs: '12.4k',
    rating: 4.9,
    tags: ['cache', 'redis', 'performance'],
    snippet: `const { createCache } = require('botnoob-plugin-redis');

const cache = createCache({
  url: process.env.REDIS_URL,
  ttl: 60
});

const reply = await cache.wrap('price:BTC', () => fetchPrice('BTC'));
console.log(reply);`,
    docs: [
      'Add REDIS_URL to your bot environment variables.',
      'Wrap expensive API calls with cache.wrap(key, loader) to reuse results.',
      'Set ttl (seconds) to control how long cached entries live.'
    ]
  },
  {
    name: 'Claude-3.5-Sonnet MCP',
    author: '@anthropic',
    installs: '45.1k',
    rating: 5.0,
    tags: ['ai', 'mcp', 'anthropic', 'claude'],
    snippet: `const { McpClient } = require('botnoob-plugin-mcp');

const claude = new McpClient({
  url: process.env.MCP_URL,
  apiKey: process.env.ANTHROPIC_API_KEY
});

const answer = await claude.ask('Summarize this support ticket.');
console.log(answer.text);`,
    docs: [
      'Save your Anthropic key under Dashboard -> BYOK & MCP.',
      'Copy your personal MCP URL from the same modal into MCP_URL.',
      'Call claude.ask(prompt) from any message handler.'
    ]
  },
  {
    name: 'Supabase Auth Sync',
    author: '@supabase',
    installs: '8.2k',
    rating: 4.8,
    tags: ['auth', 'supabase', 'database'],
    snippet: `const { syncUser } = require('botnoob-plugin-supabase');

await syncUser({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  telegramId: message.from.id,
  email: message.from.email
});`,
    docs: [
      'Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      'Call syncUser after onboarding to link chat identities with accounts.',
      'Use the same email as your Botnoob account for seamless access.'
    ]
  },
  {
    name: 'Stripe Checkout Node',
    author: '@stripe',
    installs: '5.6k',
    rating: 4.7,
    tags: ['payments', 'stripe', 'checkout'],
    snippet: `const { createCheckout } = require('botnoob-plugin-stripe');

const session = await createCheckout({
  secretKey: process.env.STRIPE_SECRET_KEY,
  priceId: process.env.STRIPE_PRICE_ID,
  customerId: user.stripe_customer_id,
  successUrl: 'https://t.me/your_bot'
});

await reply(message.chat.id, session.url);`,
    docs: [
      'Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to your env vault.',
      'Create a Checkout Session per user and send the URL in chat.',
      'Listen for checkout.session.completed before granting access.'
    ]
  },
  {
    name: 'Telegram Broadcast',
    author: '@botnoob',
    installs: '9.1k',
    rating: 4.8,
    tags: ['telegram', 'messaging', 'broadcast'],
    snippet: `const { broadcast } = require('botnoob-plugin-telegram');

await broadcast({
  token: process.env.BOT_TOKEN,
  chatIds: process.env.BROADCAST_CHAT_IDS.split(','),
  text: 'New feature shipped!'
});`,
    docs: [
      'Store a comma-separated list in BROADCAST_CHAT_IDS.',
      'The plugin throttles requests to stay within Telegram rate limits.',
      'Run broadcasts from a scheduled handler, not per-message.'
    ]
  },
  {
    name: 'Discord Moderation',
    author: '@botnoob',
    installs: '6.8k',
    rating: 4.6,
    tags: ['discord', 'moderation', 'ai', 'safety'],
    snippet: `const { moderate } = require('botnoob-plugin-discord');

const verdict = await moderate({
  token: process.env.BOT_TOKEN,
  content: message.content,
  autoDelete: true
});

if (verdict.flagged) console.log('Removed message:', verdict.reason);`,
    docs: [
      'Enable the Message Content intent in the Discord Developer Portal.',
      'Optionally pass an AI provider key for sentiment-aware decisions.',
      'Use autoDelete: false to review flags before removing messages.'
    ]
  }
];

const Plugins = () => {
  useSEO({
    title: 'Plugin Marketplace',
    description: 'Extend your bot with Redis cache, Claude-3.5-Sonnet MCP, Supabase auth, and Stripe payments. Official and community plugins for Botnoob.',
    keywords: 'bot plugins, redis cache for bots, Claude MCP, bot marketplace, botnoob plugins',
    path: '/plugins'
  });

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return plugins;
    return plugins.filter((plugin) =>
      [plugin.name, plugin.author, ...plugin.tags].join(' ').toLowerCase().includes(term)
    );
  }, [query]);

  const openPlugin = (plugin) => {
    setCopied(false);
    setSelected(plugin);
  };

  const copySnippet = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopied(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-8 mb-12">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Plugin Marketplace</h1>
          <p className="text-zinc-500">Extend your bot's capabilities with official and community plugins.</p>
        </div>
        <div className="relative w-full md:w-80">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins..."
            aria-label="Search plugins"
            className="w-full h-12 pl-12 pr-4 bg-zinc-900 border border-zinc-800 rounded-xl outline-none focus:border-cyan-500 transition-all text-sm"
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="frosted-card rounded-2xl p-10 text-center">
          <Puzzle size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No plugins match "{query.trim()}".</p>
          <button
            onClick={() => setQuery('')}
            className="mt-4 text-xs font-bold text-cyan-400 hover:text-cyan-300"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((p) => (
            <div key={p.name} className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-indigo-500/30 transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Puzzle size={24} />
                </div>
                <button
                  type="button"
                  onClick={() => openPlugin(p)}
                  aria-label={`Open ${p.name} snippet and docs`}
                  title="View snippet & docs"
                  className="p-1.5 rounded-lg text-zinc-600 hover:text-cyan-400 hover:bg-zinc-900 transition-colors"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
              <h3 className="text-lg font-bold mb-1">{p.name}</h3>
              <p className="text-xs text-zinc-500 mb-4">by {p.author}</p>
              <div className="flex flex-wrap gap-1.5 mb-6">
                {p.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-zinc-900 mt-auto">
                <div className="flex items-center gap-1 text-xs text-zinc-400">
                  <Star size={12} className="text-yellow-500 fill-yellow-500" /> {p.rating}
                </div>
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                  {p.installs} installs
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              className="absolute inset-0 bg-obsidian/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative w-full max-w-2xl frosted-card rounded-3xl shadow-2xl border-zinc-800 max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5"><Puzzle size={12} /> {selected.author}</p>
                  <h2 className="text-xl sm:text-2xl font-bold mt-1 truncate">{selected.name}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="shrink-0 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-6">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span className="flex items-center gap-1"><Star size={11} className="text-yellow-500 fill-yellow-500" /> {selected.rating}</span>
                  <span>·</span>
                  <span>{selected.installs} installs</span>
                  {selected.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800">{tag}</span>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-zinc-300">Quick start snippet</h3>
                    <button onClick={copySnippet} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors">
                      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="bg-obsidian border border-zinc-800 rounded-2xl p-4 text-[11px] leading-relaxed font-mono text-zinc-300 overflow-x-auto custom-scrollbar whitespace-pre"><code>{selected.snippet}</code></pre>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2 mb-3"><BookOpen size={14} className="text-cyan-400" /> Documentation</h3>
                  <ul className="space-y-2">
                    {selected.docs.map((line) => (
                      <li key={line} className="flex gap-2 text-xs text-zinc-400 leading-relaxed">
                        <span className="text-cyan-500 mt-0.5">•</span> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-5 sm:p-6 border-t border-zinc-800 flex flex-col sm:flex-row gap-3">
                <button onClick={() => setSelected(null)} className="sm:w-32 py-3 rounded-xl border border-zinc-800 text-sm font-bold text-zinc-300 hover:border-zinc-700 transition-colors">Close</button>
                <button onClick={copySnippet} className="flex-1 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-obsidian text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Snippet copied' : 'Copy snippet'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Plugins;
