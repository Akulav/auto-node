/** The LAN dashboard: JSON API + static web app. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as config from './config.js';
import * as auth from './auth.js';
import * as stats from './stats.js';
import * as sites from './sites.js';
import * as files from './files.js';
import * as certs from './certs.js';
import * as cf from './cloudflare.js';
import * as deploy from './deploy.js';
import * as network from './network.js';
import * as selfupdate from './selfupdate.js';
import * as proxy from './proxy.js';
import * as backup from './backup.js';
import * as uploads from './uploads.js';
import * as locks from './locks.js';
import * as icons from './icons.js';
import * as activity from './activity.js';
import * as features from './features.js';
import * as health from './health.js';
import * as visitors from './visitors.js';
import * as tasks from './tasks.js';
import * as dashtls from './dashtls.js';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import { runner, runnerKind, restoreChildren, stopAllChildren } from './runner.js';
import { HttpError, readJson, readBody, sendJson, normalizeHostname } from './util.js';

const PUBLIC = path.join(config.APP_ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/* ------------------------------------------------------------------ router */

const routes = [];
const on = (method, pattern, handler, { open = false, raw = false } = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, pattern, re, keys, handler, open, raw });
};

function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) for (const a of addrs) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '127.0.0.1';
}

function sse(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  req.on('close', () => clearInterval(ping));
  return send;
}

async function cloudflareSummary() {
  const c = config.get().cloudflare;
  return { connected: !!c.apiToken, ddns: c.ddns, lastIp: c.lastIp, lastSync: c.lastSync, lastError: c.lastError };
}

/* ---------------------------------------------------------------- session */

on('GET', '/api/session', async (req) => ({
  authenticated: auth.isAuthenticated(req),
  setUp: auth.isSetUp(),
  version: config.pkg.version,
  dev: config.DEV,
  hostname: os.hostname(),
}), { open: true });

on('POST', '/api/setup', async (req, res, p, body) => {
  if (auth.isSetUp()) throw new HttpError(409, 'A password is already set.');
  if (!config.DEV && !auth.checkSetupCode(body.code, req.socket.remoteAddress)) throw new HttpError(403, 'That setup code is not right. Run "sudo autonode setup-code" on the server to see it.');
  await auth.setPassword(body.password);
  activity.record({ action: 'Created the dashboard password', ip: req.socket.remoteAddress?.replace(/^::ffff:/, ''), by: 'you' });
  res.setHeader('Set-Cookie', auth.createSessionCookie(!!req.socket.encrypted));
  return { ok: true };
}, { open: true });

on('POST', '/api/login', async (req, res, p, body) => {
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/, '');
  if (!(await auth.verifyPassword(body.password, req.socket.remoteAddress))) {
    activity.record({ action: 'Failed sign-in', ok: false, ip, by: 'someone' });
    throw new HttpError(401, 'Wrong password.');
  }
  activity.record({ action: 'Signed in', ip, by: 'you' });
  res.setHeader('Set-Cookie', auth.createSessionCookie(!!req.socket.encrypted));
  return { ok: true };
}, { open: true });

on('POST', '/api/logout', async (req, res) => {
  res.setHeader('Set-Cookie', auth.clearSessionCookie());
  return { ok: true };
}, { open: true });

on('POST', '/api/password', async (req, res, p, body) => {
  if (!(await auth.verifyPassword(body.current, req.socket.remoteAddress))) throw new HttpError(401, 'Your current password is wrong.');
  await auth.setPassword(body.next);
  res.setHeader('Set-Cookie', auth.createSessionCookie(!!req.socket.encrypted));
  return { ok: true };
});

/* --------------------------------------------------------------- overview */

on('GET', '/api/overview', async () => ({
  stats: stats.latestSample(),
  history: stats.getHistory(),
  sites: await sites.withStatus(sites.allSites()),
  proxy: proxy.status,
  runner: runnerKind(),
  cloudflare: await cloudflareSummary(),
  certs: certs.list(),
  lanIp: lanAddress(),
  version: config.pkg.version,
  dev: config.DEV,
}));

