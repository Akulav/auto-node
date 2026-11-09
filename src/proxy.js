/**
 * Public-facing reverse proxy on ports 80/443.
 * Routes each hostname to the website's local port, terminates TLS using the
 * stored certificates (SNI), handles WebSockets and redirects HTTP → HTTPS.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import * as config from './config.js';
import * as certs from './certs.js';
import { allSites, reservedPorts } from './sites.js';

let httpServer = null;
let httpsServer = null;
let hookHandler = null;
export const status = { http: null, https: null, httpError: null, httpsError: null };

const HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate'];

function hostOf(req) {
  return String(req.headers.host || '')
    .replace(/:\d+$/, '')
    .toLowerCase();
}

export { route as routeFor };
function route(host) {
  const site = allSites().find((s) => s.hostnames.includes(host)) || null;
  // Never forward the internet to AutoNode's own ports (dashboard, or a loop to the proxy).
  if (site && reservedPorts().has(site.port)) return null;
  return site;
}

function page(res, status, title, text) {
  const body = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:#f5f5f7;color:#1d1d1f;text-align:center;padding:24px}
@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}}h1{font-size:34px;letter-spacing:-.02em;margin:0 0 8px}p{color:#86868b;margin:0}small{display:block;margin-top:32px;color:#86868b;font-size:12px}</style>
<main><h1>${title}</h1><p>${text}</p><small>Served by AutoNode</small></main>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// Cloudflare's published edge ranges (https://www.cloudflare.com/ips/).
const CLOUDFLARE_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];
const trusted = new net.BlockList();
for (const c of CLOUDFLARE_V4) trusted.addSubnet(c.split('/')[0], Number(c.split('/')[1]), 'ipv4');
for (const c of CLOUDFLARE_V6) trusted.addSubnet(c.split('/')[0], Number(c.split('/')[1]), 'ipv6');
trusted.addSubnet('127.0.0.0', 8, 'ipv4'); // cloudflared (Tunnel) on this machine
trusted.addAddress('::1', 'ipv6');

/** Is this connection from Cloudflare (or a local tunnel), so its CF-/X-Forwarded headers can be believed? */
export function isTrustedProxy(addr = '') {
  const a = addr.replace(/^::ffff:/, '');
  try {
    return trusted.check(a, a.includes(':') ? 'ipv6' : 'ipv4');
  } catch {
    return false;
  }
}

