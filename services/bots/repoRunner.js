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
const ENV_FILE_CONTENTS = process.env.BOT_ENV_FILE_CONTENTS || '';
const SCRIPT_FILES = ['index.js', 'bot.js'];
const INLINE_ENTRY_FILE = 'bot.js';

const parseDashboardEnv = () => {
  try {
    const parsed = JSON.parse(process.env.BOT_ENV_VARS || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    console.error(`Could not parse dashboard environment variables: ${err.message}`);
    return {};
  }
};

const DASHBOARD_ENV = parseDashboardEnv();

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

const writeEnvFile = () => {
  if (!ENV_FILE_CONTENTS) return;
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_DIR, '.env'), Buffer.from(ENV_FILE_CONTENTS, 'base64'), {
    mode: 0o600
  });
  log('Wrote dashboard environment variables to .env.');
};

const usesEsmSyntax = (code) => {
  const text = String(code || '');
  return (
    /(^|[\r\n;])\s*import\s+/.test(text) ||
    /(^|[\r\n;])\s*export\s+/.test(text)
  );
};

const ensureInlinePackageJson = (code) => {
  const packagePath = path.join(REPO_DIR, 'package.json');
  let pkg = null;

  if (fs.existsSync(packagePath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } catch (err) {
      log(`Could not parse repository package.json: ${err.message}`);
    }
  }

  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    pkg = { name: `botnoob-inline-${BOT_ID}`, version: '1.0.0', private: true };
  }

  pkg.type = usesEsmSyntax(code) ? 'module' : 'commonjs';
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  log(`Wrote package.json with "type": "${pkg.type}" for inline bot code.`);
};

const ensureInlineNodeModulesLink = () => {
  const linkPath = path.join(REPO_DIR, 'node_modules');

  try {
    fs.lstatSync(linkPath);
    return;
  } catch (err) {
    // Link does not exist yet.
  }

  const candidates = [
    process.env.BOT_NODE_MODULES,
    path.join(__dirname, '..', 'node_modules'),
    '/app/node_modules'
  ];
  const source = candidates.find((candidate) => candidate && fs.existsSync(candidate));

  if (!source) {
    log('No service node_modules directory found for inline bot dependencies.');
    return;
  }

  try {
    fs.symlinkSync(source, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    log(`Linked ${linkPath} to ${source}.`);
  } catch (err) {
    log(`Could not link inline bot node_modules: ${err.message}`);
  }
};

const applyCustomCode = () => {
  if (!CUSTOM_CODE_FILE) return null;
  if (!fs.existsSync(CUSTOM_CODE_FILE)) {
    throw new Error('Custom code file is missing.');
  }

  const code = fs.readFileSync(CUSTOM_CODE_FILE, 'utf8');
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_DIR, INLINE_ENTRY_FILE), code, 'utf8');
  ensureInlinePackageJson(code);
  ensureInlineNodeModulesLink();
  log(`Wrote custom code to ${INLINE_ENTRY_FILE}.`);
  return { command: process.execPath, args: [INLINE_ENTRY_FILE] };
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
  const env = { ...process.env, ...DASHBOARD_ENV };
  env.BOT_TOKEN = BOT_TOKEN;
  delete env.BOT_ENV_VARS;
  delete env.BOT_ENV_FILE_CONTENTS;
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
  writeEnvFile();

  const customEntry = applyCustomCode();
  if (CUSTOM_CODE_FILE && !customEntry) {
    throw new Error('Custom code exists but could not be staged; refusing to use the built-in runner.');
  }

  const entry = customEntry || resolveEntry();
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
