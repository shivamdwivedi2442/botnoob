const express = require('express');
const { Pool } = require('pg');
let createClient = null;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (err) {
  console.error('Supabase client unavailable:', err.message);
}
const { securityMiddleware, z, argon2 } = require('../../shared/security');
const { createAuthMiddleware, normalizeEmail } = require('../../shared/auth');
const {
  FREE_PLAN,
  DEFAULT_DURATION_DAYS,
  isFreePlan,
  ensurePlanColumns,
  applyPaidPlan
} = require('../../shared/plans');
const crypto = require('crypto');

const app = express();
const connectionString = process.env.DATABASE_URL;
const isLocalDatabase = !connectionString || /(localhost|127\.0\.0\.1|::1)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

app.use(express.json());
securityMiddleware(app);

const auth = createAuthMiddleware(pool);

const parseReplies = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
};

const normalizeTicket = (ticket) => {
  if (!ticket) return ticket;
  return {
    ...ticket,
    message: ticket.message || '',
    status: ticket.status === 'resolved' ? 'resolved' : 'open',
    replies: parseReplies(ticket.replies)
  };
};

let ticketColumnsReady = false;
const ensureTicketColumns = async () => {
  if (ticketColumnsReady) return;
  try {
    await pool.query('ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS message TEXT DEFAULT \'\'');
    await pool.query("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS replies JSONB DEFAULT '[]'::jsonb");
    await pool.query("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'");
    await pool.query('UPDATE support_tickets SET replies = \'[]\'::jsonb WHERE replies IS NULL');
    ticketColumnsReady = true;
  } catch (err) {
    console.error('Failed to ensure support ticket columns:', err.message);
  }
};

const TELEGRAM_STARTER = `const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

let offset = 0;
let running = true;

const api = (method, body) =>
  fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((res) => res.json());

const reply = (chatId, text) => api('sendMessage', { chat_id: chatId, text });

const poll = async () => {
  while (running) {
    try {
      const data = await api('getUpdates', { offset, timeout: 25 });
      for (const update of data.result || []) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message || !message.text) continue;
        const text = message.text.trim();
        if (text === '/start') await reply(message.chat.id, 'Welcome to ' + (process.env.BOT_NAME || 'Botnoob') + '!');
        else if (text === '/help') await reply(message.chat.id, 'Send any message and I will echo it.');
        else await reply(message.chat.id, 'You said: ' + text);
      }
    } catch (err) {
      console.error('Polling failed:', err.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};

process.on('SIGINT', () => { running = false; process.exit(0); });
process.on('SIGTERM', () => { running = false; process.exit(0); });

poll();
`;

const DISCORD_STARTER = `const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const gateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
let heartbeat = null;
let seq = null;

const send = (ws, op, d) => ws.send(JSON.stringify({ op, d }));

const connect = () => {
  const ws = new WebSocket(gateway);

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.s !== null && payload.s !== undefined) seq = payload.s;

    if (payload.op === 10) {
      heartbeat = setInterval(() => send(ws, 1, seq), payload.d.heartbeat_interval);
      send(ws, 2, {
        token,
        intents: 33281,
        properties: { os: 'linux', browser: 'botnoob', device: 'botnoob' }
      });
    }

    if (payload.op === 7) {
      clearInterval(heartbeat);
      ws.close();
    }

    if (payload.t === 'MESSAGE_CREATE') {
      const msg = payload.d;
      if (!msg || msg.author?.bot) return;
      const say = (content) =>
        fetch('https://discord.com/api/v10/channels/' + msg.channel_id + '/messages', {
          method: 'POST',
          headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
      if (msg.content.trim() === '.start') say('Welcome to ' + (process.env.BOT_NAME || 'Botnoob') + '!');
      else say('You said: ' + msg.content);
    }
  };

  ws.onclose = () => {
    clearInterval(heartbeat);
    setTimeout(connect, 5000);
  };
  ws.onerror = () => ws.close();
};

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

connect();
`;

