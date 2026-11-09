import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isLinux } from './util.js';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'));

/** Dev mode: runs anywhere (macOS/Windows too) with local folders and no systemd/root. */
export const DEV = process.env.AUTONODE_DEV === '1' || !isLinux;

const devRoot = path.join(APP_ROOT, '.dev');
const configDir = process.env.AUTONODE_CONFIG_DIR || (DEV ? path.join(devRoot, 'etc') : '/etc/autonode');
const dataDir = process.env.AUTONODE_DATA_DIR || (DEV ? path.join(devRoot, 'data') : '/var/lib/autonode');

export const paths = {
  configDir,
  dataDir,
  configFile: path.join(configDir, 'config.json'),
  certsDir: path.join(configDir, 'certs'),
  envDir: path.join(configDir, 'env'),
  sitesDir: path.join(dataDir, 'sites'),
  homeDir: path.join(dataDir, 'home'),
  tmpDir: path.join(dataDir, 'tmp'),
  unitDir: DEV ? path.join(devRoot, 'systemd') : '/etc/systemd/system',
};

/** The unprivileged Linux account that runs the websites. */
export const SITE_USER = 'autonode';

function defaults() {
  return {
    version: 1,
    dashboard: { port: DEV ? 7070 : 7070, host: '0.0.0.0', allowPublic: false },
    proxy: { httpPort: DEV ? 8080 : 80, httpsPort: DEV ? 8443 : 443, redirectHttps: true },
    auth: { hash: null, salt: null, setupCode: crypto.randomBytes(4).toString('hex').toUpperCase() },
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    cloudflare: { apiToken: null, ddns: true, lastIp: null, lastSync: null, lastError: null },
    selfUpdate: { auto: false, lastCheck: null },
    sites: {},
  };
}

let state = null;

function ensureDirs() {
  for (const d of [paths.configDir, paths.certsDir, paths.envDir, paths.dataDir, paths.sitesDir, paths.homeDir, paths.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  try {
    fs.chmodSync(paths.configDir, 0o700);
  } catch {}
}

function merge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && k !== 'sites') {
      base[k] = merge({ ...base[k] }, v);
    } else base[k] = v;
  }
  return base;
}

export function load() {
  ensureDirs();
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Could not read ${paths.configFile}: ${err.message}`);
  }
  state = merge(defaults(), saved);
  if (!fs.existsSync(paths.configFile)) save();
  return state;
}

export function get() {
  return state || load();
}

export function save() {
  const tmp = paths.configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, paths.configFile);
}

/** Mutate config through a callback and persist. */
export function update(fn) {
  const s = get();
  const r = fn(s);
  save();
  return r;
}
