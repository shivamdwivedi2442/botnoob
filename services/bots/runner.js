const { Pool } = require('pg');
const WebSocket = require('ws');
const { decrypt } = require('../shared/security');
const {
  aliasProvider,
  detectProviderFromKey,
  resolveProvider,
  modelsFor,
  resolveGeminiModels
} = require('../shared/aiProviders');

const BOT_ID = process.env.BOT_ID;
const BOT_NAME = process.env.BOT_NAME || 'Botnoob Bot';
const BOT_PLATFORM = (process.env.BOT_PLATFORM || '').toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_TEMPLATE = process.env.BOT_TEMPLATE || 'starter';
const OWNER_ID = process.env.OWNER_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_INTENTS = 1 | 512 | 32768;
const GEMINI_FAST_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];
const GEMINI_ATTEMPT_TIMEOUT_MS = 5000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let aiConfig = null;
let preferredGeminiModel = null;
let stopping = false;
let discordSocket = null;
let discordHeartbeat = null;
let discordReconnect = null;
let discordSequence = null;
let discordAcked = true;

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const templatePrompt = () => {
  const prompts = {
    'ai-assistant': 'You are an expert AI assistant. Be accurate, concise, and practical.',
    support: 'You are a patient customer support bot. Be concise, helpful, and clear.',
    starter: 'You are a friendly bot assistant. Keep replies short and helpful.'
  };
  return prompts[BOT_TEMPLATE] || prompts.starter;
};

const loadAiConfig = async () => {
  if (!OWNER_ID) return null;
  const result = await pool.query(
    `SELECT provider, encrypted_key
     FROM user_ai_keys
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [OWNER_ID]
  );
  const row = result.rows[0];
  if (!row) return null;

  let key;
  try {
    key = decrypt(row.encrypted_key);
  } catch (err) {
    log(`Could not decrypt BYOK key: ${err.message}`);
    return null;
  }

  const detected = detectProviderFromKey(key);
  const labeled = aliasProvider(row.provider);
  const provider = resolveProvider(key, row.provider);

  if (detected && labeled && detected !== labeled) {
    log(`Detected ${detected} key but stored label is ${row.provider}; using ${detected}.`);
  }
  if (!provider) {
    log(`Could not determine an AI provider for the saved key (label: ${row.provider}).`);
  }

  return { provider, key, detectedProvider: detected, storedProvider: row.provider };
};

// Read the owner's saved key on every message so newly saved keys work immediately.
const getAiConfig = async () => {
  try {
    aiConfig = await loadAiConfig();
  } catch (err) {
    log(`Could not load BYOK configuration: ${err.message}`);
  }
  return aiConfig;
};

const postJson = async (url, body, headers = {}, timeoutMs = 45000) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    payload = text;
  }
  if (!response.ok) {
    const detail =
      typeof payload === 'string'
        ? payload
        : payload?.error?.message || payload?.message || JSON.stringify(payload);
    const error = new Error(`${response.status} ${detail || 'AI provider request failed'}`.slice(0, 4000));
    error.status = response.status;
    error.upstream = text;
    throw error;
  }
  return payload;
};

const prioritizeGeminiModels = (discovered) =>
  [...new Set([preferredGeminiModel, ...GEMINI_FAST_MODELS, ...discovered].filter(Boolean))];

const aiReply = async (text, userName = 'there', config = aiConfig) => {
  if (!config?.key) {
    return 'This bot is online, but no AI key is configured yet. Add a Gemini, OpenAI, or Anthropic key in the Botnoob dashboard BYOK vault and it will start replying immediately.';
  }

  const provider = resolveProvider(config.key, config.provider);
  let models;

  if (provider === 'gemini') {
    const discovered = await resolveGeminiModels(config.key, { logger: log });
    models = prioritizeGeminiModels(discovered);
  } else {
    models = modelsFor(provider);
  }

  if (!provider || models.length === 0) {
    return 'This bot has an unsupported AI provider configured. Re-save your key in the Botnoob dashboard.';
  }

  const system = `${templatePrompt()} Your name is ${BOT_NAME}. You are responding to ${userName} on ${BOT_PLATFORM}.`;
  let lastError = null;

  for (const model of models) {
    try {
      if (provider === 'openai') {
        const payload = await postJson(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: text }
            ],
            max_tokens: 500
          },
          { Authorization: `Bearer ${config.key}` }
        );
        const reply = payload?.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;
        throw new Error('OpenAI returned an empty response.');
      }

      if (provider === 'anthropic') {
        const payload = await postJson(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            max_tokens: 500,
            system,
            messages: [{ role: 'user', content: text }]
          },
          {
            'x-api-key': config.key,
            'anthropic-version': '2023-06-01'
          }
        );
        const reply = payload?.content?.map((part) => part.text).filter(Boolean).join('\n').trim();
        if (reply) return reply;
        throw new Error('Anthropic returned an empty response.');
      }

      const payload = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.key)}`,
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 500 }
        },
        {},
        GEMINI_ATTEMPT_TIMEOUT_MS
      );
      const parts = payload?.candidates?.[0]?.content?.parts || [];
      const reply = parts.map((part) => part.text).filter(Boolean).join('\n').trim();
      if (reply) {
        if (preferredGeminiModel !== model) {
          preferredGeminiModel = model;
          log(`Gemini fast model selected: ${model}`);
        }
        return reply;
      }
      throw new Error('Gemini returned an empty response.');
    } catch (err) {
      lastError = err;
      log(`${provider} model ${model} failed: ${err.upstream || err.message}`);
    }
  }

  throw lastError || new Error(`${provider} request failed`);
};

