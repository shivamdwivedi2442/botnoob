const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { securityMiddleware, z } = require('../../shared/security');
const { createAuthMiddleware } = require('../../shared/auth');

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

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
securityMiddleware(app);

const createOrderSchema = z.object({
  plan_name: z.enum(['byok_pro', 'botnoob_ultra']),
  coupon_code: z.string().trim().max(64).optional()
});

const roundAmount = (value) => Math.round(Number(value) * 100) / 100;

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
    const { data, error } = await withTimeout(
      supabase
        .from('pricing_configs')
        .select('plan_name, price_monthly, max_bots, features')
        .order('price_monthly', { ascending: true })
        .order('plan_name', { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      'Pricing lookup timed out'
    );

    if (error) throw new Error(error.message);

    res.json(
      (data || []).map((plan) => ({
        ...plan,
        features: plan.features || {},
        price_monthly: Number(plan.price_monthly),
        max_bots: Number(plan.max_bots)
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

    const planTier = PLAN_TIERS.has(transaction.plan_name)
      ? transaction.plan_name
      : Number(transaction.amount) >= 900
        ? 'botnoob_ultra'
        : 'byok_pro';

    await client.query('UPDATE users SET plan_tier = $1, updated_at = NOW() WHERE id = $2', [
      planTier,
      transaction.user_id
    ]);

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

const start = async () => {
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
  app.listen(4004, () => console.log('Billing Service running on port 4004'));
};

start();