on('GET', '/api/stream', async (req, res) => {
  const send = sse(req, res);
  const push = async (s) => {
    try {
      send('stats', { stats: s, sites: await sites.withStatus(sites.allSites()) });
    } catch {}
  };
  push(stats.latestSample());
  const off = stats.subscribe(push);
  req.on('close', off);
  return undefined;
});

/* ------------------------------------------------------------------ sites */

on('GET', '/api/sites', async () => sites.withStatus(sites.allSites()));

on('POST', '/api/sites', async (req, res, p, body) => {
  const site = await sites.createSite(body);
  if (body.repo) {
    try {
      await deploy.connectRepo(site.name, { repo: body.repo, branch: body.branch, token: body.token, autoUpdate: !!body.autoUpdate });
      deploy.deploy(site.name, { reason: 'first deploy' });
    } catch (err) {
      return { site: (await sites.withStatus([sites.getSite(site.name)]))[0], warning: err.message };
    }
  } else if (body.start !== false && body.template === 'starter') {
    await sites.startSite(site.name).catch(() => {});
  }
  return { site: (await sites.withStatus([sites.getSite(site.name)]))[0] };
});

on('GET', '/api/sites/:name', async (req, res, p) => {
  const s = sites.getSite(p.name);
  const [withStatus] = await sites.withStatus([s]);
  let size = null;
  try {
    size = files.folderSize(sites.siteDir(s.name));
  } catch {}
  return { ...withStatus, size, deploy: deploy.jobStatus(s.name), health: health.statusOf(s.name), lanUrl: `http://${lanAddress()}:${s.port}`, certs: Object.fromEntries(s.hostnames.map((h) => [h, certs.hasCertFor(h)])) };
});

on('PATCH', '/api/sites/:name', async (req, res, p, body) => sites.updateSite(p.name, body));

