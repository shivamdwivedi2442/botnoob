const { createHash } = require('crypto');

const PROVIDER_ALIASES = {
  openai: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  gemini: 'gemini',
  google: 'gemini',
  'google-ai': 'gemini',
  'google-ai-studio': 'gemini'
};

const DEFAULT_MODELS = {
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash'],
  openai: ['gpt-4o-mini'],
  anthropic: ['claude-sonnet-4-6']
};

const ENV_MODEL_KEYS = {
  gemini: 'GEMINI_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL'
};

const aliasProvider = (label) => {
  if (!label) return null;
  const key = String(label).trim().toLowerCase();
  return PROVIDER_ALIASES[key] || null;
};

const detectProviderFromKey = (key) => {
  const value = String(key || '').trim();
  if (value.startsWith('AIza') || value.startsWith('AQ.')) return 'gemini';
  if (value.startsWith('sk-ant-')) return 'anthropic';
  if (value.startsWith('sk-')) return 'openai';
  return null;
};

const resolveProvider = (key, label) => detectProviderFromKey(key) || aliasProvider(label) || null;

const modelsFor = (provider, env = process.env) => {
  const overrideKey = ENV_MODEL_KEYS[provider];
  const override = overrideKey ? env[overrideKey] : null;
  const defaults = DEFAULT_MODELS[provider] || [];
  return [...new Set([override, ...defaults].filter(Boolean))];
};

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_CACHE_TTL_MS = 10 * 60 * 1000;

const geminiModelCache = new Map();
const geminiModelInflight = new Map();

const geminiCacheKey = (key) => createHash('sha256').update(String(key)).digest('hex');

const geminiModelScore = (name) => {
  const match = name.match(/gemini-(\d+)(?:\.(\d+))?/i);
  const major = match ? Number(match[1]) : 0;
  const minor = match?.[2] ? Number(match[2]) : 0;
  const lower = name.toLowerCase();
  let score = major * 1000 + minor * 10;
  if (lower.includes('preview') || lower.includes('-exp')) score -= 5;
  if (lower.includes('lite')) score -= 2;
  return score;
};

const pickGeminiFlashModels = (models) => {
  const names = new Set();

  for (const model of models) {
    if (!model || typeof model.name !== 'string') continue;
    if (!Array.isArray(model.supportedGenerationMethods)) continue;
    if (!model.supportedGenerationMethods.includes('generateContent')) continue;

    const name = model.name.replace(/^models\//, '');
    if (!/flash/i.test(name)) continue;
    if (/embedding|image|tts|native-audio|audio|vision/i.test(name)) continue;
    names.add(name);
  }

  return [...names].sort((a, b) => geminiModelScore(b) - geminiModelScore(a) || a.localeCompare(b));
};

const resolveGeminiModels = async (key, options = {}) => {
  const fallback = options.fallback?.length ? options.fallback : modelsFor('gemini');
  const cacheKey = geminiCacheKey(key);
  const cached = geminiModelCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) return cached.models;
  if (geminiModelInflight.has(cacheKey)) return geminiModelInflight.get(cacheKey);

  const lookup = (async () => {
    try {
      const response = await fetch(`${GEMINI_MODELS_URL}?key=${encodeURIComponent(String(key))}`, {
        method: 'GET',
        signal: AbortSignal.timeout(options.timeoutMs || 10000)
      });
      const text = await response.text();

      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (err) {
        payload = null;
      }

      if (!response.ok) {
        const detail = payload?.error?.message || text || response.statusText;
        throw new Error(`${response.status} ${detail}`.slice(0, 1000));
      }

      const models = pickGeminiFlashModels(Array.isArray(payload?.models) ? payload.models : []);
      if (models.length === 0) {
        throw new Error('Gemini returned no generateContent-capable flash models');
      }

      geminiModelCache.set(cacheKey, { models, expiresAt: Date.now() + GEMINI_CACHE_TTL_MS });
      if (typeof options.logger === 'function') {
        options.logger(`Gemini models resolved: ${models.join(', ')}`);
      }
      return models;
    } catch (err) {
      const message = err?.message || String(err);
      if (typeof options.logger === 'function') {
        options.logger(`Gemini model discovery failed: ${message}. Using fallback models.`);
      }
      geminiModelCache.set(cacheKey, { models: fallback, expiresAt: Date.now() + GEMINI_CACHE_TTL_MS });
      return fallback;
    } finally {
      geminiModelInflight.delete(cacheKey);
    }
  })();

  geminiModelInflight.set(cacheKey, lookup);
  return lookup;
};

module.exports = {
  PROVIDER_ALIASES,
  DEFAULT_MODELS,
  GEMINI_CACHE_TTL_MS,
  aliasProvider,
  detectProviderFromKey,
  resolveProvider,
  modelsFor,
  clearGeminiModelCache: () => geminiModelCache.clear(),
  resolveGeminiModels
};
