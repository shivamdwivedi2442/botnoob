import { Book, Code, MessageSquare, Terminal, ChevronRight, Zap, Shield, Key, Github, Bot, Layout, Cpu, Smartphone } from 'lucide-react';
import { useState } from 'react';

const Docs = () => {
  const [activeTab, setActiveTab] = useState('Introduction');

  const sections = [
    { 
      title: 'Getting Started', 
      icon: <Zap size={18} />, 
      links: [
        { name: 'Introduction', content: 'Welcome to Botnoob! The ultimate platform for building AI-powered bots with zero latency.' },
        { name: 'BotFather Token', content: 'To create a Telegram bot, talk to @BotFather on Telegram. Use the /newbot command and follow the instructions to get your API Token. Copy this token for deployment.' },
        { name: 'Discord Token', content: 'Go to the Discord Developer Portal, create a New Application, navigate to the "Bot" tab, and click "Reset Token" to get your bot token. Enable "Message Content Intent" for best results.' }
      ] 
    },
    { 
      title: 'Deployment', 
      icon: <Github size={18} />, 
      links: [
        { name: 'GitHub Sync', content: 'Connect your GitHub repository to Botnoob. Every push to the main branch will automatically trigger a new deployment. We support Node.js and Python environments.' },
        { name: 'AI Generator', content: 'Use our Home page AI Generator to describe your bot. It will generate a standalone bot.js file that you can deploy with a single click to your dashboard.' }
      ] 
    },
    { 
      title: 'Configuration', 
      icon: <Key size={18} />, 
      links: [
        { name: 'BYOK Keys', content: 'Navigate to Dashboard -> BYOK & MCP to set your OpenAI, Gemini, or Anthropic keys. These keys are used by the AI generator and your hosted bots to access AI models.' },
        { name: 'Managing Secrets', content: 'Secrets like BOT_TOKEN should never be hardcoded. Use the "Environment Variables" section in your bot settings on the dashboard to securely store these values.' }
      ] 
    },
    { 
      title: 'Studio App', 
      icon: <Smartphone size={18} />, 
      links: [
        { name: 'Studio App Sync', content: 'Coming Soon: Our native desktop and mobile app will allow you to sync your local environment with Botnoob for real-time debugging and zero-lag development.' }
      ] 
    },
  ];

  const activeLink = sections.flatMap(s => s.links).find(l => l.name === activeTab);

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-10 lg:gap-12 min-h-[70vh]">
      <aside className="w-full lg:w-64 grid grid-cols-2 sm:grid-cols-2 lg:block gap-6 lg:space-y-8">
        {sections.map((s, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
              {s.icon} {s.title}
            </div>
            <ul className="space-y-2">
              {s.links.map((l, j) => (
                <li 
                  key={j} 
                  onClick={() => setActiveTab(l.name)}
                  className={`text-sm cursor-pointer transition-colors ${activeTab === l.name ? 'text-cyan-400 font-medium' : 'text-zinc-400 hover:text-white'}`}
                >
                  {l.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <div className="flex-grow max-w-3xl min-w-0">
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">{activeTab}</h1>
          <div className="h-1 w-20 bg-cyan-500 rounded-full mb-8"></div>
          <div className="prose prose-invert max-w-none">
            <p className="text-zinc-300 text-lg leading-relaxed whitespace-pre-line">
              {activeLink?.content}
            </p>
          </div>
        </div>
        
        {activeTab === 'Introduction' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            <div className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-cyan-500/30 transition-all cursor-pointer group" onClick={() => setActiveTab('BotFather Token')}>
                <h3 className="font-bold mb-2 flex items-center gap-2">Setup Telegram <ChevronRight size={16} className="text-cyan-400" /></h3>
                <p className="text-xs text-zinc-500">Learn how to get your token from @BotFather.</p>
            </div>
            <div className="frosted-card rounded-2xl p-6 border-zinc-800 hover:border-cyan-500/30 transition-all cursor-pointer group" onClick={() => setActiveTab('Discord Token')}>
                <h3 className="font-bold mb-2 flex items-center gap-2">Setup Discord <ChevronRight size={16} className="text-cyan-400" /></h3>
                <p className="text-xs text-zinc-500">Step-by-step guide to the Discord Developer Portal.</p>
            </div>
          </div>
        )}

        <div className="mt-16 p-6 sm:p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800">
          <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield size={20} className="text-cyan-400" />
            Security Notice
          </h4>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Botnoob uses enterprise-grade encryption for all BYOK keys and environment variables. 
            We never store your keys in plain text, and they are only decrypted in the secure 
            execution environment during bot runtime.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Docs;