// The website's own favicon, for the dashboard tiles.
on('GET', '/api/sites/:name/icon', async (req, res, p) => {
  const icon = await icons.getIcon(p.name);
  const headers = {
    'Content-Type': icon.type,
    'Cache-Control': 'private, no-cache',
    ETag: icon.etag,
    // The bytes come from the website: if someone opens an SVG directly, nothing in it may run.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (req.headers['if-none-match'] === icon.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': icon.data.length });
  res.end(icon.data);
  return undefined;
});

on('DELETE', '/api/sites/:name', async (req, res, p) => {
  const s = sites.getSite(p.name);
  if (config.get().cloudflare.apiToken) for (const h of s.hostnames) await cf.removeRecord(h).catch(() => {});
  await sites.deleteSite(p.name);
  return { ok: true };
});

on('POST', '/api/sites/:name/start', async (req, res, p) => (await sites.startSite(p.name), { ok: true }));
on('POST', '/api/sites/:name/stop', async (req, res, p) => (await sites.stopSite(p.name), { ok: true }));
on('POST', '/api/sites/:name/restart', async (req, res, p) => (await sites.restartSite(p.name), { ok: true }));
on('POST', '/api/sites/:name/rebuild', async (req, res, p) => deploy.deploy(p.name, { reason: 'rebuild', pull: false }));

on('GET', '/api/sites/:name/logs', async (req, res, p) => ({ text: await runner().logs(sites.getSite(p.name).name, 400) }));
on('GET', '/api/sites/:name/logs/stream', async (req, res, p) => {
  const name = sites.getSite(p.name).name;
  const send = sse(req, res);
  const stop = runner().follow(name, (line) => send('line', line));
  req.on('close', stop);
  return undefined;
});

on('POST', '/api/sites/:name/hostnames', async (req, res, p, body) => {
  const host = await sites.addHostname(p.name, body.hostname);
  let dns = null;
  if (config.get().cloudflare.apiToken) {
    try {
      const ip = await cf.publicIp();
      dns = await cf.ensureRecord(host, ip);
    } catch (err) {
      dns = { action: 'error', error: err.message };
    }
  }
  return { hostname: host, dns, hasCert: certs.hasCertFor(host) };
});

on('DELETE', '/api/sites/:name/hostnames/:host', async (req, res, p) => {
  const host = normalizeHostname(decodeURIComponent(p.host));
  sites.removeHostname(p.name, host);
  if (config.get().cloudflare.apiToken) await cf.removeRecord(host).catch(() => {});
  return { ok: true };
});

/* ------------------------------------------------------------------ files */

const q = (req) => new URL(req.url, 'http://x').searchParams;
// File routes work in the code folder, or the site's DATA_DIR with ?area=data.
const sc = (req, p) => files.scope(p.name, q(req).get('area'));

on('GET', '/api/sites/:name/files', async (req, res, p) => {
  const { rel } = files.resolveInSite(sc(req, p), q(req).get('path') || '/');
  return { path: rel, entries: files.list(sc(req, p), rel) };
});
on('GET', '/api/sites/:name/file', async (req, res, p) => {
  const rel = q(req).get('path');
  if (q(req).get('download')) {
    const { stream, size, filename } = files.downloadStream(sc(req, p), rel);
    // Plain ASCII fallback plus the UTF-8 name; raw non-ASCII in a header makes Node throw.
    const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}` });
    stream.pipe(res);
    return undefined;
  }
  return files.readText(sc(req, p), rel);
});
on('PUT', '/api/sites/:name/file', async (req, res, p) => {
  const body = await readBody(req, 5 * 1024 * 1024);
  await files.writeText(sc(req, p), q(req).get('path'), body);
  return { ok: true };
}, { raw: true });
on('PUT', '/api/sites/:name/upload', async (req, res, p) => (await files.upload(sc(req, p), q(req).get('path'), req), { ok: true }), { raw: true });
// Chunked, resumable uploads (used for website files and backups).
on('GET', '/api/chunk', async (req) => uploads.received(q(req).get('id')));
on('PUT', '/api/chunk', async (req) => uploads.writeChunk(q(req).get('id'), q(req).get('offset'), q(req).get('total'), req), { raw: true });
on('DELETE', '/api/chunk', async (req) => (uploads.discard(q(req).get('id')), { ok: true }));
on('POST', '/api/sites/:name/upload-complete', async (req, res, p, body) => {
  sites.getSite(p.name);
  const tmp = uploads.take(body.id, body.total);
  try {
    await files.placeUpload(sc(req, p), body.path, tmp);
  } catch (err) {
    uploads.discard(body.id);
    throw err;
  }
  return { ok: true };
});
on('POST', '/api/sites/:name/mkdir', async (req, res, p, body) => (await files.mkdir(sc(req, p), body.path), { ok: true }));
on('POST', '/api/sites/:name/rename', async (req, res, p, body) => (files.rename(sc(req, p), body.from, body.to), { ok: true }));
on('POST', '/api/sites/:name/unzip', async (req, res, p, body) => (await files.unzip(sc(req, p), body.path), { ok: true }));
on('DELETE', '/api/sites/:name/files', async (req, res, p) => (files.remove(sc(req, p), q(req).get('path')), { ok: true }));

/* ----------------------------------------------------------------- deploy */

function hookBase(site) {
  const host = site.hostnames[0];
  return host ? `https://${host}` : `http://YOUR_PUBLIC_ADDRESS`;
}

on('GET', '/api/sites/:name/git', async (req, res, p) => {
  const s = sites.getSite(p.name);
  if (!s.git) return { connected: false, job: deploy.jobStatus(s.name) };
  return {
    connected: true,
    repo: s.git.repo,
    branch: s.git.branch,
    hasToken: !!s.git.token,
    autoUpdate: s.git.autoUpdate,
    interval: s.git.interval,
    lastDeploy: s.git.lastDeploy,
    lastCheck: s.git.lastCheck,
    lastCommit: s.git.lastCommit,
    behind: s.git.behind,
    webhookUrl: `${hookBase(s)}/.autonode/deploy/${s.name}`,
    webhookSecret: s.git.webhookSecret,
    workflow: deploy.workflowYaml(s, hookBase(s)),
    job: deploy.jobStatus(s.name),
    blocked: s.git.blocked || null,
    locks: s.locks || [],
  };
});
on('PUT', '/api/sites/:name/git', async (req, res, p, body) => {
  const g = await deploy.connectRepo(p.name, body);
  return { ok: true, branch: g.branch };
});
on('DELETE', '/api/sites/:name/git', async (req, res, p) => (deploy.disconnectRepo(p.name), { ok: true }));
on('POST', '/api/sites/:name/git/check', async (req, res, p) => deploy.checkForUpdates(p.name));
on('POST', '/api/sites/:name/git/rotate', async (req, res, p) => (deploy.rotateSecret(p.name), { ok: true }));
on('POST', '/api/sites/:name/deploy', async (req, res, p, body) => {
  const resolve = ['keep', 'overwrite'].includes(body.resolve) ? body.resolve : null;
  return deploy.deploy(p.name, { reason: resolve ? `manual (${resolve === 'keep' ? 'keep server files' : 'use GitHub files'})` : 'manual', resolve });
});

// Locked files: never modified or deleted by GitHub updates.
on('GET', '/api/sites/:name/locks', async (req, res, p) => ({ locks: locks.getLocks(p.name) }));
on('PUT', '/api/sites/:name/locks', async (req, res, p, body) => ({ locks: locks.setLocks(p.name, body.locks) }));
on('POST', '/api/sites/:name/locks', async (req, res, p, body) => ({ locks: locks.addLocks(p.name, body.lock) }));
on('DELETE', '/api/sites/:name/locks', async (req, res, p) => ({ locks: locks.removeLock(p.name, q(req).get('lock')) }));
on('GET', '/api/sites/:name/deploy', async (req, res, p) => deploy.jobStatus(sites.getSite(p.name).name));

/* ------------------------------------------------------ certs & cloudflare */

on('GET', '/api/certs', async () => certs.list());
on('POST', '/api/certs', async (req, res, p, body) => certs.add(body.cert, body.key));
on('DELETE', '/api/certs/:id', async (req, res, p) => (certs.remove(p.id), { ok: true }));

on('GET', '/api/cloudflare', async () => {
  const s = await cloudflareSummary();
  const out = { ...s, publicIp: await cf.publicIp(), lanIp: lanAddress(), proxy: proxy.status };
  if (s.connected) {
    try {
      out.zones = await cf.zones();
    } catch (err) {
      out.zonesError = err.message;
    }
  }
  return out;
});
on('POST', '/api/cloudflare/connect', async (req, res, p, body) => {
  const zones = await cf.connect(body.token);
  cf.syncAll({ force: true }).catch(() => {});
  return { ok: true, zones };
});
on('DELETE', '/api/cloudflare', async () => (cf.disconnect(), { ok: true }));
on('PATCH', '/api/cloudflare', async (req, res, p, body) => {
  config.update((c) => {
    if (body.ddns != null) c.cloudflare.ddns = !!body.ddns;
  });
  return { ok: true };
});
on('POST', '/api/cloudflare/sync', async () => cf.syncAll({ force: true }));
on('POST', '/api/cloudflare/origin-cert', async (req, res, p, body) => cf.createOriginCert(normalizeHostname(body.domain)));
on('POST', '/api/cloudflare/strict', async (req, res, p, body) => (await cf.setStrictSsl(normalizeHostname(body.domain)), { ok: true }));

/* ---------------------------------------------------------------- network */

on('GET', '/api/network', async () => network.info());
on('POST', '/api/network', async (req, res, p, body) => network.apply(body));

/* --------------------------------------------------------------- settings */

on('GET', '/api/settings', async () => {
  const c = config.get();
  return { selfUpdateAuto: c.selfUpdate.auto, lastCheck: c.selfUpdate.lastCheck, redirectHttps: c.proxy.redirectHttps, dashboardPort: c.dashboard.port, dashboardHttps: !!c.dashboard.https, dashboardCert: dashtls.info(), snapshotsKeep: c.snapshots.keep, proxy: proxy.status, version: config.pkg.version, gitInstall: selfupdate.isGitInstall(), runner: runnerKind(), node: process.version, paths: config.paths };
});
on('PATCH', '/api/settings', async (req, res, p, body) => {
  if (body.dashboardHttps === true) await dashtls.ensureCert(); // fail before switching if openssl is missing
  config.update((c) => {
    if (body.selfUpdateAuto != null) c.selfUpdate.auto = !!body.selfUpdateAuto;
    if (body.redirectHttps != null) c.proxy.redirectHttps = !!body.redirectHttps;
    if (body.dashboardHttps != null) c.dashboard.https = !!body.dashboardHttps;
  });
  const port = config.get().dashboard.port;
  const host = String(req.headers.host || `${lanAddress()}:${port}`);
  return { ok: true, url: body.dashboardHttps != null ? `${body.dashboardHttps ? 'https' : 'http'}://${host}/#/settings` : undefined };
});
/* ----------------------------------------------------------------- backup */

const pendingImports = new Map(); // token -> { file, at }

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
on('PUT', '/api/backup/upload', async (req) => {
  for (const [t, p] of pendingImports) if (Date.now() - p.at > 30 * 60_000) (fs.rmSync(p.file, { force: true }), pendingImports.delete(t));
  const file = await backup.receive(req);
  try {
    const summary = await backup.inspect(file);
    const token = crypto.randomUUID();
    pendingImports.set(token, { file, at: Date.now() });
    return { token, summary };
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}, { raw: true });
on('POST', '/api/backup/upload-complete', async (req, res, p, body) => {
  const tmp = uploads.take(body.id, body.total);
  const file = path.join(config.paths.tmpDir, `upload-${body.id}.bin`);
  uploads.moveFile(tmp, file);
  try {
    const summary = await backup.inspect(file);
    const token = crypto.randomUUID();
    pendingImports.set(token, { file, at: Date.now() });
    return { token, summary };
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
});
/** Validate a backup file and park it for POST /api/backup/restore. */
async function stageBackup(file) {
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
features.register(on, { q, stageBackup });

on('POST', '/api/backup/restore', async (req, res, p, body) => {
  const pending = pendingImports.get(body.token);
  if (!pending) throw new HttpError(410, 'That upload expired. Please choose the file again.');
  pendingImports.delete(body.token);
  const report = await backup.restore(pending.file, { settings: body.settings !== false });
  return report;
});

on('GET', '/api/update', async () => selfupdate.check());
on('POST', '/api/update', async () => selfupdate.apply());

/* ----------------------------------------------------------------- server */

function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: 'bad path' });
  }
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 400, { error: 'bad path' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); // revalidate: a self-update must never leave a stale UI behind
    res.end(data);
  });
}

