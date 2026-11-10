import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const isLinux = process.platform === 'linux';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Run a command without a shell. Never rejects on non-zero exit;
 * resolves { code, stdout, stderr }. Rejects only if the binary can't be spawned
 * (unless opts.quiet, in which case it resolves with code 127).
 */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env || process.env,
        uid: opts.uid,
        gid: opts.gid,
        shell: opts.shell || false,
        windowsHide: true,
      });
    } catch (err) {
      if (opts.quiet) return resolve({ code: 127, stdout: '', stderr: err.message });
      return reject(err);
    }
    let stdout = '';
    let stderr = '';
    const timer = opts.timeout ? setTimeout(() => child.kill('SIGKILL'), opts.timeout) : null;
    child.stdout.on('data', (d) => {
      stdout += d;
      opts.onData?.(String(d));
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      opts.onData?.(String(d));
    });
    if (opts.input != null) child.stdin.end(opts.input);
    else child.stdin.end();
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (opts.quiet) resolve({ code: 127, stdout, stderr: err.message });
      else reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Like run(), but throws a readable error on failure. */
export async function runOk(cmd, args = [], opts = {}) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout || '').trim().split('\n').slice(-5).join('\n');
    throw new Error(msg || `${cmd} exited with code ${r.code}`);
  }
  return r.stdout;
}

const whichCache = new Map();
export function which(bin) {
  if (whichCache.has(bin)) return whichCache.get(bin);
  const dirs = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  let found = null;
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, bin + e);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        found = p;
        break;
      } catch {}
    }
    if (found) break;
  }
  whichCache.set(bin, found);
  return found;
}

export function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** This computer's first LAN IPv4 address. */
export function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '127.0.0.1';
}

/** The client's address without the IPv4-in-IPv6 prefix. */
export const clientIp = (req) => String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

/**
 * Write a file so that readers (and a power cut) only ever see the old or the new
 * content, never half of it: write a temp file next to it, flush it to disk, rename.
 * The temp name is random and opened with O_EXCL, so a planted symlink is never followed.
 */
export function writeFileAtomic(file, data, { mode = 0o600 } = {}) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', mode);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
  } catch (err) {
    if (fd != null) fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  try {
    // Make the rename itself durable (not supported on Windows; harmless to skip).
    const dirFd = fs.openSync(path.dirname(file), 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {}
}

/** Read a JSON file, or return `fallback` if it is missing or damaged. */
export function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export const SITE_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const HOSTNAME_RE = /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function normalizeHostname(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

/** Ring buffer of text lines. */
export class LineBuffer {
  constructor(max = 2000) {
    this.max = max;
    this.lines = [];
    this.partial = '';
    this.listeners = new Set();
  }
  push(text) {
    const parts = (this.partial + text).split(/\r?\n/);
    this.partial = parts.pop();
    for (const p of parts) this.add(p);
  }
  add(line) {
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    for (const l of this.listeners) l(line);
  }
  text() {
    return this.lines.join('\n') + (this.partial ? '\n' + this.partial : '');
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
