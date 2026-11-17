import { Calendar, User, ArrowRight, X, Clock, Tag } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Blog = () => {
  const [selectedPost, setSelectedPost] = useState(null);

  const posts = [
    { 
      id: 1,
      title: 'Building Your First Bot with Botnoob AI', 
      excerpt: 'Learn how to go from a simple description to a fully functional, hosted bot in under 60 seconds.', 
      content: `Building bots used to require complex boilerplate, server setup, and API plumbing. With Botnoob's AI Generator, those days are over. 

      Our generator uses state-of-the-art LLMs (OpenAI, Gemini, Anthropic) via your own API keys to write clean, standalone Node.js code. Simply describe what you want—a crypto price alerter, a community moderator, or a personal assistant—and watch the code appear.

      Once generated, our 1-click deploy system pushes your code to our high-performance edge network. No Docker, no Express, just pure bot logic running with zero latency.`,
      date: 'Nov 14, 2026', 
      author: 'Alex Chen', 
      category: 'Tutorial',
      readTime: '4 min read'
    },
    { 
      id: 2,
      title: 'Hosting Performance: Edge vs. Traditional VM', 
      excerpt: 'Why Botnoob\'s edge-first infrastructure is the secret weapon for bot developers.', 
      content: `Latency is the enemy of a great user experience. When a user sends a command to your bot, every millisecond counts. 

      Traditional hosting involves virtual machines that might be thousands of miles away from the Telegram or Discord data centers. Botnoob solves this by deploying your bots to a global edge network. 

      Your bot logic runs as close to the messaging platform's API gateways as possible. This results in response times that feel instantaneous. Coupled with our "Zero-Lag Studio," you get a development and hosting environment built for speed.`,
      date: 'Nov 10, 2026', 
      author: 'Sarah Miller', 
      category: 'Engineering',
      readTime: '6 min read'
    },
    { 
      id: 3,
      title: 'Monetizing Your Bots with SwiftUPI', 
      excerpt: 'Turn your bot project into a business with native UI components and integrated payments.', 
      content: `The biggest challenge for bot developers is providing a rich UI and a seamless payment flow. Messaging apps are traditionally limited to text and simple buttons. 

      SwiftUPI changes everything. It allows you to render complex, interactive UI components—like product carousels, checkout forms, and live charts—directly inside the chat. 

      Combined with our integrated Stripe and crypto payment plugins, you can build a full-featured digital storefront or a premium SaaS bot without ever leaving the messaging app. Your users get a native-app feel with the convenience of their favorite chat platform.`,
      date: 'Nov 05, 2026', 
      author: 'David Kim', 
      category: 'Business',
      readTime: '5 min read'
    },
    { 
      id: 4,
      title: 'The Power of BYOK in Bot Development', 
      excerpt: 'Why "Bring Your Own Key" is the most flexible way to build AI-driven applications.', 
      content: `Most AI platforms lock you into their own models and pricing. Botnoob takes a different approach: Bring Your Own Key (BYOK). 

      By using your own API keys from Anthropic, Google, or OpenAI, you maintain full control over your costs and model selection. Want to use Claude 3.5 Sonnet for creative writing and Gemini 1.5 Pro for data analysis? You can do that in the same bot fleet.

      Our platform acts as the secure bridge, handling the hosting and security while you provide the intelligence. This transparency ensures you only pay for what you use, directly to the AI providers, with no hidden markups from us.`,
      date: 'Oct 30, 2026', 
      author: 'Elena Rossi', 
      category: 'Tech',
      readTime: '3 min read'
    },
  ];

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <div className="text-center mb-20">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold mb-6"
        >
          Latest from Botnoob
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-zinc-500"
        >
          Insights, updates, and guides from our core engineering team.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {posts.map((p, i) => (
          <motion.article 
            key={p.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => setSelectedPost(p)}
            className="group cursor-pointer frosted-card rounded-3xl p-6 sm:p-8 border-zinc-800 hover:border-cyan-500/30 transition-all"
          >
            <div className="flex items-center gap-4 text-xs font-bold text-cyan-400 uppercase tracking-widest mb-4">
              <span>{p.category}</span>
              <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
              <span className="text-zinc-500">{p.date}</span>
            </div>
            <h3 className="text-2xl font-bold mb-4 group-hover:text-cyan-400 transition-colors leading-tight">{p.title}</h3>
            <p className="text-zinc-500 text-sm mb-6 leading-relaxed line-clamp-3">{p.excerpt}</p>
            <div className="flex items-center justify-between pt-6 border-t border-zinc-900">
               <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 p-[1px]">
                    <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center text-[10px] font-bold">
                      {p.author.split(' ').map(n => n[0]).join('')}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-zinc-300">{p.author}</span>
               </div>
               <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                 <Clock size={12} /> {p.readTime}
               </div>
            </div>
          </motion.article>
        ))}
      </div>

      <AnimatePresence>
        {selectedPost && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPost(null)}
              className="absolute inset-0 bg-obsidian/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-widest border border-cyan-500/20">
                    {selectedPost.category}
                  </span>
                  <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                    {selectedPost.date}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedPost(null)}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-5 sm:p-8 overflow-y-auto custom-scrollbar">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 leading-tight">
                  {selectedPost.title}
                </h2>
                
                <div className="flex items-center gap-4 mb-10 pb-6 border-b border-zinc-800">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center font-bold text-obsidian">
                    {selectedPost.author.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{selectedPost.author}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Core Contributor</p>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none">
                  {selectedPost.content.split('\n\n').map((paragraph, idx) => (
                    <p key={idx} className="text-zinc-400 leading-relaxed mb-6 text-lg">
                      {paragraph.trim()}
                    </p>
                  ))}
                </div>
                
                <div className="mt-12 flex flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Tag size={10} /> AI Development
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Tag size={10} /> Edge Computing
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Tag size={10} /> Botnoob Studio
                  </span>
                </div>
              </div>
              
              <div className="p-6 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
                <button 
                  onClick={() => setSelectedPost(null)}
                  className="text-sm font-bold text-zinc-500 hover:text-white transition-colors"
                >
                  Close article
                </button>
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  <Clock size={12} /> {selectedPost.readTime}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Blog;
