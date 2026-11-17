const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const { securityMiddleware, encrypt, decrypt, z } = require('../../shared/security');
const { createAuthMiddleware } = require('../../shared/auth');
const { ensurePlanColumns, getPricingPlan, resolveUserPlan } = require('../../shared/plans');
const redisClient = require('../../shared/redisClient');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const auth = createAuthMiddleware(pool);
const USE_DOCKER = process.env.USE_DOCKER === 'true';
const RUNNER_PATH = path.join(__dirname, '..', 'runner.js');
const REPO_RUNNER_PATH = path.join(__dirname, '..', 'repoRunner.js');
const REPO_ROOT = process.env.BOT_REPO_ROOT || path.join(os.tmpdir(), 'botnoob-repos');
const CUSTOM_CODE_DIR = path.join(os.tmpdir(), 'botnoob-custom-code');
const SCRIPT_FILES = ['index.js', 'bot.js'];
const LOG_LIMIT = 500;
const PLAN_LIMITS = { free_byok: 10, byok_pro: 25, botnoob_ultra: 100 };

const runningBots = new Map();
const logBuffers = new Map();
let redisReady = false;

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

const PID_DIR = path.join(os.tmpdir(), 'botnoob-runners');
try {
  fs.mkdirSync(PID_DIR, { recursive: true });
} catch (err) {
  console.error('Failed to prepare runner pid directory:', err.message);
}

const pidFileFor = (botId) => path.join(PID_DIR, `${botId}.pid`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isProcessAlive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
};

const readTrackedPid = (botId) => {
  try {
    const pid = Number.parseInt(fs.readFileSync(pidFileFor(botId), 'utf8').trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch (err) {
    return null;
  }
};

const writeTrackedPid = (botId, pid) => {
  if (!pid) return;
  try {
    fs.writeFileSync(pidFileFor(botId), String(pid));
  } catch (err) {
    console.error('Failed to record runner pid:', err.message);
  }
};

const clearTrackedPid = (botId, pid) => {
  if (pid && readTrackedPid(botId) !== pid) return;
  try {
    fs.unlinkSync(pidFileFor(botId));
  } catch (err) {
    // Already gone.
  }
};

const findRunnerPids = (botId) => {
  const pids = new Set();
  const tracked = readTrackedPid(botId);
  if (tracked) pids.add(tracked);

  let entries = [];
  try {
    entries = fs.readdirSync('/proc');
  } catch (err) {
    entries = [];
  }

  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    try {
      const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8');
      if (!cmdline.includes('runner.js') && !cmdline.includes('repoRunner.js')) continue;
      const environ = fs.readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0');
      if (!environ.includes(`BOT_ID=${botId}`)) continue;
      pids.add(pid);
    } catch (err) {
      // Process vanished or is not readable.
    }
  }

  return [...pids];
};

const killStaleRunners = async (botId) => {
  const killed = [];
  for (const pid of findRunnerPids(String(botId))) {
    if (pid === process.pid || !isProcessAlive(pid)) {
      clearTrackedPid(String(botId), pid);
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      // Ignore signal errors.
    }
    let alive = true;
    for (let i = 0; i < 20; i += 1) {
      await sleep(100);
      alive = isProcessAlive(pid);
      if (!alive) break;
    }
    if (alive) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (err) {
        // Ignore signal errors.
      }
    }
    clearTrackedPid(String(botId), pid);
    killed.push(pid);
  }
  return killed;
};

const removeStaleContainer = (botId) =>
  new Promise((resolve) => {
    const child = spawn('docker', ['rm', '-f', `botnoob-bot-${botId}`], { stdio: 'ignore' });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });

const repoDirFor = (botId) => path.join(REPO_ROOT, String(botId));
const customCodePathFor = (botId) => path.join(CUSTOM_CODE_DIR, `${botId}.js`);

