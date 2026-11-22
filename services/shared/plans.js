const FREE_PLAN = 'free_byok';
const DEFAULT_DURATION_DAYS = 30;

const toPositiveInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isFreePlan = (plan) => {
  const normalized = String(plan || '').trim().toLowerCase();
  return !normalized || normalized === 'free' || normalized === FREE_PLAN;
};

let planColumnsReady = false;

const ensurePlanColumns = async (db) => {
  if (planColumnsReady) return;

  let usersReady = false;
  let pricingReady = false;

  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ');
    usersReady = true;
  } catch (err) {
    console.error('Failed to ensure users.plan_expires_at:', err.message);
  }

  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bots INT');
  } catch (err) {
    console.error('Failed to ensure users.max_bots:', err.message);
  }

  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS renewal_reminder_sent_for TIMESTAMPTZ');
  } catch (err) {
    console.error('Failed to ensure users.renewal_reminder_sent_for:', err.message);
  }

  try {
    await db.query('ALTER TABLE pricing_configs ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT 30');
    await db.query('UPDATE pricing_configs SET duration_days = 30 WHERE duration_days IS NULL');
    pricingReady = true;
  } catch (err) {
    console.error('Failed to ensure pricing_configs.duration_days:', err.message);
  }

  planColumnsReady = usersReady && pricingReady;
};

const normalizePlan = (plan) => {
  if (!plan) return null;
  return {
    ...plan,
    price_monthly: plan.price_monthly === null || plan.price_monthly === undefined ? null : Number(plan.price_monthly),
    max_bots: toPositiveInt(plan.max_bots, null),
    duration_days: toPositiveInt(plan.duration_days, DEFAULT_DURATION_DAYS)
  };
};

const getPricingPlan = async (db, planName) => {
  if (!planName) return null;

  try {
    const result = await db.query(
      'SELECT plan_name, price_monthly, max_bots, duration_days, features FROM pricing_configs WHERE plan_name = $1 LIMIT 1',
      [planName]
    );
    return normalizePlan(result.rows[0]);
  } catch (err) {
    try {
      const result = await db.query(
        'SELECT plan_name, price_monthly, max_bots, features FROM pricing_configs WHERE plan_name = $1 LIMIT 1',
        [planName]
      );
      return normalizePlan(result.rows[0]);
    } catch (fallbackErr) {
      console.error('Failed to load pricing plan:', fallbackErr.message);
      return null;
    }
  }
};

const resolveUserPlan = async (db, userId, fallback = {}) => {
  await ensurePlanColumns(db);

  let row = null;
  try {
    const result = await db.query('SELECT plan_tier, plan_expires_at FROM users WHERE id::text = $1', [userId]);
    row = result.rows[0] || null;
  } catch (err) {
    try {
      const result = await db.query('SELECT plan_tier FROM users WHERE id::text = $1', [userId]);
      row = result.rows[0] || null;
    } catch (fallbackErr) {
      console.error('Failed to load user plan:', fallbackErr.message);
    }
  }

  let plan = row?.plan_tier || fallback.plan || FREE_PLAN;
  let expiresAt = row?.plan_expires_at || null;
  let expired = false;

  if (!isFreePlan(plan) && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    expired = true;
    plan = FREE_PLAN;
    expiresAt = null;

    try {
      await db.query(
        'UPDATE users SET plan_tier = $1, plan_expires_at = NULL, updated_at = NOW() WHERE id::text = $2',
        [FREE_PLAN, userId]
      );
    } catch (err) {
      try {
        await db.query('UPDATE users SET plan_tier = $1, updated_at = NOW() WHERE id::text = $2', [
          FREE_PLAN,
          userId
        ]);
      } catch (fallbackErr) {
        console.error('Failed to downgrade expired plan:', fallbackErr.message);
      }
    }
  }

  const pricing = await getPricingPlan(db, plan);
  const liveMaxBots = toPositiveInt(pricing?.max_bots, null);
  const fallbackMaxBots = toPositiveInt(fallback.maxBots, null);

  return {
    plan,
    plan_tier: plan,
    plan_expires_at: expiresAt,
    max_bots: liveMaxBots || fallbackMaxBots || null,
    expired,
    pricing
  };
};

const applyPaidPlan = async (db, userId, planName) => {
  const pricing = await getPricingPlan(db, planName);
  const durationDays = toPositiveInt(pricing?.duration_days, DEFAULT_DURATION_DAYS);

  try {
    await db.query(
      `UPDATE users
       SET plan_tier = $1,
           plan_expires_at = NOW() + ($2::text || ' days')::interval,
           updated_at = NOW()
       WHERE id::text = $3`,
      [planName, durationDays, userId]
    );
  } catch (err) {
    console.error('Failed to set plan expiry, falling back to plan tier only:', err.message);
    await db.query('UPDATE users SET plan_tier = $1, updated_at = NOW() WHERE id::text = $2', [
      planName,
      userId
    ]);
  }

  return { plan_name: planName, duration_days: durationDays };
};

module.exports = {
  FREE_PLAN,
  DEFAULT_DURATION_DAYS,
  isFreePlan,
  ensurePlanColumns,
  normalizePlan,
  getPricingPlan,
  resolveUserPlan,
  applyPaidPlan
};
