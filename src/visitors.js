/**
 * Visitor stats per website, counted by the proxy — no tracking scripts, no cookies.
 *
 * Unique visitors are counted with a salted hash of the IP that changes every
 * day, so no IP address is ever stored. Bots and crawlers are counted separately.
 * Kept: 48 hourly buckets and 90 daily buckets per site, in /var/lib/autonode/visitors.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as config from './config.js';

const DAYS_KEPT = 90;
const HOURS_KEPT = 48;
const MAX_PAGES_PER_DAY = 300;
const MAX_UNIQUE_PER_DAY = 50_000;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|curl|wget|python-requests|go-http-client|axios|node-fetch|httpclient|monitor|uptime|pingdom|headless|lighthouse|scan/i;
const ASSET_RE = /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|json|txt|xml|wasm|zip)$/i;

const sites = new Map(); // name -> data
const dirty = new Set();

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hourKey = (d = new Date()) => `${dayKey(d)}T${pad(d.getHours())}`;
const fileFor = (name) => path.join(config.paths.visitorsDir, `${name}.json`);
const emptyDay = () => ({ requests: 0, visitors: 0, bots: 0, s2: 0, s3: 0, s4: 0, s5: 0, bytes: 0, pages: {} });

function load(name) {
  if (sites.has(name)) return sites.get(name);
  let d = null;
  try {
    d = JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch {}
  d = d && typeof d === 'object' ? d : {};
  d.days ||= {};
  d.hours ||= {};
  if (!d.today || d.today.date !== dayKey()) d.today = { date: dayKey(), salt: crypto.randomBytes(16).toString('hex'), seen: [] };
  d._seen = new Set(d.today.seen);
  sites.set(name, d);
  return d;
}

function rollover(d) {
  const today = dayKey();
  if (d.today.date === today) return;
  d.today = { date: today, salt: crypto.randomBytes(16).toString('hex'), seen: [] };
  d._seen = new Set();
  const days = Object.keys(d.days).sort();
  for (const k of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) delete d.days[k];
}

/** Called by the proxy when a response finishes. */
export function record(name, { status = 0, bytes = 0, path: p = '/', ip = '', ua = '', method = 'GET' }) {
  if (!name) return;
  const d = load(name);
  rollover(d);
  const now = new Date();
  const day = (d.days[dayKey(now)] ||= emptyDay());
  const hk = hourKey(now);
  d.hours[hk] = (d.hours[hk] || 0) + 1;
  day.requests++;
  day.bytes += bytes;
  const cls = Math.floor(status / 100);
  if (cls >= 2 && cls <= 5) day[`s${cls}`]++;
  if (BOT_RE.test(ua) || !ua) {
    day.bots++;
  } else {
    const h = crypto.createHash('sha256').update(d.today.salt + ip).digest('base64url').slice(0, 12);
    if (!d._seen.has(h) && d._seen.size < MAX_UNIQUE_PER_DAY) {
      d._seen.add(h);
      day.visitors++;
    }
    const clean = String(p).split('?')[0] || '/';
    if (method === 'GET' && status >= 200 && status < 300 && !ASSET_RE.test(clean) && !clean.startsWith('/_next/') && !clean.startsWith('/.autonode/')) {
      const key = clean.length > 200 ? clean.slice(0, 200) + '…' : clean;
      if (day.pages[key] != null || Object.keys(day.pages).length < MAX_PAGES_PER_DAY) day.pages[key] = (day.pages[key] || 0) + 1;
      else day.pages['(other pages)'] = (day.pages['(other pages)'] || 0) + 1;
    }
  }
  dirty.add(name);
}

/** Dashboard summary: daily series, last 24 hours, top pages over the period. */
export function summary(name, days = 14) {
  const d = load(name);
  rollover(d);
  days = Math.max(1, Math.min(DAYS_KEPT, days));
  const series = [];
  const pages = {};
  const totals = emptyDay();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const k = dayKey(date);
    const v = d.days[k] || emptyDay();
    series.push({ date: k, requests: v.requests, visitors: v.visitors, bots: v.bots, errors: v.s5, notFound: v.s4, bytes: v.bytes });
    for (const f of ['requests', 'visitors', 'bots', 's2', 's3', 's4', 's5', 'bytes']) totals[f] += v[f];
    for (const [pg, n] of Object.entries(v.pages || {})) pages[pg] = (pages[pg] || 0) + n;
  }
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(Date.now() - i * 3600_000);
    hours.push({ hour: hourKey(t), requests: d.hours[hourKey(t)] || 0 });
  }
  const top = Object.entries(pages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([p, n]) => ({ path: p, views: n }));
  const today = d.days[dayKey()] || emptyDay();
  return { days: series, hours, pages: top, totals, today: { requests: today.requests, visitors: today.visitors, bots: today.bots, errors: today.s5, bytes: today.bytes } };
}

export function flush() {
  for (const name of dirty) {
    const d = sites.get(name);
    if (!d) continue;
    const hours = Object.keys(d.hours).sort();
    for (const k of hours.slice(0, Math.max(0, hours.length - HOURS_KEPT))) delete d.hours[k];
    d.today.seen = [...d._seen];
    const { _seen, ...plain } = d;
    try {
      fs.writeFileSync(fileFor(name), JSON.stringify(plain), { mode: 0o600 });
    } catch (err) {
      console.error('[visitors]', err.message);
    }
  }
  dirty.clear();
}

export function forget(name) {
  sites.delete(name);
  dirty.delete(name);
}

let timer = null;
export function start() {
  if (timer) return;
  timer = setInterval(flush, 60_000);
  timer.unref();
}
