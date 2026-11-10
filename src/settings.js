/**
 * Dashboard API behind the Settings page, grouped like its tabs:
 * General (updates), Web Server, Backups, Export & Import, Security, Remote Access.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as config from './config.js';
import * as auth from './auth.js';
import * as proxy from './proxy.js';
import * as backup from './backup.js';
import * as uploads from './uploads.js';
import * as selfupdate from './selfupdate.js';
import * as dashtls from './dashtls.js';
import * as cf from './cloudflare.js';
import { runnerKind } from './runner.js';
import { HttpError, lanAddress } from './util.js';

/* --------------------------------------------------------- staged imports */

const IMPORT_TTL = 30 * 60_000;
const pendingImports = new Map(); // token -> { file, at }

function dropExpiredImports() {
  for (const [t, p] of pendingImports) {
    if (Date.now() - p.at > IMPORT_TTL) {
      fs.rmSync(p.file, { force: true });
      pendingImports.delete(t);
    }
  }
}

/** Validate a backup file and park it for POST /api/backup/restore. */
export async function stageBackup(file) {
  dropExpiredImports();
  try {
    const summary = await backup.inspect(file);
    const token = crypto.randomUUID();
    pendingImports.set(token, { file, at: Date.now() });
    return { token, summary };
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}

/* --------------------------------------------------------------- general */

export function publicSettings() {
  const c = config.get();
  return {
    version: config.pkg.version,
    selfUpdateAuto: c.selfUpdate.auto,
    lastCheck: c.selfUpdate.lastCheck,
    gitInstall: selfupdate.isGitInstall(),
    redirectHttps: c.proxy.redirectHttps,
    snapshotsKeep: c.snapshots.keep,
    proxy: proxy.status,
    runner: runnerKind(),
    node: process.version,
    paths: { sitesDir: config.paths.sitesDir, siteDataRoot: config.paths.siteDataRoot },
    dashboardPort: c.dashboard.port,
    dashboardHttps: !!c.dashboard.https,
    dashboardCert: dashtls.info(),
    remoteAccess: !!c.dashboard.allowPublic,
  };
}

/** Apply a PATCH /api/settings body. Unknown keys are ignored. */
export async function updateSettings(body) {
  if (body.dashboardHttps === true) await dashtls.ensureCert(); // fail before switching if openssl is missing
  let remoteTurnedOff = false;
  config.update((c) => {
    if (body.selfUpdateAuto != null) c.selfUpdate.auto = !!body.selfUpdateAuto;
    if (body.redirectHttps != null) c.proxy.redirectHttps = !!body.redirectHttps;
    if (body.dashboardHttps != null) {
      c.dashboard.https = !!body.dashboardHttps;
      // Remote access needs an encrypted connection: never leave it on over plain HTTP.
      if (!c.dashboard.https && c.dashboard.allowPublic) {
        c.dashboard.allowPublic = false;
        remoteTurnedOff = true;
      }
    }
  });
  return { remoteTurnedOff };
}

/* --------------------------------------------------------- remote access */

let ipCache = { at: 0, ip: null };

/** This network's internet address: cached, and never makes the page wait more than a few seconds. */
async function publicIp() {
  if (ipCache.ip && Date.now() - ipCache.at < 10 * 60_000) return ipCache.ip;
  const lookup = cf.publicIp().then((ip) => (ip && (ipCache = { at: Date.now(), ip }), ip));
  const ip = await Promise.race([lookup, new Promise((r) => setTimeout(r, 4000, null).unref())]).catch(() => null);
  return ip || config.get().cloudflare.lastIp || null;
}

export async function remoteAccessInfo() {
  const c = config.get();
  return {
    enabled: !!c.dashboard.allowPublic,
    https: !!c.dashboard.https,
    port: c.dashboard.port,
    lanIp: lanAddress(),
    publicIp: await publicIp(),
  };
}

export function setRemoteAccess(enabled) {
  enabled = !!enabled;
  if (enabled && !config.get().dashboard.https) throw new HttpError(400, 'Turn on the secure dashboard (HTTPS) first, so your password is encrypted on the internet.');
  if (enabled && !auth.isSetUp()) throw new HttpError(400, 'Choose a dashboard password first.');
  config.update((c) => {
    c.dashboard.allowPublic = enabled;
  });
  return { enabled };
}

/* ---------------------------------------------------------------- routes */

export function register(on, { q }) {
  // General & web server
  on('GET', '/api/settings', async () => publicSettings());
  on('PATCH', '/api/settings', async (req, res, p, body) => {
    const { remoteTurnedOff } = await updateSettings(body);
    const host = String(req.headers.host || `${lanAddress()}:${config.get().dashboard.port}`);
    return { ok: true, remoteTurnedOff, url: body.dashboardHttps != null ? `${body.dashboardHttps ? 'https' : 'http'}://${host}/#/settings/security` : undefined };
  });
  on('GET', '/api/update', async () => selfupdate.check());
  on('POST', '/api/update', async () => selfupdate.apply());

  // Remote access
  on('GET', '/api/remote-access', async () => remoteAccessInfo());
  on('PATCH', '/api/remote-access', async (req, res, p, body) => setRemoteAccess(body.enabled));

  // Security
  on('POST', '/api/password', async (req, res, p, body) => {
    if (!(await auth.verifyPassword(body.current, req.socket.remoteAddress))) throw new HttpError(401, 'Your current password is wrong.');
    await auth.setPassword(body.next); // rotates the session secret: every other device is signed out
    res.setHeader('Set-Cookie', auth.createSessionCookie(!!req.socket.encrypted));
    return { ok: true };
  });
  on('POST', '/api/sessions/revoke', async (req, res) => {
    auth.revokeAllSessions();
    res.setHeader('Set-Cookie', auth.clearSessionCookie());
    return { ok: true };
  });
  on('GET', '/api/dashboard-cert', async (req, res) => {
    const cert = dashtls.certPem();
    if (!cert) throw new HttpError(404, 'Turn on HTTPS for the dashboard first.');
    res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="autonode-dashboard.crt"', 'Cache-Control': 'no-store' });
    res.end(cert);
    return undefined;
  });
  on('POST', '/api/dashboard-cert/regenerate', async () => (await dashtls.ensureCert({ force: true }), dashtls.info()));

  // Export & import
  on('GET', '/api/backup', async (req, res) => {
    const withFiles = q(req).get('files') === '1';
    const name = backup.exportFilename(withFiles);
    if (!withFiles) {
      const body = JSON.stringify(backup.buildManifest(), null, 2);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
      res.end(body);
      return undefined;
    }
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    await backup.streamFullExport(res);
    return undefined;
  });
  on('PUT', '/api/backup/upload', async (req) => stageBackup(await backup.receive(req)), { raw: true });
  on('POST', '/api/backup/upload-complete', async (req, res, p, body) => {
    const tmp = uploads.take(body.id, body.total);
    const file = path.join(config.paths.tmpDir, `upload-${crypto.randomUUID()}.bin`);
    uploads.moveFile(tmp, file);
    return stageBackup(file);
  });
  on('POST', '/api/backup/restore', async (req, res, p, body) => {
    const pending = pendingImports.get(body.token);
    if (!pending) throw new HttpError(410, 'That upload expired. Please choose the file again.');
    pendingImports.delete(body.token);
    return backup.restore(pending.file, { settings: body.settings !== false });
  });

  // Backups saved on this computer
  on('GET', '/api/backups', async () => ({ settings: backup.scheduleSettings(), backups: backup.listStored(), running: backup.isBackupRunning() }));
  on('PATCH', '/api/backups', async (req, res, p, body) => backup.setSchedule(body));
  on('POST', '/api/backups/run', async () => {
    if (backup.isBackupRunning()) throw new HttpError(409, 'A backup is already running.');
    backup.runNow({ kind: 'manual' }).catch(() => {}); // the result is shown on the Backups tab and in Activity
    return { started: true };
  });
  on('GET', '/api/backups/:file', async (req, res, p) => {
    const file = backup.storedFile(p.file);
    const size = fs.statSync(file).size;
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': size, 'Content-Disposition': `attachment; filename="${p.file}"`, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return undefined;
  });
  on('DELETE', '/api/backups/:file', async (req, res, p) => (fs.rmSync(backup.storedFile(p.file)), { ok: true }));
  on('POST', '/api/backups/:file/prepare', async (req, res, p) => {
    // Restore works on a copy: restore() deletes the file it was given.
    const copy = path.join(config.paths.tmpDir, `stored-${crypto.randomUUID()}.tar.gz`);
    fs.copyFileSync(backup.storedFile(p.file), copy);
    return stageBackup(copy);
  });
}
