import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, MessageSquare, Globe, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { useSEO } from '../hooks/useSEO';

const iconFor = (template) => {
  if (template.platform === 'telegram') return <MessageSquare className="text-cyan-400" />;
  if (template.platform === 'discord') return <Globe className="text-indigo-400" />;
  return <Bot className="text-purple-400" />;
};

const Templates = () => {
  useSEO({
    title: 'Bot Templates',
    description: 'Explore our library of pre-built bot templates for Telegram and Discord. Deploy high-performance AI bots in seconds.',
    keywords: 'bot templates, telegram bot source code, discord bot templates, AI bot foundation',
    path: '/templates'
  });

  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/templates');
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError('Could not load templates right now. Please try again.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const useTemplate = (template) => {
    navigate(`/dashboard?template=${encodeURIComponent(template.id)}`);
  };

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4">Bot Templates</h1>
      <p className="text-zinc-500 mb-12 max-w-2xl">Start with a pre-built foundation and customize it to your needs. All templates are ready for BYOK and deployable in one click.</p>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-zinc-500">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading templates...
        </div>
      ) : error ? (
        <div className="frosted-card rounded-2xl p-10 text-center max-w-lg mx-auto">
          <p className="text-sm text-zinc-400 mb-4">{error}</p>
          <button onClick={loadTemplates} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 text-obsidian text-xs font-bold hover:bg-cyan-400 transition-colors">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : templates.length === 0 ? (
        <div className="frosted-card rounded-2xl p-10 text-center max-w-lg mx-auto">
          <Bot size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-400">No templates are available yet. Super Admins can add them from the control panel.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {templates.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -5 }}
              onClick={() => useTemplate(t)}
              className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-cyan-500/50 transition-all cursor-pointer group flex flex-col"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
                {iconFor(t)}
              </div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">{t.platform}</div>
              <h3 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">{t.name}</h3>
              <p className="text-sm text-zinc-500 mb-6 flex-grow">{t.description || 'A ready-to-deploy bot starter.'}</p>
              <div className="flex items-center gap-1 text-xs font-bold text-cyan-400">
                Use Template <ArrowUpRight size={14} />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Templates;
