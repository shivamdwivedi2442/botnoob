import { motion } from 'framer-motion';
import { Bot, MessageSquare, Globe, Zap, ArrowUpRight } from 'lucide-react';

const Templates = () => {
  const templates = [
    { name: 'Crypto Sentinel', type: 'Telegram', desc: 'Real-time price alerts & whale tracking.', icon: <Zap className="text-cyan-400" /> },
    { name: 'Community Guard', type: 'Discord', desc: 'Advanced moderation with AI sentiment analysis.', icon: <Globe className="text-indigo-400" /> },
    { name: 'Support Hero', type: 'Omnichannel', desc: 'AI-driven support ticket automation.', icon: <MessageSquare className="text-green-400" /> },
    { name: 'Market Maker', type: 'Trading', desc: 'Custom DEX trading strategies & signals.', icon: <Bot className="text-purple-400" /> },
  ];

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">Bot Templates</h1>
      <p className="text-zinc-500 mb-12 max-w-2xl">Start with a pre-built foundation and customize it to your needs. All templates are open-source and ready for BYOK.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {templates.map((t, i) => (
          <motion.div 
            key={i}
            whileHover={{ y: -5 }}
            className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-cyan-500/50 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
              {t.icon}
            </div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">{t.type}</div>
            <h3 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">{t.name}</h3>
            <p className="text-sm text-zinc-500 mb-6">{t.desc}</p>
            <div className="flex items-center gap-1 text-xs font-bold text-cyan-400">
              Use Template <ArrowUpRight size={14} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Templates;