const decryptEnvVars = (encrypted) => {
  if (!encrypted) return {};

  try {
    const parsed = JSON.parse(decrypt(encrypted));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const envVars = {};
    for (const [key, value] of Object.entries(parsed)) {
      const name = String(key).trim();
      if (name) envVars[name] = String(value ?? '');
    }
    return envVars;
  } catch (err) {
    console.error('Failed to decrypt bot environment variables:', err.message);
    return {};
  }
};

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const formatEnvValue = (value) => {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@+\-]*$/.test(text) ? text : JSON.stringify(text);
};

const buildBotEnvFile = (customEnv, token, platform) => {
  const entries = [];
  for (const [key, value] of Object.entries(customEnv || {})) {
    if (ENV_NAME_PATTERN.test(key)) entries.push([key, value]);
  }

  entries.push(['BOT_TOKEN', token]);
  if (platform === 'telegram') {
    entries.push(['TELEGRAM_BOT_TOKEN', token]);
  } else if (platform === 'discord') {
    entries.push(['DISCORD_TOKEN', token]);
  }

  return entries.map(([key, value]) => `${key}=${formatEnvValue(value)}`).join('\n') + '\n';
};

const writeBotEnvFile = (botId, contents) => {
  const dir = repoDirFor(botId);
  fs.mkdirSync(dir, { recursive: true });
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, contents, { mode: 0o600 });
  return envPath;
};

const readDiskScript = (botId) => {
  for (const file of SCRIPT_FILES) {
    const fullPath = path.join(repoDirFor(botId), file);
    try {
      if (fs.existsSync(fullPath)) {
        return { file, code: fs.readFileSync(fullPath, 'utf8') };
      }
    } catch (err) {
      console.error(`Failed to read ${file} from disk:`, err.message);
    }
  }
  return { file: 'bot.js', code: '' };
};

const stageCustomCode = (botId, code) => {
  fs.mkdirSync(CUSTOM_CODE_DIR, { recursive: true });
  const fullPath = customCodePathFor(botId);
  fs.writeFileSync(fullPath, code, 'utf8');
  return fullPath;
};

const initRedis = async () => {
  try {
    if (typeof redisClient.connect === 'function') {
      await redisClient.connect();
    }
    redisReady = typeof redisClient.rPush === 'function' && typeof redisClient.lRange === 'function';
  } catch (err) {
    console.error('Redis initialization failed:', err.message);
  }
};

const logsKey = (botId) => `bot:logs:${botId}`;

const appendLog = (botId, message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  const id = String(botId);
  const buffer = logBuffers.get(id) || [];
  buffer.push(line);
  if (buffer.length > LOG_LIMIT) buffer.splice(0, buffer.length - LOG_LIMIT);
  logBuffers.set(id, buffer);

  if (redisReady) {
    redisClient
      .rPush(logsKey(id), line)
      .then(() => redisClient.lTrim(logsKey(id), -LOG_LIMIT, -1))
      .catch(() => {});
  }
};

const readLogs = async (botId, limit = LOG_LIMIT) => {
  const id = String(botId);

  if (redisReady) {
    try {
      const lines = await redisClient.lRange(logsKey(id), -limit, -1);
      if (Array.isArray(lines) && lines.length > 0) return lines;
    } catch (err) {
      console.error('Failed to read bot logs from Redis:', err.message);
    }
  }

  const buffer = logBuffers.get(id) || [];
  return buffer.slice(-limit);
};

const clearLogs = async (botId) => {
  const id = String(botId);
  logBuffers.delete(id);
  if (redisReady) {
    try {
      await redisClient.del(logsKey(id));
    } catch (err) {
      console.error('Failed to clear bot logs:', err.message);
    }
  }
};

const streamToLogs = (botId, stream) => {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      if (line.trim()) appendLog(botId, line);
    }
  });
  stream.on('end', () => {
    if (pending.trim()) appendLog(botId, pending);
  });
};

