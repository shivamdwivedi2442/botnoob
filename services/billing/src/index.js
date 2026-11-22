const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { securityMiddleware, z } = require('../../shared/security');
const { createAuthMiddleware } = require('../../shared/auth');
const { ensurePlanColumns, applyPaidPlan, DEFAULT_DURATION_DAYS } = require('../../shared/plans');

const app = express();
const connectionString = process.env.DATABASE_URL;
const isLocalDatabase = !connectionString || /(localhost|127\.0\.0\.1|::1)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  query_timeout: 5000
});
pool.on('error', (err) => console.error('Unexpected database pool error:', err.message));
const auth = createAuthMiddleware(pool);

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

const SUPABASE_TIMEOUT_MS = 8000;
const withTimeout = (promise, ms, message) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const SWIFTUPI_BASE_URL = (process.env.SWIFTUPI_BASE_URL || '').replace(/\/$/, '');
const SWIFTUPI_CHECKOUT_URL = (process.env.SWIFTUPI_CHECKOUT_URL || 'http://localhost:3000').replace(/\/$/, '');
const PAYMENT_REDIRECT_URL = process.env.SWIFTUPI_REDIRECT_URL || 'http://localhost/dashboard?payment=success';
const PLAN_TIERS = new Set(['byok_pro', 'botnoob_ultra']);

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
const RAZORPAY_API_BASE = (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '');

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const BREVO_API_URL = (process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email').replace(/\/$/, '');
const BREVO_SENDER_EMAIL = (process.env.BREVO_SENDER_EMAIL || 'no-reply@botnoob.com').trim();
const BREVO_SENDER_NAME = (process.env.BREVO_SENDER_NAME || 'Botnoob').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost').replace(/\/$/, '');
const RENEWAL_WARNING_DAYS = 3;
const DAY_MS = 86400000;

const planLabelFor = (plan) => {
  const normalized = String(plan || '').toLowerCase();
  if (normalized.includes('ultra')) return 'Botnoob Ultra';
  if (normalized.includes('pro')) return 'Byok Pro';
  return 'your plan';
};

const sendBrevoEmail = async ({ to, subject, htmlContent }) => {
  if (!BREVO_API_KEY || !to) return { sent: false, reason: 'not_configured' };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  return { sent: true };
};

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
securityMiddleware(app);

const createOrderSchema = z.object({
  plan_name: z.string().trim().min(1).max(64),
  coupon_code: z.string().trim().max(64).optional()
});

const razorpayCheckoutSchema = z.object({
  plan_name: z.string().trim().min(1).max(64),
  coupon_code: z.string().trim().max(64).optional()
});

const razorpayVerifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(128),
  razorpay_payment_id: z.string().trim().min(1).max(128),
  razorpay_signature: z.string().trim().min(1).max(256),
  plan_name: z.string().trim().min(1).max(64).optional()
});

const roundAmount = (value) => Math.round(Number(value) * 100) / 100;

const toPositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const safeCompare = (expected, received) => {
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
};

const verifyRazorpayPaymentSignature = (orderId, paymentId, signature) => {
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeCompare(expected, signature);
};

