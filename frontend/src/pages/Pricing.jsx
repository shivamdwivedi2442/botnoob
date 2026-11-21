import { Check, Zap, Rocket, Crown, Loader2, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useSEO } from '../hooks/useSEO';
import { openRazorpayCheckout } from '../lib/razorpay';

const Pricing = () => {
  useSEO({
    title: 'Pricing & Plans',
    description: 'Start for free or upgrade to BYOK Pro. Transparent pricing for AI bot hosting and automation.',
    keywords: 'AI bot pricing, telegram bot hosting cost, discord bot subscriptions, Botnoob plans',
    path: '/pricing'
  });

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState('');
  const [loadingPlan, setLoadingPlan] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const navigate = useNavigate();
  const { user, checkUser } = useAuth();

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/billing/plans');
      const livePlans = Array.isArray(res.data) ? res.data : [];
      setPlans(livePlans);
      if (livePlans.length === 0) {
        setError('No pricing plans are configured yet. Please check back soon.');
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
      setPlans([]);
      setError('Could not load live pricing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleCheckout = async (planName) => {
    setError('');

    if (planName === 'free_byok') {
      navigate(user ? '/dashboard' : '/signup');
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    setLoadingPlan(planName);
    try {
      const payload = { plan_name: planName };
      const couponCode = coupon.trim();
      if (couponCode) payload.coupon_code = couponCode;

      const res = await api.post('/billing/checkout', payload);
      const order = res.data;
      if (!order?.order_id || !order?.key_id) {
        throw new Error('Checkout session is missing Razorpay details.');
      }

      await openRazorpayCheckout({
        order,
        user,
        onSuccess: async (response) => {
          try {
            const verify = await api.post('/billing/verify-razorpay', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_name: order.plan_name
            });

            setToast(
              `Payment successful! Your ${String(verify.data?.plan || order.plan_name).replace(/_/g, ' ')} plan is now active.`
            );
            await checkUser?.();
          } catch (err) {
            setError(
              err.response?.data?.message ||
                err.response?.data?.error ||
                err.message ||
                'Payment verification failed. Contact support if you were charged.'
            );
          } finally {
            setLoadingPlan('');
          }
        },
        onFailure: (response) => {
          setError(response?.error?.description || 'Payment failed. Please try again.');
          setLoadingPlan('');
        },
        onDismiss: () => setLoadingPlan('')
      });
    } catch (err) {
      setError(
        err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to start checkout.'
      );
      setLoadingPlan('');
    }
  };

  const getIcon = (name) => {
    if (name.includes('ultra')) return <Crown className="text-yellow-400" />;
    if (name.includes('pro')) return <Rocket className="text-cyan-400" />;
    return <Zap className="text-zinc-400" />;
  };

  const activePlan = user?.plan_tier || user?.plan;
  const planExpiresAt = user?.plan_expires_at;
  const showExpiry = activePlan && activePlan !== 'free_byok' && activePlan !== 'free' && planExpiresAt;

  const formatFeatures = (p) => {
    const list = [`Up to ${p.max_bots} Bots`];
    if (p.features?.byok) list.push('Bring Your Own Keys');
    if (p.features?.uptime_24_7) list.push('24/7 Uptime');
    if (p.features?.built_in_ai) list.push('Built-in AI Credits');
    if (p.features?.mcp) list.push('MCP Support');
    return list;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={40} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <Toast message={toast} variant="success" onClose={() => setToast('')} />
      <div className="text-center mb-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">Simple, Scalable Pricing</h1>
        <p className="text-zinc-500">Start for free, scale to millions. No hidden fees.</p>
      </div>

      {error && (
        <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-bold text-red-300 flex items-center justify-center gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchPlans}
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-red-200 hover:bg-red-500/10"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {showExpiry && (
        <div className="mx-auto mb-8 max-w-xl rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-center text-xs font-bold text-cyan-200">
          Your {String(activePlan).replace(/_/g, ' ')} plan is active until{' '}
          {new Date(planExpiresAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {plans.map((p) => (
          <div
            key={p.plan_name}
            className={`relative frosted-card rounded-3xl p-6 sm:p-8 border-zinc-800 ${
              p.plan_name === 'byok_pro' ? 'border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.1)]' : ''
            }`}
          >
            {p.plan_name === 'byok_pro' && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-cyan-500 text-obsidian text-[10px] font-bold uppercase rounded-full">
                Most Popular
              </div>
            )}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800">
                {getIcon(p.plan_name)}
              </div>
              <h3 className="text-xl font-bold capitalize">{p.plan_name.replace('_', ' ')}</h3>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold">₹{p.price_monthly}</span>
              <span className="text-zinc-500"> / {p.duration_days || 30} days</span>
            </div>
            <ul className="space-y-4 mb-10">
              {formatFeatures(p).map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-zinc-400">
                  <Check size={16} className="text-cyan-500" /> {f}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleCheckout(p.plan_name)}
              disabled={loadingPlan === p.plan_name}
              className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${
                p.plan_name === 'byok_pro'
                  ? 'bg-cyan-500 text-obsidian hover:bg-cyan-400'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
            >
              {loadingPlan === p.plan_name && <Loader2 size={16} className="animate-spin" />}
              {p.plan_name === 'free_byok' ? 'Get Started' : `Upgrade Plan`}
            </button>
          </div>
        ))}
      </div>

      <div className="max-w-md mx-auto frosted-card rounded-2xl p-6 border-zinc-800">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
          Coupon Code (Optional)
        </label>
        <input
          type="text"
          placeholder="Enter coupon code"
          value={coupon}
          onChange={(e) => setCoupon(e.target.value)}
          className="w-full bg-obsidian border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-cyan-500 text-sm"
        />
        <p className="mt-3 text-[11px] text-zinc-500">
          Coupon discounts are validated by the billing service when you continue to checkout.
        </p>
      </div>
    </div>
  );
};

export default Pricing;
