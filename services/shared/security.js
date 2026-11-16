const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const argon2 = require('argon2');
const { z } = require('zod');

// AES-256-GCM Encryption Helpers
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'v-7h_s%68_p*m9#k2!l5^n8*x3$z1@y9'; // 32 chars
const IV_LENGTH = 12;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text) {
  const [ivHex, authTagHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Security Middleware Configuration
const securityMiddleware = (app) => {
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  }));

  // Generic Rate Limiter
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const path = req.originalUrl || req.url || '';
      return path === '/health' || path.startsWith('/health?') || path.includes('/logs');
    },
    message: 'Too many requests from this IP, please try again shortly.'
  });
  app.use(limiter);
};

// Auth Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes'
});

// JWT Helpers
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    process.env.ACCESS_TOKEN_SECRET || 'access-secret',
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET || 'refresh-secret',
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
};

const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

// Cloudflare Turnstile Verifier (Mock)
async function verifyTurnstile(token) {
  if (process.env.NODE_ENV === 'development' || !token) return true;
  // Real implementation would fetch https://challenges.cloudflare.com/turnstile/v0/siteverify
  return true; 
}

module.exports = {
  encrypt,
  decrypt,
  securityMiddleware,
  authLimiter,
  generateTokens,
  verifyToken,
  verifyTurnstile,
  argon2,
  z
};
