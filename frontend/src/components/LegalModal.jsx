import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const legalDocs = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'What we collect',
        body: 'We store your account email, bot metadata, encrypted bot tokens, and encrypted environment variables. BYOK provider keys are encrypted at rest and are never displayed in full.'
      },
      {
        heading: 'How we use data',
        body: 'Your data is used only to run your bots, generate code you request, process payments, and provide support. We do not sell personal data or share secrets with third parties.'
      },
      {
        heading: 'Security',
        body: 'Secrets are encrypted with AES-256-GCM. Support staff operate under a zero-knowledge policy and cannot read your bot tokens or API keys.'
      },
      {
        heading: 'Your controls',
        body: 'You can delete a bot, remove a saved key, or request account deletion at any time from the dashboard. Deleting a bot removes its encrypted configuration and local runtime files.'
      }
    ]
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Acceptable use',
        body: 'You may not use Botnoob to send spam, distribute malware, facilitate fraud, or violate the terms of Telegram, Discord, or your AI provider. Bots that break platform policies may be suspended.'
      },
      {
        heading: 'Your responsibilities',
        body: 'You are responsible for the bot tokens, API keys, and code you deploy. Keep your credentials secure and only deploy code you have the right to run.'
      },
      {
        heading: 'Billing',
        body: 'Paid plans renew according to the plan you select. Coupons are validated at checkout. Refunds are handled case by case through the support center.'
      },
      {
        heading: 'Service availability',
        body: 'We work to keep hosting online 24/7, but Botnoob is provided as-is without guarantees. We are not liable for losses caused by downtime, third-party platform changes, or AI provider failures.'
      }
    ]
  }
};

const LegalModal = ({ doc, onClose }) => (
  <AnimatePresence>
    {doc && (
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-obsidian/90 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between gap-4">
            <h2 className="text-xl sm:text-2xl font-bold">{legalDocs[doc].title}</h2>
            <button onClick={onClose} className="shrink-0 p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><X size={20} /></button>
          </div>
          <div className="p-5 sm:p-8 overflow-y-auto custom-scrollbar space-y-6">
            <p className="text-xs text-zinc-500">Last updated: November 2026</p>
            {legalDocs[doc].sections.map((section) => (
              <section key={section.heading}>
                <h3 className="text-sm font-bold text-zinc-200 mb-2">{section.heading}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{section.body}</p>
              </section>
            ))}
          </div>
          <div className="p-5 sm:p-6 border-t border-zinc-800 flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-bold text-white transition-colors">Close</button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default LegalModal;
