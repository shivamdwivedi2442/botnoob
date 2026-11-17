const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { securityMiddleware, authLimiter, generateTokens, verifyToken, verifyTurnstile, encrypt, argon2, z } = require('../../shared/security');
const redisClient = require('../../shared/redisClient');
const { ensurePlanColumns, resolveUserPlan } = require('../../shared/plans');

const app = express();
const connectionString = process.env.DATABASE_URL;
const isLocalDatabase = !connectionString || /(localhost|127\.0\.0\.1|::1)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false }
});
pool.on('error', (err) => console.error('Unexpected database pool error:', err.message));

const normalizeEmail = (value) => (value || '').trim().toLowerCase();

const getSupabaseAdminConfig = () => {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
};

const getSupabaseUserByEmail = async (email) => {
  const config = getSupabaseAdminConfig();
  if (!config) return { configured: false, user: null };

  const endpoint = new URL(`${config.url}/auth/v1/admin/users`);
  endpoint.searchParams.set('page', '1');
  endpoint.searchParams.set('per_page', '100');
  endpoint.searchParams.set('filter', email);

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase user lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  const users = Array.isArray(payload) ? payload : payload.users || [];
  const user = users.find((candidate) => normalizeEmail(candidate.email) === normalizeEmail(email));
  return { configured: true, user: user || null };
};

const getSupabaseUserFromToken = async (accessToken) => {
  const config = getSupabaseAdminConfig();
  if (!config) throw new Error('Supabase is not configured');

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) return null;
  return response.json();
};

const isEmailConfirmed = (user) => Boolean(user && user.email_confirmed_at);

const setAuthCookies = (res, accessToken, refreshToken) => {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('accessToken', accessToken, { httpOnly: true, secure, sameSite: 'strict' });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure, sameSite: 'strict' });
  res.cookie('X-CSRF-Token', crypto.randomBytes(24).toString('hex'), {
    httpOnly: false,
    secure,
    sameSite: 'strict'
  });
};

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  plan: user.plan_tier ?? user.plan ?? null,
  plan_tier: user.plan_tier ?? user.plan ?? null,
  plan_expires_at: user.plan_expires_at ?? null,
  max_bots: user.max_bots ?? null
});

const withLivePlan = async (user) => {
  const planState = await resolveUserPlan(pool, user.id, {
    plan: user.plan_tier || user.plan,
    maxBots: user.max_bots
  });

  return {
    ...user,
    plan: planState.plan,
    plan_tier: planState.plan,
    plan_expires_at: planState.plan_expires_at,
    max_bots: planState.max_bots
  };
};

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const upsertLocalUser = async (email, { password, updatePassword = false } = {}) => {
  const passwordHash = await argon2.hash(password || crypto.randomUUID());
  const result = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET updated_at = NOW(),
           password_hash = CASE WHEN $3::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END
     RETURNING id, email, role`,
    [email, passwordHash, updatePassword]
  );
  return result.rows[0];
};

const upsertSupabaseUser = async (supabaseUser, { password, updatePassword = false } = {}) => {
  const email = normalizeEmail(supabaseUser?.email);
  if (!email) throw new Error('Supabase account has no email address');
  return upsertLocalUser(email, { password, updatePassword });
};

app.use(express.json());
securityMiddleware(app);

const ExchangeSchema = z.object({
  session_token: z.string().min(1),
  turnstile_token: z.string().optional(),
  password: z.string().optional()
});

const SyncPasswordSchema = z.object({
  access_token: z.string().min(1),
  password: z.string().min(1)
});

// 1. Indexed lookup < 1s
app.post('/check-user', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Email is required' });
  try {
    const result = await pool.query('SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)', [email]);
    res.json({ exists: result.rows[0].exists });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. Signup
app.post('/signup', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const { password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const hashedPassword = await argon2.hash(password);
    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email, hashedPassword]
    );
    res.json({ message: 'Signup successful. Code sent to email.' });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ message: 'User already exists' });
    } else {
      res.status(500).json({ message: 'Signup failed' });
    }
  }
});

// 3. Login
app.post('/login', authLimiter, async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const { password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    let validPassword = false;
    if (user?.password_hash) {
      try {
        validPassword = await argon2.verify(user.password_hash, password);
      } catch (err) {
        validPassword = false;
      }
    }

    if (!user || !validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    try {
      const { configured, user: supabaseUser } = await getSupabaseUserByEmail(email);
      if (configured && (!supabaseUser || !isEmailConfirmed(supabaseUser))) {
        return res.status(403).json({ error: 'Email not verified', message: 'Email not verified' });
      }
    } catch (err) {
      console.error('Email verification check failed:', err.message);
      return res.status(503).json({ error: 'Email verification unavailable' });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    setAuthCookies(res, accessToken, refreshToken);
    res.json({ message: 'Success', user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// 4. Logout
app.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    try {
      await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [refreshToken]);
    } catch (err) {
      console.error('Failed to revoke refresh token:', err.message);
    }
  }

  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie('accessToken', { secure, sameSite: 'strict' });
  res.clearCookie('refreshToken', { secure, sameSite: 'strict' });
  res.clearCookie('X-CSRF-Token', { secure, sameSite: 'strict' });
  res.json({ message: 'Logged out' });
});

// 5. Verify OTP (Mock)
app.post('/verify-otp', async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const { token } = req.body || {};
  if (!token || token.length !== 6) {
    return res.status(400).json({ message: 'Invalid OTP format' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { accessToken, refreshToken } = generateTokens(user);
    
    await pool.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', 
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ message: 'Success', user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed' });
  }
});

// 5b. OAuth session exchange (Supabase -> BotNoob cookies)
app.post('/oauth-exchange', authLimiter, async (req, res) => {
  const { access_token } = req.body || {};
  if (!access_token) {
    return res.status(400).json({ message: 'Missing OAuth access token' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ message: 'OAuth exchange is not configured' });
  }

  try {
    const supabaseResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${access_token}`
      }
    });

    if (!supabaseResponse.ok) {
      return res.status(401).json({ message: 'Invalid or expired OAuth session' });
    }

    const supabaseUser = await supabaseResponse.json();
    if (!normalizeEmail(supabaseUser.email)) {
      return res.status(400).json({ message: 'OAuth account has no email address' });
    }

    const user = await upsertSupabaseUser(supabaseUser);
    const { accessToken, refreshToken } = generateTokens(user);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO NOTHING',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    setAuthCookies(res, accessToken, refreshToken);
    res.json({ message: 'Success', user: publicUser(user) });
  } catch (err) {
    console.error('OAuth exchange failed:', err.message);
    res.status(500).json({ message: 'OAuth exchange failed' });
  }
});

