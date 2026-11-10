import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isLinux, writeFileAtomic } from './util.js';

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
  // Start scripts must be readable by the site user, so they can't live in the root-only configDir.
  runDir: path.join(dataDir, 'run'),
  homeDir: path.join(dataDir, 'home'),
  tmpDir: path.join(dataDir, 'tmp'),
  // Each website's DATA_DIR: never touched by deploys, rollbacks or "clean".
  siteDataRoot: path.join(dataDir, 'sitedata'),
  snapshotsDir: path.join(dataDir, 'snapshots'),
  historyDir: path.join(dataDir, 'history'),
  backupsDir: path.join(dataDir, 'backups'),
  visitorsDir: path.join(dataDir, 'visitors'),
  tasksDir: path.join(dataDir, 'tasks'),
  activityFile: path.join(dataDir, 'activity.log'),
  unitDir: DEV ? path.join(devRoot, 'systemd') : '/etc/systemd/system',
};

/** The unprivileged Linux account that runs the websites. */
export const SITE_USER = 'autonode';

function defaults() {
  return {
    version: 1,
    dashboard: { port: DEV ? 7070 : 7070, host: '0.0.0.0', allowPublic: false, https: false },
    backups: { enabled: false, time: '03:00', keep: 7, copyTo: '', lastRun: null, lastOk: null, lastError: null, lastFile: null },
    snapshots: { keep: 5 },
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
  const all = [paths.configDir, paths.certsDir, paths.envDir, paths.dataDir, paths.sitesDir, paths.runDir, paths.homeDir, paths.tmpDir, paths.siteDataRoot];
  const rootOnly = [paths.snapshotsDir, paths.historyDir, paths.backupsDir, paths.visitorsDir, paths.tasksDir];
  for (const d of [...all, ...rootOnly]) fs.mkdirSync(d, { recursive: true });
  try {
    fs.chmodSync(paths.configDir, 0o700); // secrets: root only
    fs.chmodSync(paths.tmpDir, 0o700);
    for (const d of rootOnly) fs.chmodSync(d, 0o700); // snapshots/backups hold site data and keys
    fs.chmodSync(paths.siteDataRoot, 0o755);
    fs.chmodSync(paths.dataDir, 0o755); // site user must be able to reach sites/ and run/
    fs.chmodSync(paths.runDir, 0o755); // root-owned: readable, not writable, by the site user
  } catch {}
}

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function merge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (isPlain(base[k]) && k !== 'sites') {
      // A section like "dashboard" must stay an object even if the file has null or a string there.
      if (isPlain(v)) base[k] = merge({ ...base[k] }, v);
    } else base[k] = v;
  }
  return base;
}

/** The previous good config, kept next to it; used if config.json is ever damaged. */
const backupFile = () => paths.configFile + '.bak';

function readConfig(file) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('not a settings object');
  return saved;
}

/** Repair values a hand edit or an old version could have left in a shape the code doesn't expect. */
function sanitize(s) {
  if (!s.sites || typeof s.sites !== 'object' || Array.isArray(s.sites)) s.sites = {};
  for (const [name, site] of Object.entries(s.sites)) {
    if (!site || typeof site !== 'object' || site.name !== name) {
      console.error(`[config] Ignoring a damaged website entry "${name}".`);
      delete s.sites[name];
      continue;
    }
    if (!Array.isArray(site.hostnames)) site.hostnames = [];
    if (!site.env || typeof site.env !== 'object' || Array.isArray(site.env)) site.env = {};
  }
  if (typeof s.sessionSecret !== 'string' || s.sessionSecret.length < 32) s.sessionSecret = crypto.randomBytes(32).toString('hex');
  s.dashboard.allowPublic = !!s.dashboard.allowPublic;
  return s;
}

export function load() {
  ensureDirs();
  let saved = {};
  let recovered = false;
  try {
    saved = readConfig(paths.configFile);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // A damaged file (power cut during a write on an old version, a bad hand edit): fall back to the last good copy.
      try {
        saved = readConfig(backupFile());
        recovered = true;
        fs.copyFileSync(paths.configFile, `${paths.configFile}.damaged-${Date.now()}`);
        console.error(`[config] ${paths.configFile} could not be read (${err.message}). Restored the last good copy; the damaged file was kept next to it.`);
      } catch {
        throw new Error(`Could not read ${paths.configFile}: ${err.message}`);
      }
    }
  }
  state = sanitize(merge(defaults(), saved));
  if (recovered || !fs.existsSync(paths.configFile)) save();
  return state;
}

export function get() {
  return state || load();
}

export function save() {
  const json = JSON.stringify(state, null, 2);
  // Keep the current file as the "last good" copy before replacing it.
  try {
    if (fs.existsSync(paths.configFile)) {
      readConfig(paths.configFile); // only a file that parses is worth keeping
      fs.copyFileSync(paths.configFile, backupFile());
      fs.chmodSync(backupFile(), 0o600);
    }
  } catch {}
  writeFileAtomic(paths.configFile, json, { mode: 0o600 });
}

/**
 * Mutate config through a callback and persist. If the callback throws, or the
 * file can't be written, nothing changes in memory either.
 */
export function update(fn) {
  const s = get();
  const before = structuredClone(s);
  try {
    const r = fn(s);
    save();
    return r;
  } catch (err) {
    state = before;
    if (err.code === 'ENOSPC') throw Object.assign(new Error('The disk is full, so the change could not be saved. Free up some space and try again.'), { status: 507 });
    throw err;
  }
}
