/**
 * Cloudflare integration: DNS records, dynamic DNS (keeps A records pointed at
 * your home IP), and automatic Origin Certificates.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import * as certs from './certs.js';
import { allSites } from './sites.js';
import { publicHostnames } from './traffic.js';
import { run, which, HttpError } from './util.js';

const API = 'https://api.cloudflare.com/client/v4';

async function cf(method, url, body, token = config.get().cloudflare.apiToken) {
  if (!token) throw new HttpError(400, 'Connect your Cloudflare account first.');
  let res;
  try {
    res = await fetch(API + url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new HttpError(502, `Couldn't reach Cloudflare: ${err.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new HttpError(res.status === 403 || res.status === 401 ? 403 : 502, `Cloudflare: ${msg}`);
  }
  return data;
}

export async function publicIp() {
  for (const url of ['https://1.1.1.1/cdn-cgi/trace', 'https://cloudflare.com/cdn-cgi/trace']) {
    try {
      const t = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text();
      const ip = /^ip=(.+)$/m.exec(t)?.[1]?.trim();
      if (ip && !ip.includes(':')) return ip;
    } catch {}
  }
  try {
    return (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8000) })).text()).trim();
  } catch {
    return null;
  }
}

export async function connect(token) {
  token = String(token || '').trim();
  if (!token) throw new HttpError(400, 'Paste your API token.');
  const v = await cf('GET', '/user/tokens/verify', null, token);
  if (v.result?.status !== 'active') throw new HttpError(400, 'That token is not active.');
  const zones = await cf('GET', '/zones?per_page=50', null, token);
  config.update((c) => {
    c.cloudflare.apiToken = token;
    c.cloudflare.lastError = null;
  });
  return zones.result.map((z) => z.name);
}

export function disconnect() {
  config.update((c) => {
    c.cloudflare.apiToken = null;
  });
}

let zoneCache = { at: 0, zones: [] };
export async function zones() {
  if (Date.now() - zoneCache.at < 60_000) return zoneCache.zones;
  const r = await cf('GET', '/zones?per_page=50');
  zoneCache = { at: Date.now(), zones: r.result.map((z) => ({ id: z.id, name: z.name, status: z.status, plan: z.plan?.name, nameServers: z.name_servers })) };
  return zoneCache.zones;
}

export async function zoneFor(hostname) {
  const list = await zones();
  return list.filter((z) => hostname === z.name || hostname.endsWith('.' + z.name)).sort((a, b) => b.name.length - a.name.length)[0] || null;
}

/** Make `hostname` point at `ip` (proxied through Cloudflare). */
export async function ensureRecord(hostname, ip) {
  const zone = await zoneFor(hostname);
  if (!zone) throw new HttpError(404, `${hostname} isn't in your Cloudflare account.`);
  const existing = await cf('GET', `/zones/${zone.id}/dns_records?name=${encodeURIComponent(hostname)}`);
  const body = { type: 'A', name: hostname, content: ip, proxied: true, ttl: 1, comment: 'Managed by AutoNode' };
  const a = existing.result.find((r) => r.type === 'A');
  const conflict = existing.result.find((r) => r.type === 'CNAME' || r.type === 'AAAA');
  if (conflict && !a) {
    throw new HttpError(409, `${hostname} already has a ${conflict.type} record in Cloudflare. Remove it in the Cloudflare dashboard first.`);
  }
  if (a) {
    if (a.content === ip && a.proxied) return { hostname, action: 'unchanged' };
    await cf('PATCH', `/zones/${zone.id}/dns_records/${a.id}`, body);
    return { hostname, action: 'updated' };
  }
  await cf('POST', `/zones/${zone.id}/dns_records`, body);
  return { hostname, action: 'created' };
}

export async function removeRecord(hostname) {
  const zone = await zoneFor(hostname);
  if (!zone) return;
  const existing = await cf('GET', `/zones/${zone.id}/dns_records?type=A&name=${encodeURIComponent(hostname)}`);
  for (const r of existing.result) if (r.comment === 'Managed by AutoNode') await cf('DELETE', `/zones/${zone.id}/dns_records/${r.id}`);
}

/** Point every connected domain at the current public IP. */
export async function syncAll({ force = false } = {}) {
  const c = config.get().cloudflare;
  if (!c.apiToken) return { skipped: true };
  const ip = await publicIp();
  if (!ip) throw new HttpError(502, "Couldn't detect your public IP address.");
  if (!force && ip === c.lastIp) return { ip, unchanged: true };
  const results = [];
  // publicHostnames: includes the www twin when "www" handling is on.
  for (const host of allSites().flatMap((s) => publicHostnames(s))) {
    try {
      results.push(await ensureRecord(host, ip));
    } catch (err) {
      results.push({ hostname: host, action: 'error', error: err.message });
    }
  }
  const failed = results.filter((r) => r.action === 'error');
  config.update((cfg) => {
    cfg.cloudflare.lastIp = failed.length ? cfg.cloudflare.lastIp : ip;
    cfg.cloudflare.lastSync = new Date().toISOString();
    cfg.cloudflare.lastError = failed.length ? failed.map((f) => `${f.hostname}: ${f.error}`).join('\n') : null;
  });
  return { ip, results };
}

/** Set the zone's SSL mode to Full (strict). Needs Zone Settings: Edit. */
export async function setStrictSsl(domain) {
  const zone = await zoneFor(domain);
  if (!zone) throw new HttpError(404, `${domain} isn't in your Cloudflare account.`);
  await cf('PATCH', `/zones/${zone.id}/settings/ssl`, { value: 'strict' });
}

/** Create a 15-year Cloudflare Origin Certificate for domain + *.domain and install it. */
export async function createOriginCert(domain) {
  const zone = await zoneFor(domain);
  if (!zone) throw new HttpError(404, `${domain} isn't in your Cloudflare account.`);
  if (!which('openssl')) throw new HttpError(500, 'openssl is not installed. Install it (sudo apt install openssl) or paste the certificate manually.');
  const dir = fs.mkdtempSync(path.join(config.paths.tmpDir, 'csr-'));
  try {
    const keyFile = path.join(dir, 'key.pem');
    const r = await run('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-subj', `/CN=${zone.name}`], { quiet: true });
    if (r.code !== 0) throw new HttpError(500, `openssl failed: ${r.stderr}`);
    const csr = r.stdout;
    const res = await cf('POST', '/certificates', {
      hostnames: [zone.name, `*.${zone.name}`],
      requested_validity: 5475,
      request_type: 'origin-rsa',
      csr,
    });
    const info = certs.add(res.result.certificate, fs.readFileSync(keyFile, 'utf8'));
    let strict = true;
    try {
      await setStrictSsl(zone.name);
    } catch {
      strict = false;
    }
    return { ...info, strict };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let timer = null;
export function startDdns() {
  if (timer) return;
  const tick = () => {
    if (!config.get().cloudflare.ddns) return;
    syncAll().catch((err) =>
      config.update((c) => {
        c.cloudflare.lastError = err.message;
      }),
    );
  };
  setTimeout(tick, 15_000).unref();
  timer = setInterval(tick, 5 * 60_000);
  timer.unref();
}