const DEFAULT_TEMPLATES = [
  {
    id: 'default-crypto-sentinel',
    name: 'Crypto Sentinel',
    platform: 'telegram',
    description: 'Real-time price alerts & whale tracking.',
    starter_code: TELEGRAM_STARTER,
    is_default: true
  },
  {
    id: 'default-community-guard',
    name: 'Community Guard',
    platform: 'discord',
    description: 'Advanced moderation with AI sentiment analysis.',
    starter_code: DISCORD_STARTER,
    is_default: true
  },
  {
    id: 'default-support-hero',
    name: 'Support Hero',
    platform: 'telegram',
    description: 'AI-driven support ticket automation.',
    starter_code: TELEGRAM_STARTER,
    is_default: true
  },
  {
    id: 'default-market-maker',
    name: 'Market Maker',
    platform: 'telegram',
    description: 'Custom DEX trading strategies & signals.',
    starter_code: TELEGRAM_STARTER,
    is_default: true
  }
];

let templateTableReady = false;
const ensureTemplateTable = async () => {
  if (templateTableReady) return;
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bot_templates (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         name TEXT NOT NULL,
         platform TEXT NOT NULL DEFAULT 'telegram',
         description TEXT DEFAULT '',
         starter_code TEXT DEFAULT '',
         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
       )`
    );
    templateTableReady = true;
  } catch (err) {
    console.error('Failed to ensure bot_templates table:', err.message);
  }
};

const fallbackTemplates = () => DEFAULT_TEMPLATES.map((template) => ({ ...template }));

const TEMPLATE_COLUMNS = 'id, name, platform, description, starter_code, created_at';
let templateSource = 'default';
let templateError = null;
const safeHeaderValue = (value) => String(value || '').replace(/[\r\n]+/g, ' ').slice(0, 300);
const defaultTemplateRows = () => DEFAULT_TEMPLATES.map(({ name, platform, description, starter_code }) => ({
  name,
  platform,
  description,
  starter_code
}));

const isAdminRole = (role) => ['super_admin', 'employee'].includes(role);

const loadAccessibleTicket = async (id, user) => {
  let result;
  try {
    result = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [id]);
  } catch (err) {
    if (err.code === '22P02') return { status: 404, error: 'Ticket not found' };
    throw err;
  }

  const ticket = result.rows[0];
  if (!ticket) return { status: 404, error: 'Ticket not found' };

  const admin = isAdminRole(user.role);
  if (!admin && ticket.user_id !== user.id) {
    return { status: 403, error: 'Access denied' };
  }

  return { ticket, isAdmin: admin };
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access denied. ${roles.join('/')} role required.` });
  }
  next();
};

const getSupabaseAdminConfig = () => {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
};

let supabaseClient;
let supabaseClientLoaded = false;

const getSupabaseClient = () => {
  if (supabaseClientLoaded) return supabaseClient;
  supabaseClientLoaded = true;

  const config = getSupabaseAdminConfig();
  if (!config || !createClient) return null;

  try {
    supabaseClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) })
      }
    });
  } catch (err) {
    console.error('Failed to create Supabase client:', err.message);
    supabaseClient = null;
  }

  return supabaseClient;
};

