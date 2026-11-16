import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

const Toast = ({ message, onClose, variant = 'error' }) => {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onClose?.(), 5000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  const isSuccess = variant === 'success';

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          role="alert"
          className={`fixed top-20 right-4 z-[200] flex max-w-sm items-start gap-3 rounded-xl border bg-zinc-900 px-4 py-3 text-sm shadow-2xl ${
            isSuccess ? 'border-green-500/30 text-green-300' : 'border-red-500/30 text-red-300'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-400" />
          ) : (
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
          )}
          <span className="flex-1">{message}</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
