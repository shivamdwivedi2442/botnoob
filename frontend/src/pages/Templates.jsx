import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, MessageSquare, Globe, ArrowUpRight } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';

const STATIC_TEMPLATES = [
  {
    id: 'tg-starter',
    name: 'Telegram AI Starter',
    platform: 'telegram',
    description: 'A clean Telegram bot foundation using the telegraf framework. Ready for AI logic.',
    starter_code: `const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply('Welcome! I am your AI-powered Telegram bot.'));
bot.on('text', (ctx) => ctx.reply('You said: ' + ctx.message.text));

bot.launch();
console.log('Telegram bot is running...');`
  },
  {
    id: 'discord-starter',
    name: 'Discord AI Starter',
    platform: 'discord',
    description: 'A modern Discord.js starter with slash command support and event handling.',
    starter_code: `const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
  console.log('Discord bot is online as ' + client.user.tag);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  message.reply('Hello from Botnoob! I heard you say: ' + message.content);
});

client.login(process.env.BOT_TOKEN);`
  },
  {
    id: 'gemini-agent',
    name: 'Gemini AI Agent',
    platform: 'telegram',
    description: 'Advanced Telegram agent with Google Gemini integration. BYOK required.',
    starter_code: `const { Telegraf } = require('telegraf');
const axios = require('axios');
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('text', async (ctx) => {
  try {
    ctx.sendChatAction('typing');
    // This is a placeholder for actual Gemini API logic
    ctx.reply('I am a Gemini-powered agent. Please configure your GEMINI_API_KEY in the .env vault.');
  } catch (err) {
    ctx.reply('Error: ' + err.message);
  }
});

bot.launch();`
  },
  {
    id: 'universal-mcp',
    name: 'Universal MCP Hub',
    platform: 'discord',
    description: 'Connect your bot to various MCP nodes and external tools seamlessly.',
    starter_code: `const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log('MCP Hub online.');
});

// Logic to connect to MCP nodes goes here
client.login(process.env.BOT_TOKEN);`
  }
];

const iconFor = (platform) => {
  if (platform === 'telegram') return <MessageSquare className="text-cyan-400" />;
  if (platform === 'discord') return <Globe className="text-indigo-400" />;
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

  const useTemplate = (template) => {
    navigate('/dashboard', { 
      state: { 
        templateCode: template.starter_code,
        platform: template.platform
      } 
    });
  };

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <h1 className="text-3xl sm:text-4xl font-bold mb-4">Bot Templates</h1>
      <p className="text-zinc-500 mb-12 max-w-2xl">Start with a pre-built foundation and customize it to your needs. All templates are ready for BYOK and deployable in one click.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {STATIC_TEMPLATES.map((t, i) => (
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
              {iconFor(t.platform)}
            </div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-1">{t.platform}</div>
            <h3 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">{t.name}</h3>
            <p className="text-sm text-zinc-500 mb-6 flex-grow">{t.description}</p>
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