const fetchRazorpayOrder = async (orderId) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !orderId) return null;

  try {
    const response = await fetch(`${RAZORPAY_API_BASE}/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch Razorpay order:', err.message);
    return null;
  }
};

const escapeLike = (value) => String(value).replace(/[\\%_]/g, (char) => `\\${char}`);

const findCoupon = async (code) => {
  const now = new Date().toISOString();
  const { data, error } = await withTimeout(
    supabase
      .from('discount_coupons')
      .select('code, discount_percent')
      .ilike('code', escapeLike(code))
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    'Coupon lookup timed out'
  );

  if (error) throw new Error(`Coupon lookup failed: ${error.message}`);
  return data || null;
};

const upgradeRazorpayPlan = async ({
  userId,
  planName,
  durationDays,
  paymentId,
  orderId,
  amount
}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, plan_tier, plan_expires_at FROM users WHERE id::text = $1 FOR UPDATE',
      [userId]
    );
    if (!userResult.rows[0]) {
      await client.query('ROLLBACK');
      return { upgraded: false, reason: 'user_not_found' };
    }

    // Razorpay can deliver both payment.captured and order.paid for the same
    // order. Skip a second activation for an order that is already settled.
    if (orderId) {
      const existingPayment = await client.query(
        `SELECT id FROM razorpay_payments WHERE order_id = $1 AND status = 'captured' LIMIT 1`,
        [orderId]
      );
      if (existingPayment.rows[0]) {
        await client.query('COMMIT');
        return { upgraded: false, duplicate: true };
      }
    }

    // A unique payment_id makes the upgrade idempotent even when the browser
    // verification and the server-to-server webhook race each other.
    const paymentInsert = await client.query(
      `INSERT INTO razorpay_payments (payment_id, order_id, user_id, plan_name, amount, status)
       VALUES ($1, $2, $3, $4, $5, 'captured')
       ON CONFLICT (payment_id) DO NOTHING
       RETURNING id`,
      [paymentId, orderId || null, userId, planName, amount || null]
    );

    if (paymentInsert.rowCount === 0) {
      await client.query('COMMIT');
      return { upgraded: false, duplicate: true };
    }

    const planResult = await client.query(
      'SELECT plan_name, max_bots, duration_days FROM pricing_configs WHERE plan_name = $1 LIMIT 1',
      [planName]
    );
    const livePlan = planResult.rows[0] || null;
    const days = toPositiveInt(livePlan?.duration_days, toPositiveInt(durationDays, DEFAULT_DURATION_DAYS));
    const maxBots = toPositiveInt(livePlan?.max_bots, null);

    // Renewing the same active plan extends the existing expiry so unused
    // days carry forward; switching plans starts a fresh cycle from now.
    const currentPlan = String(userResult.rows[0].plan_tier || '').trim().toLowerCase();
    const purchasedPlan = String(planName || '').trim().toLowerCase();
    const currentExpiry = userResult.rows[0].plan_expires_at
      ? new Date(userResult.rows[0].plan_expires_at)
      : null;
    const carryForward =
      currentPlan === purchasedPlan && currentExpiry && currentExpiry.getTime() > Date.now();
    const baseExpiry = carryForward ? currentExpiry : null;

    await client.query(
      `UPDATE users
       SET plan_tier = $1,
           plan_expires_at = CASE
             WHEN $2::timestamptz IS NOT NULL
               THEN $2::timestamptz + ($3::text || ' days')::interval
             ELSE NOW() + ($3::text || ' days')::interval
           END,
           updated_at = NOW()
       WHERE id::text = $4`,
      [planName, baseExpiry, days, userId]
    );

    // Reset the reminder marker for the new billing cycle without letting a
    // missing column abort the paid-plan activation.
    await client.query('SAVEPOINT razorpay_renewal_reset');
    try {
      await client.query(
        'UPDATE users SET renewal_reminder_sent_for = NULL WHERE id::text = $1',
        [userId]
      );
      await client.query('RELEASE SAVEPOINT razorpay_renewal_reset');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT razorpay_renewal_reset');
    }

    // Keep users.max_bots in sync when the column exists without letting a
    // missing column abort the paid-plan activation.
    await client.query('SAVEPOINT razorpay_max_bots');
    try {
      await client.query(
        'UPDATE users SET max_bots = COALESCE($1, max_bots) WHERE id::text = $2',
        [maxBots, userId]
      );
      await client.query('RELEASE SAVEPOINT razorpay_max_bots');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT razorpay_max_bots');
    }

    if (orderId) {
      await client.query(
        `UPDATE razorpay_orders SET status = 'paid', updated_at = NOW() WHERE order_id = $1`,
        [orderId]
      );
    }

    await client.query('COMMIT');
    return { upgraded: true, plan: planName, duration_days: days, max_bots: maxBots };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

let reminderSweepRunning = false;

const buildRenewalReminderHtml = ({ planLabel, daysLeft, expiresAt }) => {
  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'soon';

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
      <h2 style="margin:0 0 8px;color:#0e7490">Your ${planLabel} plan is expiring</h2>
      <p style="margin:0 0 16px;line-height:1.6">
        Your ${planLabel} plan expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>
        (${expiryText}). Renew now to keep your bots running without auto-pause.
      </p>
      <p style="margin:0 0 24px;line-height:1.6;color:#52525b">
        Remaining days will be added to your new plan, so you never lose paid time.
      </p>
      <a href="${FRONTEND_URL}/pricing" style="display:inline-block;background:#06b6d4;color:#0b0b0f;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">
        Renew ${planLabel}
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">— The Botnoob team</p>
    </div>
  `;
};

const sweepRenewalReminders = async () => {
  if (reminderSweepRunning) return;
  reminderSweepRunning = true;

  try {
    const { rows } = await pool.query(
      `SELECT id, email, plan_tier, plan_expires_at
       FROM users
       WHERE plan_expires_at IS NOT NULL
         AND plan_expires_at > NOW()
         AND plan_expires_at <= NOW() + ($1::text || ' days')::interval
         AND LOWER(COALESCE(plan_tier, 'free')) NOT IN ('free', 'free_byok')
         AND (renewal_reminder_sent_for IS NULL OR renewal_reminder_sent_for < plan_expires_at)`,
      [RENEWAL_WARNING_DAYS]
    );

    for (const user of rows) {
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(user.plan_expires_at).getTime() - Date.now()) / DAY_MS)
      );
      const planLabel = planLabelFor(user.plan_tier);

      if (!BREVO_API_KEY) {
        // Leave the reminder unmarked so it can be sent once Brevo is configured.
        continue;
      }

      try {
        await sendBrevoEmail({
          to: user.email,
          subject: `Your ${planLabel} plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          htmlContent: buildRenewalReminderHtml({
            planLabel,
            daysLeft,
            expiresAt: user.plan_expires_at
          })
        });
        await pool.query(
          `UPDATE users SET renewal_reminder_sent_for = plan_expires_at, updated_at = NOW() WHERE id = $1`,
          [user.id]
        );
        console.log(`Sent renewal reminder to user ${user.id} (${planLabel}, ${daysLeft} day(s) left).`);
      } catch (err) {
        console.error(`Failed to send renewal reminder to user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Renewal reminder sweep failed:', err.message);
  } finally {
    reminderSweepRunning = false;
  }
};

const markTransactionFailed = async (transactionId) => {
  if (!transactionId) return;

  try {
    const { error } = await withTimeout(
      supabase.from('swiftupi_transactions').update({ status: 'failed' }).eq('id', transactionId),
      SUPABASE_TIMEOUT_MS,
      'Failed transaction update timed out'
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('Failed to mark transaction as failed:', err.message);
  }
};

const markTransactionFailedInBackground = (transactionId) => {
  if (!transactionId) return;
  void markTransactionFailed(transactionId).catch((err) =>
    console.error('Failed to mark transaction as failed:', err.message)
  );
};

const persistGatewayDetails = (transactionId, paymentId, upiId) => {
  void (async () => {
    try {
      const { error } = await supabase
        .from('swiftupi_transactions')
        .update({ gateway_payment_id: paymentId, upi_id: upiId || null })
        .eq('id', transactionId);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('Failed to persist gateway payment details:', err.message);
    }
  })();
};

app.get(['/plans', '/api/billing/plans'], async (req, res) => {
  // Always reflect the latest Super Admin edits; never serve stale pricing.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const fetchPlans = (includeDuration) =>
      withTimeout(
        supabase
          .from('pricing_configs')
          .select(
            includeDuration
              ? 'plan_name, price_monthly, max_bots, duration_days, features'
              : 'plan_name, price_monthly, max_bots, features'
          )
          .order('price_monthly', { ascending: true })
          .order('plan_name', { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        'Pricing lookup timed out'
      );

    let { data, error } = await fetchPlans(true);
    if (error && /duration_days/i.test(error.message || '')) {
      ({ data, error } = await fetchPlans(false));
    }

    if (error) throw new Error(error.message);

    res.json(
      (data || []).map((plan) => ({
        ...plan,
        features: plan.features || {},
        price_monthly: Number(plan.price_monthly),
        max_bots: Number(plan.max_bots),
        duration_days: Number(plan.duration_days) || DEFAULT_DURATION_DAYS
      }))
    );
  } catch (err) {
    console.error('Failed to fetch plans:', err.message);
    res.status(500).json({ error: 'Failed to fetch pricing plans' });
  }
});

app.post(['/create-order', '/api/billing/create-order'], auth, async (req, res) => {
  if (!SWIFTUPI_BASE_URL || !process.env.SWIFTUPI_API_KEY || !process.env.SWIFTUPI_API_SECRET) {
    return res.status(503).json({ error: 'SwiftUPI payment gateway is not configured' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  let transactionId = null;

  try {
    const data = createOrderSchema.parse(req.body);

    const [planResult, coupon] = await Promise.all([
      withTimeout(
        supabase
          .from('pricing_configs')
          .select('plan_name, price_monthly')
          .eq('plan_name', data.plan_name)
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        'Plan lookup timed out'
      ),
      data.coupon_code ? findCoupon(data.coupon_code) : Promise.resolve(null)
    ]);

    const { data: plan, error: planError } = planResult;
    if (planError) throw new Error(planError.message);
    if (!plan) return res.status(400).json({ error: 'Unknown pricing plan' });

    let discountPercent = 0;
    let couponCode = null;

    if (data.coupon_code) {
      if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon code' });
      discountPercent = Number(coupon.discount_percent) || 0;
      couponCode = coupon.code;
    }

    const amount = roundAmount(Number(plan.price_monthly) * (1 - discountPercent / 100));
    if (!(amount > 0)) {
      return res.status(400).json({ error: 'Coupon cannot reduce the order total to zero' });
    }

    const transactionRef = crypto.randomUUID();

    const { data: transaction, error: insertError } = await withTimeout(
      supabase
        .from('swiftupi_transactions')
        .insert({
          user_id: req.user.id,
          amount,
          status: 'pending',
          transaction_ref: transactionRef,
          plan_name: plan.plan_name,
          coupon_code: couponCode
        })
        .select('id')
        .single(),
      SUPABASE_TIMEOUT_MS,
      'Transaction insert timed out'
    );

    if (insertError) throw new Error(insertError.message);
    transactionId = transaction?.id || null;

    const orderPayload = {
      amount,
      order_id: transactionRef,
      customer_email: req.user.email,
      callback_url: PAYMENT_REDIRECT_URL,
      redirect_url: PAYMENT_REDIRECT_URL
    };

    let gatewayResponse;
    try {
      gatewayResponse = await fetch(`${SWIFTUPI_BASE_URL}/api/v1/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SWIFTUPI_API_KEY,
          'X-API-Secret': process.env.SWIFTUPI_API_SECRET
        },
        body: JSON.stringify(orderPayload),
        signal: AbortSignal.timeout(8000)
      });
    } catch (err) {
      markTransactionFailedInBackground(transactionId);
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      const cause = err.cause?.message || err.cause?.code;
      const detail = timedOut
        ? `no response within 8s from ${SWIFTUPI_BASE_URL}`
        : [err.message, cause].filter(Boolean).join(': ');
      console.error('SwiftUPI order request failed:', detail);
      return res.status(502).json({
        error: 'Payment gateway is unreachable',
        message: `SwiftUPI is unreachable: ${detail}`,
        details: detail,
        gateway: SWIFTUPI_BASE_URL,
        retryable: true
      });
    }

    const gatewayBody = await gatewayResponse.text();
    let gatewayData = {};
    try {
      gatewayData = gatewayBody ? JSON.parse(gatewayBody) : {};
    } catch (err) {
      gatewayData = {};
    }

    if (!gatewayResponse.ok || !gatewayData.payment_id) {
      markTransactionFailedInBackground(transactionId);
      const upstreamDetail =
        gatewayData.error ||
        gatewayData.message ||
        gatewayBody.slice(0, 300) ||
        `HTTP ${gatewayResponse.status}`;
      const detail = `SwiftUPI returned ${gatewayResponse.status}: ${
        typeof upstreamDetail === 'string' ? upstreamDetail : JSON.stringify(upstreamDetail)
      }`;
      console.error('SwiftUPI order creation failed:', detail);
      return res.status(502).json({
        error: 'Failed to create payment order',
        message: detail,
        details: upstreamDetail,
        gateway_status: gatewayResponse.status,
        gateway: SWIFTUPI_BASE_URL,
        retryable: gatewayResponse.status >= 500
      });
    }

    const checkoutUrl =
      gatewayData.checkout_url ||
      `${SWIFTUPI_CHECKOUT_URL}/pay/${gatewayData.payment_id || transactionRef}`;

    // Respond as soon as SwiftUPI replies; persist gateway metadata in the background.
    res.json({
      checkout_url: checkoutUrl,
      payment_id: gatewayData.payment_id,
      transaction_ref: transactionRef,
      plan_name: plan.plan_name,
      amount,
      discount_percent: discountPercent,
      coupon_code: couponCode,
      expires_at: gatewayData.expires_at || null
    });

    if (transactionId) {
      persistGatewayDetails(transactionId, gatewayData.payment_id, gatewayData.upi_uri);
    }
  } catch (err) {
    markTransactionFailedInBackground(transactionId);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid checkout request' });
    }
    console.error('Create order failed:', err.message);
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: err.message,
      details: err.message
    });
  }
});

app.post(['/checkout', '/api/billing/checkout'], auth, async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Razorpay payment gateway is not configured' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const data = razorpayCheckoutSchema.parse(req.body);

    const { data: plan, error: planError } = await withTimeout(
      supabase
        .from('pricing_configs')
        .select('plan_name, price_monthly, duration_days, max_bots')
        .eq('plan_name', data.plan_name)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      'Plan lookup timed out'
    );

    if (planError) throw new Error(planError.message);
    if (!plan) return res.status(400).json({ error: 'Unknown pricing plan' });

    const price = Number(plan.price_monthly);
    if (!(price > 0)) {
      return res.status(400).json({ error: 'This plan is not available for purchase' });
    }

    const durationDays = toPositiveInt(plan.duration_days, DEFAULT_DURATION_DAYS);

    let discountPercent = 0;
    let couponCode = null;
    if (data.coupon_code) {
      const coupon = await findCoupon(data.coupon_code);
      if (!coupon) return res.status(400).json({ error: 'Invalid or expired coupon code' });
      discountPercent = Number(coupon.discount_percent) || 0;
      couponCode = coupon.code;
    }

    const baseAmount = Math.round(price * 100);
    const amount =
      discountPercent > 0
        ? Math.round(baseAmount * (1 - discountPercent / 100))
        : baseAmount;
    if (!(amount > 0)) {
      return res.status(400).json({ error: 'Coupon cannot reduce the order total to zero' });
    }

    const receipt = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

    let orderResponse;
    try {
      orderResponse = await fetch(`${RAZORPAY_API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`
        },
        body: JSON.stringify({
          amount,
          currency: 'INR',
          receipt,
          notes: {
            user_id: String(req.user.id),
            plan_name: plan.plan_name,
            duration_days: String(durationDays)
          }
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      console.error('Razorpay order request failed:', err.message);
      return res.status(502).json({
        error: 'Payment gateway is unreachable',
        message: timedOut ? 'Razorpay did not respond in time' : err.message,
        retryable: true
      });
    }

    const orderBody = await orderResponse.text();
    let orderData = {};
    try {
      orderData = orderBody ? JSON.parse(orderBody) : {};
    } catch (err) {
      orderData = {};
    }

    if (!orderResponse.ok || !orderData.id) {
      const detail =
        orderData?.error?.description ||
        orderData?.message ||
        orderBody.slice(0, 300) ||
        `HTTP ${orderResponse.status}`;
      console.error('Razorpay order creation failed:', detail);
      return res.status(502).json({
        error: 'Failed to create Razorpay order',
        message: typeof detail === 'string' ? detail : JSON.stringify(detail)
      });
    }

    try {
      await pool.query(
        `INSERT INTO razorpay_orders (order_id, user_id, plan_name, amount, currency, duration_days, status)
         VALUES ($1, $2, $3, $4, 'INR', $5, 'created')
         ON CONFLICT (order_id) DO NOTHING`,
        [
          orderData.id,
          req.user.id,
          plan.plan_name,
          Number(orderData.amount ?? amount),
          durationDays
        ]
      );
    } catch (err) {
      // Order persistence is a convenience for verification/webhooks; never
      // fail a live checkout because of it.
      console.error('Failed to persist Razorpay order:', err.message);
    }

    res.json({
      order_id: orderData.id,
      amount: Number(orderData.amount ?? amount),
      currency: 'INR',
      key_id: RAZORPAY_KEY_ID,
      plan_name: plan.plan_name,
      duration_days: durationDays
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid checkout request' });
    }
    console.error('Razorpay checkout failed:', err.message);
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: err.message
    });
  }
});

app.post(['/verify-razorpay', '/api/billing/verify-razorpay'], auth, async (req, res) => {
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Razorpay payment gateway is not configured' });
  }

  try {
    const data = razorpayVerifySchema.parse(req.body);

    if (
      !verifyRazorpayPaymentSignature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature
      )
    ) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    let order = null;
    try {
      const orderResult = await pool.query(
        'SELECT order_id, user_id, plan_name, duration_days, amount FROM razorpay_orders WHERE order_id = $1 LIMIT 1',
        [data.razorpay_order_id]
      );
      order = orderResult.rows[0] || null;
    } catch (err) {
      console.error('Failed to load Razorpay order:', err.message);
    }

    // If the local order row is missing (for example, persistence failed),
    // recover the server-authored plan/user reference from Razorpay itself.
    if (!order) {
      const remoteOrder = await fetchRazorpayOrder(data.razorpay_order_id);
      if (remoteOrder) {
        const notes = remoteOrder.notes || {};
        order = {
          order_id: remoteOrder.id,
          user_id: notes.user_id || null,
          plan_name: notes.plan_name || null,
          duration_days: notes.duration_days || null,
          amount: remoteOrder.amount ?? null
        };
      }
    }

    if (order?.user_id && String(order.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'This payment belongs to a different account' });
    }

    const planName = order?.plan_name || data.plan_name;
    if (!planName) return res.status(400).json({ error: 'Missing plan reference for this payment' });

    if (!order) {
      const planResult = await pool.query(
        'SELECT plan_name FROM pricing_configs WHERE plan_name = $1 LIMIT 1',
        [planName]
      );
      if (!planResult.rows[0]) return res.status(400).json({ error: 'Unknown pricing plan' });
    }

    const result = await upgradeRazorpayPlan({
      userId: req.user.id,
      planName,
      durationDays: order?.duration_days || null,
      paymentId: data.razorpay_payment_id,
      orderId: data.razorpay_order_id,
      amount: order?.amount || null
    });

    if (result.reason === 'user_not_found') {
      return res.status(404).json({ error: 'User account not found' });
    }

    res.json({
      success: true,
      already_processed: Boolean(result.duplicate),
      plan: result.plan || planName,
      duration_days: result.duration_days || null,
      max_bots: result.max_bots ?? null
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid payment verification request' });
    }
    console.error('Razorpay verification failed:', err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

app.post(['/webhook/razorpay', '/api/billing/webhook/razorpay'], async (req, res) => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Razorpay webhook secret is not configured' });
  }

  const signature = req.headers['x-razorpay-signature'];
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  if (!safeCompare(expected, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body || {};
  const event = String(payload.event || '');
  if (!['payment.captured', 'order.paid'].includes(event)) {
    return res.status(200).json({ status: 'ignored' });
  }

  const payment = payload.payload?.payment?.entity || {};
  const order = payload.payload?.order?.entity || {};
  const orderId = payment.order_id || order.id || null;
  const paymentId = payment.id || (event === 'order.paid' && orderId ? `order_${orderId}` : null);

  if (!paymentId) return res.status(400).json({ error: 'Missing payment reference' });

  let userId = payment.notes?.user_id || order.notes?.user_id || null;
  let planName = payment.notes?.plan_name || order.notes?.plan_name || null;
  let durationDays = payment.notes?.duration_days || order.notes?.duration_days || null;
  let storedOrder = null;

  if (orderId) {
    try {
      const orderResult = await pool.query(
        'SELECT user_id, plan_name, duration_days, amount FROM razorpay_orders WHERE order_id = $1 LIMIT 1',
        [orderId]
      );
      storedOrder = orderResult.rows[0] || null;
    } catch (err) {
      console.error('Failed to load Razorpay order:', err.message);
    }
  }

  if (storedOrder) {
    userId = userId || storedOrder.user_id;
    planName = storedOrder.plan_name || planName;
    durationDays = storedOrder.duration_days || durationDays;
  }

  if (!userId || !planName) {
    return res.status(400).json({ error: 'Missing payment plan or user reference' });
  }

  try {
    const result = await upgradeRazorpayPlan({
      userId,
      planName,
      durationDays,
      paymentId,
      orderId,
      amount: payment.amount ?? storedOrder?.amount ?? null
    });

    if (result.reason === 'user_not_found') {
      return res.status(404).json({ error: 'User account not found' });
    }

    return res.status(200).json({ status: 'ok', already_processed: Boolean(result.duplicate) });
  } catch (err) {
    console.error('Razorpay webhook failed:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post(['/webhooks/swiftupi', '/api/billing/webhooks/swiftupi'], async (req, res) => {
  const secret = process.env.SWIFTUPI_WEBHOOK_SECRET;
  const signature = req.headers['x-swiftupi-signature'];

  if (!secret) return res.status(500).json({ error: 'Webhook secret is not configured' });
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = String(signature);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body || {};
  const status = String(payload.status || '').toUpperCase();
  if (!['PAID', 'COMPLETED', 'SUCCESS'].includes(status)) {
    return res.status(200).send('OK');
  }

  const orderId = payload.order_id || null;
  const paymentId = payload.payment_id || payload.paymentId || null;
  if (!orderId && !paymentId) return res.status(400).json({ error: 'Missing order reference' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txResult = await client.query(
      `SELECT *
       FROM swiftupi_transactions
       WHERE ($1::text IS NOT NULL AND transaction_ref = $1)
          OR ($2::text IS NOT NULL AND gateway_payment_id = $2)
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [orderId, paymentId]
    );

    const transaction = txResult.rows[0];
    if (!transaction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'paid') {
      await client.query('COMMIT');
      return res.status(200).send('OK');
    }

    await client.query(
      `UPDATE swiftupi_transactions
       SET status = 'paid', upi_id = COALESCE($1, upi_id)
       WHERE id = $2`,
      [payload.utr || null, transaction.id]
    );

    const knownPlan = await client.query('SELECT plan_name FROM pricing_configs WHERE plan_name = $1 LIMIT 1', [
      transaction.plan_name
    ]);
    const planTier =
      knownPlan.rows[0]?.plan_name ||
      (PLAN_TIERS.has(transaction.plan_name)
        ? transaction.plan_name
        : Number(transaction.amount) >= 900
          ? 'botnoob_ultra'
          : 'byok_pro');

    // Custom plans may exist before the duration column is migrated; keep the
    // payment transaction usable even if plan expiry cannot be persisted yet.
    await client.query('SAVEPOINT plan_activation');
    try {
      await applyPaidPlan(client, transaction.user_id, planTier);
      await client.query('RELEASE SAVEPOINT plan_activation');
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT plan_activation');
      await client.query('UPDATE users SET plan_tier = $1, updated_at = NOW() WHERE id = $2', [
        planTier,
        transaction.user_id
      ]);
    }

    await client.query('COMMIT');
    res.status(200).send('OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('SwiftUPI webhook failed:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'billing-upi-service' }));

const ensureRazorpayTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS razorpay_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id TEXT UNIQUE NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      plan_name TEXT NOT NULL,
      amount NUMERIC,
      currency TEXT DEFAULT 'INR',
      duration_days INT DEFAULT 30,
      status TEXT DEFAULT 'created',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS razorpay_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id TEXT UNIQUE NOT NULL,
      order_id TEXT,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      plan_name TEXT,
      amount NUMERIC,
      status TEXT DEFAULT 'captured',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_razorpay_orders_order ON razorpay_orders(order_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_razorpay_payments_payment ON razorpay_payments(payment_id)'
  );
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_razorpay_payments_order ON razorpay_payments(order_id)'
  );
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bots INT');
};

const start = async () => {
  await ensurePlanColumns(pool);
  try {
    await pool.query('ALTER TABLE swiftupi_transactions ADD COLUMN IF NOT EXISTS plan_name TEXT');
    await pool.query('ALTER TABLE swiftupi_transactions ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT');
    await pool.query('ALTER TABLE swiftupi_transactions ADD COLUMN IF NOT EXISTS coupon_code TEXT');
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_swiftupi_tx_gateway_payment ON swiftupi_transactions(gateway_payment_id)'
    );
  } catch (err) {
    console.error('Failed to ensure billing columns:', err.message);
  }
  try {
    await ensureRazorpayTables();
  } catch (err) {
    console.error('Failed to ensure Razorpay tables:', err.message);
  }

  setTimeout(() => {
    void sweepRenewalReminders();
  }, 10000);
  setInterval(() => {
    void sweepRenewalReminders();
  }, 60000);

  app.listen(4004, () => console.log('Billing Service running on port 4004'));
};

start();
