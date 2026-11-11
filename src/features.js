/**
 * Dashboard API for: snapshots & rollback, deploy history, health checks,
 * traffic rules (www, redirects, maintenance, password), visitor stats,
 * scheduled tasks, disk usage, activity log. (Settings-page routes live in settings.js.)
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import * as sites from './sites.js';
import * as snapshots from './snapshots.js';
import * as rescued from './rescued.js';
import * as history from './history.js';
import * as health from './health.js';
import * as traffic from './traffic.js';
import * as visitors from './visitors.js';
import * as tasks from './tasks.js';
import * as activity from './activity.js';
import * as deploy from './deploy.js';
import * as cf from './cloudflare.js';
import { folderSize } from './files.js';
import { HttpError } from './util.js';

/* ------------------------------------------------------------ disk usage */

const usageCache = new Map(); // name -> { at, value }

function realDirSize(p) {
  try {
    return fs.lstatSync(p).isDirectory() ? folderSize(p) : 0; // a symlink is never followed
  } catch {
    return 0;
  }
}

export function usage(name, { fresh = false } = {}) {
  sites.getSite(name);
  const c = usageCache.get(name);
  if (!fresh && c && Date.now() - c.at < 60_000) return c.value;
  const dir = sites.siteDir(name);
  const total = realDirSize(dir);
  const nodeModules = realDirSize(path.join(dir, 'node_modules'));
  const git = realDirSize(path.join(dir, '.git'));
  let snaps = 0;
  for (const s of snapshots.list(name)) snaps += s.size || 0;
  const value = { code: Math.max(0, total - nodeModules - git), nodeModules, git, data: realDirSize(sites.siteDataDir(name)), snapshots: snaps };
  value.total = value.code + value.nodeModules + value.git + value.data + value.snapshots;
  usageCache.set(name, { at: Date.now(), value });
  return value;
}

/* --------------------------------------------------------------- routes */

