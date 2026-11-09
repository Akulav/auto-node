/** Safe file management inside a website folder. */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { siteDir, fixOwnership, getSite } from './sites.js';
import { HttpError, run, which } from './util.js';

const MAX_EDIT = 2 * 1024 * 1024;
const HIDDEN_HEAVY = new Set(['node_modules', '.git']);

/** Resolve a user-supplied path, refusing anything that escapes the site folder. */
export function resolveInSite(name, rel = '/') {
  getSite(name);
  const root = fs.realpathSync(siteDir(name));
  const clean = path.posix.normalize('/' + String(rel).replace(/\\/g, '/'));
  const full = path.resolve(root, '.' + clean); // resolve() drops trailing slashes, so "/" === root
  if (full !== root && !full.startsWith(root + path.sep)) throw new HttpError(400, 'Invalid path');
  // Check the nearest existing ancestor isn't a symlink pointing outside.
  let probe = full;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (real !== root && !real.startsWith(root + path.sep)) throw new HttpError(400, 'Invalid path');
  return { root, full, rel: clean };
}

export function list(name, rel) {
  const { full } = resolveInSite(name, rel);
  let entries;
  try {
    entries = fs.readdirSync(full, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(404, 'Folder not found');
    if (err.code === 'ENOTDIR') throw new HttpError(400, 'Not a folder');
    throw err;
  }
  return entries
    .map((e) => {
      let st = null;
      try {
        st = fs.statSync(path.join(full, e.name));
      } catch {}
      const dir = st ? st.isDirectory() : e.isDirectory();
      return { name: e.name, type: dir ? 'dir' : 'file', size: dir ? null : st?.size ?? 0, mtime: st?.mtime ?? null, heavy: HIDDEN_HEAVY.has(e.name) };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === 'dir' ? -1 : 1));
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export function readText(name, rel) {
  const { full } = resolveInSite(name, rel);
  const st = fs.statSync(full);
  if (st.isDirectory()) throw new HttpError(400, 'That is a folder');
  if (st.size > MAX_EDIT) return { binary: false, tooLarge: true, size: st.size };
  const buf = fs.readFileSync(full);
  if (looksBinary(buf)) return { binary: true, size: st.size };
  return { content: buf.toString('utf8'), size: st.size, mtime: st.mtime };
}

export async function writeText(name, rel, content) {
  const { full } = resolveInSite(name, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  await fixOwnership(full);
}

export async function upload(name, rel, req) {
  const { full, root } = resolveInSite(name, rel);
  if (full === root) throw new HttpError(400, 'Missing file name');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = full + '.autonode-upload';
  try {
    await pipeline(req, fs.createWriteStream(tmp));
    fs.renameSync(tmp, full);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  // Hand the file and any folders we created to the site user (non-recursive, cheap).
  const chain = [];
  for (let p = full; p !== root && p.startsWith(root); p = path.dirname(p)) chain.push(p);
  await chownEach(chain);
}

/** Move a finished chunked upload into the website folder. */
export async function placeUpload(name, rel, tmpFile) {
  const { full, root } = resolveInSite(name, rel);
  if (full === root) throw new HttpError(400, 'Missing file name');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const { moveFile } = await import('./uploads.js');
  moveFile(tmpFile, full);
  const chain = [];
  for (let p = full; p !== root && p.startsWith(root); p = path.dirname(p)) chain.push(p);
  await chownEach(chain);
}

async function chownEach(list) {
  const { siteUser } = await import('./runner.js');
  const ids = await siteUser();
  if (!ids) return;
  for (const p of list) {
    try {
      fs.chownSync(p, ids.uid, ids.gid);
    } catch {}
  }
}

export async function mkdir(name, rel) {
  const { full } = resolveInSite(name, rel);
  fs.mkdirSync(full, { recursive: true });
  await fixOwnership(full);
}

export function remove(name, rel) {
  const { full, root } = resolveInSite(name, rel);
  if (full === root) throw new HttpError(400, "You can't delete the website folder itself.");
  fs.rmSync(full, { recursive: true, force: true });
}

export function rename(name, from, to) {
  const a = resolveInSite(name, from);
  const b = resolveInSite(name, to);
  if (a.full === a.root || b.full === b.root) throw new HttpError(400, 'Invalid path');
  if (fs.existsSync(b.full)) throw new HttpError(409, 'Something with that name already exists.');
  fs.renameSync(a.full, b.full);
}

export async function unzip(name, rel) {
  const { full } = resolveInSite(name, rel);
  if (!which('unzip')) throw new HttpError(500, 'The "unzip" program is missing. Install it with: sudo apt install unzip');
  const dest = path.dirname(full);
  // Extract as the site user, not root, so symlinks inside the archive can't write outside the site.
  const { siteUser } = await import('./runner.js');
  const ids = await siteUser();
  await fixOwnership(dest);
  const r = await run('unzip', ['-o', '-q', full, '-d', dest], { quiet: true, uid: ids?.uid, gid: ids?.gid });
  if (r.code > 1) throw new HttpError(400, `Couldn't unzip: ${r.stderr.trim()}`);
  fs.rmSync(full, { force: true });
  // If the zip contained a single top-level folder with a package.json, flatten it.
  const entries = fs.readdirSync(dest);
  // lstat, not stat: a symlink to another folder (another site, /opt/autonode…) must never be "flattened" by root.
  if (entries.length === 1 && fs.lstatSync(path.join(dest, entries[0])).isDirectory() && fs.existsSync(path.join(dest, entries[0], 'package.json'))) {
    const inner = path.join(dest, entries[0]);
    for (const e of fs.readdirSync(inner)) fs.renameSync(path.join(inner, e), path.join(dest, e));
    fs.rmdirSync(inner);
  }
  await fixOwnership(dest);
}

export function downloadStream(name, rel) {
  const { full } = resolveInSite(name, rel);
  const st = fs.statSync(full);
  if (st.isDirectory()) throw new HttpError(400, 'Folders cannot be downloaded directly.');
  return { stream: fs.createReadStream(full), size: st.size, filename: path.basename(full) };
}

export function folderSize(dir) {
  let total = 0;
  const stack = [dir];
  let count = 0;
  while (stack.length && count < 200_000) {
    const d = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      count++;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {}
      }
    }
  }
  return total;
}
