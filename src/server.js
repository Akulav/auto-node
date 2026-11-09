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
import crypto from 'node:crypto';
import { runner, runnerKind, restoreChildren, stopAllChildren } from './runner.js';
import { HttpError, readJson, readBody, sendJson, normalizeHostname } from './util.js';

const PUBLIC = path.join(config.APP_ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/* ------------------------------------------------------------------ router */

const routes = [];
const on = (method, pattern, handler, { open = false } = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, handler, open });
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
  const code = String(body.code || '').trim().toUpperCase();
  if (!config.DEV && code !== config.get().auth.setupCode) throw new HttpError(403, 'That setup code is not right. Run "sudo autonode setup-code" on the server to see it.');
  await auth.setPassword(body.password);
  res.setHeader('Set-Cookie', auth.createSessionCookie(false));
  return { ok: true };
}, { open: true });

on('POST', '/api/login', async (req, res, p, body) => {
  if (!(await auth.verifyPassword(body.password, req.socket.remoteAddress))) throw new HttpError(401, 'Wrong password.');
  res.setHeader('Set-Cookie', auth.createSessionCookie(false));
  return { ok: true };
}, { open: true });

on('POST', '/api/logout', async (req, res) => {
  res.setHeader('Set-Cookie', auth.clearSessionCookie());
  return { ok: true };
}, { open: true });

on('POST', '/api/password', async (req, res, p, body) => {
  if (!(await auth.verifyPassword(body.current, req.socket.remoteAddress))) throw new HttpError(401, 'Your current password is wrong.');
  await auth.setPassword(body.next);
  res.setHeader('Set-Cookie', auth.createSessionCookie(false));
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
  return { ...withStatus, size, deploy: deploy.jobStatus(s.name), lanUrl: `http://${lanAddress()}:${s.port}`, certs: Object.fromEntries(s.hostnames.map((h) => [h, certs.hasCertFor(h)])) };
});

on('PATCH', '/api/sites/:name', async (req, res, p, body) => sites.updateSite(p.name, body));

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

