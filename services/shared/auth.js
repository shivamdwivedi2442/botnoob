const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const getSupabaseConfig = () => {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
};

const getSupabaseUserFromToken = async (accessToken) => {
  const config = getSupabaseConfig();
  if (!config || !accessToken) return null;

  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    console.error('Supabase token verification failed:', err.message);
    return null;
  }
};

const loadLocalUser = async (pool, id) => {
  const result = await pool.query(
    'SELECT id, email, role, plan_tier, is_banned FROM users WHERE id::text = $1',
    [id]
  );
  return result.rows[0] || null;
};

const loadLocalUserByEmail = async (pool, email) => {
  const result = await pool.query(
    'SELECT id, email, role, plan_tier, is_banned FROM users WHERE LOWER(email) = LOWER($1)',
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
};

const upsertSupabaseUser = async (pool, supabaseUser) => {
  const email = normalizeEmail(supabaseUser?.email);
  if (!email) return null;

  // Try lookup by Supabase ID (as local ID) or email
  const existing = await pool.query(
    'SELECT id, email, role, plan_tier, is_banned FROM users WHERE id::text = $1 OR LOWER(email) = LOWER($2)',
    [supabaseUser.id, email]
  );
  if (existing.rows[0]) return existing.rows[0];

  const passwordHash = await argon2.hash(crypto.randomUUID());
  const result = await pool.query(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
     RETURNING id, email, role, plan_tier, is_banned`,
    [supabaseUser.id, email, passwordHash]
  );
  return result.rows[0] || null;
};

const createAuthMiddleware = (pool) => async (req, res, next) => {
  const acceptUser = (user) => {
    if (!user) return false;
    if (user.is_banned) {
      res.status(403).json({ error: 'Account banned' });
      return false;
    }
    req.user = user;
    next();
    return true;
  };

  try {
    // 1. Bearer Token (Bearer <token>)
    const bearerToken = getBearerToken(req);
    if (bearerToken) {
      // Try as local JWT
      try {
        const decoded = jwt.verify(bearerToken, process.env.ACCESS_TOKEN_SECRET || 'access-secret');
        const user = await loadLocalUser(pool, decoded.id);
        if (user && acceptUser(user)) return;
      } catch (err) {}

      // Try as Supabase token
      const supabaseUser = await getSupabaseUserFromToken(bearerToken);
      if (supabaseUser) {
        const user = await upsertSupabaseUser(pool, supabaseUser);
        if (user && acceptUser(user)) return;
      }
    }

    // 2. Cookie Token (accessToken)
    const cookieToken = req.cookies?.accessToken;
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, process.env.ACCESS_TOKEN_SECRET || 'access-secret');
        const user = await loadLocalUser(pool, decoded.id);
        if (user && acceptUser(user)) return;
      } catch (err) {}
    }

    if (!res.headersSent) return res.status(401).json({ error: 'Unauthorized' });
    return undefined;
  } catch (err) {
    console.error('Authentication failed:', err.message);
    if (!res.headersSent) return res.status(401).json({ error: 'Unauthorized' });
    return undefined;
  }
};

module.exports = {
  createAuthMiddleware,
  getSupabaseUserFromToken,
  normalizeEmail,
  getBearerToken
};
