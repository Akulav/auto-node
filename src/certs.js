/**
 * TLS certificates (typically Cloudflare Origin Certificates).
 * Stored as <id>.crt / <id>.key in the certs directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import tls from 'node:tls';
import * as config from './config.js';
import { HttpError } from './util.js';

let contexts = []; // [{ id, names, context, validTo }]
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);

function inspect(certPem, keyPem) {
  let x509;
  try {
    x509 = new crypto.X509Certificate(certPem);
  } catch {
    throw new HttpError(400, "That doesn't look like a certificate. It should start with -----BEGIN CERTIFICATE-----");
  }
  if (keyPem != null) {
    let key;
    try {
      key = crypto.createPrivateKey(keyPem);
    } catch {
      throw new HttpError(400, "That doesn't look like a private key. It should start with -----BEGIN PRIVATE KEY-----");
    }
    if (!x509.checkPrivateKey(key)) throw new HttpError(400, "The private key doesn't belong to this certificate.");
  }
  const names = (x509.subjectAltName || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('DNS:'))
    .map((s) => s.slice(4).toLowerCase());
  if (!names.length) {
    const cn = /CN=([^\n,]+)/.exec(x509.subject)?.[1];
    if (cn) names.push(cn.toLowerCase());
  }
  return {
    names,
    issuer: (/O=([^\n]+)/.exec(x509.issuer)?.[1] || /CN=([^\n]+)/.exec(x509.issuer)?.[1] || 'Unknown').trim(),
    validFrom: new Date(x509.validFrom).toISOString(),
    validTo: new Date(x509.validTo).toISOString(),
    fingerprint: x509.fingerprint256,
  };
}

export function reload() {
  const next = [];
  let files = [];
  try {
    files = fs.readdirSync(config.paths.certsDir).filter((f) => f.endsWith('.crt'));
  } catch {}
  for (const f of files) {
    const id = f.slice(0, -4);
    try {
      const cert = fs.readFileSync(path.join(config.paths.certsDir, f), 'utf8');
      const key = fs.readFileSync(path.join(config.paths.certsDir, `${id}.key`), 'utf8');
      const info = inspect(cert, null);
      next.push({ id, ...info, context: tls.createSecureContext({ cert, key }) });
    } catch (err) {
      console.error(`[certs] Skipping ${f}: ${err.message}`);
    }
  }
  contexts = next;
  for (const l of listeners) l();
}

export function list() {
  return contexts.map(({ context, ...rest }) => ({ ...rest, expired: new Date(rest.validTo) < new Date() }));
}

export function add(certPem, keyPem) {
  certPem = String(certPem || '').trim() + '\n';
  keyPem = String(keyPem || '').trim() + '\n';
  const info = inspect(certPem, keyPem);
  const id = info.names[0].replace(/^\*\./, 'wildcard.').replace(/[^a-z0-9.-]/g, '_') + '-' + info.fingerprint.replace(/:/g, '').slice(0, 8).toLowerCase();
  fs.writeFileSync(path.join(config.paths.certsDir, `${id}.crt`), certPem, { mode: 0o600 });
  fs.writeFileSync(path.join(config.paths.certsDir, `${id}.key`), keyPem, { mode: 0o600 });
  reload();
  return { id, ...info };
}

export function remove(id) {
  if (!/^[a-z0-9._-]+$/.test(id)) throw new HttpError(400, 'Bad id');
  fs.rmSync(path.join(config.paths.certsDir, `${id}.crt`), { force: true });
  fs.rmSync(path.join(config.paths.certsDir, `${id}.key`), { force: true });
  reload();
}

function matches(pattern, host) {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host.endsWith('.' + base) && !host.slice(0, -base.length - 1).includes('.');
  }
  return false;
}

/** Find the best certificate for a hostname (exact beats wildcard; newest wins). */
export function find(host) {
  host = String(host || '').toLowerCase();
  let best = null;
  for (const c of contexts) {
    const exact = c.names.includes(host);
    const wild = !exact && c.names.some((n) => matches(n, host));
    if (!exact && !wild) continue;
    const score = (exact ? 2 : 1) * 1e15 + new Date(c.validTo).getTime();
    if (!best || score > best.score) best = { score, c };
  }
  return best?.c || null;
}

export const hasCertFor = (host) => !!find(host);
export const contextFor = (host) => find(host)?.context || null;