const updateStatus = async (botId, status) => {
  try {
    await pool.query('UPDATE bots SET status = $1, updated_at = NOW() WHERE id = $2', [status, botId]);
  } catch (err) {
    console.error('Failed to update bot status:', err.message);
  }
};

const getPlanLimit = async (planTier) => {
  try {
    const livePlan = await getPricingPlan(pool, planTier);
    if (livePlan?.max_bots) return livePlan.max_bots;
  } catch (err) {
    console.error('Failed to read live plan limits:', err.message);
  }
  return PLAN_LIMITS[planTier] || PLAN_LIMITS.free_byok;
};

const getSlotInfo = async (userId, planTier, liveMaxBots = null) => {
  const validLiveLimit = Number.isFinite(Number(liveMaxBots)) && Number(liveMaxBots) > 0 ? Number(liveMaxBots) : null;
  const [countResult, limit] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM bots WHERE owner_id = $1', [userId]),
    validLiveLimit ? Promise.resolve(validLiveLimit) : getPlanLimit(planTier)
  ]);
  return { used: countResult.rows[0]?.count || 0, limit };
};

const resolveRequestPlan = (user) => {
  const profileMaxBots = Number.parseInt(user.max_bots, 10);
  const fallbackMaxBots =
    Number.isFinite(profileMaxBots) && profileMaxBots > 0
      ? profileMaxBots
      : PLAN_LIMITS[user.plan_tier] || PLAN_LIMITS.free_byok;

  return resolveUserPlan(pool, user.id, {
    plan: user.plan_tier,
    maxBots: fallbackMaxBots
  });
};

const safeBot = (bot, extra = {}) => ({
  id: bot.id,
  name: bot.name,
  platform: bot.platform,
  status: extra.status || bot.status,
  github_repo_url: bot.github_repo_url || null,
  created_at: bot.created_at,
  updated_at: bot.updated_at,
  is_owner: extra.is_owner ?? bot.is_owner ?? true,
  token_stored: Boolean(bot.encrypted_bot_token),
  ...extra
});

const getBotForUser = async (botId, userId) => {
  const result = await pool.query(
    `SELECT b.*, (b.owner_id = $2) AS is_owner
     FROM bots b
     WHERE b.id = $1
       AND (
         b.owner_id = $2
         OR EXISTS (
           SELECT 1 FROM bot_collaborators c
           WHERE c.bot_id = b.id AND c.user_id = $2
         )
       )`,
    [botId, userId]
  );
  return result.rows[0] || null;
};

const maskToken = (token) => {
  if (!token || token.length < 10) return 'encrypted';
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const validateBotToken = async (platform, token) => {
  if (platform === 'telegram') {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.result?.is_bot) {
      throw new Error(payload?.description || 'Telegram rejected this bot token.');
    }
    return { username: payload.result.username, displayName: payload.result.first_name };
  }

  if (platform === 'discord') {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.bot) {
      throw new Error(payload?.message || 'Discord rejected this bot token.');
    }
    return { username: payload.username, displayName: payload.global_name || payload.username };
  }

  throw new Error('Unsupported bot platform.');
};

