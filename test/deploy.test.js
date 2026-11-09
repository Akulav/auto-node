// Update safety: GitHub updates must never destroy data the website wrote.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-deploy-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const { which } = await import('../src/util.js');
const HAS_GIT = !!which('git');

const config = await import('../src/config.js');
const sites = await import('../src/sites.js');
const deploy = await import('../src/deploy.js');
const locks = await import('../src/locks.js');
const runner = await import('../src/runner.js');

const remote = path.join(tmp, 'remote.git');
const work = path.join(tmp, 'work');
const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, stdio: 'pipe' }).toString();
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const read = (rel) => fs.readFileSync(path.join(sites.siteDir('app'), rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(sites.siteDir('app'), rel));
/** Commit files (null = delete) in the work clone and push. */
function push(changes, msg) {
  for (const [rel, text] of Object.entries(changes)) {
    if (text === null) g(work, 'rm', '-q', '-r', rel);
    else write(work, rel, text);
  }
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', msg);
  g(work, 'push', '-q', 'origin', 'main');
}
async function runDeploy(opts) {
  deploy.deploy('app', opts);
  for (let i = 0; i < 400 && deploy.jobStatus('app').running; i++) await new Promise((r) => setTimeout(r, 25));
  return deploy.jobStatus('app');
}

before(async () => {
  config.load();
  if (!HAS_GIT) return;
  g(tmp, 'init', '-q', '--bare', remote);
  g(tmp, 'clone', '-q', remote, work);
  g(work, 'checkout', '-q', '-b', 'main');
  push({ 'server.js': 'v1', 'db.sqlite': 'seed', 'config.json': '{}', 'data/seed.json': 'seed' }, 'initial');
  await sites.createSite({ name: 'app', template: 'empty' });
  await sites.updateSite('app', { startCommand: 'node -e 0' });
  config.update((c) => {
    c.sites.app.git = { repo: remote, branch: 'main', token: null, autoUpdate: false, interval: 5, webhookSecret: 'x' };
  });
});
after(async () => {
  await runner.stopAllChildren();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('lock patterns', () => {
  const m = locks.matcher(['db.sqlite', 'data/', '*.log', 'storage/**.json']);
  for (const p of ['db.sqlite', 'data/x.json', 'data/a/b', 'logs/app.log', 'app.log', 'storage/a/b.json', 'storage/b.json']) assert.ok(m(p), p);
  for (const p of ['db.sqlite3', 'database/x', 'server.js', 'other/storage/b.json']) assert.ok(!m(p), p);
  assert.equal(locks.normalizeLock('/data//'), 'data/');
  assert.throws(() => locks.normalizeLock('../etc/passwd'), /inside the website/);
  assert.throws(() => locks.normalizeLock('node_modules/x'), /cannot be locked/);
});

test('first deploy works', { skip: !HAS_GIT && 'git not installed' }, async () => {
  const j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('db.sqlite'), 'seed');
});

test('update is paused when it would overwrite a repo file the website changed', { skip: !HAS_GIT && 'git not installed' }, async () => {
  write(sites.siteDir('app'), 'db.sqlite', 'LIVE DATA'); // the website writes to a committed database
  push({ 'server.js': 'v2' }, 'code change');
  const j = await runDeploy();
  assert.equal(j.ok, false);
  assert.match(j.error, /Update paused/);
  assert.equal(read('db.sqlite'), 'LIVE DATA', 'data must be untouched');
  assert.equal(read('server.js'), 'v1', 'nothing changes while paused');
  assert.deepEqual(sites.getSite('app').git.blocked.files, [{ path: 'db.sqlite', reason: 'changed' }]);
});

test('"keep server versions" updates code, keeps data and locks the file', { skip: !HAS_GIT && 'git not installed' }, async () => {
  const j = await runDeploy({ resolve: 'keep' });
  assert.equal(j.ok, true, j.log);
  assert.equal(read('server.js'), 'v2');
  assert.equal(read('db.sqlite'), 'LIVE DATA');
  assert.ok(sites.getSite('app').locks.includes('db.sqlite'));
  assert.equal(sites.getSite('app').git.blocked, null);
});

test('locked files survive upstream edits and deletions', { skip: !HAS_GIT && 'git not installed' }, async () => {
  push({ 'db.sqlite': 'new seed from repo', 'server.js': 'v3' }, 'repo edits db');
  let j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('db.sqlite'), 'LIVE DATA');
  assert.equal(read('server.js'), 'v3');

  push({ 'db.sqlite': null }, 'repo deletes db');
  j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('db.sqlite'), 'LIVE DATA');
});

