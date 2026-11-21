const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayPromise = null;

export const loadRazorpay = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout is only available in the browser.'));
  }

  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayPromise) return razorpayPromise;

  razorpayPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (existing) {
      if (window.Razorpay) {
        resolve(window.Razorpay);
        return;
      }
      existing.addEventListener('load', () => {
        if (window.Razorpay) {
          resolve(window.Razorpay);
        } else {
          razorpayPromise = null;
          reject(new Error('Razorpay Checkout did not initialize.'));
        }
      });
      existing.addEventListener('error', () => {
        razorpayPromise = null;
        reject(new Error('Failed to load Razorpay Checkout.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        razorpayPromise = null;
        reject(new Error('Razorpay Checkout did not initialize.'));
      }
    };
    script.onerror = () => {
      razorpayPromise = null;
      reject(new Error('Failed to load Razorpay Checkout.'));
    };
    document.body.appendChild(script);
  });

  return razorpayPromise;
};

export const openRazorpayCheckout = async ({ order, user, onSuccess, onFailure, onDismiss }) => {
  const Razorpay = await loadRazorpay();
  const email = user?.email || '';
  const name =
    user?.name || user?.full_name || user?.username || (email ? email.split('@')[0] : '');

  const checkout = new Razorpay({
    key: order.key_id,
    amount: order.amount,
    currency: order.currency || 'INR',
    name: 'Botnoob',
    description: `${order.plan_name} plan · ${order.duration_days} days`,
    order_id: order.order_id,
    prefill: { name, email },
    notes: { plan_name: order.plan_name },
    theme: { color: '#22d3ee' },
    handler: onSuccess,
    modal: {
      ondismiss: () => onDismiss?.(),
      escape: true,
      backdropclose: false
    }
  });

  if (onFailure) {
    checkout.on('payment.failed', onFailure);
  }

  checkout.open();
  return checkout;
};
