/**
 * Leftover files: what stays behind when AutoNode is stopped in the middle of a
 * backup, snapshot, restore or upload (a restart, a crash, a power cut).
 *
 *   backups    backups/*.part                    half-written backups
 *   snapshots  snapshots/<site>/*.part           half-written snapshots
 *   orphans    snapshots/<site>/<id>.tar.gz or <id>.json without its other half
 *   uploads    tmp/uploads/*                     uploads abandoned for a day
 *   temp       tmp/* (everything else)           working copies of backups and restores
 *
 * Anything changed recently is left alone: it may belong to something still running.
 * All of these folders are root-only, so nothing here is reachable by a website.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { folderSize } from './files.js';

const HOUR = 3600_000;
const UPLOAD_AGE = 24 * HOUR; // interrupted uploads can be resumed for a day
const GROUPS = ['backups', 'snapshots', 'orphans', 'uploads', 'temp'];

function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function find(now = Date.now()) {
  const out = [];
  const add = (group, p, minAge = HOUR) => {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (now - st.mtimeMs < minAge) return;
    out.push({ group, path: p, size: st.isDirectory() ? folderSize(p) : st.size });
  };
  const P = config.paths;
  for (const e of entries(P.backupsDir)) if (e.name.endsWith('.part')) add('backups', path.join(P.backupsDir, e.name));
  for (const site of entries(P.snapshotsDir)) {
    if (!site.isDirectory()) continue;
    const dir = path.join(P.snapshotsDir, site.name);
    const names = new Set(entries(dir).map((e) => e.name));
    for (const n of names) {
      if (n.endsWith('.part')) add('snapshots', path.join(dir, n));
      else if (n.endsWith('.tar.gz') && !names.has(n.slice(0, -'.tar.gz'.length) + '.json')) add('orphans', path.join(dir, n));
      else if (n.endsWith('.json') && !names.has(n.slice(0, -'.json'.length) + '.tar.gz')) add('orphans', path.join(dir, n));
    }
  }
  for (const e of entries(P.tmpDir)) {
    const p = path.join(P.tmpDir, e.name);
    if (e.name === 'uploads' && e.isDirectory()) for (const u of entries(p)) add('uploads', path.join(p, u.name), UPLOAD_AGE);
    else add('temp', p);
  }
  return out;
}

/** What could be removed, grouped, plus how much space the kept copies use. */
export function scan(now) {
  const found = find(now);
  const groups = GROUPS.map((id) => {
    const items = found.filter((f) => f.group === id);
    return { id, count: items.length, size: items.reduce((n, f) => n + f.size, 0) };
  }).filter((g) => g.count);
  const P = config.paths;
  return {
    groups,
    count: found.length,
    size: found.reduce((n, f) => n + f.size, 0),
    usage: { snapshots: folderSize(P.snapshotsDir), backups: folderSize(P.backupsDir), rescued: folderSize(P.rescuedDir) },
  };
}

/** Remove the leftovers. Returns how many items went and how much space came back. */
export function clean(now) {
  let removed = 0;
  let freed = 0;
  const failed = [];
  for (const f of find(now)) {
    try {
      fs.rmSync(f.path, { recursive: true, force: true }); // rm never follows symlinks
      removed++;
      freed += f.size;
    } catch (err) {
      failed.push(`${path.basename(f.path)}: ${err.message}`);
    }
  }
  return { removed, freed, failed };
}
