/**
 * Scheduled tasks per website (like cron): run a command in the site folder,
 * as the site user, with the site's environment (PORT, DATA_DIR, variables).
 *
 * site.tasks = [{ id, name, command, schedule: '0 3 * * *' | '@daily', enabled }]
 * Run history (last 20) and the latest output live in /var/lib/autonode/tasks/<site>/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as config from './config.js';
import * as activity from './activity.js';
import { getSite, runInSite } from './sites.js';
import { HttpError } from './util.js';

/* ------------------------------------------------------------------ cron */

const PRESETS = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' };
const RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function parseField(text, [min, max]) {
  const set = new Set();
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`"${part}"`);
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      lo = Number(m[2]);
      hi = m[3] != null ? Number(m[3]) : m[4] != null ? max : lo;
    }
    const step = m[4] != null ? Number(m[4]) : 1;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`"${part}" (allowed ${min}-${max})`);
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

/** Parse "m h dom mon dow" (or @daily…). Throws a readable error. */
export function parseCron(expr) {
  const src = PRESETS[String(expr).trim().toLowerCase()] || String(expr).trim();
  const f = src.split(/\s+/);
  if (f.length !== 5) throw new HttpError(400, 'A schedule has 5 parts: minute hour day month weekday (e.g. "0 3 * * *" = every day at 03:00).');
  try {
    const [minute, hour, dom, month, dow] = f.map((t, i) => parseField(t, RANGES[i]));
    if (dow.has(7)) dow.add(0); // 7 = Sunday too
    return { minute, hour, dom, month, dow, domAny: f[2] === '*', dowAny: f[4] === '*' };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, `That schedule isn't valid: ${err.message}.`);
  }
}

export function cronMatches(c, d) {
  if (!c.minute.has(d.getMinutes()) || !c.hour.has(d.getHours()) || !c.month.has(d.getMonth() + 1)) return false;
  const domOk = c.dom.has(d.getDate());
  const dowOk = c.dow.has(d.getDay());
  // Classic cron: if both day fields are restricted, either one matching is enough.
  if (!c.domAny && !c.dowAny) return domOk || dowOk;
  return domOk && dowOk;
}

/** Next time (after `from`) the schedule fires, or null within ~a year. */
export function nextRun(expr, from = new Date()) {
  const c = parseCron(expr);
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (cronMatches(c, d)) return d;
  }
  return null;
}

/* ----------------------------------------------------------------- tasks */

const dirFor = (name) => path.join(config.paths.tasksDir, name);
const running = new Map(); // `${site}/${id}` -> { startedAt, output }

function normalize(input, existing = {}) {
  const t = { ...existing };
  if (input.name !== undefined) t.name = String(input.name || '').trim().slice(0, 60) || 'Task';
  if (input.command !== undefined) {
    const cmd = String(input.command || '').trim();
    if (!cmd) throw new HttpError(400, 'Enter the command to run, like: npm run cleanup');
    if (/[\r\n]/.test(cmd) || cmd.length > 500) throw new HttpError(400, 'The command must be a single line.');
    t.command = cmd;
  }
  if (input.schedule !== undefined) {
    parseCron(input.schedule);
    t.schedule = String(input.schedule).trim();
  }
  if (input.enabled !== undefined) t.enabled = !!input.enabled;
  if (input.timeoutMin !== undefined) t.timeoutMin = Math.max(1, Math.min(240, Number(input.timeoutMin) || 30));
  return t;
}

function runsFile(name, id) {
  return path.join(dirFor(name), `${id}.json`);
}

function readRuns(name, id) {
  try {
    return JSON.parse(fs.readFileSync(runsFile(name, id), 'utf8'));
  } catch {
    return [];
  }
}

