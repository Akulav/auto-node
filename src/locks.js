/**
 * Locked files: paths in a website that GitHub updates must never modify or delete.
 *
 * A lock is one of:
 *   db.sqlite          an exact file (or, if it's a folder, everything inside it)
 *   data/              a folder and everything inside it
 *   *.sqlite           a pattern; without a "/" it matches at any depth
 *   storage/**.json    a pattern with "/" matches from the site root ("**" crosses folders)
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { getSite, siteDir } from './sites.js';
import { HttpError } from './util.js';

const MAX_LOCKS = 200;
const SKIP_DIRS = new Set(['node_modules', '.git']);

export function normalizeLock(input) {
  let p = String(input ?? '').trim().replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/{2,}/g, '/');
  if (!p || p === '/' || p.length > 300) throw new HttpError(400, 'Enter a file, folder or pattern, like db.sqlite, data/ or *.sqlite.');
  if (p.split('/').some((seg) => seg === '..')) throw new HttpError(400, 'Locks must stay inside the website folder.');
  if (/^(node_modules|\.git)(\/|$)/.test(p)) throw new HttpError(400, 'node_modules and .git are managed by AutoNode and cannot be locked.');
  return p;
}

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++; // "**/" also matches zero folders
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

/** Build a function that tells whether a site-relative path ("a/b.txt") is locked. */
export function matcher(locks = []) {
  const tests = locks.map((lock) => {
    if (lock.endsWith('/')) {
      const dir = lock.slice(0, -1);
      return (p) => p === dir || p.startsWith(lock);
    }
    if (/[*?]/.test(lock)) {
      const anyDepth = !lock.includes('/');
      const re = new RegExp(`^${anyDepth ? '(?:.*/)?' : ''}${globToRegex(lock)}(?:/.*)?$`);
      return (p) => re.test(p);
    }
    return (p) => p === lock || p.startsWith(lock + '/');
  });
  return (p) => tests.some((t) => t(p));
}

export const isLocked = (locks, rel) => matcher(locks)(String(rel).replace(/^\/+/, ''));

/** Every existing file in the site that a lock covers (skips node_modules and .git). */
export function lockedFiles(name, locks) {
  if (!locks?.length) return [];
  const match = matcher(locks);
  const root = siteDir(name);
  const out = [];
  const stack = [''];
  let seen = 0;
  while (stack.length && seen < 200_000) {
    const rel = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      seen++;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(p);
      } else if (e.isFile() && match(p)) out.push(p);
    }
  }
  return out.sort();
}

export function getLocks(name) {
  return getSite(name).locks || [];
}

export function setLocks(name, list) {
  getSite(name);
  const locks = [...new Set((list || []).map(normalizeLock))].sort();
  if (locks.length > MAX_LOCKS) throw new HttpError(400, `You can lock up to ${MAX_LOCKS} items.`);
  config.update((c) => {
    c.sites[name].locks = locks;
  });
  return locks;
}

export const addLocks = (name, items) => setLocks(name, [...getLocks(name), ...[].concat(items)]);
export const removeLock = (name, item) => setLocks(name, getLocks(name).filter((l) => l !== normalizeLock(item)));