export function forwardHeaders(req, secure) {
  const h = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.includes(k)) h[k] = v;
  const ip = req.socket.remoteAddress?.replace(/^::ffff:/, '') || '';
  if (isTrustedProxy(ip)) {
    h['x-forwarded-for'] = req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${ip}` : ip;
    h['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || (secure ? 'https' : 'http');
    h['x-real-ip'] = req.headers['cf-connecting-ip'] || ip;
  } else {
    // Someone connected straight to this computer: never pass on claims about who they are.
    for (const k of ['cf-connecting-ip', 'true-client-ip', 'cf-ipcountry', 'cf-visitor', 'cf-ray', 'x-real-ip', 'forwarded']) delete h[k];
    h['x-forwarded-for'] = ip;
    h['x-forwarded-proto'] = secure ? 'https' : 'http';
    h['x-real-ip'] = ip;
  }
  h['x-forwarded-host'] = req.headers.host || '';
  return h;
}

function handle(secure) {
  return (req, res) => {
    const host = hostOf(req);
    if (req.url.startsWith('/.autonode/deploy/') && hookHandler) {
      // Public port: a rejection here must never take the daemon down.
      return Promise.resolve(hookHandler(req, res)).catch((err) => {
        console.error('[proxy] deploy hook:', err);
        if (!res.headersSent) page(res, 500, 'Something went wrong', 'Please try again.');
        else res.destroy();
      });
    }
    const site = route(host);
    if (!site) return page(res, 404, 'Nothing here yet', `<b>${host.replace(/[<>&"]/g, '')}</b> isn't connected to a website.`);
    const viaHttps = isTrustedProxy(req.socket.remoteAddress) && String(req.headers['cf-visitor'] || '').includes('https');
    if (!secure && config.get().proxy.redirectHttps && certs.hasCertFor(host) && !viaHttps) {
      const port = config.get().proxy.httpsPort;
      res.writeHead(301, { Location: `https://${host}${port === 443 ? '' : ':' + port}${req.url}` });
      return res.end();
    }
    const up = http.request(
      { host: '127.0.0.1', port: site.port, method: req.method, path: req.url, headers: forwardHeaders(req, secure) },
      (upRes) => {
        const headers = { ...upRes.headers };
        for (const k of HOP) if (k !== 'transfer-encoding') delete headers[k];
        res.writeHead(upRes.statusCode || 502, headers);
        upRes.pipe(res);
      },
    );
    up.setTimeout(10 * 60_000, () => up.destroy(new Error('timeout'))); // idle time; slow reports/exports need more than 2 min
    up.on('error', () => {
      if (!res.headersSent) page(res, 502, 'Starting up…', 'This website is not responding right now. If you own it, check that it is running in AutoNode.');
      else res.destroy();
    });
    req.pipe(up);
  };
}

function handleUpgrade(secure) {
  return (req, socket, head) => {
    const site = route(hostOf(req));
    if (!site) return socket.destroy();
    const up = net.connect(site.port, '127.0.0.1', () => {
      const headers = forwardHeaders(req, secure);
      headers.connection = 'Upgrade';
      headers.upgrade = req.headers.upgrade;
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(headers)) for (const vv of [].concat(v)) raw += `${k}: ${vv}\r\n`;
      up.write(raw + '\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  };
}

function listen(server, port, key) {
  return new Promise((resolve) => {
    server.once('error', (err) => {
      status[key + 'Error'] = err.code === 'EADDRINUSE' ? `Port ${port} is already used by another program.` : err.code === 'EACCES' ? `No permission to use port ${port}.` : err.message;
      status[key] = null;
      console.error(`[proxy] ${key} :${port} — ${status[key + 'Error']}`);
      resolve();
    });
    server.listen(port, '0.0.0.0', () => {
      status[key] = port;
      status[key + 'Error'] = null;
      resolve();
    });
  });
}

/** Public ports: a synchronous throw in a handler would otherwise crash the whole daemon. */
const guard = (fn) => (req, resOrSocket, head) => {
  try {
    return fn(req, resOrSocket, head);
  } catch (err) {
    console.error('[proxy]', err);
    if (typeof resOrSocket.writeHead === 'function' && !resOrSocket.headersSent) page(resOrSocket, 500, 'Something went wrong', 'Please try again.');
    else resOrSocket.destroy();
  }
};

function tune(server) {
  // Node's default 5-minute request limit cut off large uploads to websites.
  server.requestTimeout = 60 * 60_000;
  server.headersTimeout = 60_000; // still guards against slow-header (slowloris) clients
  return server;
}

export async function start(onHook) {
  hookHandler = onHook;
  const { httpPort, httpsPort } = config.get().proxy;
  httpServer = tune(http.createServer(guard(handle(false))));
  httpServer.on('upgrade', guard(handleUpgrade(false)));
  await listen(httpServer, httpPort, 'http');

  httpsServer = tune(
    https.createServer(
      {
        SNICallback: (name, cb) => {
          const ctx = certs.contextFor(name);
          cb(ctx ? null : new Error('no certificate'), ctx || undefined);
        },
      },
      guard(handle(true)),
    ),
  );
  httpsServer.on('upgrade', guard(handleUpgrade(true)));
  httpsServer.on('tlsClientError', () => {});
  await listen(httpsServer, httpsPort, 'https');
}

export async function stop() {
  await Promise.all([httpServer, httpsServer].filter(Boolean).map((s) => new Promise((r) => s.close(r))));
}