const startBotProcess = async (bot, { template = 'starter' } = {}) => {
  const botId = String(bot.id);
  const existing = runningBots.get(botId);
  if (existing?.process && existing.process.exitCode === null) {
    return { started: false, pid: existing.process.pid };
  }
  if (existing) runningBots.delete(botId);

  // Kill any runner left behind by a previous service instance before spawning,
  // otherwise two pollers share the same bot token and /start replies twice.
  if (USE_DOCKER) await removeStaleContainer(botId);
  const stalePids = await killStaleRunners(botId);
  if (stalePids.length > 0) {
    appendLog(botId, `Stopped ${stalePids.length} stale runner process(es) for this bot.`);
  }

  const token = decrypt(bot.encrypted_bot_token);
  const repoUrl = String(bot.github_repo_url || '').trim();
  const customEnv = decryptEnvVars(bot.encrypted_env_vars);
  const customCode = typeof bot.custom_code === 'string' ? bot.custom_code : '';
  const customCodeFile = customCode.trim() ? stageCustomCode(botId, customCode) : '';
  const envFileContents = buildBotEnvFile(customEnv, token, bot.platform);

  if (repoUrl || customCodeFile) {
    try {
      writeBotEnvFile(botId, envFileContents);
    } catch (err) {
      appendLog(botId, `Could not write dashboard .env file: ${err.message}`);
    }
  }

  const tokenAliases = bot.platform === 'telegram' ? { TELEGRAM_BOT_TOKEN: token } : { DISCORD_TOKEN: token };
  const env = {
    ...process.env,
    ...customEnv,
    ...tokenAliases,
    BOT_ID: botId,
    BOT_NAME: bot.name,
    BOT_PLATFORM: bot.platform,
    BOT_TOKEN: token,
    BOT_TEMPLATE: template || 'starter',
    BOT_REPO_URL: repoUrl,
    BOT_REPO_ROOT: REPO_ROOT,
    BOT_REPO_DIR: path.join(REPO_ROOT, botId),
    BOT_CUSTOM_CODE_FILE: customCodeFile,
    BOT_ENV_VARS: JSON.stringify(customEnv),
    BOT_ENV_FILE_CONTENTS: Buffer.from(envFileContents, 'utf8').toString('base64'),
    OWNER_ID: bot.owner_id,
    USE_DOCKER: String(USE_DOCKER)
  };

  let child;

  if (repoUrl || customCodeFile) {
    child = spawn(process.execPath, [REPO_RUNNER_PATH], {
      cwd: path.dirname(REPO_RUNNER_PATH),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } else if (USE_DOCKER && process.env.BOT_RUNNER_IMAGE) {
    const args = [
      'run', '--rm',
      '--name', `botnoob-bot-${botId}`,
      '--memory=256m', '--cpus=0.5',
      '-e', `BOT_ID=${botId}`,
      '-e', `BOT_NAME=${bot.name}`,
      '-e', `BOT_PLATFORM=${bot.platform}`,
      '-e', `BOT_TOKEN=${token}`,
      '-e', `BOT_TEMPLATE=${template || 'starter'}`,
      '-e', `BOT_REPO_URL=${bot.github_repo_url || ''}`,
      '-e', `OWNER_ID=${bot.owner_id}`,
      '-e', `DATABASE_URL=${process.env.DATABASE_URL || ''}`,
      '-e', `ENCRYPTION_KEY=${process.env.ENCRYPTION_KEY || ''}`,
      process.env.BOT_RUNNER_IMAGE
    ];
    child = spawn('docker', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    child = spawn(process.execPath, [RUNNER_PATH], {
      cwd: path.dirname(RUNNER_PATH),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  runningBots.set(botId, { process: child, startedAt: Date.now() });
  writeTrackedPid(botId, child.pid);
  const sourceLabel = repoUrl
    ? 'from GitHub repository'
    : customCodeFile
      ? 'from custom code'
      : 'with built-in AI runner';
  appendLog(botId, `Starting ${bot.platform} bot "${bot.name}" ${sourceLabel} (pid ${child.pid || 'pending'})`);

  streamToLogs(botId, child.stdout);
  streamToLogs(botId, child.stderr);

  child.on('error', async (err) => {
    appendLog(botId, `Process error: ${err.message}`);
    clearTrackedPid(botId, child.pid);
    if (runningBots.get(botId)?.process === child) {
      runningBots.delete(botId);
      await updateStatus(bot.id, 'paused');
    }
  });

  child.on('exit', async (code, signal) => {
    appendLog(botId, `Bot process exited (code ${code ?? 'null'}, signal ${signal || 'none'})`);
    clearTrackedPid(botId, child.pid);
    if (runningBots.get(botId)?.process === child) {
      runningBots.delete(botId);
      await updateStatus(bot.id, 'paused');
    }
  });

  await updateStatus(bot.id, 'active');
  return { started: true, pid: child.pid };
};

const stopBotProcess = async (botId) => {
  const id = String(botId);
  const entry = runningBots.get(id);
  runningBots.delete(id);

  if (entry?.process?.pid) writeTrackedPid(id, entry.process.pid);
  if (entry?.process && entry.process.exitCode === null) {
    try {
      entry.process.kill('SIGTERM');
    } catch (err) {
      // Ignore signal errors.
    }
  }

  if (USE_DOCKER) await removeStaleContainer(id);
  await killStaleRunners(id);

  if (entry?.process && entry.process.exitCode === null) {
    try {
      entry.process.kill('SIGKILL');
    } catch (err) {
      // Ignore signal errors.
    }
  }

  await updateStatus(id, 'paused');
  appendLog(id, 'Bot stopped by user.');
};

const isRunning = (botId) => {
  const entry = runningBots.get(String(botId));
  return Boolean(entry?.process && entry.process.exitCode === null);
};

const deploySchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(['telegram', 'discord']),
  bot_token: z.string().trim().min(10),
  github_repo_url: z.string().trim().url().optional().or(z.literal('')),
  template: z.string().trim().max(50).optional(),
  code: z.string().max(400000).optional(),
  env_vars: z
    .union([
      z.record(
        z
          .string()
          .trim()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        z.string().max(8000)
      ),
      z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .max(128)
            .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
        )
        .max(30)
    ])
    .optional()
});

const shareSchema = z.object({
  email: z.string().trim().email()
});

const configSchema = z.object({
  env_vars: z
    .record(
      z
        .string()
        .trim()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, numbers, and underscores; start with a letter or underscore'),
      z.string().max(8000)
    )
    .optional(),
  code: z.string().max(400000).optional()
});

app.use(express.json());
securityMiddleware(app);

app.get('/bots', auth, async (req, res) => {
  try {
    const planState = await resolveRequestPlan(req.user);
    const [botsResult, slots] = await Promise.all([
      pool.query(
        `SELECT DISTINCT b.*, (b.owner_id = $1) AS is_owner
         FROM bots b
         LEFT JOIN bot_collaborators c ON c.bot_id = b.id
         WHERE b.owner_id = $1 OR c.user_id = $1
         ORDER BY b.created_at DESC`,
        [req.user.id]
      ),
      getSlotInfo(req.user.id, planState.plan, planState.max_bots)
    ]);

    const bots = botsResult.rows.map((bot) =>
      safeBot(bot, { status: isRunning(bot.id) ? 'active' : bot.status === 'banned' ? 'banned' : 'paused' })
    );

    res.json({
      bots,
      slots,
      plan: {
        name: planState.plan,
        plan_tier: planState.plan,
        expires_at: planState.plan_expires_at,
        max_bots: slots.limit,
        expired: planState.expired
      }
    });
  } catch (err) {
    console.error('Failed to list bots:', err.message);
    res.status(500).json({ error: 'Failed to load bots' });
  }
});

const deployBot = async (req, res) => {
  try {
    const data = deploySchema.parse(req.body);
    const planState = await resolveRequestPlan(req.user);
    const slots = await getSlotInfo(req.user.id, planState.plan, planState.max_bots);

    if (slots.used >= slots.limit) {
      return res.status(403).json({
        error: 'Bot limit reached',
        message: `Your plan allows ${slots.limit} bots. Stop and delete one before deploying another.`,
        code: 'BOT_LIMIT_REACHED',
        slots
      });
    }

    let identity;
    try {
      identity = await validateBotToken(data.platform, data.bot_token);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid bot token' });
    }

    const encryptedToken = encrypt(data.bot_token);
    const envVars = {};
    if (Array.isArray(data.env_vars)) {
      for (const name of data.env_vars) envVars[name] = '';
    } else if (data.env_vars) {
      for (const [name, value] of Object.entries(data.env_vars)) {
        envVars[name.trim()] = String(value ?? '');
      }
    }
    const encryptedEnvVars = Object.keys(envVars).length > 0 ? encrypt(JSON.stringify(envVars)) : null;
    const customCode = typeof data.code === 'string' && data.code.trim() ? data.code : null;

    const result = await pool.query(
      `INSERT INTO bots (owner_id, name, platform, github_repo_url, encrypted_bot_token, encrypted_env_vars, custom_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'paused')
       RETURNING *`,
      [
        req.user.id,
        data.name,
        data.platform,
        data.github_repo_url || null,
        encryptedToken,
        encryptedEnvVars,
        customCode
      ]
    );

    const bot = result.rows[0];
    appendLog(bot.id, `Token validated for ${identity.username || identity.displayName || data.platform}.`);
    await startBotProcess(bot, { template: data.template });

    const updatedSlots = await getSlotInfo(req.user.id, planState.plan, planState.max_bots);
    res.status(201).json({
      bot: safeBot(bot, {
        status: 'active',
        is_owner: true,
        token_hint: maskToken(data.bot_token),
        username: identity.username || null
      }),
      slots: updatedSlots
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid deploy request' });
    }
    console.error('Bot deployment failed:', err.message);
    res.status(500).json({ error: 'Bot deployment failed' });
  }
};

app.post(['/bots', '/bots/deploy'], auth, deployBot);

app.post('/bots/:id/start', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (bot.status === 'banned') return res.status(403).json({ error: 'Bot is banned' });

    const planState = await resolveRequestPlan(req.user);
    const slots = await getSlotInfo(req.user.id, planState.plan, planState.max_bots);

    if (slots.used >= slots.limit) {
      return res.status(403).json({
        error: 'Bot limit reached',
        message: `Your plan allows ${slots.limit} bots. Stop and delete one to start a bot.`,
        code: 'BOT_LIMIT_REACHED',
        slots
      });
    }

    const result = await startBotProcess(bot);
    res.json({ message: result.started ? 'Bot started' : 'Bot is already running', running: true });
  } catch (err) {
    console.error('Failed to start bot:', err.message);
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

app.post('/bots/:id/stop', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    await stopBotProcess(bot.id);
    res.json({ message: 'Bot stopped', running: false });
  } catch (err) {
    console.error('Failed to stop bot:', err.message);
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

app.post('/bots/:id/restart', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (bot.status === 'banned') return res.status(403).json({ error: 'Bot is banned' });

    await stopBotProcess(bot.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = await startBotProcess(bot);
    res.json({ message: 'Bot restarted', running: true, pid: result.pid });
  } catch (err) {
    console.error('Failed to restart bot:', err.message);
    res.status(500).json({ error: 'Failed to restart bot' });
  }
});

app.delete('/bots/:id', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (!bot.is_owner) return res.status(403).json({ error: 'Only the owner can delete this bot' });

    await stopBotProcess(bot.id);
    await pool.query('DELETE FROM bots WHERE id = $1 AND owner_id = $2', [bot.id, req.user.id]);
    await clearLogs(bot.id);
    try {
      fs.rmSync(repoDirFor(bot.id), { recursive: true, force: true });
      fs.rmSync(customCodePathFor(bot.id), { force: true });
    } catch (err) {
      console.error('Failed to clean up bot files:', err.message);
    }
    res.json({ message: 'Bot deleted' });
  } catch (err) {
    console.error('Failed to delete bot:', err.message);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

app.get('/bots/:id/logs', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), LOG_LIMIT) : LOG_LIMIT;
    const logs = await readLogs(bot.id, limit);

    res.json({
      logs,
      running: isRunning(bot.id),
      status: isRunning(bot.id) ? 'active' : bot.status
    });
  } catch (err) {
    console.error('Failed to read bot logs:', err.message);
    res.status(500).json({ error: 'Failed to read bot logs' });
  }
});

app.get('/bots/:id/config', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const envVars = decryptEnvVars(bot.encrypted_env_vars);
    let code = typeof bot.custom_code === 'string' ? bot.custom_code : '';
    let file = 'bot.js';
    let source = code ? 'custom' : 'none';

    if (!code && fs.existsSync(repoDirFor(bot.id))) {
      const disk = readDiskScript(bot.id);
      code = disk.code;
      file = disk.file;
      source = disk.code ? 'repo' : 'none';
    }

    res.json({
      env_vars: envVars,
      code,
      file,
      source,
      github_repo_url: bot.github_repo_url || null
    });
  } catch (err) {
    console.error('Failed to load bot configuration:', err.message);
    res.status(500).json({ error: 'Failed to load bot configuration' });
  }
});

