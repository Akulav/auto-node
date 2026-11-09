/**
 * Health checks: AutoNode asks each website for a page every so often and
 * restarts it after several failed answers in a row, even if the process
 * still looks alive (hung event loop, deadlock, stuck DB connection…).
 *
 * site.health = { enabled, path: '/', interval: 30 (s), failures: 3 }
 */
import http from 'node:http';
import * as config from './config.js';
import * as activity from './activity.js';
import { runner } from './runner.js';
import { restartSite } from './sites.js';
import { HttpError } from './util.js';

const STARTUP_GRACE_S = 60; // give a freshly started site time to boot
const COOLDOWN_MS = 2 * 60_000; // after a restart, wait before judging again
const TIMEOUT_MS = 5000;

const state = new Map(); // name -> { fails, lastCheck, lastOk, lastError, lastStatus, restarts, lastRestart }

export const DEFAULTS = { enabled: false, path: '/', interval: 30, failures: 3 };

export function normalize(input = {}) {
  const h = { ...DEFAULTS, ...input };
  const p = String(h.path || '/').trim();
  if (!p.startsWith('/') || /\s/.test(p) || p.length > 300) throw new HttpError(400, 'The check address must start with "/", like / or /health.');
  return {
    enabled: !!h.enabled,
    path: p,
    interval: Math.max(10, Math.min(3600, Math.round(Number(h.interval) || 30))),
    failures: Math.max(1, Math.min(20, Math.round(Number(h.failures) || 3))),
  };
}

/** One request; healthy = any answer below 500 within the timeout. */
export function probe(port, path) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.get({ host: '127.0.0.1', port, path, timeout: TIMEOUT_MS, headers: { 'user-agent': 'AutoNode-HealthCheck', connection: 'close' } }, (res) => {
      res.resume();
      const ok = (res.statusCode || 500) < 500;
      resolve({ ok, status: res.statusCode, ms: Date.now() - started, error: ok ? null : `answered ${res.statusCode}` });
    });
    req.on('timeout', () => req.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000}s`)));
    req.on('error', (err) => resolve({ ok: false, status: null, ms: Date.now() - started, error: err.code === 'ECONNREFUSED' ? 'not accepting connections' : err.message }));
  });
}

export function statusOf(name) {
  const s = state.get(name);
  const site = config.get().sites[name];
  const h = site?.health?.enabled ? site.health : null;
  if (!h) return { enabled: false };
  if (!s) return { enabled: true, state: 'waiting' };
  return { enabled: true, state: s.fails === 0 ? 'healthy' : 'failing', fails: s.fails, threshold: h.failures, lastCheck: s.lastCheck, lastOk: s.lastOk, lastError: s.lastError, lastMs: s.lastMs, restarts: s.restarts, lastRestart: s.lastRestart };
}

async function checkSite(site, st) {
  const h = site.health;
  const s = state.get(site.name) || { fails: 0, restarts: 0 };
  state.set(site.name, s);
  if (s.lastRestart && Date.now() - s.lastRestart < COOLDOWN_MS) return;
  if (st?.state !== 'running' || (st.uptime != null && st.uptime < STARTUP_GRACE_S)) {
    s.fails = 0;
    return;
  }
  const r = await probe(site.port, h.path);
  s.lastCheck = new Date().toISOString();
  s.lastMs = r.ms;
  if (r.ok) {
    s.fails = 0;
    s.lastOk = s.lastCheck;
    s.lastError = null;
    return;
  }
  s.fails++;
  s.lastError = r.error;
  if (s.fails >= h.failures) {
    s.fails = 0;
    s.restarts++;
    s.lastRestart = Date.now();
    activity.record({ action: 'Restarted by health check', site: site.name, detail: `${h.path} ${r.error} (${h.failures}× in a row)`, ok: false, by: 'health check' });
    await restartSite(site.name).catch((err) => console.error(`[health] ${site.name}: ${err.message}`));
  }
}

let timer = null;
export function start(isBusy = () => false) {
  if (timer) return;
  const last = new Map();
  timer = setInterval(async () => {
    const due = Object.values(config.get().sites).filter((s) => s.enabled && s.health?.enabled && !isBusy(s.name) && Date.now() - (last.get(s.name) || 0) >= s.health.interval * 1000);
    if (!due.length) return;
    for (const s of due) last.set(s.name, Date.now());
    let status = {};
    try {
      status = await runner().statusAll(due.map((s) => s.name));
    } catch {}
    await Promise.all(due.map((s) => checkSite(s, status[s.name]).catch(() => {})));
  }, 5000);
  timer.unref();
}

export function forget(name) {
  state.delete(name);
}
