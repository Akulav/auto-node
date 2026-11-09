/**
 * Per-website traffic rules applied by the public proxy:
 *   • www handling      site.www = 'off' | 'to-apex' (www.x → x) | 'to-www' (x → www.x)
 *   • redirects         site.redirects = [{ from: '/old' | '/blog/*', to: '/new' | 'https://…', code: 301 }]
 *   • maintenance mode  site.maintenance = { enabled, message }
 *   • password          site.access = { enabled, username, salt, hash }  (HTTP Basic auth over HTTPS)
 */
import crypto from 'node:crypto';
import { allSites } from './sites.js';
import { HttpError } from './util.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "akulav.com" is an apex (gets a www twin); "blog.akulav.com" is not. */
export const isApex = (host) => host.split('.').length === 2;

/** Every hostname the proxy answers for this site, including its www twin. */
export function publicHostnames(site) {
  const out = new Set(site.hostnames || []);
  if (site.www === 'to-apex' || site.www === 'to-www') for (const h of site.hostnames || []) if (isApex(h)) out.add(`www.${h}`);
  return [...out];
}

/** Which site answers a hostname, or which hostname to redirect to. */
export function resolveHost(host) {
  const sites = allSites();
  const exact = sites.find((s) => s.hostnames.includes(host));
  if (exact) {
    if (exact.www === 'to-www' && isApex(host) && !exact.hostnames.includes(`www.${host}`)) return { site: exact, redirectHost: `www.${host}` };
    return { site: exact };
  }
  if (host.startsWith('www.')) {
    const base = host.slice(4);
    const s = sites.find((x) => x.hostnames.includes(base));
    if (s?.www === 'to-apex' && isApex(base)) return { site: s, redirectHost: base };
    if (s?.www === 'to-www' && isApex(base)) return { site: s };
  }
  return null;
}

/* ---------------------------------------------------------------- redirects */

export function matchRedirect(site, pathname, search = '') {
  for (const r of site.redirects || []) {
    let to = null;
    if (r.from.endsWith('*')) {
      const prefix = r.from.slice(0, -1);
      if (pathname.startsWith(prefix)) to = r.to.endsWith('*') ? r.to.slice(0, -1) + pathname.slice(prefix.length) : r.to;
    } else if (pathname === r.from || pathname === r.from + '/') to = r.to;
    if (to != null) return { location: to.includes('?') || !search ? to : to + search, code: r.code || 301 };
  }
  return null;
}

/* -------------------------------------------------------------- maintenance */

export function maintenancePage(site) {
  const title = esc(site.title || site.name);
  const msg = esc(site.maintenance?.message || "We're making some improvements and will be back shortly.");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — back soon</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:#f5f5f7;color:#1d1d1f;text-align:center;padding:24px}
@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}}h1{font-size:40px;letter-spacing:-.02em;margin:0 0 10px}p{color:#86868b;margin:0 auto;max-width:520px}.dot{width:12px;height:12px;border-radius:50%;background:#ff9f0a;margin:0 auto 22px;animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}</style>
<main><div class="dot"></div><h1>Back soon</h1><p>${msg}</p></main>`;
}

/* ----------------------------------------------------------------- password */

const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const okCache = new Map(); // sha256(site + header) -> expiry
const failures = new Map(); // ip -> { count, until }

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: (await scrypt(password, salt)).toString('hex') };
}

/** true = let through; false = ask for the password; 'locked' = too many tries from this visitor. */
export async function checkAccess(site, authHeader, ip) {
  const a = site.access;
  if (!a?.enabled) return true;
  const f = failures.get(ip);
  if (f && f.until > Date.now()) return 'locked';
  const m = /^Basic\s+(.+)$/i.exec(String(authHeader || ''));
  if (!m) return false;
  const key = crypto.createHash('sha256').update(`${site.name}\0${a.hash}\0${m[1]}`).digest('hex');
  if ((okCache.get(key) || 0) > Date.now()) return true;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  const user = i < 0 ? decoded : decoded.slice(0, i);
  const pass = i < 0 ? '' : decoded.slice(i + 1);
  const got = await scrypt(pass, a.salt);
  const want = Buffer.from(a.hash, 'hex');
  const ok = user === a.username && got.length === want.length && crypto.timingSafeEqual(got, want);
  if (ok) {
    failures.delete(ip);
    if (okCache.size > 5000) okCache.clear();
    okCache.set(key, Date.now() + 10 * 60_000);
    return true;
  }
  if (failures.size > 10_000) failures.clear();
  const count = (f?.count || 0) + 1;
  failures.set(ip, { count, until: count >= 10 ? Date.now() + 5 * 60_000 : 0 });
  return false;
}

/* ------------------------------------------------------------- validation */

const CODES = new Set([301, 302, 307, 308]);

/** Validate a settings change from the dashboard; returns the fields to store on the site. */
export async function normalize(patch, current) {
  const out = {};
  if (patch.www !== undefined) {
    if (!['off', 'to-apex', 'to-www'].includes(patch.www)) throw new HttpError(400, 'Choose how www should work.');
    out.www = patch.www;
  }
  if (patch.redirects !== undefined) {
    if (!Array.isArray(patch.redirects) || patch.redirects.length > 100) throw new HttpError(400, 'Up to 100 redirects.');
    out.redirects = patch.redirects.map((r) => {
      const from = String(r.from || '').trim();
      const to = String(r.to || '').trim();
      const code = Number(r.code || 301);
      if (!from.startsWith('/') || /\s/.test(from) || from.length > 500) throw new HttpError(400, `"${from}" must be a path starting with /, like /old-page or /blog/*.`);
      if (from.slice(0, -1).includes('*')) throw new HttpError(400, `Only a single * at the end is supported ("${from}").`);
      if (!(to.startsWith('/') || /^https?:\/\/[^\s/]+/i.test(to)) || /\s/.test(to) || to.length > 1000) throw new HttpError(400, `"${to}" must be a path like /new-page or a full address like https://example.com.`);
      if (!CODES.has(code)) throw new HttpError(400, 'Use 301 (permanent) or 302 (temporary).');
      return { from, to, code };
    });
  }
  if (patch.maintenance !== undefined) {
    out.maintenance = { enabled: !!patch.maintenance.enabled, message: String(patch.maintenance.message || '').slice(0, 500) };
  }
  if (patch.access !== undefined) {
    const enabled = !!patch.access.enabled;
    const username = String(patch.access.username ?? current.access?.username ?? '').trim();
    const password = patch.access.password;
    if (!enabled) out.access = { ...(current.access || {}), enabled: false };
    else {
      if (!username || username.length > 64 || username.includes(':')) throw new HttpError(400, 'Choose a username (no ":").');
      if (password) {
        if (String(password).length < 6) throw new HttpError(400, 'Use a password of at least 6 characters.');
        out.access = { enabled: true, username, ...(await hashPassword(String(password))) };
      } else if (current.access?.hash) out.access = { ...current.access, enabled: true, username };
      else throw new HttpError(400, 'Choose a password for visitors.');
    }
  }
  return out;
}
