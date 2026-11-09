/**
 * HTTPS for the LAN dashboard, with a self-signed certificate made for this
 * computer (its addresses and name). The dashboard keeps one port: AutoNode
 * looks at the first byte of each connection — TLS goes to HTTPS, plain HTTP
 * is redirected to https:// — so old bookmarks keep working.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import crypto from 'node:crypto';
import * as config from './config.js';
import { run, which, HttpError } from './util.js';

const certFile = () => path.join(config.paths.configDir, 'dashboard.crt');
const keyFile = () => path.join(config.paths.configDir, 'dashboard.key');

let context = null;

function lanIps() {
  const ips = new Set(['127.0.0.1']);
  for (const addrs of Object.values(os.networkInterfaces())) for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) ips.add(a.address);
  return [...ips];
}

export function certPem() {
  try {
    return fs.readFileSync(certFile(), 'utf8');
  } catch {
    return null;
  }
}

export function info() {
  const pem = certPem();
  if (!pem) return { hasCert: false };
  try {
    const x = new crypto.X509Certificate(pem);
    return { hasCert: true, names: (x.subjectAltName || '').split(', ').map((s) => s.replace(/^(DNS|IP Address):/, '')), validTo: new Date(x.validTo).toISOString(), fingerprint: x.fingerprint256 };
  } catch {
    return { hasCert: false };
  }
}

/** Make (or remake) the self-signed certificate. Needs openssl. */
export async function ensureCert({ force = false } = {}) {
  if (!force && fs.existsSync(certFile()) && fs.existsSync(keyFile())) return load();
  if (!which('openssl')) throw new HttpError(500, 'openssl is not installed. Run: sudo apt install openssl');
  const host = os.hostname().toLowerCase().replace(/[^a-z0-9.-]/g, '') || 'autonode';
  const san = [...new Set(['localhost', host, `${host}.local`, `${host}.lan`])].map((d) => `DNS:${d}`).concat(lanIps().map((ip) => `IP:${ip}`)).join(',');
  const tmpKey = keyFile() + '.new';
  const tmpCrt = certFile() + '.new';
  const r = await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-keyout', tmpKey, '-out', tmpCrt, '-subj', `/CN=AutoNode ${host}/O=AutoNode`, '-addext', `subjectAltName=${san}`, '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth'], { quiet: true });
  if (r.code !== 0) throw new HttpError(500, `Couldn't create the certificate: ${r.stderr.trim().split('\n').pop()}`);
  fs.chmodSync(tmpKey, 0o600);
  fs.renameSync(tmpKey, keyFile());
  fs.renameSync(tmpCrt, certFile());
  return load();
}

const listeners = new Set();
/** Called with { cert, key } whenever a certificate is loaded (startup, turned on, regenerated). */
export const onLoad = (fn) => listeners.add(fn);

/** The PEM pair, for servers that need it directly (no SNI when visiting by IP address). */
export function pair() {
  try {
    return { cert: fs.readFileSync(certFile()), key: fs.readFileSync(keyFile()) };
  } catch {
    return null;
  }
}

function load() {
  const p = pair();
  context = tls.createSecureContext(p);
  for (const fn of listeners) fn(p);
  return context;
}

export function secureContext() {
  if (context) return context;
  try {
    return load();
  } catch {
    return null;
  }
}
