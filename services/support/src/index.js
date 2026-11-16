const express = require('express');
const { Pool } = require('pg');
const { securityMiddleware, z, argon2 } = require('../../shared/security');
const { createAuthMiddleware, normalizeEmail } = require('../../shared/auth');
const crypto = require('crypto');

const app = express();
const connectionString = process.env.DATABASE_URL;
const isLocalDatabase = !connectionString || /(localhost|127\.0\.0\.1|::1)/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false }
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
  const { plan_name, price_monthly, max_bots, features } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO pricing_configs (plan_name, price_monthly, max_bots, features)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [plan_name, price_monthly, max_bots, JSON.stringify(features || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Plan creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

app.put('/pricing/:planName', auth, requireRole(['super_admin']), async (req, res) => {
  const { planName } = req.params;
  const { price_monthly, max_bots, features } = req.body;
  try {
    const result = await pool.query(
      `UPDATE pricing_configs 
       SET price_monthly = COALESCE($1, price_monthly),
           max_bots = COALESCE($2, max_bots),
           features = COALESCE($3, features)
       WHERE plan_name = $4 RETURNING *`,
      [price_monthly, max_bots, features ? JSON.stringify(features) : null, planName]
    );
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
    const result = await pool.query(
      `UPDATE users SET plan_tier = COALESCE($1, plan_tier), is_banned = COALESCE($2, is_banned), role = COALESCE($3, role), updated_at = NOW()
       WHERE id::text = $4 RETURNING id, email, role, plan_tier, is_banned`,
      [plan_tier, is_banned, role, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
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

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'admin-service' }));

const start = async () => {
  try {
    await pool.query('ALTER TABLE discount_coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    await ensureTicketColumns();
  } catch (err) {
    console.warn('Migration warning:', err.message);
  }
  app.listen(4005, () => console.log('Admin Service running on port 4005'));
};
start();