on('GET', '/api/sites/:name/files', async (req, res, p) => {
  const { rel } = files.resolveInSite(p.name, q(req).get('path') || '/');
  return { path: rel, entries: files.list(p.name, rel) };
});
on('GET', '/api/sites/:name/file', async (req, res, p) => {
  const rel = q(req).get('path');
  if (q(req).get('download')) {
    const { stream, size, filename } = files.downloadStream(p.name, rel);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"` });
    stream.pipe(res);
    return undefined;
  }
  return files.readText(p.name, rel);
});
on('PUT', '/api/sites/:name/file', async (req, res, p) => {
  const body = await readBody(req, 5 * 1024 * 1024);
  await files.writeText(p.name, q(req).get('path'), body);
  return { ok: true };
}, { raw: true });
on('PUT', '/api/sites/:name/upload', async (req, res, p) => (await files.upload(p.name, q(req).get('path'), req), { ok: true }), { raw: true });
// Chunked, resumable uploads (used for website files and backups).
on('GET', '/api/chunk', async (req) => uploads.received(q(req).get('id')));
on('PUT', '/api/chunk', async (req) => uploads.writeChunk(q(req).get('id'), q(req).get('offset'), q(req).get('total'), req));
on('DELETE', '/api/chunk', async (req) => (uploads.discard(q(req).get('id')), { ok: true }));
on('POST', '/api/sites/:name/upload-complete', async (req, res, p, body) => {
  sites.getSite(p.name);
  const tmp = uploads.take(body.id, body.total);
  try {
    await files.placeUpload(p.name, body.path, tmp);
  } catch (err) {
    uploads.discard(body.id);
    throw err;
  }
  return { ok: true };
});
on('POST', '/api/sites/:name/mkdir', async (req, res, p, body) => (await files.mkdir(p.name, body.path), { ok: true }));
on('POST', '/api/sites/:name/rename', async (req, res, p, body) => (files.rename(p.name, body.from, body.to), { ok: true }));
on('POST', '/api/sites/:name/unzip', async (req, res, p, body) => (await files.unzip(p.name, body.path), { ok: true }));
on('DELETE', '/api/sites/:name/files', async (req, res, p) => (files.remove(p.name, q(req).get('path')), { ok: true }));

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
  };
});
on('PUT', '/api/sites/:name/git', async (req, res, p, body) => {
  const g = await deploy.connectRepo(p.name, body);
  return { ok: true, branch: g.branch };
});
on('DELETE', '/api/sites/:name/git', async (req, res, p) => (deploy.disconnectRepo(p.name), { ok: true }));
on('POST', '/api/sites/:name/git/check', async (req, res, p) => deploy.checkForUpdates(p.name));
on('POST', '/api/sites/:name/git/rotate', async (req, res, p) => (deploy.rotateSecret(p.name), { ok: true }));
on('POST', '/api/sites/:name/deploy', async (req, res, p) => deploy.deploy(p.name, { reason: 'manual' }));
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
  return { selfUpdateAuto: c.selfUpdate.auto, lastCheck: c.selfUpdate.lastCheck, redirectHttps: c.proxy.redirectHttps, dashboardPort: c.dashboard.port, proxy: proxy.status, version: config.pkg.version, gitInstall: selfupdate.isGitInstall(), runner: runnerKind(), node: process.version, paths: config.paths };
});
on('PATCH', '/api/settings', async (req, res, p, body) => {
  config.update((c) => {
    if (body.selfUpdateAuto != null) c.selfUpdate.auto = !!body.selfUpdateAuto;
    if (body.redirectHttps != null) c.proxy.redirectHttps = !!body.redirectHttps;
  });
  return { ok: true };
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
});
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

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 400, { error: 'bad path' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=300' });
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

  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/.autonode/deploy/')) return deploy.handleHook(req, res);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

  // CSRF: mutating requests must come from this page.
  if (req.method !== 'GET' && req.headers.origin) {
    const origin = req.headers.origin.replace(/^https?:\/\//, '');
    if (origin !== req.headers.host) return sendJson(res, 403, { error: 'Cross-site request blocked.' });
  }

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      if (!r.open && !auth.isAuthenticated(req)) throw new HttpError(401, 'Please sign in.');
      const isRaw = req.method === 'PUT' && /\/(upload|file|chunk)$/.test(url.pathname); // streamed bodies (files, backups)
      const body = req.method === 'GET' || req.method === 'DELETE' || isRaw ? {} : await readJson(req, 2 * 1024 * 1024);
      const out = await r.handler(req, res, params, body);
      if (out !== undefined && !res.headersSent) sendJson(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(`[api] ${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) sendJson(res, status, { error: err.message || 'Something went wrong' });
      else res.end();
    }
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

  const { port, host } = config.get().dashboard;
  const server = http.createServer(handler);
  server.requestTimeout = 0; // uploads & SSE
  server.headersTimeout = 60_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const url = `http://${lanAddress()}:${port}`;
  const line = '─'.repeat(52);
  console.log(`\n  ${line}\n   AutoNode ${config.pkg.version}${config.DEV ? '  (dev mode)' : ''}  ·  made by Akulav\n  ${line}`);
  console.log(`   Dashboard   ${url}`);
  console.log(`   Websites    http :${proxy.status.http ?? '✖ ' + proxy.status.httpError}   https :${proxy.status.https ?? '✖ ' + proxy.status.httpsError}`);
  console.log(`   Processes   ${runnerKind()}`);
  if (!auth.isSetUp()) console.log(`\n   First time? Open the dashboard and use setup code:  ${config.get().auth.setupCode}`);
  console.log(`  ${line}\n`);

  const shutdown = async () => {
    server.close();
    await proxy.stop();
    await stopAllChildren();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