app.put('/bots/:id/config', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const data = configSchema.parse(req.body);
    const assignments = [];
    const values = [];

    if (data.env_vars !== undefined) {
      const envVars = {};
      for (const [key, value] of Object.entries(data.env_vars)) {
        const name = key.trim();
        if (name) envVars[name] = String(value);
      }
      values.push(Object.keys(envVars).length > 0 ? encrypt(JSON.stringify(envVars)) : null);
      assignments.push(`encrypted_env_vars = $${values.length}`);
    }

    if (data.code !== undefined) {
      values.push(data.code);
      assignments.push(`custom_code = $${values.length}`);
    }

    if (assignments.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    values.push(bot.id);
    await pool.query(
      `UPDATE bots SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`,
      values
    );

    res.json({ message: 'Bot configuration saved' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors?.[0]?.message || 'Invalid bot configuration' });
    }
    console.error('Failed to save bot configuration:', err.message);
    res.status(500).json({ error: 'Failed to save bot configuration' });
  }
});

app.post('/bots/:id/collaborators', auth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
  try {
    const bot = await getBotForUser(req.params.id, req.user.id);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    if (!bot.is_owner) return res.status(403).json({ error: 'Only the owner can share this bot' });

    const { email } = shareSchema.parse(req.body);
    const userResult = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);
    const collaborator = userResult.rows[0];
    if (!collaborator) return res.status(404).json({ error: 'No Botnoob account exists for that email' });
    if (collaborator.id === bot.owner_id) return res.status(400).json({ error: 'The owner already has access' });

    await pool.query(
      `INSERT INTO bot_collaborators (bot_id, user_id, role)
       VALUES ($1, $2, 'editor')
       ON CONFLICT (bot_id, user_id) DO NOTHING`,
      [bot.id, collaborator.id]
    );

    appendLog(bot.id, `Access shared with ${collaborator.email}.`);
    res.json({ message: 'Collaborator added', collaborator });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    console.error('Failed to add collaborator:', err.message);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'bot-worker-service' }));

const start = async () => {
  await initRedis();
  await ensurePlanColumns(pool);
  try {
    await pool.query('ALTER TABLE bots ADD COLUMN IF NOT EXISTS encrypted_env_vars TEXT');
    await pool.query('ALTER TABLE bots ADD COLUMN IF NOT EXISTS custom_code TEXT');
  } catch (err) {
    console.error('Failed to ensure bot config columns:', err.message);
  }
  try {
    await pool.query("UPDATE bots SET status = 'paused' WHERE status = 'active'");
  } catch (err) {
    console.error('Failed to reset bot states:', err.message);
  }
  app.listen(4002, () => console.log('Bot Worker running on port 4002'));
};

const shutdown = async () => {
  for (const [botId, entry] of runningBots.entries()) {
    if (entry.process && entry.process.exitCode === null) entry.process.kill('SIGTERM');
    await updateStatus(botId, 'paused');
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
