import os from 'node:os';
import fs from 'node:fs';
import * as config from './config.js';
import { isLinux } from './util.js';

let lastCpu = cpuTimes();
let lastNet = null;
let lastNetAt = Date.now();
const history = [];
const HISTORY = 90; // 3 minutes at 2s

function cpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const [k, v] of Object.entries(c.times)) {
      total += v;
      if (k === 'idle') idle += v;
    }
  }
  return { idle, total };
}

function memory() {
  const total = os.totalmem();
  let available = os.freemem();
  if (isLinux) {
    try {
      const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/);
      if (m) available = Number(m[1]) * 1024;
    } catch {}
  }
  return { total, used: total - available, available };
}

function disk(p) {
  try {
    const s = fs.statfsSync(p);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { path: p, total, free, used: total - free };
  } catch {
    return null;
  }
}

function netCounters() {
  if (!isLinux) return null;
  try {
    let rx = 0;
    let tx = 0;
    for (const line of fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const [name, rest] = line.split(':');
      if (!rest || name.trim() === 'lo') continue;
      const f = rest.trim().split(/\s+/).map(Number);
      rx += f[0];
      tx += f[8];
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

function temperature() {
  if (!isLinux) return null;
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'));
    let max = null;
    for (const z of zones) {
      const t = Number(fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8')) / 1000;
      if (Number.isFinite(t) && t > 0 && (max == null || t > max)) max = t;
    }
    return max;
  } catch {
    return null;
  }
}

export function sample() {
  const now = cpuTimes();
  const dTotal = now.total - lastCpu.total;
  const dIdle = now.idle - lastCpu.idle;
  lastCpu = now;
  const cpu = dTotal > 0 ? Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100)) : 0;

  const net = netCounters();
  let netRate = null;
  const t = Date.now();
  if (net && lastNet) {
    const sec = (t - lastNetAt) / 1000;
    netRate = { rx: Math.max(0, (net.rx - lastNet.rx) / sec), tx: Math.max(0, (net.tx - lastNet.tx) / sec) };
  }
  lastNet = net;
  lastNetAt = t;

  const mem = memory();
  const root = disk(isLinux ? '/' : config.paths.dataDir);
  const sites = disk(config.paths.sitesDir);
  const point = { t, cpu, mem: (mem.used / mem.total) * 100, rx: netRate?.rx ?? null, tx: netRate?.tx ?? null };
  history.push(point);
  if (history.length > HISTORY) history.shift();

  return {
    time: t,
    cpu: { percent: cpu, cores: os.cpus().length, model: os.cpus()[0]?.model?.trim() || 'CPU', load: os.loadavg() },
    memory: mem,
    disk: root,
    sitesDisk: sites && root && sites.total !== root.total ? sites : null,
    network: netRate,
    temperature: temperature(),
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
  };
}

export function getHistory() {
  return history;
}

// Keep sampling in the background so history is always warm.
let timer = null;
let latest = null;
const subscribers = new Set();
export function startSampling() {
  if (timer) return;
  latest = sample();
  timer = setInterval(() => {
    latest = sample();
    for (const fn of subscribers) fn(latest);
  }, 2000);
  timer.unref();
}
export function latestSample() {
  return latest || sample();
}
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
