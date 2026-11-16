import { Monitor, Smartphone, Terminal, Download, Zap, Shield } from 'lucide-react';

const StudioApp = () => {
  const platforms = [
    { name: 'Windows', version: 'v2.0.4', icon: <Monitor />, size: '84MB' },
    { name: 'macOS', version: 'v2.0.4 (Apple Silicon)', icon: <Monitor />, size: '78MB' },
    { name: 'Linux', version: 'v2.0.4 (.AppImage)', icon: <Terminal />, size: '92MB' },
    { name: 'Mobile Preview', version: 'v1.2.0 (iOS/Android)', icon: <Smartphone />, size: 'Live Sync' },
  ];

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-20">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-bold text-cyan-400 mb-6">
            NATIVE DESKTOP EXPERIENCE
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">Zero-Lag Botnoob <br /> Studio IDE</h1>
          <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
            Experience the power of a local IDE with the intelligence of our AI cloud. 
            Built-in error solver, local plugin sandbox, and instant live previews.
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500"><Zap size={16} className="text-cyan-400" /> Low Latency</div>
            <div className="flex items-center gap-2 text-sm text-zinc-500"><Shield size={16} className="text-cyan-400" /> Secure Sandbox</div>
            <div className="flex items-center gap-2 text-sm text-zinc-500"><Terminal size={16} className="text-cyan-400" /> Integrated CLI</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map((p, i) => (
            <div key={i} className="frosted-card rounded-2xl p-6 border-zinc-800 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-cyan-400 mb-4">{p.icon}</div>
              <h3 className="font-bold mb-1">{p.name}</h3>
              <p className="text-xs text-zinc-500 mb-4">{p.version} • {p.size}</p>
              <button className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                <Download size={14} /> Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudioApp;