test('files the website made that are not in the repo are kept, no pause', { skip: !HAS_GIT && 'git not installed' }, async () => {
  write(sites.siteDir('app'), 'uploads/photo.png', 'PNG');
  write(sites.siteDir('app'), 'cache.db', 'cache');
  push({ 'server.js': 'v4' }, 'more code');
  const j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('uploads/photo.png'), 'PNG');
  assert.equal(read('cache.db'), 'cache');
});

test('a changed repo file that the update removes is kept automatically', { skip: !HAS_GIT && 'git not installed' }, async () => {
  write(sites.siteDir('app'), 'config.json', '{"saved":true}');
  push({ 'config.json': null }, 'stop tracking config');
  const j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('config.json'), '{"saved":true}');
});

test('a website-made file at a path the update adds pauses; "use GitHub" replaces it and saves a copy', { skip: !HAS_GIT && 'git not installed' }, async () => {
  write(sites.siteDir('app'), 'notes.txt', 'website notes');
  push({ 'notes.txt': 'repo notes' }, 'add notes');
  let j = await runDeploy();
  assert.equal(j.ok, false);
  assert.deepEqual(sites.getSite('app').git.blocked.files, [{ path: 'notes.txt', reason: 'created' }]);
  assert.equal(read('notes.txt'), 'website notes');

  j = await runDeploy({ resolve: 'overwrite' });
  assert.equal(j.ok, true, j.log);
  assert.equal(read('notes.txt'), 'repo notes');
  const rescued = path.join(config.paths.dataDir, 'rescued', 'app');
  const copies = fs.readdirSync(rescued).filter((d) => d.endsWith('overwritten'));
  assert.equal(fs.readFileSync(path.join(rescued, copies.at(-1), 'notes.txt'), 'utf8'), 'website notes');
});

test('a symlink the repo puts over a locked file is replaced, never written through', { skip: (!HAS_GIT && 'git not installed') || (process.platform === 'win32' && 'git on Windows checks out symlinks as plain files') }, async () => {
  const outside = path.join(tmp, 'outside-target.txt');
  fs.writeFileSync(outside, 'must not change');
  // Repo replaces the locked db.sqlite with a symlink pointing outside the site.
  fs.rmSync(path.join(work, 'db.sqlite'), { force: true });
  fs.symlinkSync(outside, path.join(work, 'db.sqlite'));
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'evil symlink');
  g(work, 'push', '-q', 'origin', 'main');
  write(sites.siteDir('app'), 'db.sqlite', 'LIVE DATA');
  const j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'must not change');
  assert.equal(fs.lstatSync(path.join(sites.siteDir('app'), 'db.sqlite')).isSymbolicLink(), false);
  assert.equal(read('db.sqlite'), 'LIVE DATA');
});

test('identical content never pauses; manual folder locks protect whole folders', { skip: !HAS_GIT && 'git not installed' }, async () => {
  write(sites.siteDir('app'), 'same.txt', 'same');
  push({ 'same.txt': 'same' }, 'same content');
  let j = await runDeploy();
  assert.equal(j.ok, true, j.log);

  locks.addLocks('app', 'data/');
  write(sites.siteDir('app'), 'data/seed.json', 'edited by site');
  write(sites.siteDir('app'), 'data/new.json', 'new');
  push({ 'data/seed.json': null, 'server.js': 'v5' }, 'remove data dir');
  j = await runDeploy();
  assert.equal(j.ok, true, j.log);
  assert.equal(read('data/seed.json'), 'edited by site');
  assert.ok(exists('data/new.json'));
  assert.equal(read('server.js'), 'v5');
});