// 4. Me (Session Check)
app.get('/me', async (req, res) => {
  const token = req.cookies.accessToken;

  if (token) {
    try {
      const decoded = verifyToken(token, process.env.ACCESS_TOKEN_SECRET || 'access-secret');
      let userResult;
      try {
        userResult = await pool.query(
          'SELECT id, email, role, plan_tier, plan_expires_at, is_banned FROM users WHERE id = $1',
          [decoded.id]
        );
      } catch (err) {
        if (err.code !== '42703') throw err;
        userResult = await pool.query(
          'SELECT id, email, role, plan_tier, is_banned FROM users WHERE id = $1',
          [decoded.id]
        );
      }
      const user = userResult.rows[0];
      if (user) return res.json(await withLivePlan(user));
    } catch (err) {
      // Fall through to Supabase session authentication.
    }
  }

  const supabaseToken = getBearerToken(req);
  if (!supabaseToken) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const supabaseUser = await getSupabaseUserFromToken(supabaseToken);
    if (!supabaseUser) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = await upsertSupabaseUser(supabaseUser);
    res.json(await withLivePlan(publicUser(user)));
  } catch (err) {
    console.error('Session lookup failed:', err.message);
    res.status(401).json({ error: 'Invalid session' });
  }
});

// 5. Refresh Token
app.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  try {
    const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
    const tokenResult = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = false', [refreshToken]);
    
    if (tokenResult.rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });

    const userResult = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];

    const tokens = generateTokens(user);
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', tokens.accessToken, { httpOnly: true, secure: isProd, sameSite: 'strict' });
    
    res.json({ message: 'Success' });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// 6. Session Exchange (Supabase OTP -> BotNoob cookies)
app.post('/session/exchange', authLimiter, async (req, res) => {
  try {
    const { session_token, turnstile_token, password } = ExchangeSchema.parse(req.body);

    const isHuman = await verifyTurnstile(turnstile_token);
    if (!isHuman) return res.status(403).json({ error: 'Turnstile verification failed' });

    const supabaseUser = await getSupabaseUserFromToken(session_token);
    if (!supabaseUser) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (!isEmailConfirmed(supabaseUser)) {
      return res.status(403).json({ error: 'Email not verified', message: 'Email not verified' });
    }

    const user = await upsertSupabaseUser(supabaseUser, {
      password,
      updatePassword: Boolean(password)
    });
    const { accessToken, refreshToken } = generateTokens(user);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    setAuthCookies(res, accessToken, refreshToken);
    res.json({ message: 'Success', user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid session exchange request' });
    }
    console.error('Session exchange failed:', err.message);
    res.status(500).json({ error: 'Session exchange failed' });
  }
});

// 7. Password Reset Sync (Supabase recovery -> local password hash)
app.post('/session/sync-password', authLimiter, async (req, res) => {
  try {
    const { access_token, password } = SyncPasswordSchema.parse(req.body);

    const supabaseUser = await getSupabaseUserFromToken(access_token);
    if (!supabaseUser) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const user = await upsertSupabaseUser(supabaseUser, {
      password,
      updatePassword: true
    });

    res.json({ message: 'Password synced', user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid password sync request' });
    }
    console.error('Password sync failed:', err.message);
    res.status(500).json({ error: 'Password sync failed' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'auth-service' }));

const PORT = Number(process.env.PORT) || 4001;
const HOST = process.env.HOST || '0.0.0.0';

const start = async () => {
  await ensurePlanColumns(pool);

  const server = app.listen(PORT, HOST, () => {
    console.log(`Auth Service running on ${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Auth Service failed to start:', err.message);
    process.exit(1);
  });
};

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in auth service:', reason);
});

start();
