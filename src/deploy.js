/**
 * GitHub deployments: connect a repository, check for new commits, pull +
 * install + build + restart, deploy webhooks and periodic auto-updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as config from './config.js';
import { getSite, siteDir, siteKind, runInSite, restartSite, newSecret, fixOwnership } from './sites.js';
import * as rust from './rust.js';
import { siteUser } from './runner.js';
import { matcher, lockedFiles, addLocks } from './locks.js';
import * as snapshots from './snapshots.js';
import * as history from './history.js';
import * as activity from './activity.js';
import { run, which, HttpError, LineBuffer, readBody, sendJson } from './util.js';

const jobs = new Map(); // name -> { running, log, startedAt, finishedAt, ok, error, again }

function gitEnv(site) {
  // Minimal environment: git runs as the site user and shouldn't see the root daemon's variables.
  const base = config.DEV ? process.env : { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: process.env.LANG || 'C.UTF-8' };
  const env = { ...base, GIT_TERMINAL_PROMPT: '0', HOME: config.paths.homeDir };
  if (site.git?.token) {
    const basic = Buffer.from(`x-access-token:${site.git.token}`).toString('base64');
    Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}` });
  }
  return env;
}

async function git(site, args, onData, input) {
  const ids = await siteUser();
  // core.fileMode=false: permission changes (chown/chmod by AutoNode) are not edits.
  const r = await run('git', ['-c', 'core.fileMode=false', ...args], { cwd: siteDir(site.name), env: gitEnv(site), uid: ids?.uid, gid: ids?.gid, onData, input, timeout: 10 * 60_000 });
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

/* ------------------------------------------------------ update safety check */

const zsplit = (s) => s.split('\0').filter(Boolean);

/** path -> blob hash for every file in a commit. */
async function treeHashes(site, rev) {
  const map = new Map();
  for (const entry of zsplit(await git(site, ['ls-tree', '-r', '-z', rev]))) {
    const tab = entry.indexOf('\t');
    const [, type, hash] = entry.slice(0, tab).split(' ');
    if (type === 'blob') map.set(entry.slice(tab + 1), hash);
  }
  return map;
}

/** Git blob hashes of files on disk (same hashing git uses, so equal content ⇒ equal hash). */
async function diskHashes(site, paths) {
  if (!paths.length) return new Map();
  const out = (await git(site, ['hash-object', '--stdin-paths'], undefined, paths.join('\n') + '\n')).split('\n');
  return new Map(paths.map((p, i) => [p, out[i]?.trim()]));
}

/**
 * True only for a regular file reached without passing through any symlink.
 * We run as root, and the repo or the website can plant symlinks (e.g. "data" → /etc),
 * so anything else must never be copied in or out.
 */
export function plainFile(site, rel) {
  const parts = String(rel).split('/');
  if (!rel || parts.some((p) => !p || p === '.' || p === '..')) return false;
  let cur = siteDir(site.name);
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    let st;
    try {
      st = fs.lstatSync(cur);
    } catch {
      return false;
    }
    if (st.isSymbolicLink()) return false;
    if (i < parts.length - 1 ? !st.isDirectory() : !st.isFile()) return false;
  }
  return true;
}
const isFile = plainFile;

const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0; // undefined on Windows (dev only)

/** Copy a file without following a symlink at either end. */
export function copyNoFollow(from, to) {
  const src = fs.openSync(from, fs.constants.O_RDONLY | O_NOFOLLOW);
  try {
    const dst = fs.openSync(to, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | O_NOFOLLOW, fs.fstatSync(src).mode & 0o777);
    try {
      const buf = Buffer.allocUnsafe(1 << 20);
      let n;
      while ((n = fs.readSync(src, buf, 0, buf.length, null)) > 0) fs.writeSync(dst, buf, 0, n);
    } finally {
      fs.closeSync(dst);
    }
  } finally {
    fs.closeSync(src);
  }
}

/** Make the folders leading to rel real folders inside the site (replacing any symlink or file in the way). */
export function prepareTarget(site, rel) {
  const parts = rel.split('/');
  let cur = siteDir(site.name);
  for (let i = 0; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    let st = null;
    try {
      st = fs.lstatSync(cur);
    } catch {}
    const last = i === parts.length - 1;
    if (st && (st.isSymbolicLink() || (last ? st.isDirectory() : !st.isDirectory()))) {
      fs.rmSync(cur, { recursive: true, force: true }); // rm never follows symlinks
      st = null;
    }
    if (!st && !last) fs.mkdirSync(cur);
  }
  return cur;
}