export function register(on, { q }) {
  const site = (p) => sites.getSite(p.name);

  // Snapshots & rollback
  on('GET', '/api/sites/:name/snapshots', async (req, res, p) => ({ snapshots: snapshots.list(site(p).name), keep: config.get().snapshots.keep }));
  on('POST', '/api/sites/:name/snapshots', async (req, res, p) => {
    const s = await snapshots.create(site(p).name, { reason: 'manual' });
    if (!s) throw new HttpError(400, 'This website folder is empty, so there is nothing to snapshot.');
    return s;
  });
  on('POST', '/api/sites/:name/snapshots/:id/restore', async (req, res, p) => {
    const s = site(p);
    if (deploy.jobStatus(s.name).running) throw new HttpError(409, 'Wait for the current deploy to finish first.');
    const r = await snapshots.restore(s.name, p.id);
    const wasAuto = !!s.git?.autoUpdate;
    if (wasAuto)
      config.update((c) => {
        c.sites[s.name].git.autoUpdate = false; // otherwise the next check would deploy the newer version again
      });
    deploy.deploy(s.name, { reason: `restored snapshot ${p.id}`, pull: false, by: 'you' });
    return { ...r, autoUpdatePaused: wasAuto };
  });
  on('DELETE', '/api/sites/:name/snapshots/:id', async (req, res, p) => (snapshots.remove(site(p).name, p.id), { ok: true }));
  on('PATCH', '/api/snapshots', async (req, res, p, body) => {
    const keep = Number(body.keep);
    if (!Number.isInteger(keep) || keep < 1 || keep > 50) throw new HttpError(400, 'Keep between 1 and 50 snapshots per website.');
    config.update((c) => (c.snapshots.keep = keep));
    return { keep };
  });

  // Rescued files (copies saved before an update kept or replaced website files)
  on('GET', '/api/sites/:name/rescued', async (req, res, p) => ({ rescued: rescued.list(site(p).name) }));
  on('GET', '/api/sites/:name/rescued/:id/file', async (req, res, p) => {
    const { stream, size, filename } = rescued.downloadStream(site(p).name, p.id, q(req).get('path'));
    const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size, 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}` });
    stream.pipe(res);
    return undefined;
  });
  on('DELETE', '/api/sites/:name/rescued/:id', async (req, res, p) => (rescued.remove(site(p).name, p.id), { ok: true }));
  on('DELETE', '/api/sites/:name/rescued', async (req, res, p) => ({ removed: rescued.removeAll(site(p).name) }));

  // Deploy history
  on('GET', '/api/sites/:name/history', async (req, res, p) => ({ history: history.list(site(p).name) }));
  on('GET', '/api/sites/:name/history/:id/log', async (req, res, p) => ({ log: history.log(site(p).name, p.id) }));

  // Health
  on('GET', '/api/sites/:name/health', async (req, res, p) => ({ settings: { ...health.DEFAULTS, ...(site(p).health || {}) }, status: health.statusOf(p.name) }));
  on('POST', '/api/sites/:name/health/test', async (req, res, p, body) => {
    const s = site(p);
    const h = health.normalize({ ...(s.health || {}), ...body });
    return health.probe(s.port, h.path);
  });

  // Traffic: www, redirects, maintenance, password
  on('GET', '/api/sites/:name/traffic', async (req, res, p) => {
    const s = site(p);
    return {
      www: s.www || 'off',
      redirects: s.redirects || [],
      maintenance: s.maintenance || { enabled: false, message: '' },
      access: { enabled: !!s.access?.enabled, username: s.access?.username || '', hasPassword: !!s.access?.hash },
      apexHostnames: s.hostnames.filter(traffic.isApex),
    };
  });
  on('PATCH', '/api/sites/:name/traffic', async (req, res, p, body) => {
    const s = site(p);
    const changes = await traffic.normalize(body, s);
    config.update((c) => Object.assign(c.sites[s.name], changes));
    let dns = null;
    // Turning www on: make sure the www twin has a DNS record too.
    if (changes.www && changes.www !== 'off' && config.get().cloudflare.apiToken) {
      dns = [];
      const ip = await cf.publicIp().catch(() => null);
      for (const h of traffic.publicHostnames(sites.getSite(s.name)).filter((h) => !s.hostnames.includes(h))) {
        dns.push(await cf.ensureRecord(h, ip).catch((err) => ({ hostname: h, action: 'error', error: err.message })));
      }
    }
    return { ok: true, dns };
  });

  // Visitors
  on('GET', '/api/sites/:name/visitors', async (req, res, p) => visitors.summary(site(p).name, Number(q(req).get('days')) || 14));

  // Scheduled tasks
  on('GET', '/api/sites/:name/tasks', async (req, res, p) => ({ tasks: tasks.list(site(p).name) }));
  on('POST', '/api/sites/:name/tasks', async (req, res, p, body) => tasks.create(site(p).name, body));
  on('PATCH', '/api/sites/:name/tasks/:id', async (req, res, p, body) => tasks.update(site(p).name, p.id, body));
  on('DELETE', '/api/sites/:name/tasks/:id', async (req, res, p) => (tasks.remove(site(p).name, p.id), { ok: true }));
  on('POST', '/api/sites/:name/tasks/:id/run', async (req, res, p) => tasks.run(site(p).name, p.id, 'you'));
  on('GET', '/api/sites/:name/tasks/:id/log', async (req, res, p) => tasks.log(site(p).name, p.id));
  on('POST', '/api/cron/preview', async (req, res, p, body) => {
    const next = [];
    let from = new Date();
    for (let i = 0; i < 3; i++) {
      const n = tasks.nextRun(body.schedule, from);
      if (!n) break;
      next.push(n.toISOString());
      from = n;
    }
    return { next };
  });

  // Disk usage & cleanup
  on('GET', '/api/sites/:name/usage', async (req, res, p) => usage(site(p).name, { fresh: q(req).get('fresh') === '1' }));
  on('POST', '/api/sites/:name/clean', async (req, res, p, body) => {
    const s = site(p);
    if (deploy.jobStatus(s.name).running) throw new HttpError(409, 'Wait for the current deploy to finish first.');
    const nm = path.join(sites.siteDir(s.name), 'node_modules');
    const before = realDirSize(nm);
    fs.rmSync(nm, { recursive: true, force: true }); // rm never follows symlinks
    usageCache.delete(s.name);
    if (body.reinstall) deploy.deploy(s.name, { reason: 'clean reinstall', pull: false, by: 'you' });
    return { freed: before, reinstalling: !!body.reinstall };
  });

  // Activity log
  on('GET', '/api/activity', async (req) => ({ entries: activity.list({ limit: Math.min(500, Number(q(req).get('limit')) || 200), site: q(req).get('site') || null, before: q(req).get('before') || null }), keepDays: activity.KEEP_DAYS }));
  on('POST', '/api/activity/prune', async (req, res, p, body) => {
    if (body.before == null || Date.parse(body.before) > Date.now() + 60_000) throw new HttpError(400, 'Choose a date that is not in the future.');
    return { removed: activity.prune(String(body.before)) };
  });
}

/** Drop everything cached in memory for a website that was deleted. */
export function forgetSite(name) {
  usageCache.delete(name);
}
