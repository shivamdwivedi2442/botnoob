import { Search, Puzzle, Star, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

const plugins = [
  {
    name: 'Redis Cache Layer',
    author: '@botnoob',
    installs: '12.4k',
    rating: 4.9,
    tags: ['cache', 'redis', 'performance']
  },
  {
    name: 'Claude-3.5-Sonnet MCP',
    author: '@anthropic',
    installs: '45.1k',
    rating: 5.0,
    tags: ['ai', 'mcp', 'anthropic', 'claude']
  },
  {
    name: 'Supabase Auth Sync',
    author: '@supabase',
    installs: '8.2k',
    rating: 4.8,
    tags: ['auth', 'supabase', 'database']
  },
  {
    name: 'Stripe Checkout Node',
    author: '@stripe',
    installs: '5.6k',
    rating: 4.7,
    tags: ['payments', 'stripe', 'checkout']
  },
  {
    name: 'Telegram Broadcast',
    author: '@botnoob',
    installs: '9.1k',
    rating: 4.8,
    tags: ['telegram', 'messaging', 'broadcast']
  },
  {
    name: 'Discord Moderation',
    author: '@botnoob',
    installs: '6.8k',
    rating: 4.6,
    tags: ['discord', 'moderation', 'ai', 'safety']
  }
];

const Plugins = () => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return plugins;
    return plugins.filter((plugin) =>
      [plugin.name, plugin.author, ...plugin.tags].join(' ').toLowerCase().includes(term)
    );
  }, [query]);

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-12">
        <div>
          <h1 className="text-4xl font-bold mb-4">Plugin Marketplace</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => (
            <div key={p.name} className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-indigo-500/30 transition-all cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Puzzle size={24} />
                </div>
                <ExternalLink size={16} className="text-zinc-600 group-hover:text-zinc-400" />
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
              <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
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
    </div>
  );
};

export default Plugins;