const generateReply = async (text, userName) => {
  const config = await getAiConfig();
  try {
    const reply = await aiReply(text, userName, config);
    return reply.slice(0, 3900);
  } catch (err) {
    const provider = config?.provider ? ` (${config.provider})` : '';
    log(`AI reply failed${provider}: ${err.upstream || err.message}`);
    return 'I hit an error while contacting the AI provider. Please try again shortly.';
  }
};

const telegramCall = async (method, payload = {}) => {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.description || `Telegram API ${method} failed`);
  }
  return result.result;
};

const sendTelegramMessage = async (chatId, text) => {
  const chunks = text.match(/[\s\S]{1,3900}/g) || [text];
  for (const chunk of chunks) {
    await telegramCall('sendMessage', {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true
    });
  }
};

const handleTelegramMessage = async (message) => {
  if (!message?.text || message.chat?.type === 'channel') return;
  const text = message.text.trim();
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const userName = message.from?.first_name || message.from?.username || 'there';

  telegramCall('sendChatAction', {
    chat_id: message.chat.id,
    action: 'typing'
  }).catch((err) => log(`Typing indicator failed: ${err.message}`));

  if (command === '/start') {
    await sendTelegramMessage(
      message.chat.id,
      `Welcome to ${BOT_NAME}! I am online and ready to help.\n\nUse /help to see what I can do.`
    );
    return;
  }

  if (command === '/help') {
    await sendTelegramMessage(
      message.chat.id,
      `Available commands:\n/start - Start the bot\n/help - Show this message\n\nSend any other message and I will answer using AI.`
    );
    return;
  }

  log(`Telegram message from ${userName}: ${text.slice(0, 120)}`);
  const typingTimer = setInterval(() => {
    telegramCall('sendChatAction', {
      chat_id: message.chat.id,
      action: 'typing'
    }).catch(() => {});
  }, 4000);

  try {
    const reply = await generateReply(text, userName);
    await sendTelegramMessage(message.chat.id, reply);
  } finally {
    clearInterval(typingTimer);
  }
};

const startTelegram = async () => {
  const me = await telegramCall('getMe');
  log(`Telegram connected as @${me.username} (${me.first_name})`);

  try {
    await telegramCall('deleteWebhook', { drop_pending_updates: false });
    log('Telegram webhook cleared; using long polling.');
  } catch (err) {
    log(`Could not clear Telegram webhook: ${err.message}`);
  }

  let offset = 0;
  while (!stopping) {
    try {
      const updates = await telegramCall('getUpdates', {
        timeout: 25,
        offset,
        allowed_updates: ['message']
      });

      for (const update of updates || []) {
        offset = update.update_id + 1;
        if (update.message?.text) {
          handleTelegramMessage(update.message).catch((err) => log(`Telegram handler failed: ${err.message}`));
        }
      }
    } catch (err) {
      if (stopping) break;
      log(`Telegram polling error: ${err.message}`);
      await sleep(3000);
    }
  }
};

const discordCall = async (path, options = {}) => {
  const response = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discord API ${response.status}: ${text.slice(0, 200)}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const sendDiscordMessage = async (channelId, text) => {
  const chunks = text.match(/[\s\S]{1,1900}/g) || [text];
  for (const chunk of chunks) {
    await discordCall(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: chunk })
    });
  }
};