export function list(name) {
  const site = getSite(name);
  return (site.tasks || []).map((t) => {
    let next = null;
    try {
      next = t.enabled ? nextRun(t.schedule)?.toISOString() || null : null;
    } catch {}
    const runs = readRuns(name, t.id);
    return { ...t, next, running: running.has(`${name}/${t.id}`), lastRun: runs[0] || null, runs: runs.slice(0, 10) };
  });
}

export function create(name, input) {
  getSite(name);
  const t = normalize({ enabled: true, timeoutMin: 30, ...input }, { id: crypto.randomBytes(5).toString('hex') });
  if (!t.command || !t.schedule) throw new HttpError(400, 'A task needs a command and a schedule.');
  config.update((c) => {
    const s = c.sites[name];
    s.tasks = [...(s.tasks || []), t].slice(0, 50);
  });
  return t;
}

export function update(name, id, input) {
  const site = getSite(name);
  const cur = (site.tasks || []).find((t) => t.id === id);
  if (!cur) throw new HttpError(404, 'That task no longer exists.');
  const next = normalize(input, cur);
  config.update((c) => {
    c.sites[name].tasks = c.sites[name].tasks.map((t) => (t.id === id ? next : t));
  });
  return next;
}

export function remove(name, id) {
  getSite(name);
  config.update((c) => {
    c.sites[name].tasks = (c.sites[name].tasks || []).filter((t) => t.id !== id);
  });
  for (const f of [runsFile(name, id), path.join(dirFor(name), `${id}.log`)]) fs.rmSync(f, { force: true });
}

export function log(name, id) {
  if (!/^[0-9a-f]{10}$/.test(String(id))) throw new HttpError(400, 'Invalid task');
  const r = running.get(`${name}/${id}`);
  if (r) return { running: true, output: r.output.join('') };
  try {
    return { running: false, output: fs.readFileSync(path.join(dirFor(name), `${id}.log`), 'utf8') };
  } catch {
    return { running: false, output: '' };
  }
}

/** Run a task now (in the background). */
export function run(name, id, by = 'you') {
  const site = getSite(name);
  const task = (site.tasks || []).find((t) => t.id === id);
  if (!task) throw new HttpError(404, 'That task no longer exists.');
  const key = `${name}/${id}`;
  if (running.has(key)) return { running: true };
  const r = { startedAt: new Date().toISOString(), output: [], size: 0 };
  running.set(key, r);
  const onData = (t) => {
    if (r.size > 256 * 1024) return;
    r.size += t.length;
    r.output.push(t);
  };
  (async () => {
    let ok = true;
    let error = null;
    try {
      await runInSite(name, task.command, onData, { timeoutMs: (task.timeoutMin || 30) * 60_000, task: true });
    } catch (err) {
      ok = false;
      error = err.message;
      onData(`\n✖ ${err.message}\n`);
    }
    const finishedAt = new Date().toISOString();
    try {
      fs.mkdirSync(dirFor(name), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dirFor(name), `${id}.log`), r.output.join(''), { mode: 0o600 });
      const runs = [{ at: r.startedAt, finishedAt, ok, error, by, durationMs: Date.parse(finishedAt) - Date.parse(r.startedAt) }, ...readRuns(name, id)].slice(0, 20);
      fs.writeFileSync(runsFile(name, id), JSON.stringify(runs), { mode: 0o600 });
    } catch {}
    running.delete(key);
    if (!ok || by !== 'schedule') activity.record({ action: ok ? `Task “${task.name}” finished` : `Task “${task.name}” failed`, site: name, detail: error, ok, by });
  })();
  return { running: true };
}

let timer = null;
export function start() {
  if (timer) return;
  let lastMinute = null;
  timer = setInterval(() => {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    for (const site of Object.values(config.get().sites)) {
      for (const t of site.tasks || []) {
        if (!t.enabled) continue;
        try {
          if (cronMatches(parseCron(t.schedule), now)) run(site.name, t.id, 'schedule');
        } catch {}
      }
    }
  }, 10_000);
  timer.unref();
}
