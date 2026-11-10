import crypto from 'node:crypto';
import * as config from './config.js';
import { HttpError } from './util.js';

const COOKIE = 'autonode_session';
const SESSION_DAYS = 30;
const failures = new Map(); // ip -> { count, until }

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))),
  );
}

export function isSetUp() {
  return !!config.get().auth.hash;
}

export async function setPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Use at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt);
  config.update((c) => {
    c.auth.hash = hash;
    c.auth.salt = salt;
    c.auth.setupCode = null;
    // Rotating the secret signs everyone out.
    c.sessionSecret = crypto.randomBytes(32).toString('hex');
  });
}

/*
 * Guessing protection.
 *  • Per address: 5 wrong tries → 1 minute pause, 10 → 15 minutes, 20+ → 1 hour.
 *    A quiet hour forgets the count.
 *  • Internet as a whole (remote access): 30 wrong tries from outside the home network
 *    within 15 minutes pause *outside* sign-ins for 15 minutes. Home-network sign-ins keep
 *    working, so an attacker spraying from many addresses can't lock the owner out at home.
 */
const FORGET_MS = 60 * 60_000;
const PUBLIC_WINDOW_MS = 15 * 60_000;
const PUBLIC_MAX_FAILURES = 30;
let publicFailures = []; // timestamps
let publicPausedUntil = 0;

const lockFor = (count) => (count >= 20 ? 60 * 60_000 : count >= 10 ? 15 * 60_000 : count >= 5 ? 60_000 : 0);
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60_000));

function checkLockout(ip) {
  const now = Date.now();
  let f = failures.get(ip);
  if (f && now - f.last > FORGET_MS) {
    failures.delete(ip);
    f = undefined;
  }
  if (f && f.until > now) {
    const m = minutes(f.until - now);
    throw new HttpError(429, `Too many wrong passwords. Try again in ${m} minute${m === 1 ? '' : 's'}.`);
  }
  if (!isPrivateAddress(ip) && publicPausedUntil > now) {
    throw new HttpError(429, `Sign-ins from outside your home network are paused for ${minutes(publicPausedUntil - now)} more minutes because of many wrong passwords. You can still sign in at home.`);
  }
  return f;
}

function recordResult(ip, f, ok) {
  if (ok) return failures.delete(ip);
  const now = Date.now();
  if (failures.size > 10_000) failures.clear(); // don't grow forever under a spray of addresses
  const count = (f?.count || 0) + 1;
  failures.set(ip, { count, last: now, until: now + lockFor(count) });
  if (!isPrivateAddress(ip)) {
    publicFailures = publicFailures.filter((t) => now - t < PUBLIC_WINDOW_MS);
    publicFailures.push(now);
    if (publicFailures.length >= PUBLIC_MAX_FAILURES) {
      publicPausedUntil = now + PUBLIC_WINDOW_MS;
      publicFailures = [];
      console.error('[auth] Many wrong passwords from the internet: outside sign-ins paused for 15 minutes.');
    }
  }
}

/** For tests. */
export function resetLockouts() {
  failures.clear();
  publicFailures = [];
  publicPausedUntil = 0;
}

/** Sign out every device: old cookies no longer verify. */
export function revokeAllSessions() {
  config.update((c) => {
    c.sessionSecret = crypto.randomBytes(32).toString('hex');
  });
}

/** First-run setup code, with the same lockout as the password. */
export function checkSetupCode(code, ip) {
  const f = checkLockout(ip);
  const expected = config.get().auth.setupCode;
  const given = String(code || '').trim().toUpperCase();
  const ok = !!expected && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  recordResult(ip, f, ok);
  return ok;
}

export async function verifyPassword(password, ip) {
  const f = checkLockout(ip);
  const { hash, salt } = config.get().auth;
  if (!hash) return false;
  const attempt = await scrypt(String(password || ''), salt);
  const ok = crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(hash, 'hex'));
  recordResult(ip, f, ok);
  return ok;
}

function sign(payload) {
  return crypto.createHmac('sha256', config.get().sessionSecret).update(payload).digest('base64url');
}

export function createSessionCookie(secure) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${exp}.${crypto.randomBytes(8).toString('hex')}`;
  const value = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw; // malformed %-escape from some other cookie
    }
  }
  return out;
}

export function isAuthenticated(req) {
  const v = parseCookies(req.headers.cookie)[COOKIE];
  if (!v) return false;
  const i = v.lastIndexOf('.');
  if (i < 0) return false;
  const payload = v.slice(0, i);
  const sig = v.slice(i + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false; // byte lengths: non-ASCII would make timingSafeEqual throw
  return Number(payload.split('.')[0]) > Date.now();
}

/** Private / LAN / VPN ranges that may reach the dashboard. */
export function isPrivateAddress(addr = '') {
  let a = String(addr || '').replace(/^::ffff:/, '');
  if (a === '::1' || a === '127.0.0.1' || a.startsWith('127.')) return true;
  if (a.includes(':')) {
    a = a.toLowerCase();
    return a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80');
  }
  const [x, y] = a.split('.').map(Number);
  if (x === 10) return true;
  if (x === 192 && y === 168) return true;
  if (x === 172 && y >= 16 && y <= 31) return true;
  if (x === 100 && y >= 64 && y <= 127) return true; // CGNAT / Tailscale
  if (x === 169 && y === 254) return true;
  return false;
}
