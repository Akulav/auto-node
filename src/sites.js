import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import * as config from './config.js';
import { runner, siteUser, siteEnv } from './runner.js';
import { run, HttpError, SITE_NAME_RE, HOSTNAME_RE, ENV_KEY_RE, normalizeHostname, isLinux } from './util.js';

export const siteDir = (name) => path.join(config.paths.sitesDir, name);

export function getSite(name) {
  // hasOwn: names like "__proto__" or "constructor" must not resolve to Object internals.
  const all = config.get().sites;
  if (!Object.hasOwn(all, name)) throw new HttpError(404, 'That website does not exist.');
  return all[name];
}

export function allSites() {
  return Object.values(config.get().sites).sort((a, b) => a.name.localeCompare(b.name));
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function nextPort() {
  const used = new Set(allSites().map((s) => s.port));
  for (let p = 3001; p < 3999; p++) if (!used.has(p) && (await portFree(p))) return p;
  throw new HttpError(500, 'No free port available.');
}

/** Hand files to the unprivileged site user. */
export async function fixOwnership(target) {
  if (config.DEV || !isLinux) return;
  await run('chown', ['-R', `${config.SITE_USER}:${config.SITE_USER}`, target], { quiet: true });
}

/** Figure out how to start a site when the user didn't specify. */
export function detectStartCommand(site) {
  if (site.startCommand?.trim()) return site.startCommand.trim();
  const dir = siteDir(site.name);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pkg.scripts?.start) return 'npm start';
    if (pkg.main && fs.existsSync(path.join(dir, pkg.main))) return `node ${JSON.stringify(pkg.main)}`;
  } catch {}
  for (const f of ['server.js', 'index.js', 'app.js', 'main.js', 'server.mjs', 'index.mjs', 'dist/index.js', 'build/index.js']) {
    if (fs.existsSync(path.join(dir, f))) return `node ${f}`;
  }
  return 'npm start';
}

export async function withStatus(sites) {
  const status = await runner().statusAll(sites.map((s) => s.name));
  return sites.map((s) => publicSite(s, status[s.name]));
}

/** Strip secrets before sending to the browser. */
export function publicSite(s, status) {
  return {
    ...s,
    git: s.git ? { ...s.git, token: s.git.token ? '••••••••' : null, hasToken: !!s.git.token } : null,
    detectedCommand: detectStartCommand(s),
    status: status || { state: 'stopped' },
  };
}

export async function createSite({ name, title, template = 'starter' }) {
  name = String(name || '').trim().toLowerCase();
  if (!SITE_NAME_RE.test(name)) throw new HttpError(400, 'Use lowercase letters, numbers and dashes (e.g. "my-blog").');
  if (config.get().sites[name]) throw new HttpError(409, 'A website with that name already exists.');
  const dir = siteDir(name);
  fs.mkdirSync(dir, { recursive: true });
  const site = {
    name,
    title: String(title || name).slice(0, 80),
    port: await nextPort(),
    hostnames: [],
    startCommand: '',
    installCommand: '',
    buildCommand: '',
    env: {},
    enabled: false,
    createdAt: new Date().toISOString(),
    git: null,
  };
  if (template === 'starter' && fs.readdirSync(dir).length === 0) writeStarter(dir, site);
  config.update((c) => {
    c.sites[name] = site;
  });
  await fixOwnership(dir);
  return site;
}

function writeStarter(dir, site) {
  // The title is user text going into HTML inside a JS template literal: escape for both.
  const title = site.title
    .replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
    .replace(/[\\`$]/g, (ch) => `\\${ch}`);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: site.name, version: '1.0.0', private: true, type: 'module', scripts: { start: 'node server.js' } }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'server.js'),
    `import http from 'node:http';

const port = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(\`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:#f5f5f7;color:#1d1d1f}
@media(prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}}h1{font-size:48px;letter-spacing:-.02em;margin:0}p{color:#86868b}</style>
<main style="text-align:center"><h1>${title}</h1><p>Your website is live. Edit <b>server.js</b> in AutoNode to change this page.</p></main>\`);
  })
  .listen(port, () => console.log(\`Listening on port \${port}\`));
`,
  );
}

export async function updateSite(name, patch) {
  const site = getSite(name);
  const next = { ...site };
  if (patch.title != null) next.title = String(patch.title).slice(0, 80);
  for (const k of ['startCommand', 'installCommand', 'buildCommand']) {
    if (patch[k] != null) {
      const v = String(patch[k]).trim();
      if (/[\n\r]/.test(v)) throw new HttpError(400, 'Commands must be a single line.');
      next[k] = v.slice(0, 500);
    }
  }
  if (patch.port != null) {
    const p = Number(patch.port);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new HttpError(400, 'Port must be between 1024 and 65535.');
    if (allSites().some((s) => s.name !== name && s.port === p)) throw new HttpError(409, 'Another website already uses that port.');
    next.port = p;
  }
  if (patch.env != null) {
    const env = {};
    for (const [k, v] of Object.entries(patch.env)) {
      if (!ENV_KEY_RE.test(k)) throw new HttpError(400, `"${k}" is not a valid variable name.`);
      if (k === 'PORT') continue;
      env[k] = String(v);
    }
    next.env = env;
  }
  config.update((c) => {
    c.sites[name] = next;
  });
  return next;
}

export async function addHostname(name, hostname) {
  const h = normalizeHostname(hostname);
  if (!HOSTNAME_RE.test(h) || h.startsWith('*.')) throw new HttpError(400, 'Enter a domain like akulav.com or blog.akulav.com.');
  const owner = allSites().find((s) => s.hostnames.includes(h));
  if (owner) throw new HttpError(409, `${h} is already connected to "${owner.name}".`);
  getSite(name);
  config.update((c) => {
    c.sites[name].hostnames.push(h);
  });
  return h;
}

export function removeHostname(name, hostname) {
  config.update((c) => {
    const s = c.sites[name];
    if (s) s.hostnames = s.hostnames.filter((x) => x !== hostname);
  });
}

export async function startSite(name) {
  const site = getSite(name);
  await runner().start(site, detectStartCommand(site));
  config.update((c) => {
    c.sites[name].enabled = true;
  });
}

export async function stopSite(name) {
  const site = getSite(name);
  await runner().stop(site);
  config.update((c) => {
    c.sites[name].enabled = false;
  });
}

export async function restartSite(name) {
  return startSite(name);
}

export async function deleteSite(name) {
  getSite(name);
  await runner().remove(name);
  fs.rmSync(siteDir(name), { recursive: true, force: true });
  config.update((c) => {
    delete c.sites[name];
  });
}

/** Run a shell command inside a site folder as the site user, streaming output. */
export async function runInSite(name, command, onData) {
  const ids = await siteUser();
  const site = getSite(name);
  const env = { ...process.env, ...siteEnv(site), NODE_ENV: 'development', npm_config_cache: path.join(config.paths.homeDir, '.npm') };
  if (config.DEV) env.PATH = process.env.PATH;
  onData?.(`$ ${command}\n`);
  const r = await run(command, [], { cwd: siteDir(name), env, shell: config.DEV ? true : '/bin/sh', uid: ids?.uid, gid: ids?.gid, onData, timeout: 30 * 60_000 });
  if (r.code !== 0) throw new Error(`"${command}" failed (exit code ${r.code}).`);
}

export function newSecret() {
  return crypto.randomBytes(24).toString('base64url');
}
