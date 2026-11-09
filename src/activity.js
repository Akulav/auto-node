/**
 * Activity log: who did what, when. One JSON object per line in
 * /var/lib/autonode/activity.log (root only), rotated at 5 MB.
 */
import fs from 'node:fs';
import * as config from './config.js';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @param {object} e
 * @param {string} e.action   short sentence, e.g. "Started website"
 * @param {string} [e.site]   website name
 * @param {string} [e.detail] extra info (never secrets)
 * @param {boolean} [e.ok]
 * @param {string} [e.ip]     who, for dashboard actions
 * @param {string} [e.by]     "you" (dashboard), "system", "GitHub", "schedule"…
 */
export function record({ action, site = null, detail = null, ok = true, ip = null, by = 'system' }) {
  const file = config.paths.activityFile;
  const entry = { at: new Date().toISOString(), action, site, detail: detail == null ? null : String(detail).slice(0, 500), ok, ip, by };
  try {
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file + '.1');
    } catch {}
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch (err) {
    console.error('[activity]', err.message);
  }
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Newest first. */
export function list({ limit = 200, site = null, before = null } = {}) {
  const file = config.paths.activityFile;
  const lines = [...readLines(file + '.1'), ...readLines(file)];
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (site && e.site !== site) continue;
    if (before && e.at >= before) continue;
    out.push(e);
  }
  return out;
}

/** Plain-language labels for dashboard actions (method + route pattern). Bodies are never logged except listed fields. */
const LABELS = {
  'POST /api/sites': (p, b) => ['Created website', b.name],
  'PATCH /api/sites/:name': () => ['Changed website settings'],
  'DELETE /api/sites/:name': () => ['Deleted website'],
  'POST /api/sites/:name/start': () => ['Started website'],
  'POST /api/sites/:name/stop': () => ['Stopped website'],
  'POST /api/sites/:name/restart': () => ['Restarted website'],
  'POST /api/sites/:name/rebuild': () => ['Started install & rebuild'],
  'POST /api/sites/:name/hostnames': (p, b) => ['Added domain', b.hostname],
  'DELETE /api/sites/:name/hostnames/:host': (p) => ['Removed domain', p.host],
  'PUT /api/sites/:name/file': () => ['Edited a file'],
  'POST /api/sites/:name/upload-complete': (p, b) => ['Uploaded a file', b.path],
  'POST /api/sites/:name/mkdir': (p, b) => ['Created a folder', b.path],
  'POST /api/sites/:name/rename': (p, b) => ['Renamed', `${b.from} → ${b.to}`],
  'POST /api/sites/:name/unzip': (p, b) => ['Unzipped', b.path],
  'DELETE /api/sites/:name/files': () => ['Deleted files'],
  'PUT /api/sites/:name/git': (p, b) => ['Changed GitHub settings', b.repo],
  'DELETE /api/sites/:name/git': () => ['Disconnected GitHub'],
  'POST /api/sites/:name/git/rotate': () => ['Created a new deploy secret'],
  'POST /api/sites/:name/deploy': (p, b) => ['Started deploy', b.ref ? `commit ${b.ref}` : b.resolve || null],
  'POST /api/sites/:name/locks': (p, b) => ['Locked', b.lock],
  'DELETE /api/sites/:name/locks': () => ['Unlocked a file'],
  'POST /api/sites/:name/snapshots': () => ['Took a snapshot'],
  'POST /api/sites/:name/snapshots/:id/restore': (p) => ['Restored snapshot', p.id],
  'DELETE /api/sites/:name/snapshots/:id': (p) => ['Deleted snapshot', p.id],
  'POST /api/sites/:name/tasks': (p, b) => ['Created task', b.name],
  'PATCH /api/sites/:name/tasks/:id': () => ['Changed task'],
  'DELETE /api/sites/:name/tasks/:id': () => ['Deleted task'],
  'POST /api/sites/:name/tasks/:id/run': () => ['Ran task now'],
  'POST /api/sites/:name/clean': (p, b) => ['Cleaned node_modules', b.reinstall ? 'and reinstalled' : null],
  'PATCH /api/sites/:name/traffic': () => ['Changed redirects / access settings'],
  'POST /api/certs': () => ['Added a certificate'],
  'DELETE /api/certs/:id': (p) => ['Removed a certificate', p.id],
  'POST /api/cloudflare/connect': () => ['Connected Cloudflare'],
  'DELETE /api/cloudflare': () => ['Disconnected Cloudflare'],
  'POST /api/cloudflare/origin-cert': (p, b) => ['Created a Cloudflare certificate', b.domain],
  'POST /api/network': (p, b) => ['Changed network settings', b.mode === 'static' ? `fixed address ${b.address}` : 'automatic'],
  'PATCH /api/settings': () => ['Changed settings'],
  'POST /api/password': () => ['Changed the dashboard password'],
  'POST /api/backup/restore': () => ['Restored a backup'],
  'PATCH /api/backups': () => ['Changed backup schedule'],
  'POST /api/backups/run': () => ['Started a backup'],
  'DELETE /api/backups/:file': (p) => ['Deleted a backup', p.file],
  'POST /api/update': () => ['Updated AutoNode'],
  'POST /api/dashboard-cert/regenerate': () => ['Made a new dashboard certificate'],
};

/** Called by the router after every mutating dashboard request. */
export function fromRequest({ method, pattern, params, body, ok, error, ip }) {
  const label = LABELS[`${method} ${pattern}`];
  if (!label) return;
  let action;
  let detail;
  try {
    [action, detail] = label(params || {}, body || {});
  } catch {
    return;
  }
  record({ action, site: params?.name || (pattern === '/api/sites' ? body?.name : null), detail: ok ? detail : error, ok, ip: ip?.replace(/^::ffff:/, ''), by: 'you' });
}