const seedTemplates = async (client) => {
  const rows = defaultTemplateRows();

  if (client) {
    const { data, error } = await client
      .from('bot_templates')
      .insert(rows)
      .select(TEMPLATE_COLUMNS);
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data : [];
  }

  await ensureTemplateTable();
  const placeholders = rows
    .map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`)
    .join(', ');
  const values = rows.flatMap((row) => [row.name, row.platform, row.description, row.starter_code]);
  const result = await pool.query(
    `INSERT INTO bot_templates (name, platform, description, starter_code)
     VALUES ${placeholders}
     RETURNING ${TEMPLATE_COLUMNS}`,
    values
  );
  return result.rows;
};

const loadTemplates = async () => {
  templateError = null;
  templateSource = 'default';

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('bot_templates')
        .select(TEMPLATE_COLUMNS)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      if (Array.isArray(data) && data.length > 0) {
        templateSource = 'supabase';
        return data;
      }

      const seeded = await seedTemplates(client);
      if (seeded.length > 0) {
        templateSource = 'supabase';
        return seeded;
      }
    } catch (err) {
      templateError = `Supabase: ${err.message}`;
      console.error('Supabase template fetch failed:', err.message);
    }
  }

  try {
    await ensureTemplateTable();
    const result = await pool.query(
      `SELECT ${TEMPLATE_COLUMNS} FROM bot_templates ORDER BY created_at ASC`
    );
    if (result.rows.length > 0) {
      templateSource = 'postgres';
      return result.rows;
    }

    const seeded = await seedTemplates(null);
    if (seeded.length > 0) {
      templateSource = 'postgres';
      return seeded;
    }
    return fallbackTemplates();
  } catch (err) {
    templateError = templateError ? `${templateError}; Postgres: ${err.message}` : `Postgres: ${err.message}`;
    console.error('Template fetch failed:', err.message);
    return fallbackTemplates();
  }
};

const syncSupabaseUsers = async () => {
  const config = getSupabaseAdminConfig();
  if (!config) return;

  try {
    const response = await fetch(`${config.url}/auth/v1/admin/users`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      }
    });

    if (!response.ok) return;

    const payload = await response.json();
    const supabaseUsers = Array.isArray(payload) ? payload : payload.users || [];

    for (const sUser of supabaseUsers) {
      const email = normalizeEmail(sUser.email);
      if (!email) continue;

      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      if (existing.rows.length === 0) {
        const passwordHash = await argon2.hash(crypto.randomUUID());
        await pool.query(
          'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
          [sUser.id, email, passwordHash]
        );
      }
    }
  } catch (err) {
    console.error('User sync failed:', err.message);
  }
};

// GET /api/admin/overview
app.get('/overview', auth, requireRole(['employee', 'super_admin']), async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    if (isSuperAdmin) await syncSupabaseUsers();

    const results = {};
    const queries = {
      pricing: 'SELECT * FROM pricing_configs ORDER BY price_monthly ASC',
      coupons: 'SELECT * FROM discount_coupons ORDER BY id DESC',
      users: isSuperAdmin 
        ? 'SELECT id, email, role, plan_tier, is_banned, created_at FROM users ORDER BY created_at DESC'
        : 'SELECT id, email, role, plan_tier, is_banned FROM users WHERE role = \'user\' ORDER BY created_at DESC',
      tickets: `SELECT st.*,
                       COALESCE(st.replies, '[]'::jsonb) AS replies,
                       u.email AS user_email
                FROM support_tickets st
                LEFT JOIN users u ON st.user_id = u.id
                ORDER BY st.created_at DESC`,
      bot_overview: 'SELECT * FROM employee_bot_overview ORDER BY created_at DESC'
    };

    for (const [key, query] of Object.entries(queries)) {
      try {
        const { rows } = await pool.query(query);
        results[key] = rows;
      } catch (err) {
        console.error(`Query ${key} failed:`, err.message);
        results[key] = [];
      }
    }

    results.tickets = (results.tickets || []).map(normalizeTicket);

    res.json(results);
  } catch (err) {
    console.error('Overview fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch overview data' });
  }
});

// Plan CRUD
app.post('/pricing', auth, requireRole(['super_admin']), async (req, res) => {
  const { plan_name, price_monthly, max_bots, features, duration_days } = req.body;
  const parsedDuration = Number.parseInt(duration_days, 10);
  const planDuration =
    Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : DEFAULT_DURATION_DAYS;

  try {
    await ensurePlanColumns(pool);

    let result;
    try {
      result = await pool.query(
        `INSERT INTO pricing_configs (plan_name, price_monthly, max_bots, duration_days, features)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [plan_name, price_monthly, max_bots, planDuration, JSON.stringify(features || {})]
      );
    } catch (err) {
      if (err.code !== '42703') throw err;
      result = await pool.query(
        `INSERT INTO pricing_configs (plan_name, price_monthly, max_bots, features)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [plan_name, price_monthly, max_bots, JSON.stringify(features || {})]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Plan creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

app.put('/pricing/:planName', auth, requireRole(['super_admin']), async (req, res) => {
  const { planName } = req.params;
  const { price_monthly, max_bots, features, duration_days } = req.body;
  const parsedDuration = Number.parseInt(duration_days, 10);
  const planDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;

  try {
    await ensurePlanColumns(pool);

    let result;
    try {
      result = await pool.query(
        `UPDATE pricing_configs 
         SET price_monthly = COALESCE($1, price_monthly),
             max_bots = COALESCE($2, max_bots),
             duration_days = COALESCE($3, duration_days),
             features = COALESCE($4, features)
         WHERE plan_name = $5 RETURNING *`,
        [price_monthly, max_bots, planDuration, features ? JSON.stringify(features) : null, planName]
      );
    } catch (err) {
      if (err.code !== '42703') throw err;
      result = await pool.query(
        `UPDATE pricing_configs 
         SET price_monthly = COALESCE($1, price_monthly),
             max_bots = COALESCE($2, max_bots),
             features = COALESCE($3, features)
         WHERE plan_name = $4 RETURNING *`,
        [price_monthly, max_bots, features ? JSON.stringify(features) : null, planName]
      );
    }

    if (result.rowCount === 0) return res.status(404).json({ error: 'Plan not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Plan update failed:', err.message);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

app.delete('/pricing/:planName', auth, requireRole(['super_admin']), async (req, res) => {
  try {
    await pool.query('DELETE FROM pricing_configs WHERE plan_name = $1', [req.params.planName]);
    res.json({ message: 'Plan deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// Coupon endpoints
app.post('/coupons', auth, requireRole(['super_admin']), async (req, res) => {
  const { code, discount_percent, expires_at } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO discount_coupons (code, discount_percent, expires_at) VALUES ($1, $2, $3) RETURNING *',
      [code, discount_percent, expires_at || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

app.patch('/coupons/:id/toggle', auth, requireRole(['super_admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE discount_coupons SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle coupon' });
  }
});

// User Admin
app.patch('/users/:id', auth, requireRole(['super_admin']), async (req, res) => {
  const { plan_tier, is_banned, role } = req.body;

  try {
    await ensurePlanColumns(pool);

    if (plan_tier !== undefined && plan_tier !== null && plan_tier !== '') {
      const nextPlan = isFreePlan(plan_tier) ? FREE_PLAN : plan_tier;

      if (isFreePlan(nextPlan)) {
        try {
          await pool.query(
            `UPDATE users
             SET plan_tier = $1,
                 plan_expires_at = NULL,
                 is_banned = COALESCE($2, is_banned),
                 role = COALESCE($3, role),
                 updated_at = NOW()
             WHERE id::text = $4`,
            [nextPlan, is_banned, role, req.params.id]
          );
        } catch (err) {
          if (err.code !== '42703') throw err;
          await pool.query(
            `UPDATE users
             SET plan_tier = $1,
                 is_banned = COALESCE($2, is_banned),
                 role = COALESCE($3, role),
                 updated_at = NOW()
             WHERE id::text = $4`,
            [nextPlan, is_banned, role, req.params.id]
          );
        }
      } else {
        await applyPaidPlan(pool, req.params.id, nextPlan);

        if (is_banned !== undefined || role !== undefined) {
          await pool.query(
            `UPDATE users
             SET is_banned = COALESCE($1, is_banned),
                 role = COALESCE($2, role),
                 updated_at = NOW()
             WHERE id::text = $3`,
            [is_banned, role, req.params.id]
          );
        }
      }
    } else {
      await pool.query(
        `UPDATE users SET plan_tier = COALESCE($1, plan_tier), is_banned = COALESCE($2, is_banned), role = COALESCE($3, role), updated_at = NOW()
         WHERE id::text = $4`,
        [plan_tier, is_banned, role, req.params.id]
      );
    }

    let result;
    try {
      result = await pool.query(
        'SELECT id, email, role, plan_tier, plan_expires_at, is_banned FROM users WHERE id::text = $1',
        [req.params.id]
      );
    } catch (err) {
      if (err.code !== '42703') throw err;
      result = await pool.query(
        'SELECT id, email, role, plan_tier, is_banned FROM users WHERE id::text = $1',
        [req.params.id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('User update failed:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Ticket Admin
app.patch('/tickets/:id', auth, requireRole(['employee', 'super_admin']), async (req, res) => {
  await ensureTicketColumns();
  const requested = String(req.body.status || '').toLowerCase();
  const status = requested === 'open' || requested === 'resolved' ? requested : 'resolved';

  try {
    const result = await pool.query(
      'UPDATE support_tickets SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    res.json(normalizeTicket(result.rows[0]));
  } catch (err) {
    console.error('Ticket update failed:', err.message);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Toggle open/resolved. Works for the ticket owner and support staff.
app.patch(['/tickets/:id/status', '/api/support/tickets/:id/status'], auth, async (req, res) => {
  await ensureTicketColumns();

  try {
    const access = await loadAccessibleTicket(req.params.id, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const requested = String(req.body?.status || '').toLowerCase();
    const status = ['open', 'resolved'].includes(requested)
      ? requested
      : access.ticket.status === 'resolved'
        ? 'open'
        : 'resolved';

    const result = await pool.query(
      'UPDATE support_tickets SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json(normalizeTicket(result.rows[0]));
  } catch (err) {
    console.error('Ticket status update failed:', err.message);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

app.post(['/tickets/:id/reply', '/api/support/tickets/:id/reply'], auth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });

  await ensureTicketColumns();

  try {
    const access = await loadAccessibleTicket(req.params.id, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const reply = {
      id: crypto.randomUUID(),
      sender_id: req.user.id,
      sender_role: req.user.role,
      message,
      created_at: new Date().toISOString()
    };

    const newReplies = [...parseReplies(access.ticket.replies), reply];
    // A user reply reopens the ticket. Admin replies keep the current status.
    const nextStatus = access.isAdmin
      ? access.ticket.status === 'resolved' ? 'resolved' : 'open'
      : 'open';

    const result = await pool.query(
      'UPDATE support_tickets SET replies = $1::jsonb, status = $2 WHERE id = $3 RETURNING *',
      [JSON.stringify(newReplies), nextStatus, req.params.id]
    );
    res.json(normalizeTicket(result.rows[0]));
  } catch (err) {
    console.error('Reply failed:', err.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// USER-FACING SUPPORT ENDPOINTS
app.post(['/tickets', '/api/support/tickets'], auth, async (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!subject) return res.status(400).json({ error: 'Subject is required' });

  await ensureTicketColumns();

  try {
    const result = await pool.query(
      `INSERT INTO support_tickets (user_id, subject, message, status, priority, replies)
       VALUES ($1, $2, $3, 'open', 'medium', '[]'::jsonb)
       RETURNING *`,
      [req.user.id, subject, message]
    );
    res.status(201).json(normalizeTicket(result.rows[0]));
  } catch (err) {
    console.error('Ticket creation failed:', err.message);
    res.status(500).json({ error: 'Failed to submit ticket' });
  }
});

app.get(['/tickets', '/api/support/tickets'], auth, async (req, res) => {
  await ensureTicketColumns();

  try {
    const result = await pool.query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows.map(normalizeTicket));
  } catch (err) {
    console.error('Ticket fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// BOT TEMPLATES
app.get(['/templates', '/api/templates'], async (req, res) => {
  try {
    const templates = await loadTemplates();
    res.set('X-Template-Source', templateSource);
    if (templateError) res.set('X-Template-Error', safeHeaderValue(templateError));
    res.json(templates);
  } catch (err) {
    console.error('Template fetch failed:', err.message);
    res.set('X-Template-Source', 'default');
    res.set('X-Template-Error', safeHeaderValue(err.message));
    res.json(fallbackTemplates());
  }
});

app.post(['/templates', '/api/admin/templates'], auth, requireRole(['super_admin']), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const platform = String(req.body?.platform || 'telegram').trim().toLowerCase();
  const description = String(req.body?.description || '').trim();
  const starterCode = String(req.body?.starter_code || '');

  if (!name) return res.status(400).json({ error: 'Template name is required' });
  if (!['telegram', 'discord'].includes(platform)) {
    return res.status(400).json({ error: 'Platform must be telegram or discord' });
  }

  const payload = { name, platform, description, starter_code: starterCode };
  const client = getSupabaseClient();
  let supabaseError = null;

  if (client) {
    try {
      const { data, error } = await client
        .from('bot_templates')
        .insert(payload)
        .select(TEMPLATE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      if (data) return res.status(201).json(data);
    } catch (err) {
      supabaseError = err.message;
      console.error('Supabase template creation failed:', err.message);
    }
  }

  try {
    await ensureTemplateTable();
    const result = await pool.query(
      `INSERT INTO bot_templates (name, platform, description, starter_code)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TEMPLATE_COLUMNS}`,
      [name, platform, description, starterCode]
    );
    const created = result.rows[0];
    if (supabaseError) created.warning = `Supabase insert failed: ${supabaseError}`;
    res.status(201).json(created);
  } catch (err) {
    console.error('Template creation failed:', err.message);
    res.status(201).json({
      id: crypto.randomUUID(),
      ...payload,
      created_at: new Date().toISOString(),
      persisted: false,
      details: {
        supabase: supabaseError || 'skipped: Supabase service credentials are not configured',
        postgres: err.message
      }
    });
  }
});

app.delete(['/templates/:id', '/api/admin/templates/:id'], auth, requireRole(['super_admin']), async (req, res) => {
  const { id } = req.params;
  if (/^default-/.test(id)) {
    return res.status(400).json({ error: 'Built-in default templates cannot be deleted' });
  }

  const client = getSupabaseClient();
  let supabaseError = null;

  if (client) {
    try {
      const { data, error } = await client
        .from('bot_templates')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw new Error(error.message);
      if (Array.isArray(data) && data.length > 0) {
        return res.json({ message: 'Template deleted' });
      }
    } catch (err) {
      supabaseError = err.message;
      console.error('Supabase template deletion failed:', err.message);
    }
  }

  try {
    await ensureTemplateTable();
    const result = await pool.query('DELETE FROM bot_templates WHERE id = $1 RETURNING id', [id]);
    if (result.rows[0]) {
      return res.json({
        message: 'Template deleted',
        ...(supabaseError ? { warning: `Supabase delete failed: ${supabaseError}` } : {})
      });
    }
  } catch (err) {
    console.error('Template deletion failed:', err.message);
  }

  res.json({
    message: 'Template already removed',
    ...(supabaseError ? { details: { supabase: supabaseError } } : {})
  });
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'admin-service' }));

const start = async () => {
  await ensurePlanColumns(pool);
  try {
    await pool.query('ALTER TABLE discount_coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    await ensureTicketColumns();
    await ensureTemplateTable();
    await loadTemplates();
  } catch (err) {
    console.warn('Migration warning:', err.message);
  }
  app.listen(4005, () => console.log('Admin Service running on port 4005'));
};
start();