/**
 * Work out what `git reset --hard FETCH_HEAD` would destroy. Call after fetch.
 *
 *   conflicts — website data the update would overwrite:
 *     • "changed": a repo file the website modified, still in the new version
 *     • "created": a file the website made, at a path the new version adds
 *   preserve — repo files the website modified that the new version removes
 *     (typically a database moved into .gitignore): kept automatically.
 *
 * Files the website made that aren't in the repo are untouched by reset, so
 * they are never listed. Identical content is never a conflict.
 */
export async function planUpdate(site, rev = 'FETCH_HEAD') {
  const incoming = await treeHashes(site, rev);
  let tracked = new Map();
  let modified = [];
  try {
    await git(site, ['rev-parse', '--verify', '-q', 'HEAD']);
    tracked = await treeHashes(site, 'HEAD');
    modified = zsplit(await git(site, ['diff', '--name-only', '-z', '--diff-filter=MT', 'HEAD', '--']));
  } catch {
    // First deploy into this folder: nothing is tracked yet.
  }

  const candidates = [...new Set([...modified, ...[...incoming.keys()].filter((p) => !tracked.has(p))])].filter((p) => isFile(site, p));
  const local = await diskHashes(site, candidates);
  const conflicts = [];
  const preserve = [];
  for (const p of candidates) {
    if (incoming.has(p) && local.get(p) === incoming.get(p)) continue; // update brings identical content
    if (tracked.has(p)) {
      if (incoming.has(p)) conflicts.push({ path: p, reason: 'changed' });
      else preserve.push(p);
    } else if (incoming.has(p)) conflicts.push({ path: p, reason: 'created' });
  }
  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  return { conflicts, preserve };
}

