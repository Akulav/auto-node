/**
 * Full export / import of AutoNode.
 *
 * - Settings export: one JSON file with every setting, website definition,
 *   environment variable, Cloudflare token and certificate (+ private key).
 * - Full export: a .tar.gz with that JSON plus every website's files
 *   (node_modules is skipped — it is reinstalled on import).
 *
 * Import restores into the current machine: websites with the same name are
 * replaced, others are kept. The dashboard password on this machine is kept.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import * as config from './config.js';
import * as certs from './certs.js';
import { runner } from './runner.js';
import { siteDir, siteDataDir, siteKind, fixOwnership, allSites, startSite, reservedPorts } from './sites.js';
import { deploy } from './deploy.js';
import { HttpError, SITE_NAME_RE, run, which } from './util.js';

const FORMAT = 'autonode-backup';
const JSON_NAME = 'autonode-backup.json';

export function buildManifest() {
  const c = structuredClone(config.get());
  const certList = [];
  for (const info of certs.list()) {
    try {
      certList.push({
        id: info.id,
        cert: fs.readFileSync(path.join(config.paths.certsDir, `${info.id}.crt`), 'utf8'),
        key: fs.readFileSync(path.join(config.paths.certsDir, `${info.id}.key`), 'utf8'),
      });
    } catch {}
  }
  return {
    format: FORMAT,
    formatVersion: 1,
    autonodeVersion: config.pkg.version,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    config: c,
    certs: certList,
  };
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export function exportFilename(withFiles) {
  return `autonode-backup-${stamp()}.${withFiles ? 'tar.gz' : 'json'}`;
}

/** Stream a .tar.gz containing the manifest and all website files. */
export async function streamFullExport(out) {
  if (!which('tar')) throw new HttpError(500, 'The "tar" program is missing.');
  const tmp = fs.mkdtempSync(path.join(config.paths.tmpDir, 'export-'));
  fs.writeFileSync(path.join(tmp, JSON_NAME), JSON.stringify(buildManifest(), null, 2), { mode: 0o600 });
  // Rust build output is rebuilt on restore like node_modules is reinstalled.
  const rustTargets = allSites()
    .filter((s) => siteKind(s) === 'rust')
    .map((s) => `--exclude=sites/${s.name}/target`);
  const args = ['-czf', '-', '--exclude=node_modules', ...rustTargets, '--exclude=*.autonode-upload', '--exclude=*.autonode-tmp', '-C', tmp, JSON_NAME];
  if (fs.existsSync(config.paths.sitesDir)) args.push('-C', config.paths.dataDir, 'sites');
  if (fs.existsSync(config.paths.siteDataRoot)) args.push('-C', config.paths.dataDir, path.basename(config.paths.siteDataRoot)); // each site's DATA_DIR
  const child = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  try {
    await pipeline(child.stdout, out);
    const code = await new Promise((r) => (child.exitCode != null ? r(child.exitCode) : child.on('close', r)));
    if (code > 1) throw new Error(err.trim() || `tar exited with ${code}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function validateManifest(m) {
  if (!m || m.format !== FORMAT || !m.config || typeof m.config !== 'object') throw new HttpError(400, "That file isn't an AutoNode backup.");
  const sites = m.config.sites;
  if (sites != null && (typeof sites !== 'object' || Array.isArray(sites))) throw new HttpError(400, "That file isn't an AutoNode backup.");
  // restore() uses s.name for folder paths (deleted and replaced as root), so it must match the validated key.
  for (const [name, s] of Object.entries(sites || {})) {
    if (!SITE_NAME_RE.test(name) || !s || s.name !== name) throw new HttpError(400, `Backup contains an invalid website name: ${name}`);
    if (!Number.isInteger(s.port) || s.port < 1024 || s.port > 65535) throw new HttpError(400, `Backup has an invalid port for ${name}.`);
    if (s.hostnames != null && !Array.isArray(s.hostnames)) throw new HttpError(400, `Backup has invalid domains for ${name}.`);
  }
  return m;
}

/** Inspect a backup file without applying it. */
export async function inspect(file) {
  const { manifest, cleanup } = await open(file);
  cleanup();
  return summary(manifest);
}

function summary(m) {
  return {
    createdAt: m.createdAt,
    autonodeVersion: m.autonodeVersion,
    hostname: m.hostname,
    sites: Object.values(m.config.sites || {}).map((s) => ({ name: s.name, title: s.title, hostnames: s.hostnames })),
    certificates: m.certs?.length || 0,
    cloudflare: !!m.config.cloudflare?.apiToken,
  };
}

async function open(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(2);
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (!which('tar')) throw new HttpError(500, 'The "tar" program is missing.');
    const dir = fs.mkdtempSync(path.join(config.paths.tmpDir, 'import-'));
    // We run as root: don't recreate the archive's owners; fixOwnership() hands files to the site user.
    const r = await run('tar', ['--no-same-owner', '-xzf', file, '-C', dir], { quiet: true, timeout: 30 * 60_000 });
    if (r.code !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new HttpError(400, `Couldn't open the backup: ${r.stderr.trim()}`);
    }
    let manifest;
    try {
      manifest = validateManifest(JSON.parse(fs.readFileSync(path.join(dir, JSON_NAME), 'utf8')));
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw err instanceof HttpError ? err : new HttpError(400, "That file isn't an AutoNode backup.");
    }
    return { manifest, filesDir: path.join(dir, 'sites'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new HttpError(400, "That file isn't an AutoNode backup.");
  }
  return { manifest: validateManifest(manifest), filesDir: null, cleanup: () => {} };
}

/* ------------------------------------------------------ scheduled backups */

const STORED_RE = /^autonode-backup-[0-9-]+(?:-auto|-manual)?\.tar\.gz$/;

export function storedFile(name) {
  if (!STORED_RE.test(String(name))) throw new HttpError(400, 'Invalid backup name.');
  const file = path.join(config.paths.backupsDir, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That backup no longer exists.');
  return file;
}

export function listStored() {
  let names = [];
  try {
    names = fs.readdirSync(config.paths.backupsDir).filter((n) => STORED_RE.test(n));
  } catch {}
  return names
    .map((name) => {
      const st = fs.statSync(path.join(config.paths.backupsDir, name));
      return { name, size: st.size, at: st.mtime.toISOString(), kind: name.includes('-manual') ? 'manual' : 'scheduled' };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function scheduleSettings() {
  const b = config.get().backups;
  return { enabled: b.enabled, time: b.time, keep: b.keep, copyTo: b.copyTo, lastRun: b.lastRun, lastOk: b.lastOk, lastError: b.lastError, lastFile: b.lastFile, folder: config.paths.backupsDir };
}

export function setSchedule(patch = {}) {
  const next = { ...config.get().backups };
  if (patch.enabled != null) next.enabled = !!patch.enabled;
  if (patch.time != null) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(patch.time))) throw new HttpError(400, 'Use a time like 03:00.');
    next.time = patch.time;
  }
  if (patch.keep != null) {
    const k = Number(patch.keep);
    if (!Number.isInteger(k) || k < 1 || k > 365) throw new HttpError(400, 'Keep between 1 and 365 backups.');
    next.keep = k;
  }
  if (patch.copyTo != null) {
    const dir = String(patch.copyTo).trim();
    if (dir) {
      if (!path.isAbsolute(dir)) throw new HttpError(400, 'Use a full folder path, like /mnt/backup-disk/autonode.');
      let st;
      try {
        st = fs.statSync(dir);
      } catch {
        throw new HttpError(400, `The folder ${dir} doesn't exist. Create it (or mount the disk) first.`);
      }
      if (!st.isDirectory()) throw new HttpError(400, `${dir} is not a folder.`);
      if (path.resolve(dir).startsWith(path.resolve(config.paths.sitesDir))) throw new HttpError(400, "Don't put backups inside a website folder: the website could read them.");
    }
    next.copyTo = dir;
  }
  config.update((c) => {
    c.backups = next;
  });
  return scheduleSettings();
}

let running = null;

/** Make a full backup into the backups folder (and the extra copy folder), then prune old ones. */
export function runNow({ kind = 'manual' } = {}) {
  if (running) return running;
  running = (async () => {
    const name = `autonode-backup-${stamp()}-${new Date().getSeconds().toString().padStart(2, '0')}-${kind === 'manual' ? 'manual' : 'auto'}.tar.gz`;
    const file = path.join(config.paths.backupsDir, name);
    const started = Date.now();
    try {
      fs.mkdirSync(config.paths.backupsDir, { recursive: true, mode: 0o700 });
      await streamFullExport(fs.createWriteStream(file + '.part', { mode: 0o600 }));
      fs.renameSync(file + '.part', file);
      const copyTo = config.get().backups.copyTo;
      let copied = null;
      if (copyTo) {
        fs.copyFileSync(file, path.join(copyTo, name));
        copied = path.join(copyTo, name);
      }
      // Keep the newest N of each kind (manual backups are never removed by the schedule).
      const keep = config.get().backups.keep;
      for (const old of listStored().filter((b) => b.kind === 'scheduled').slice(keep)) fs.rmSync(path.join(config.paths.backupsDir, old.name), { force: true });
      if (copyTo) {
        try {
          const extra = fs.readdirSync(copyTo).filter((n) => STORED_RE.test(n) && n.endsWith('-auto.tar.gz')).sort().reverse();
          for (const old of extra.slice(keep)) fs.rmSync(path.join(copyTo, old), { force: true });
        } catch {}
      }
      config.update((c) => {
        c.backups.lastRun = new Date().toISOString();
        if (kind !== 'manual') c.backups.lastScheduled = c.backups.lastRun;
        c.backups.lastOk = true;
        c.backups.lastError = null;
        c.backups.lastFile = name;
      });
      const size = fs.statSync(file).size;
      const { record } = await import('./activity.js');
      record({ action: kind === 'manual' ? 'Made a backup' : 'Scheduled backup', detail: `${name} (${Math.round(size / 1048576)} MB${copied ? `, copied to ${copyTo}` : ''}, ${Math.round((Date.now() - started) / 1000)} s)`, by: kind === 'manual' ? 'you' : 'schedule' });
      return { name, size, copied };
    } catch (err) {
      fs.rmSync(file + '.part', { force: true });
      config.update((c) => {
        c.backups.lastRun = new Date().toISOString();
        if (kind !== 'manual') c.backups.lastScheduled = c.backups.lastRun; // don't retry every minute; try again tomorrow
        c.backups.lastOk = false;
        c.backups.lastError = err.message;
      });
      const { record } = await import('./activity.js');
      record({ action: 'Backup failed', detail: err.message, ok: false, by: kind === 'manual' ? 'you' : 'schedule' });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

export const isBackupRunning = () => !!running;

let timer = null;
export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    const b = config.get().backups;
    if (!b.enabled || running) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const lastDay = b.lastScheduled ? new Date(b.lastScheduled).toDateString() : null;
    // Run once a day, at or after the chosen time (also catches up if the machine was off at that time).
    if (hhmm >= b.time && lastDay !== now.toDateString()) runNow({ kind: 'scheduled' }).catch((err) => console.error('[backup]', err.message));
  }, 60_000);
  timer.unref();
}

/** Save an uploaded backup to a temp file. */
export async function receive(req) {
  const file = path.join(config.paths.tmpDir, `upload-${Date.now()}.bin`);
  await pipeline(req, fs.createWriteStream(file, { mode: 0o600 }));
  return file;
}

/**
 * Apply a backup. Options:
 *   settings: restore Cloudflare/proxy/update settings (default true)
 */
export async function restore(file, { settings = true, startSites = true } = {}) {
  const { manifest: m, filesDir, cleanup } = await open(file);
  const report = { sites: [], certificates: 0, filesRestored: !!filesDir, warnings: [] };
  try {
    // 1) Certificates
    for (const c of m.certs || []) {
      try {
        certs.add(c.cert, c.key);
        report.certificates++;
      } catch (err) {
        report.warnings.push(`Certificate ${c.id}: ${err.message}`);
      }
    }

    // 2) Websites
    const incoming = Object.values(m.config.sites || {});
    for (const s of incoming) {
      // Stop the existing site with this name before replacing it.
      if (config.get().sites[s.name]) await runner().stop({ name: s.name }).catch(() => {});

      // Resolve port and hostname clashes with websites that stay.
      const others = allSites().filter((x) => x.name !== s.name);
      const site = { ...s, hostnames: [...(s.hostnames || [])], env: { ...(s.env || {}) } };
      const reserved = reservedPorts();
      if (others.some((o) => o.port === site.port) || reserved.has(site.port)) {
        const used = new Set([...others.map((o) => o.port), ...incoming.map((i) => i.port), ...reserved]);
        let p = 3001;
        while (used.has(p)) p++;
        report.warnings.push(`${site.name}: port ${site.port} was taken, now uses ${p}.`);
        site.port = p;
      }
      site.hostnames = site.hostnames.filter((h) => {
        const owner = others.find((o) => o.hostnames.includes(h));
        if (owner) report.warnings.push(`${h} stays with "${owner.name}" (already connected there).`);
        return !owner;
      });

      // Files
      const dest = siteDir(site.name);
      const src = filesDir && path.join(filesDir, site.name);
      if (src && fs.existsSync(src)) {
        fs.rmSync(dest, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(src, dest, { recursive: true });
      } else fs.mkdirSync(dest, { recursive: true });
      await fixOwnership(dest);
      // The site's DATA_DIR (databases, uploads), when the backup has it.
      const dataSrc = filesDir && path.join(path.dirname(filesDir), path.basename(config.paths.siteDataRoot), site.name);
      if (dataSrc && fs.existsSync(dataSrc)) {
        const dataDest = siteDataDir(site.name);
        fs.rmSync(dataDest, { recursive: true, force: true });
        fs.cpSync(dataSrc, dataDest, { recursive: true });
        await fixOwnership(dataDest);
      }

      config.update((c) => {
        c.sites[site.name] = site;
      });
      report.sites.push(site.name);
    }

    // 3) Global settings (keep this machine's password and session secret)
    if (settings) {
      config.update((c) => {
        const src = m.config;
        if (src.cloudflare) c.cloudflare = { ...c.cloudflare, ...src.cloudflare, lastIp: null };
        if (src.proxy) c.proxy = { ...c.proxy, redirectHttps: src.proxy.redirectHttps ?? c.proxy.redirectHttps };
        if (src.selfUpdate) c.selfUpdate = { ...c.selfUpdate, auto: !!src.selfUpdate.auto };
      });
    }
  } finally {
    cleanup();
    fs.rmSync(file, { force: true });
  }

  // 4) Bring websites back up (reinstall packages when files came from a full backup).
  if (startSites) {
    for (const name of report.sites) {
      const s = config.get().sites[name];
      if (!s?.enabled) continue;
      const dir = siteDir(name);
      const rustSite = siteKind(s) === 'rust';
      const hasCode = fs.existsSync(path.join(dir, rustSite ? 'Cargo.toml' : 'package.json'));
      const needsBuild = !fs.existsSync(path.join(dir, rustSite ? path.join('target', 'release') : 'node_modules'));
      if (s.git && !hasCode) deploy(name, { reason: 'restored from backup', by: 'system' });
      else if (hasCode && needsBuild) deploy(name, { reason: 'restored from backup', pull: false, by: 'system' });
      else await startSite(name).catch((err) => report.warnings.push(`${name}: ${err.message}`));
    }
  }
  report.summary = summary(m);
  return report;
}
