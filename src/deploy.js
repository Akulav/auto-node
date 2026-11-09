/**
 * GitHub deployments: connect a repository, check for new commits, pull +
 * install + build + restart, deploy webhooks and periodic auto-updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as config from './config.js';
import { getSite, siteDir, runInSite, restartSite, newSecret, fixOwnership } from './sites.js';
import { siteUser } from './runner.js';
import { run, which, HttpError, LineBuffer, readBody, sendJson } from './util.js';

const jobs = new Map(); // name -> { running, log, startedAt, finishedAt, ok, error, again }

function gitEnv(site) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', HOME: config.paths.homeDir };
  if (site.git?.token) {
    const basic = Buffer.from(`x-access-token:${site.git.token}`).toString('base64');
    Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}` });
  }
  return env;
}

async function git(site, args, onData) {
  const ids = await siteUser();
  const r = await run('git', args, { cwd: siteDir(site.name), env: gitEnv(site), uid: ids?.uid, gid: ids?.gid, onData, timeout: 10 * 60_000 });
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout).trim();
    if (/Authentication failed|could not read Username|403|Repository not found/i.test(msg))
      throw new HttpError(400, "GitHub refused access. If the repository is private, add an access token (Settings → Developer settings → Fine-grained tokens → Contents: Read-only).");
    throw new HttpError(500, msg.split('\n').slice(-3).join('\n') || `git ${args[0]} failed`);
  }
  return r.stdout.trim();
}

export function normalizeRepo(input) {
  let r = String(input || '').trim();
  if (!r) throw new HttpError(400, 'Enter a GitHub repository.');
  if (/^[\w.-]+\/[\w.-]+$/.test(r)) r = `https://github.com/${r}`;
  r = r.replace(/^git@github\.com:/, 'https://github.com/');
  if (!/^https:\/\/[^\s]+$/.test(r)) throw new HttpError(400, 'Use an https:// address or owner/repo.');
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(r) && !r.endsWith('.git')) r += '.git';
  return r;
}

export async function connectRepo(name, { repo, branch, token, autoUpdate, interval }) {
  if (!which('git')) throw new HttpError(500, 'git is not installed. Run: sudo apt install git');
  const site = getSite(name);
  const prev = site.git || {};
  const gitCfg = {
    repo: normalizeRepo(repo),
    branch: String(branch || prev.branch || 'main').trim(),
    token: token === undefined || token === '••••••••' ? prev.token || null : String(token).trim() || null,
    autoUpdate: autoUpdate ?? prev.autoUpdate ?? false,
    interval: Math.max(1, Math.min(1440, Number(interval || prev.interval || 5))),
    webhookSecret: prev.webhookSecret || newSecret(),
    lastCommit: prev.lastCommit || null,
    lastDeploy: prev.lastDeploy || null,
    lastCheck: prev.lastCheck || null,
    behind: prev.behind || 0,
  };
  // No leading "-": git would read the branch as an option.
  if (!/^[\w.][\w./-]*$/.test(gitCfg.branch)) throw new HttpError(400, 'Invalid branch name.');
  // Verify access before saving.
  const probe = await run('git', ['ls-remote', '--heads', gitCfg.repo, gitCfg.branch], { env: gitEnv({ git: gitCfg }), timeout: 60_000 });
  if (probe.code !== 0) {
    throw new HttpError(400, /Authentication|could not read|403|not found/i.test(probe.stderr) ? "Couldn't access that repository. If it's private, add an access token." : probe.stderr.trim());
  }
  if (!probe.stdout.trim()) throw new HttpError(400, `Branch "${gitCfg.branch}" doesn't exist in that repository.`);
  config.update((c) => {
    c.sites[name].git = gitCfg;
  });
  return gitCfg;
}

export function disconnectRepo(name) {
  config.update((c) => {
    if (c.sites[name]) c.sites[name].git = null;
  });
}

export function rotateSecret(name) {
  config.update((c) => {
    c.sites[name].git.webhookSecret = newSecret();
  });
}

async function ensureRepo(site, onData) {
  const dir = siteDir(site.name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    await git(site, ['init', '-q'], onData);
    await git(site, ['remote', 'add', 'origin', site.git.repo], onData);
  } else {
    await git(site, ['remote', 'set-url', 'origin', site.git.repo], onData).catch(() => git(site, ['remote', 'add', 'origin', site.git.repo], onData));
  }
}

async function headInfo(site) {
  try {
    const [hash, subject, author, date] = (await git(site, ['log', '-1', '--format=%h%x09%s%x09%an%x09%cI'])).split('\t');
    return { hash, subject, author, date };
  } catch {
    return null;
  }
}

export async function checkForUpdates(name) {
  const site = getSite(name);
  if (!site.git) throw new HttpError(400, 'This website is not connected to GitHub.');
  await fixOwnership(siteDir(name));
  await ensureRepo(site);
  await git(site, ['fetch', '-q', '--depth', '50', 'origin', site.git.branch]);
  const remote = await git(site, ['rev-parse', 'FETCH_HEAD']);
  let local = null;
  try {
    local = await git(site, ['rev-parse', 'HEAD']);
  } catch {}
  let commits = [];
  if (local !== remote) {
    const range = local ? `${local}..FETCH_HEAD` : 'FETCH_HEAD';
    const out = await git(site, ['log', '--format=%h%x09%s%x09%an%x09%cI', '-n', '20', range]).catch(() => '');
    commits = out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, subject, author, date] = l.split('\t');
        return { hash, subject, author, date };
      });
  }
  const result = { upToDate: local === remote, behind: commits.length, commits, current: await headInfo(site), checkedAt: new Date().toISOString() };
  config.update((c) => {
    if (!c.sites[name]?.git) return;
    c.sites[name].git.lastCheck = result.checkedAt;
    c.sites[name].git.behind = result.behind;
  });
  return result;
}

function pickInstall(site) {
  if (site.installCommand) return site.installCommand;
  const dir = siteDir(site.name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) return null;
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) && which('pnpm')) return 'pnpm install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'yarn.lock')) && which('yarn')) return 'yarn install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm ci --no-audit --no-fund';
  return 'npm install --no-audit --no-fund';
}

function pickBuild(site) {
  if (site.buildCommand) return site.buildCommand;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(siteDir(site.name), 'package.json'), 'utf8'));
    if (pkg.scripts?.build) return 'npm run build';
  } catch {}
  return null;
}

export function jobStatus(name) {
  const j = jobs.get(name);
  if (!j) return { running: false, log: '' };
  return { running: j.running, log: j.log.text(), startedAt: j.startedAt, finishedAt: j.finishedAt, ok: j.ok, error: j.error, kind: j.kind };
}

/**
 * Pull (if connected to git), install dependencies, build and restart.
 * Returns immediately; follow progress with jobStatus().
 */
