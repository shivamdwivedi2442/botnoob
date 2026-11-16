import { Cpu, Github, Globe, Terminal } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    { title: 'Describe or Import', desc: 'Use our AI prompt to describe your bot or import an existing GitHub repository.', icon: <Terminal className="text-cyan-400" /> },
    { title: 'Connect BYOK & MCP', desc: 'Add your Claude/Gemini keys and connect to personal MCP servers for enhanced logic.', icon: <Cpu className="text-indigo-400" /> },
    { title: 'Test in Studio', desc: 'Use the zero-lag Studio App to debug and refine your bot with live previews.', icon: <Globe className="text-green-400" /> },
    { title: 'Deploy & Scale', desc: 'Push to production with 1-click hosting on our globally distributed edge network.', icon: <Github className="text-white" /> },
  ];

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">From Prompt to Production</h1>
        <p className="text-zinc-500 max-w-2xl mx-auto">The most seamless developer experience for AI bot creators.</p>
      </div>

      <div className="relative">
        <div className="hidden lg:block absolute top-1/2 left-0 w-full h-[2px] bg-zinc-900 -translate-y-1/2 z-0"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
          {steps.map((s, i) => (
            <div key={i} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6 shadow-xl">
                {s.icon}
              </div>
              <h3 className="text-xl font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;
