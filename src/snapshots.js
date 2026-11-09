/**
 * Snapshots: a compressed copy of a website's folder (code + .git, without
 * node_modules), taken automatically before every GitHub deploy and on demand.
 * Restoring one puts the files back, keeps locked files as they are now, leaves
 * DATA_DIR alone, then reinstalls, rebuilds and restarts.
 *
 * Stored root-only in /var/lib/autonode/snapshots/<site>/<id>.tar.gz + <id>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import * as config from './config.js';
import { getSite, siteDir, fixOwnership } from './sites.js';
import { siteUser } from './runner.js';
import { lockedFiles } from './locks.js';
import { HttpError, which } from './util.js';

const ID_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-z]{4}$/;
const dirFor = (name) => path.join(config.paths.snapshotsDir, name);

function newId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
}

function checkId(id) {
  if (!ID_RE.test(String(id))) throw new HttpError(400, 'Invalid snapshot.');
  return id;
}

function tar(args, { uid, gid, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { uid, gid, stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    if (stdin) pipeline(stdin, child.stdin).catch(() => {});
    // GNU tar exits 1 for "file changed as we read it": still a usable snapshot.
    child.on('close', (code) => (code <= 1 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `tar exited with ${code}`))));
  });
}

export function list(name) {
  getSite(name);
  let files = [];
  try {
    files = fs.readdirSync(dirFor(name)).filter((f) => f.endsWith('.json'));
  } catch {}
  const out = [];
  for (const f of files) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dirFor(name), f), 'utf8'));
      if (fs.existsSync(path.join(dirFor(name), `${meta.id}.tar.gz`))) out.push(meta);
    } catch {}
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

function prune(name) {
  const keep = Math.max(1, Math.min(50, Number(config.get().snapshots?.keep) || 5));
  for (const s of list(name).slice(keep)) remove(name, s.id);
}

/** Take a snapshot. Returns its metadata (or null if the folder is empty). */
export async function create(name, { reason = 'manual', commit = null } = {}) {
  getSite(name);
  if (!which('tar')) throw new HttpError(500, 'The "tar" program is missing.');
  const src = siteDir(name);
  if (!fs.existsSync(src) || !fs.readdirSync(src).length) return null;
  const dir = dirFor(name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const id = newId();
  const file = path.join(dir, `${id}.tar.gz`);
  // Read as root (tar stores symlinks, it doesn't follow them); written to a root-only folder.
  await tar(['-czf', file + '.part', '--exclude=node_modules', '--exclude=*.autonode-upload', '-C', src, '.']);
  fs.renameSync(file + '.part', file);
  fs.chmodSync(file, 0o600);
  const meta = { id, at: new Date().toISOString(), reason, commit, size: fs.statSync(file).size };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta), { mode: 0o600 });
  prune(name);
  return meta;
}

export function remove(name, id) {
  checkId(id);
  for (const ext of ['.tar.gz', '.json']) fs.rmSync(path.join(dirFor(name), id + ext), { force: true });
}

/**
 * Put a snapshot back. Locked files keep their current version; DATA_DIR is untouched.
 * Returns { restored, safety } — the caller then reinstalls/rebuilds/restarts.
 */
export async function restore(name, id) {
  const site = getSite(name);
  checkId(id);
  const file = path.join(dirFor(name), `${id}.tar.gz`);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That snapshot no longer exists.');
  const { plainFile, copyNoFollow, prepareTarget } = await import('./deploy.js');

  // 1) Safety net: a snapshot of right now, so the restore itself can be undone.
  const safety = await create(name, { reason: `before restoring ${id}` });

  // 2) Set locked files aside (they must survive with their current content).
  const keep = lockedFiles(name, site.locks || []).filter((p) => plainFile(site, p));
  const aside = fs.mkdtempSync(path.join(config.paths.tmpDir, 'restore-'));
  try {
    for (const p of keep) {
      const target = path.join(aside, p);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      copyNoFollow(path.join(siteDir(name), p), target);
    }

    // 3) Empty the website folder (rm never follows symlinks) and extract as the site user.
    const dir = siteDir(name);
    for (const e of fs.readdirSync(dir)) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
    const ids = await siteUser();
    // The snapshot is root-only, so root streams it to a tar that runs as the site user and can only write the site.
    await tar(['-xzf', '-', '-C', dir], { uid: ids?.uid, gid: ids?.gid, stdin: fs.createReadStream(file) });

    // 4) Locked files back.
    for (const p of keep) copyNoFollow(path.join(aside, p), prepareTarget(site, p));
    await fixOwnership(dir);
  } finally {
    fs.rmSync(aside, { recursive: true, force: true });
  }
  return { restored: id, safety: safety?.id || null, keptLocked: keep };
}

export function snapshotFile(name, id) {
  checkId(id);
  const file = path.join(dirFor(name), `${id}.tar.gz`);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That snapshot no longer exists.');
  return file;
}