async function handler(req, res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");

  const remote = req.socket.remoteAddress || '';
  if (!config.get().dashboard.allowPublic && !auth.isPrivateAddress(remote)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('AutoNode is only available on your local network.');
  }

  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    return sendJson(res, 400, { error: 'Bad request' }); // e.g. "GET //"
  }
  if (url.pathname.startsWith('/.autonode/deploy/')) return deploy.handleHook(req, res);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);

  // CSRF: mutating requests must come from this page.
  if (req.method !== 'GET' && req.headers.origin) {
    const origin = req.headers.origin.replace(/^https?:\/\//, '');
    if (origin !== req.headers.host) return sendJson(res, 403, { error: 'Cross-site request blocked.' });
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    let params = {};
    let body = {};
    let failed = null;
    try {
      params = Object.fromEntries(
        r.keys.map((k, i) => {
          try {
            return [k, decodeURIComponent(m[i + 1])];
          } catch {
            throw new HttpError(400, 'Invalid address.');
          }
        }),
      );
      if (!r.open && !auth.isAuthenticated(req)) throw new HttpError(401, 'Please sign in.');
      // Raw routes stream their own body (files, chunks, backups).
      body = req.method === 'GET' || req.method === 'DELETE' || r.raw ? {} : await readJson(req, 2 * 1024 * 1024);
      const out = await r.handler(req, res, params, body);
      if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      failed = err.message || 'Something went wrong';
      if (status === 500) console.error(`[api] ${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) sendJson(res, status, { error: failed });
      else res.end();
      if (status === 401) return; // not signed in: nothing happened
    }
    if (req.method !== 'GET') activity.fromRequest({ method: req.method, pattern: r.pattern, params, body, ok: !failed, error: failed, ip: req.socket.remoteAddress });
    return;
  }
  sendJson(res, 404, { error: 'Not found' });
}

export async function serve() {
  config.load();
  certs.reload();
  stats.startSampling();
  await proxy.start(deploy.handleHook);
  await restoreChildren(sites.allSites(), sites.detectStartCommand);
  deploy.startAutoUpdates();
  cf.startDdns();
  selfupdate.startAutoCheck();
  health.start((name) => deploy.jobStatus(name).running);
  visitors.start();
  tasks.start();
  backup.startScheduler();

  const { port, host } = config.get().dashboard;
  // A rejected handler would be an unhandled rejection, which kills the whole daemon.
  const app = (req, res) =>
    handler(req, res).catch((err) => {
      console.error('[dashboard]', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong' });
      else res.destroy();
    });
  const plain = http.createServer((req, res) => {
    // HTTPS is on: send plain-HTTP visitors (old bookmarks) to the secure address.
    if (config.get().dashboard.https && dashtls.secureContext()) {
      res.writeHead(308, { Location: `https://${req.headers.host || `${lanAddress()}:${port}`}${req.url}` });
      return res.end();
    }
    return app(req, res);
  });
  // The certificate is given directly, not via SNI: browsers send no SNI when you visit by IP address.
  const secure = https.createServer({ ...(dashtls.pair() || {}) }, app);
  dashtls.onLoad((p) => secure.setSecureContext(p)); // turned on or regenerated while running
  for (const s of [plain, secure]) {
    s.requestTimeout = 0; // uploads & SSE
    s.headersTimeout = 60_000;
  }
  secure.on('tlsClientError', () => {});
  // One port for both: a TLS handshake starts with byte 0x16, plain HTTP with a letter.
  const server = net.createServer((socket) => {
    socket.on('error', () => socket.destroy());
    socket.setTimeout(60_000, () => socket.destroy()); // a client that never sends anything
    socket.once('data', (chunk) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(chunk);
      const useTls = chunk[0] === 0x16 && config.get().dashboard.https && dashtls.secureContext();
      (useTls ? secure : plain).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });
  if (config.get().dashboard.https) await dashtls.ensureCert().catch((err) => console.error('[dashboard] HTTPS:', err.message));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const url = `${config.get().dashboard.https ? 'https' : 'http'}://${lanAddress()}:${port}`;
  const line = '─'.repeat(52);
  console.log(`\n  ${line}\n   AutoNode ${config.pkg.version}${config.DEV ? '  (dev mode)' : ''}  ·  made by Akulav\n  ${line}`);
  console.log(`   Dashboard   ${url}`);
  console.log(`   Websites    http :${proxy.status.http ?? '✖ ' + proxy.status.httpError}   https :${proxy.status.https ?? '✖ ' + proxy.status.httpsError}`);
  console.log(`   Processes   ${runnerKind()}`);
  if (!auth.isSetUp()) console.log(`\n   First time? Open the dashboard and use setup code:  ${config.get().auth.setupCode}`);
  console.log(`  ${line}\n`);

  const shutdown = async () => {
    server.close();
    visitors.flush();
    await proxy.stop();
    await stopAllChildren();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