/** Copy files out of the site before an update touches them (kept for later recovery). */
function rescue(site, paths, label) {
  paths = paths.filter((p) => plainFile(site, p));
  if (!paths.length) return null;
  const top = config.paths.rescuedDir;
  fs.mkdirSync(top, { recursive: true, mode: 0o700 });
  fs.chmodSync(top, 0o700); // copies may hold database contents: root only
  const root = path.join(top, site.name);
  const dest = path.join(root, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`);
  for (const p of paths) {
    const target = path.join(dest, p);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    copyNoFollow(path.join(siteDir(site.name), p), target);
  }
  // Keep the 20 most recent rescue folders per site.
  const all = fs.readdirSync(root).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 20))) fs.rmSync(path.join(root, old), { recursive: true, force: true });
  return dest;
}

function restoreFrom(site, from, paths) {
  for (const p of paths) {
    const saved = path.join(from, p);
    if (!fs.existsSync(saved)) continue; // wasn't a plain file, so it was never copied
    copyNoFollow(saved, prepareTarget(site, p));
  }
}

/** Install step: custom command, else the Node package manager (Rust sites fetch crates while building). */
export function pickInstall(site) {
  if (site.installCommand) return site.installCommand;
  const dir = siteDir(site.name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) return null;
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) && which('pnpm')) return 'pnpm install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'yarn.lock')) && which('yarn')) return 'yarn install --frozen-lockfile';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm ci --no-audit --no-fund';
  return 'npm install --no-audit --no-fund';
}

/** Build step: custom command, else `cargo build --release` for Rust, else `npm run build` if package.json has one. */
export function pickBuild(site) {
  if (site.buildCommand) return site.buildCommand;
  if (siteKind(site) === 'rust') return rust.buildCommand(siteDir(site.name));
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
export function deploy(name, { reason = 'manual', pull = true, resolve = null, ref = null, by = 'you' } = {}) {
  const site = getSite(name);
  if (ref != null && !/^[0-9a-f]{7,40}$/i.test(String(ref))) throw new HttpError(400, 'That is not a commit id.');
  const existing = jobs.get(name);
  if (existing?.running) {
    existing.again = true;
    return jobStatus(name);
  }
  const job = { id: Date.now().toString(36), running: true, log: new LineBuffer(5000), startedAt: new Date().toISOString(), finishedAt: null, ok: null, error: null, kind: pull && site.git ? 'deploy' : 'build', snapshot: null, from: null };
  jobs.set(name, job);
  const say = (t) => job.log.push(t);
  const stamp = () => new Date().toLocaleTimeString();
  (async () => {
    try {
      say(`[${stamp()}] Starting (${reason})\n`);
      if (pull && site.git) {
        await fixOwnership(siteDir(name));
        say(`[${stamp()}] Downloading ${ref ? `commit ${ref}` : 'latest code'} from ${site.git.repo.replace(/\.git$/, '')} (${site.git.branch})…\n`);
        await ensureRepo(site, say);
        await git(site, ['fetch', '--depth', '50', 'origin', site.git.branch], say);
        job.from = await headInfo(site);
        let target = 'FETCH_HEAD';
        if (ref) {
          // GitHub serves any reachable commit by id; fall back to the local history.
          await git(site, ['fetch', '--depth', '50', 'origin', ref], say).catch(() => {});
          try {
            target = await git(site, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
          } catch {
            throw new HttpError(404, `Commit ${ref} isn't available any more.`);
          }
        }

        // Safety check: never silently overwrite data the website wrote.
        say(`[${stamp()}] Checking for website data the update would overwrite…\n`);
        const plan = await planUpdate(site, target);
        const locks = getSite(name).locks || [];
        const locked = matcher(locks);
        const blocking = plan.conflicts.filter((c) => !locked(c.path));
        if (blocking.length && !resolve) {
          config.update((c) => {
            if (c.sites[name]?.git) c.sites[name].git.blocked = { at: new Date().toISOString(), files: blocking };
          });
          const list = blocking.map((c) => `  • ${c.path} (${c.reason === 'changed' ? 'changed on the server' : 'created by the website'})`).join('\n');
          say(`\n${list}\n`);
          throw new HttpError(409, `Update paused: it would overwrite ${blocking.length} file${blocking.length === 1 ? '' : 's'} the website changed on the server. Choose what to keep on the GitHub tab.`);
        }
        // Locked files are always kept exactly as they are on the server (even if the update deletes them).
        let keepNow = [...plan.preserve, ...lockedFiles(name, locks)];
        if (resolve === 'keep') {
          keepNow.push(...blocking.map((c) => c.path));
          addLocks(
            name,
            blocking.map((c) => c.path),
          ); // remember: lock them for future updates
          say(`[${stamp()}] Locked for future updates: ${blocking.map((c) => c.path).join(', ')}\n`);
        }
        keepNow = [...new Set(keepNow)].filter((p) => isFile(site, p));
        const overwrite = resolve === 'overwrite' ? blocking.map((c) => c.path) : [];
        const saved = rescue(site, [...keepNow, ...overwrite], resolve === 'overwrite' ? 'overwritten' : 'kept');
        if (saved) say(`[${stamp()}] Saved a copy of ${keepNow.length + overwrite.length} file(s) to ${saved}\n`);

        // Snapshot of the folder as it is now, so this deploy can be undone in one click.
        try {
          const snap = await snapshots.create(name, { reason: `before deploy (${reason})`, commit: job.from });
          if (snap) {
            job.snapshot = snap.id;
            say(`[${stamp()}] Snapshot saved (${snap.id}) — you can roll back to it from the Deploys tab.\n`);
          }
        } catch (err) {
          say(`[${stamp()}] ⚠ Couldn't take a snapshot first: ${err.message}\n`);
        }

        await git(site, ['reset', '--hard', target], say);
        if (ref) {
          config.update((c) => {
            if (c.sites[name]?.git) c.sites[name].git.autoUpdate = false;
          });
          say(`[${stamp()}] Automatic updates were paused so this older version stays. Turn them back on when you're ready.\n`);
        }
        if (keepNow.length) {
          restoreFrom(site, saved, keepNow);
          say(`[${stamp()}] Kept the server version of: ${keepNow.join(', ')}\n`);
        }
        if (overwrite.length) say(`[${stamp()}] Replaced with the GitHub version (old copies saved above): ${overwrite.join(', ')}\n`);
        await fixOwnership(siteDir(name));
        config.update((c) => {
          if (c.sites[name]?.git) c.sites[name].git.blocked = null;
        });
      }
      // Rust sites: install the build tools and Rust itself the first time (quick once they are there).
      if (siteKind(site) === 'rust') {
        await rust.ensureToolchain({ say, ids: await siteUser() });
      }
      const install = pickInstall(site);
      if (install) {
        say(`\n[${stamp()}] Installing packages…\n`);
        await runInSite(name, install, say);
      }
      const build = pickBuild(site);
      const cargoBuild = !site.buildCommand && siteKind(site) === 'rust';
      if (build) {
        say(`\n[${stamp()}] ${cargoBuild ? 'Building with cargo (the first build can take several minutes)…' : 'Building…'}\n`);
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
      // Record everything first, then report "finished", so readers never see a stale history.
      job.finishedAt = new Date().toISOString();
      const head = getSafe(name)?.git ? await headInfo(getSite(name)).catch(() => null) : null;
      config.update((c) => {
        const s = c.sites[name];
        if (!s?.git) return;
        s.git.lastDeploy = { at: job.finishedAt, ok: job.ok, error: job.error, reason, commit: head };
        if (job.ok) {
          s.git.lastCommit = head;
          s.git.behind = 0;
        }
      });
      if (getSafe(name)) {
        try {
          history.add(
            name,
            { id: job.id, kind: job.kind, reason, by, at: job.startedAt, finishedAt: job.finishedAt, durationMs: Date.parse(job.finishedAt) - Date.parse(job.startedAt), ok: job.ok, error: job.error, commit: job.kind === 'deploy' ? head : null, from: job.from, ref, snapshot: job.snapshot },
            job.log.text(),
          );
        } catch (err) {
          console.error('[history]', err.message);
        }
        if (by !== 'you') activity.record({ action: job.ok ? 'Deployed' : 'Deploy failed', site: name, detail: job.ok ? (head ? `${head.hash} ${head.subject}` : reason) : job.error, ok: !!job.ok, by });
      }
      job.running = false;
      if (job.again) {
        job.again = false;
        setTimeout(() => deploy(name, { reason: 'queued', by: 'system' }), 500);
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
  const secret = site.git.webhookSecret;
  const sig = String(req.headers['x-hub-signature-256'] || '');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  // Compare bytes (timingSafeEqual throws on different byte lengths, e.g. non-ASCII input).
  const eq = (a, b) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  // This is on the public ports: never buffer a body for anonymous requests.
  if (!sig && !bearer) {
    req.resume();
    return sendJson(res, 401, { error: 'missing signature' });
  }
  if (bearer && !sig && !eq(bearer, secret)) {
    req.resume();
    return sendJson(res, 401, { error: 'bad signature' });
  }
  let body;
  try {
    body = await readBody(req, 5 * 1024 * 1024);
  } catch {
    return sendJson(res, 413, { error: 'too large' });
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (!(sig && eq(sig, expected)) && !(bearer && eq(bearer, secret))) return sendJson(res, 401, { error: 'bad signature' });

  const event = req.headers['x-github-event'];
  if (event === 'ping') return sendJson(res, 200, { ok: true, message: 'pong' });
  if (event === 'push') {
    try {
      const ref = JSON.parse(body.toString('utf8')).ref;
      if (ref && ref !== `refs/heads/${site.git.branch}`) return sendJson(res, 200, { ok: true, skipped: `push to ${ref}` });
    } catch {}
  }
  deploy(name, { reason: event ? `GitHub ${event}` : 'GitHub Actions', by: 'GitHub' });
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
let checking = false;
export function startAutoUpdates() {
  if (timer) return;
  timer = setInterval(async () => {
    // A slow fetch can outlast the minute; a second pass would run git in the same folder at once.
    if (checking) return;
    checking = true;
    try {
      await autoUpdatePass();
    } finally {
      checking = false;
    }
  }, 60_000);
  timer.unref();
}

async function autoUpdatePass() {
  for (const site of Object.values(config.get().sites)) {
    const g = site.git;
    if (!g?.autoUpdate || g.blocked || jobs.get(site.name)?.running) continue; // blocked: waits for you to choose
    const last = g.lastCheck ? new Date(g.lastCheck).getTime() : 0;
    if (Date.now() - last < g.interval * 60_000) continue;
    try {
      const r = await checkForUpdates(site.name);
      // A deploy may have started (button, webhook) while we were fetching.
      if (!r.upToDate && !jobs.get(site.name)?.running) deploy(site.name, { reason: 'auto-update', by: 'auto-update' });
    } catch (err) {
      console.error(`[auto-update] ${site.name}: ${err.message}`);
    }
  }
}
