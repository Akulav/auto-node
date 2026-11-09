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
import { siteDir, fixOwnership, allSites, startSite, reservedPorts } from './sites.js';
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
  const args = ['-czf', '-', '--exclude=node_modules', '--exclude=*.autonode-upload', '-C', tmp, JSON_NAME];
  if (fs.existsSync(config.paths.sitesDir)) args.push('-C', config.paths.dataDir, 'sites');
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
      const hasCode = fs.existsSync(path.join(siteDir(name), 'package.json'));
      if (s.git && !hasCode) deploy(name, { reason: 'restored from backup' });
      else if (hasCode && !fs.existsSync(path.join(siteDir(name), 'node_modules'))) deploy(name, { reason: 'restored from backup', pull: false });
      else await startSite(name).catch((err) => report.warnings.push(`${name}: ${err.message}`));
    }
  }
  report.summary = summary(m);
  return report;
}
