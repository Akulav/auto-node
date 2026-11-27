/**
 * Website icons (favicons) for the dashboard.
 *
 * Looks in the website's files first (favicon.ico, public/, Next.js app/icon.*,
 * whatever index.html links to), then asks the running site for /favicon.ico.
 * The type is decided from the file's bytes, never its name, and nothing outside
 * the site folder (or through a symlink) is ever read.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSite, siteDir } from './sites.js';
import { HttpError } from './util.js';

const MAX_BYTES = 512 * 1024;
const LIVE_TTL = 10 * 60_000;
// A miss (site starting, stopped or crashed) is retried soon instead of hiding the icon for ten minutes.
const LIVE_MISS_TTL = 30_000;

// Folders a site commonly serves its pages from (frontend/ for a server + no-build SPA such as AkulavBox).
const WEB_DIRS = ['', 'public', 'static', 'frontend', 'client', 'web', 'www', 'frontend/public', 'client/public'];
const CANDIDATES = [
  ...WEB_DIRS.flatMap((d) => ['favicon.ico', 'favicon.svg', 'favicon.png', 'icon.svg', 'icon.png', 'apple-touch-icon.png'].map((f) => (d ? `${d}/${f}` : f))),
  'app/favicon.ico', 'src/app/favicon.ico', 'app/icon.svg', 'app/icon.png', 'src/app/icon.svg', 'src/app/icon.png', 'app/apple-icon.png',
  'dist/favicon.ico', 'dist/favicon.svg', 'dist/favicon.png', 'build/favicon.ico', 'build/favicon.png', 'out/favicon.ico',
  'public/images/favicon.ico', 'public/img/favicon.ico', 'assets/favicon.ico', 'src/assets/favicon.ico', 'src/favicon.ico',
];
const HTML_PAGES = [...WEB_DIRS.map((d) => (d ? `${d}/index.html` : 'index.html')), 'src/index.html', 'dist/index.html', 'build/index.html'];
const ICON_FILES = ['favicon.ico', 'favicon.svg', 'favicon.png', 'icon.svg', 'icon.png'];
// Monorepos keep the web page one folder down, e.g. master/public/ (FleetView) or apps/web/.
const NESTED_WEB_DIRS = ['public', 'static', 'frontend', 'web', 'www'];
const SKIP_DIRS = new Set(['node_modules', 'target', 'vendor', 'tmp', 'logs', 'coverage']);
const MAX_SUBDIRS = 40;

/** Web folders one level down (sub/public, sub/web, ...) that really exist, without following symlinks. */
function nestedWebDirs(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const subs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && !WEB_DIRS.includes(e.name))
    .map((e) => e.name)
    .sort()
    .slice(0, MAX_SUBDIRS);
  const out = [];
  for (const sub of subs) {
    for (const d of NESTED_WEB_DIRS) {
      try {
        if (fs.lstatSync(path.join(root, sub, d)).isDirectory()) out.push(`${sub}/${d}`);
      } catch {}
    }
  }
  return out;
}

/** Local icon paths that <link rel="icon"> tags in a page point to, as written (e.g. "/favicon.png"). */
export function iconHrefs(html) {
  const out = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/\brel\s*=\s*["']?[^"'>]*\bicon\b/i.test(tag)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || /^(?:[a-z]+:)?\/\//i.test(href) || /^[a-z]+:/i.test(href)) continue; // only local files
    const clean = href.split(/[?#]/)[0];
    if (clean) out.push(clean);
  }
  return out;
}

/** Identify an image by its first bytes. Returns a content type or null. */
export function sniff(buf) {
  if (!buf?.length) return null;
  const b = buf;
  if (b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) return 'image/x-icon';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const head = b.toString('utf8', 0, Math.min(b.length, 1024)).replace(/^﻿/, '').trimStart().toLowerCase();
  if ((head.startsWith('<svg') || head.startsWith('<?xml')) && head.includes('<svg')) return 'image/svg+xml';
  return null;
}

/** A regular file inside root, reached without any symlink, small enough to be an icon. */
function readPlain(root, rel) {
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null;
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    let st;
    try {
      st = fs.lstatSync(cur);
    } catch {
      return null;
    }
    if (st.isSymbolicLink()) return null;
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile() || st.size === 0 || st.size > MAX_BYTES) return null;
  }
  try {
    return { path: cur, data: fs.readFileSync(cur) };
  } catch {
    return null;
  }
}

/** Icon paths an index.html links to, e.g. <link rel="icon" href="/favicon.svg">. */
function linkedIcons(root, pages) {
  const out = [];
  for (const page of pages) {
    const html = readPlain(root, page)?.data?.toString('utf8');
    if (!html) continue;
    for (const clean of iconHrefs(html)) {
      const base = path.posix.dirname(page);
      out.push(path.posix.normalize(clean.startsWith('/') ? `${base}/${clean.slice(1)}` : `${base}/${clean}`).replace(/^\.\//, ''));
      if (clean.startsWith('/')) out.push(`public/${clean.slice(1)}`); // frameworks serve "/" from public/
    }
  }
  return out;
}

/** Find an icon in the website's files. */
export function findOnDisk(name) {
  const root = siteDir(name);
  const nested = nestedWebDirs(root);
  const pages = [...HTML_PAGES, ...nested.map((d) => `${d}/index.html`)];
  const nestedFiles = nested.flatMap((d) => ICON_FILES.map((f) => `${d}/${f}`));
  for (const rel of [...linkedIcons(root, pages), ...CANDIDATES, ...nestedFiles]) {
    const f = readPlain(root, rel);
    const type = f && sniff(f.data);
    if (type) return { type, data: f.data, source: rel };
  }
  return null;
}

const live = new Map(); // name -> { at, icon|null }

/** GET a path from the running website on 127.0.0.1 (short timeout, size-capped). Returns the body or null. */
async function getLocal(port, urlPath) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, { redirect: 'manual', signal: AbortSignal.timeout(1500) });
    if (!res.ok || Number(res.headers.get('content-length') || 0) > MAX_BYTES || !res.body) return null;
    const chunks = [];
    let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > MAX_BYTES) return null;
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/** Ask the running website for /favicon.ico, then for whatever icon its home page links to (images only). */
async function fetchLive(site) {
  const cached = live.get(site.name);
  if (cached && Date.now() - cached.at < (cached.icon ? LIVE_TTL : LIVE_MISS_TTL)) return cached.icon;
  let icon = null;
  const paths = ['/favicon.ico'];
  for (let i = 0; i < paths.length && !icon && i < 4; i++) {
    const data = await getLocal(site.port, paths[i]);
    const type = data && sniff(data);
    if (type) icon = { type, data, source: 'live' };
    else if (i === 0) {
      const html = (await getLocal(site.port, '/'))?.toString('utf8');
      if (html) for (const href of iconHrefs(html)) paths.push(path.posix.normalize(`/${href.replace(/^\/+/, '')}`));
    }
  }
  live.set(site.name, { at: Date.now(), icon });
  return icon;
}

export async function getIcon(name) {
  const site = getSite(name);
  const icon = findOnDisk(site.name) || (await fetchLive(site));
  if (!icon) throw new HttpError(404, 'No icon');
  return { ...icon, etag: `"${crypto.createHash('sha1').update(icon.data).digest('base64url')}"` };
}

export function forget(name) {
  live.delete(name);
}