export function deploy(name, { reason = 'manual', pull = true } = {}) {
  const site = getSite(name);
  const existing = jobs.get(name);
  if (existing?.running) {
    existing.again = true;
    return jobStatus(name);
  }
  const job = { running: true, log: new LineBuffer(5000), startedAt: new Date().toISOString(), finishedAt: null, ok: null, error: null, kind: pull && site.git ? 'deploy' : 'build' };
  jobs.set(name, job);
  const say = (t) => job.log.push(t);
  const stamp = () => new Date().toLocaleTimeString();
  (async () => {
    try {
      say(`[${stamp()}] Starting (${reason})\n`);
      if (pull && site.git) {
        await fixOwnership(siteDir(name));
        say(`[${stamp()}] Downloading latest code from ${site.git.repo.replace(/\.git$/, '')} (${site.git.branch})…\n`);
        await ensureRepo(site, say);
        await git(site, ['fetch', '--depth', '50', 'origin', site.git.branch], say);
        await git(site, ['reset', '--hard', 'FETCH_HEAD'], say);
      }
      const install = pickInstall(site);
      if (install) {
        say(`\n[${stamp()}] Installing packages…\n`);
        await runInSite(name, install, say);
      }
      const build = pickBuild(site);
      if (build) {
        say(`\n[${stamp()}] Building…\n`);
        await runInSite(name, build, say);
      }
      say(`\n[${stamp()}] Restarting website…\n`);
      await restartSite(name);
      job.ok = true;
      say(`\n[${stamp()}] ✓ Done.\n`);
    } catch (err) {
      job.ok = false;
      job.error = err.message;
      say(`\n[${stamp()}] ✖ ${err.message}\n`);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      const head = getSafe(name)?.git ? await headInfo(getSite(name)) : null;
      config.update((c) => {
        const s = c.sites[name];
        if (!s?.git) return;
        s.git.lastDeploy = { at: job.finishedAt, ok: job.ok, error: job.error, reason, commit: head };
        if (job.ok) {
          s.git.lastCommit = head;
          s.git.behind = 0;
        }
      });
      if (job.again) {
        job.again = false;
        setTimeout(() => deploy(name, { reason: 'queued' }), 500);
      }
    }
  })();
  return jobStatus(name);
}

