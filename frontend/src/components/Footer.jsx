import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-obsidian border-t border-zinc-800 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent font-mono mb-4 inline-block">
              Botnoob
            </Link>
            <p className="text-zinc-500 text-sm max-w-xs">
              The flagship AI studio for Telegram and Discord bots. 
              Build, host, and scale your bot fleet in minutes.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
            <ul className="space-y-2 text-zinc-500 text-sm">
              <li><Link to="/templates" className="hover:text-cyan-400 transition-colors">Templates</Link></li>
              <li><Link to="/studio-app" className="hover:text-cyan-400 transition-colors">Studio App</Link></li>
              <li><Link to="/plugins" className="hover:text-cyan-400 transition-colors">Plugins</Link></li>
              <li><Link to="/pricing" className="hover:text-cyan-400 transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Resources</h4>
            <ul className="space-y-2 text-zinc-500 text-sm">
              <li><Link to="/docs" className="hover:text-cyan-400 transition-colors">Documentation</Link></li>
              <li><Link to="/blog" className="hover:text-cyan-400 transition-colors">Blog</Link></li>
              <li><Link to="/how-it-works" className="hover:text-cyan-400 transition-colors">How It Works</Link></li>
              <li><Link to="/support" className="hover:text-cyan-400 transition-colors">Support</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-zinc-600 text-xs">
            © {new Date().getFullYear()} Botnoob. Built for the decentralized future.
          </p>
          <div className="flex gap-6 text-zinc-600 text-xs">
            <Link to="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
