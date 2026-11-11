/**
 * Rescued files: copies AutoNode saved before a GitHub update kept or replaced
 * files the website changed. Stored root-only in
 * /var/lib/autonode/rescued/<site>/<timestamp>-kept|overwritten/<original path>.
 * Only plain files are ever copied there, and nothing here follows a symlink.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { getSite } from './sites.js';
import { HttpError } from './util.js';

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(kept|overwritten)$/;

const siteRoot = (name) => path.join(config.paths.rescuedDir, getSite(name).name);

/** "2026-11-11T10-20-30-123Z-kept" → { at: ISO date, kind: "kept" } */
function parseId(id) {
  const m = ID.exec(id);
  if (!m) return null;
  const [d, t] = id.slice(0, 24).split('T');
  const [hh, mm, ss, ms] = t.slice(0, -1).split('-');
  return { at: `${d}T${hh}:${mm}:${ss}.${ms}Z`, kind: m[1] };
}

function folderFor(name, id) {
  if (!parseId(String(id))) throw new HttpError(404, 'That saved copy no longer exists.');
  const dir = path.join(siteRoot(name), id);
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    throw new HttpError(404, 'That saved copy no longer exists.');
  }
  if (!st.isDirectory()) throw new HttpError(404, 'That saved copy no longer exists.');
  return dir;
}

/** Plain files inside a rescue folder, as forward-slash paths relative to it. */
function filesIn(dir) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < 5000) {
    const rel = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) stack.push(r);
      else if (e.isFile()) {
        let size = 0;
        try {
          size = fs.lstatSync(path.join(dir, r)).size;
        } catch {}
        out.push({ path: r, size });
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Newest first. */
export function list(name) {
  const root = siteRoot(name);
  let ids = [];
  try {
    ids = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && parseId(e.name)).map((e) => e.name);
  } catch {}
  return ids
    .sort()
    .reverse()
    .map((id) => {
      const files = filesIn(path.join(root, id));
      return { id, ...parseId(id), files, size: files.reduce((n, f) => n + f.size, 0) };
    });
}

export function remove(name, id) {
  fs.rmSync(folderFor(name, id), { recursive: true, force: true });
}

export function removeAll(name) {
  const root = siteRoot(name);
  const n = list(name).length;
  fs.rmSync(root, { recursive: true, force: true });
  return n;
}

/** A read stream for one saved file. */
export function downloadStream(name, id, rel) {
  const dir = folderFor(name, id);
  const clean = path.posix.normalize('/' + String(rel || '').replace(/\\/g, '/')).slice(1);
  const full = path.resolve(dir, clean);
  if (!clean || !full.startsWith(dir + path.sep)) throw new HttpError(400, 'Invalid path');
  // Every folder on the way must be a real folder, not a symlink.
  for (let p = path.dirname(full); p !== dir; p = path.dirname(p)) {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      throw new HttpError(404, 'File not found');
    }
    if (!st.isDirectory()) throw new HttpError(400, 'Invalid path');
  }
  let fd;
  try {
    fd = fs.openSync(full, fs.constants.O_RDONLY | NOFOLLOW);
  } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(404, 'File not found');
    if (err.code === 'ELOOP') throw new HttpError(400, 'Invalid path');
    throw err;
  }
  const st = fs.fstatSync(fd);
  if (!st.isFile()) {
    fs.closeSync(fd);
    throw new HttpError(400, 'That is not a file.');
  }
  return { stream: fs.createReadStream(null, { fd, autoClose: true }), size: st.size, filename: path.basename(full) };
}