function getSafe(name) {
  const all = config.get().sites;
  return Object.hasOwn(all, name) ? all[name] : null;
}

/** POST /.autonode/deploy/<site> — from GitHub webhooks or GitHub Actions. */
export async function handleHook(req, res) {
  let name = '';
  try {
    name = decodeURIComponent(req.url.split('?')[0].split('/')[3] || '');
  } catch {}
  const site = getSafe(name);
  if (req.method !== 'POST' || !site?.git?.webhookSecret) return sendJson(res, 404, { error: 'not found' });
  let body;
  try {
    body = await readBody(req, 5 * 1024 * 1024);
  } catch {
    return sendJson(res, 413, { error: 'too large' });
  }
  const secret = site.git.webhookSecret;
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!(sig && eq(sig, expected)) && !(bearer && eq(bearer, secret))) return sendJson(res, 401, { error: 'bad signature' });

  const event = req.headers['x-github-event'];
  if (event === 'ping') return sendJson(res, 200, { ok: true, message: 'pong' });
  if (event === 'push') {
    try {
      const ref = JSON.parse(body.toString('utf8')).ref;
      if (ref && ref !== `refs/heads/${site.git.branch}`) return sendJson(res, 200, { ok: true, skipped: `push to ${ref}` });
    } catch {}
  }
  deploy(name, { reason: event ? `GitHub ${event}` : 'GitHub Actions' });
  sendJson(res, 202, { ok: true, message: 'Deploy started' });
}

export function workflowYaml(site, baseUrl) {
  const branch = site.git?.branch || 'main';
  return `# .github/workflows/deploy.yml
# Tests your code on GitHub, then tells AutoNode to deploy it.
# Add a repository secret named AUTONODE_DEPLOY_TOKEN (Settings → Secrets and variables → Actions).
name: Deploy

on:
  push:
    branches: [${branch}]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test --if-present
      - run: npm run build --if-present

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to AutoNode
        run: |
          curl --fail --silent --show-error -X POST \\
            -H "Authorization: Bearer \${{ secrets.AUTONODE_DEPLOY_TOKEN }}" \\
            ${baseUrl}/.autonode/deploy/${site.name}
`;
}

let timer = null;
export function startAutoUpdates() {
  if (timer) return;
  timer = setInterval(async () => {
    for (const site of Object.values(config.get().sites)) {
      const g = site.git;
      if (!g?.autoUpdate || jobs.get(site.name)?.running) continue;
      const last = g.lastCheck ? new Date(g.lastCheck).getTime() : 0;
      if (Date.now() - last < g.interval * 60_000) continue;
      try {
        const r = await checkForUpdates(site.name);
        if (!r.upToDate) deploy(site.name, { reason: 'auto-update' });
      } catch (err) {
        console.error(`[auto-update] ${site.name}: ${err.message}`);
      }
    }
  }, 60_000);
  timer.unref();
}