const handleDiscordMessage = async (message) => {
  if (!message?.content || message.author?.bot) return;
  const text = message.content.trim();
  const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
  const userName = message.author?.global_name || message.author?.username || 'there';

  if (command === '/start') {
    await sendDiscordMessage(message.channel_id, `Welcome to ${BOT_NAME}! I am online and ready to help. Use /help for commands.`);
    return;
  }

  if (command === '/help') {
    await sendDiscordMessage(
      message.channel_id,
      `Available commands:\n/start - Start the bot\n/help - Show this message\n\nSend any other message and I will answer using AI.`
    );
    return;
  }

  log(`Discord message from ${userName}: ${text.slice(0, 120)}`);
  const reply = await generateReply(text, userName);
  await sendDiscordMessage(message.channel_id, reply);
};

const handleDiscordPayload = (payload) => {
  if (payload.s != null) discordSequence = payload.s;

  if (payload.op === 10) {
    discordHeartbeat = setInterval(() => {
      if (!discordSocket || discordSocket.readyState !== WebSocket.OPEN) return;
      if (!discordAcked) {
        log('Discord heartbeat was not acknowledged; reconnecting.');
        discordSocket.terminate();
        return;
      }
      discordAcked = false;
      discordSocket.send(JSON.stringify({ op: 1, d: discordSequence }));
    }, payload.d.heartbeat_interval);

    discordSocket.send(
      JSON.stringify({
        op: 2,
        d: {
          token: BOT_TOKEN,
          intents: DISCORD_INTENTS,
          properties: { os: process.platform, browser: 'botnoob', device: 'botnoob' }
        }
      })
    );
    return;
  }

  if (payload.op === 11) {
    discordAcked = true;
    return;
  }

  if (payload.op === 1) {
    discordSocket.send(JSON.stringify({ op: 1, d: discordSequence }));
    return;
  }

  if (payload.op === 7 || payload.op === 9) {
    log('Discord gateway requested a reconnect.');
    discordSocket.close();
    return;
  }

  if (payload.op === 0) {
    if (payload.t === 'READY') {
      log(`Discord connected as ${payload.d.user.username} (${payload.d.user.id})`);
    }
    if (payload.t === 'MESSAGE_CREATE') {
      handleDiscordMessage(payload.d).catch((err) => log(`Discord handler failed: ${err.message}`));
    }
  }
};

const connectDiscordGateway = (url) => {
  if (stopping) return;

  discordAcked = true;
  discordSocket = new WebSocket(`${url}?v=10&encoding=json`);

  discordSocket.on('open', () => log('Discord gateway socket opened.'));

  discordSocket.on('message', (raw) => {
    try {
      handleDiscordPayload(JSON.parse(raw.toString()));
    } catch (err) {
      log(`Discord gateway parse error: ${err.message}`);
    }
  });

  discordSocket.on('close', (code) => {
    if (discordHeartbeat) clearInterval(discordHeartbeat);
    discordHeartbeat = null;
    log(`Discord gateway closed (code ${code}).`);
    if (!stopping) {
      discordReconnect = setTimeout(() => connectDiscordGateway(url), 5000);
    }
  });

  discordSocket.on('error', (err) => log(`Discord gateway error: ${err.message}`));
};

const startDiscord = async () => {
  const me = await discordCall('/users/@me');
  log(`Discord token validated for ${me.username} (${me.id}).`);

  const gateway = await discordCall('/gateway/bot');
  connectDiscordGateway(gateway.url);
};

const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  log('Shutting down bot runner.');

  if (discordHeartbeat) clearInterval(discordHeartbeat);
  if (discordReconnect) clearTimeout(discordReconnect);
  if (discordSocket) {
    try {
      discordSocket.close();
    } catch (err) {
      // Ignore close errors during shutdown.
    }
  }

  try {
    await pool.end();
  } catch (err) {
    // Ignore pool shutdown errors.
  }

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => log(`Unhandled rejection: ${err?.message || err}`));

const main = async () => {
  if (!BOT_TOKEN) {
    log('Missing BOT_TOKEN.');
    process.exit(1);
  }

  log(`Runner started for "${BOT_NAME}" on ${BOT_PLATFORM} (bot ${BOT_ID}).`);

  try {
    aiConfig = await loadAiConfig();
  } catch (err) {
    log(`Could not load BYOK configuration: ${err.message}`);
  }

  if (aiConfig) {
    log(`BYOK provider active: ${aiConfig.provider}.`);
  } else {
    log('No BYOK key is saved for this user yet.');
  }

  if (BOT_PLATFORM === 'telegram') {
    await startTelegram();
  } else if (BOT_PLATFORM === 'discord') {
    await startDiscord();
  } else {
    throw new Error(`Unsupported platform: ${BOT_PLATFORM}`);
  }
};

main().catch(async (err) => {
  log(`Fatal runner error: ${err.message}`);
  await shutdown();
});
