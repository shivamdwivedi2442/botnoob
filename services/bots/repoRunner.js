const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BOT_ID = process.env.BOT_ID || 'unknown';
const BOT_NAME = process.env.BOT_NAME || 'Botnoob Bot';
const BOT_PLATFORM = (process.env.BOT_PLATFORM || '').toLowerCase();
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const REPO_URL = process.env.BOT_REPO_URL || '';
const REPO_ROOT = process.env.BOT_REPO_ROOT || path.join(os.tmpdir(), 'botnoob-repos');
const REPO_DIR = process.env.BOT_REPO_DIR || path.join(REPO_ROOT, String(BOT_ID));
const CUSTOM_CODE_FILE = process.env.BOT_CUSTOM_CODE_FILE || '';
const SCRIPT_FILES = ['index.js', 'bot.js'];

let appProcess = null;
let shuttingDown = false;

const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const redact = (value) => String(value).replace(/(https?:\/\/)[^@/]+@/i, '$1***@');

const redactCommand = (command, args) => [command, ...args].map(redact).join(' ');

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    log(`$ ${redactCommand(command, args)}`);
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit']
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 'null'}${signal ? ` (${signal})` : ''}`));
    });
  });

const ensureRepo = async () => {
  fs.mkdirSync(REPO_ROOT, { recursive: true });

  if (!REPO_URL) {
    fs.mkdirSync(REPO_DIR, { recursive: true });
    return;
  }

  if (!/^https?:\/\//i.test(REPO_URL)) {
    throw new Error('Only public HTTPS repository URLs are supported.');
  }

  if (fs.existsSync(path.join(REPO_DIR, '.git'))) {
    log(`Updating repository for ${BOT_NAME} in ${REPO_DIR}.`);
    await run('git', ['-C', REPO_DIR, 'remote', 'set-url', 'origin', REPO_URL]);
    await run('git', ['-C', REPO_DIR, 'pull', '--ff-only']);
  } else {
    log(`Cloning repository for ${BOT_NAME} into ${REPO_DIR}.`);
    fs.rmSync(REPO_DIR, { recursive: true, force: true });
    await run('git', ['clone', '--depth', '1', REPO_URL, REPO_DIR]);
  }

  if (fs.existsSync(path.join(REPO_DIR, 'package.json'))) {
    log('package.json found; installing production dependencies.');
    await run('npm', ['install', '--production'], REPO_DIR);
  }
};

const applyCustomCode = () => {
  if (!CUSTOM_CODE_FILE) return null;
  if (!fs.existsSync(CUSTOM_CODE_FILE)) {
    throw new Error('Custom code file is missing.');
  }

  let target = 'bot.js';
  for (const candidate of SCRIPT_FILES) {
    if (fs.existsSync(path.join(REPO_DIR, candidate))) {
      target = candidate;
      break;
    }
  }

  fs.copyFileSync(CUSTOM_CODE_FILE, path.join(REPO_DIR, target));
  log(`Wrote custom code to ${target}.`);
  return { command: process.execPath, args: [target] };
};

const resolveEntry = () => {
  const packagePath = path.join(REPO_DIR, 'package.json');

  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (pkg?.scripts?.start) {
        return { command: 'npm', args: ['start'] };
      }
    } catch (err) {
      log(`Could not parse package.json: ${err.message}`);
    }
  }

  for (const candidate of SCRIPT_FILES) {
    if (fs.existsSync(path.join(REPO_DIR, candidate))) {
      return { command: process.execPath, args: [candidate] };
    }
  }

  throw new Error('No npm start script, index.js, or bot.js found in the repository.');
};

const buildEnv = () => {
  const env = { ...process.env };
  if (BOT_PLATFORM === 'telegram') {
    env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  } else if (BOT_PLATFORM === 'discord') {
    env.DISCORD_TOKEN = BOT_TOKEN;
  }
  return env;
};

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}; stopping repository bot.`);

  if (appProcess && appProcess.exitCode === null) {
    try {
      appProcess.kill(signal);
    } catch (err) {
      // Ignore signal errors during shutdown.
    }
    const timer = setTimeout(() => {
      if (appProcess.exitCode === null) {
        try {
          appProcess.kill('SIGKILL');
        } catch (err) {
          // Ignore signal errors during shutdown.
        }
      }
      process.exit(0);
    }, 1500);
    if (typeof timer.unref === 'function') timer.unref();
    return;
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => log(`Unhandled rejection: ${err?.message || err}`));

const main = async () => {
  if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN.');
  if (!REPO_URL && !CUSTOM_CODE_FILE) throw new Error('Missing BOT_REPO_URL and custom code.');

  log(`Repository runner started for "${BOT_NAME}" (${BOT_ID}).`);
  await ensureRepo();

  const entry = applyCustomCode() || resolveEntry();
  log(`Starting repository bot: ${entry.command} ${entry.args.join(' ')}`);

  appProcess = spawn(entry.command, entry.args, {
    cwd: REPO_DIR,
    env: buildEnv(),
    stdio: ['ignore', 'inherit', 'inherit']
  });

  appProcess.on('error', (err) => {
    log(`Repository bot failed to start: ${err.message}`);
    process.exit(1);
  });

  appProcess.on('exit', (code, signal) => {
    log(`Repository bot exited (code ${code ?? 'null'}, signal ${signal || 'none'})`);
    process.exit(code ?? 0);
  });
};

main().catch((err) => {
  log(`Repository runner error: ${err.message}`);
  process.exit(1);
});
