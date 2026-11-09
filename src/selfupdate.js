/** Keeps AutoNode itself up to date from its GitHub repository. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as config from './config.js';
import { run, which, HttpError } from './util.js';

const git = async (args) => {
  const r = await run('git', ['-C', config.APP_ROOT, ...args], { quiet: true, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.code !== 0) throw new HttpError(500, (r.stderr || r.stdout).trim() || `git ${args[0]} failed`);
  return r.stdout.trim();
};

export function isGitInstall() {
  return !!which('git') && fs.existsSync(path.join(config.APP_ROOT, '.git'));
}

export async function check() {
  const info = { version: config.pkg.version, gitInstall: isGitInstall(), upToDate: true, commits: [], latestVersion: config.pkg.version };
  if (!info.gitInstall) return info;
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'main';
  await git(['fetch', '-q', 'origin', branch]);
  const local = await git(['rev-parse', 'HEAD']);
  const remote = await git(['rev-parse', 'FETCH_HEAD']);
  info.branch = branch;
  info.current = local.slice(0, 7);
  info.upToDate = local === remote;
  if (!info.upToDate) {
    const out = await git(['log', '--format=%h%x09%s%x09%cI', '-n', '30', `${local}..FETCH_HEAD`]).catch(() => '');
    info.commits = out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, subject, date] = l.split('\t');
        return { hash, subject, date };
      });
    try {
      info.latestVersion = JSON.parse(await git(['show', 'FETCH_HEAD:package.json'])).version;
    } catch {}
  }
  config.update((c) => {
    c.selfUpdate.lastCheck = new Date().toISOString();
  });
  return info;
}

/** Pull the new version and restart the service. */
export async function apply() {
  if (!isGitInstall()) throw new HttpError(400, 'AutoNode was not installed from git, so it cannot update itself. Re-run the installer.');
  const status = await git(['status', '--porcelain', '--untracked-files=no']);
  if (status) throw new HttpError(409, 'AutoNode files were modified locally, so the update was stopped to keep your changes safe.');
  const before = await git(['rev-parse', 'HEAD']);
  await git(['pull', '--ff-only', '-q']);
  const after = await git(['rev-parse', 'HEAD']);
  scheduleRestart();
  return { updated: before !== after };
}

export function scheduleRestart() {
  setTimeout(() => {
    if (!config.DEV && which('systemctl')) {
      spawn('systemctl', ['restart', 'autonode'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      console.log('[update] Restart AutoNode to finish updating.');
    }
  }, 800);
}

let timer = null;
export function startAutoCheck() {
  if (timer) return;
  timer = setInterval(async () => {
    const c = config.get().selfUpdate;
    if (!c.auto) return;
    const last = c.lastCheck ? new Date(c.lastCheck).getTime() : 0;
    if (Date.now() - last < 24 * 3600_000) return;
    try {
      const r = await check();
      if (!r.upToDate) await apply();
    } catch (err) {
      console.error(`[self-update] ${err.message}`);
    }
  }, 30 * 60_000);
  timer.unref();
}
