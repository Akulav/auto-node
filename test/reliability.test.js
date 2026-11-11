import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated dev-mode sandbox — never touches /etc or /var.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-rel-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const auth = await import('../src/auth.js');
const settings = await import('../src/settings.js');
const files = await import('../src/files.js');
const sites = await import('../src/sites.js');
const { writeFileAtomic, readJsonFile, which } = await import('../src/util.js');
const { handler } = await import('../src/server.js');

before(() => config.load());
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake request/response pair for the dashboard handler. */
function call({ method = 'GET', url = '/api/session', ip = '192.168.1.5', encrypted = false, headers = {} } = {}) {
  const res = {
    status: 0,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    writeHead(s, h = {}) {
      this.status = s;
      for (const [k, v] of Object.entries(h)) this.headers[k.toLowerCase()] = v;
      this.headersSent = true;
    },
    end(b = '') {
      this.body += b;
    },
  };
  // Only bodiless requests (GET, or ones refused before the body is read) are used here.
  const req = { method, url, headers: { host: 'x', ...headers }, socket: { remoteAddress: ip, encrypted }, on() {}, resume() {} };
  return { req, res, done: handler(req, res).then(() => res) };
}

test('atomic writes replace a file in one step and leave no temp files', () => {
  const file = path.join(tmp, 'atomic.json');
  writeFileAtomic(file, '{"a":1}');
  writeFileAtomic(file, '{"a":2}');
  assert.deepEqual(readJsonFile(file, null), { a: 2 });
  assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.startsWith('atomic.json.')), []);
  assert.equal(readJsonFile(path.join(tmp, 'missing.json'), 'fallback'), 'fallback');
});

test('a failed config change is rolled back in memory too', () => {
  const before = config.get().proxy.redirectHttps;
  assert.throws(() =>
    config.update((c) => {
      c.proxy.redirectHttps = !before;
      throw new Error('boom');
    }),
  );
  assert.equal(config.get().proxy.redirectHttps, before);
});

test('a damaged config.json is recovered from the last good copy', () => {
  config.update((c) => (c.selfUpdate.auto = true));
  config.update((c) => (c.selfUpdate.lastCheck = 'kept')); // the previous file becomes config.json.bak
  fs.writeFileSync(config.paths.configFile, '{"half": tr'); // e.g. a power cut on an old version
  const s = config.load();
  assert.equal(s.selfUpdate.auto, true);
  assert.ok(fs.readdirSync(config.paths.configDir).some((f) => f.startsWith('config.json.damaged-')), 'damaged file kept for inspection');
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(config.paths.configFile, 'utf8')));
});

test('config sections stay objects even if the file has junk in them', () => {
  fs.writeFileSync(config.paths.configFile, JSON.stringify({ dashboard: null, sites: { bad: null, ok: { name: 'other' } }, __proto__: { polluted: true } }));
  const s = config.load();
  assert.equal(typeof s.dashboard.port, 'number');
  assert.deepEqual(s.sites, {});
  assert.equal({}.polluted, undefined);
});

test('wrong passwords lock an address for longer each time; outside sign-ins pause during an attack', async () => {
  await auth.setPassword('correct horse');
  auth.resetLockouts();
  for (let i = 0; i < 5; i++) assert.equal(await auth.verifyPassword('nope', '203.0.113.9'), false);
  await assert.rejects(auth.verifyPassword('correct horse', '203.0.113.9'), /1 minute/);
  // Many outside addresses: outside sign-ins pause, home ones don't.
  auth.resetLockouts();
  for (let i = 0; i < 30; i++) await auth.verifyPassword('nope', `198.51.100.${i}`);
  await assert.rejects(auth.verifyPassword('correct horse', '198.51.100.200'), /paused/);
  assert.equal(await auth.verifyPassword('correct horse', '192.168.1.20'), true);
  auth.resetLockouts();
});

test('sign out everywhere invalidates existing sessions', () => {
  const cookie = auth.createSessionCookie(false).split(';')[0];
  assert.equal(auth.isAuthenticated({ headers: { cookie } }), true);
  auth.revokeAllSessions();
  assert.equal(auth.isAuthenticated({ headers: { cookie } }), false);
});

test('remote access needs HTTPS, and turning HTTPS off turns it off', async () => {
  config.update((c) => (c.dashboard.https = false));
  assert.throws(() => settings.setRemoteAccess(true), /HTTPS/);
  config.update((c) => (c.dashboard.https = true));
  assert.deepEqual(settings.setRemoteAccess(true), { enabled: true });
  const r = await settings.updateSettings({ dashboardHttps: false });
  assert.equal(r.remoteTurnedOff, true);
  assert.equal(config.get().dashboard.allowPublic, false);
});

test('the dashboard refuses the internet unless remote access is on, and then only over HTTPS', async () => {
  config.update((c) => {
    c.dashboard.allowPublic = false;
    c.dashboard.https = true;
  });
  let res = await call({ ip: '8.8.8.8', encrypted: true }).done;
  assert.equal(res.status, 403);
  assert.match(res.body, /local network/);

  config.update((c) => (c.dashboard.allowPublic = true));
  res = await call({ ip: '8.8.8.8', encrypted: false }).done;
  assert.equal(res.status, 403, 'never over plain HTTP');
  res = await call({ ip: '8.8.8.8', encrypted: true }).done;
  assert.equal(res.status, 200);
  const session = JSON.parse(res.body);
  assert.equal(session.hostname, null, 'strangers learn nothing about the computer');
  assert.equal(session.version, null);
  assert.ok(res.headers['strict-transport-security']);

  res = await call({ ip: '192.168.1.5' }).done;
  assert.equal(JSON.parse(res.body).hostname, os.hostname());
  config.update((c) => (c.dashboard.allowPublic = false));
});

test('cross-site requests are blocked even without an Origin header', async () => {
  const res = await call({ method: 'POST', url: '/api/logout', headers: { 'sec-fetch-site': 'cross-site' } }).done;
  assert.equal(res.status, 403);
});

test('editing a file never writes through a symlink planted in its place', async () => {
  const site = await sites.createSite({ name: 'linky', template: 'empty' });
  const dir = sites.siteDir(site.name);
  const outside = path.join(tmp, 'outside.txt');
  fs.writeFileSync(outside, 'secret');
  try {
    fs.symlinkSync(outside, path.join(dir, 'link.txt'));
  } catch {
    return; // no symlink permission (Windows without developer mode)
  }
  await assert.rejects(async () => files.readText('linky', '/link.txt'), /Invalid path/);
  await assert.rejects(async () => files.writeText('linky', '/link.txt', 'new'), /Invalid path/);
  await assert.rejects(async () => files.downloadStream('linky', '/link.txt'), /Invalid path/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'secret');
  // A planted file at an old-style fixed temp name is never written through either.
  fs.writeFileSync(path.join(dir, 'page.html'), 'old');
  try {
    fs.symlinkSync(outside, path.join(dir, 'page.html.autonode-upload'));
  } catch {}
  await files.writeText('linky', '/page.html', 'new');
  assert.equal(fs.readFileSync(path.join(dir, 'page.html'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'secret');
});

test('snapshot pruning keeps the newest ones, even several taken in the same second', { skip: !which('tar') && 'tar not installed' }, async () => {
  const snapshots = await import('../src/snapshots.js');
  await sites.createSite({ name: 'snappy', template: 'starter' });
  config.update((c) => (c.snapshots.keep = 2));
  try {
    const made = [];
    for (let i = 0; i < 6; i++) made.push((await snapshots.create('snappy', { reason: `n${i}` })).id);
    assert.deepEqual(snapshots.list('snappy').map((s) => s.id), [made[5], made[4]]);
  } finally {
    config.update((c) => (c.snapshots.keep = 5));
  }
});

test('activity keeps 30 days and can be cleared up to a date', async () => {
  const activity = await import('../src/activity.js');
  const day = 86400_000;
  const at = (daysAgo) => new Date(Date.now() - daysAgo * day).toISOString();
  const line = (daysAgo, action) => JSON.stringify({ at: at(daysAgo), action, ok: true, by: 'system' });
  fs.writeFileSync(config.paths.activityFile + '.1', line(40, 'ancient') + '\n' + line(10, 'ten days') + '\n');
  fs.writeFileSync(config.paths.activityFile, line(3, 'three days') + '\nnot json\n' + line(0, 'today') + '\n');

  // Older than 30 days is never shown, even before it is pruned.
  assert.deepEqual(activity.list().map((e) => e.action), ['today', 'three days', 'ten days']);

  assert.equal(activity.prune(), 2, 'the 40-day-old entry and the damaged line');
  assert.equal(fs.existsSync(config.paths.activityFile + '.1'), false);
  assert.equal(activity.prune(at(5)), 1);
  assert.deepEqual(activity.list().map((e) => e.action), ['today', 'three days']);
  assert.throws(() => activity.prune('not a date'), /valid date/);
});

test('saving a file keeps its permissions and leaves no temp files', async () => {
  await sites.createSite({ name: 'modes', template: 'empty' });
  const dir = sites.siteDir('modes');
  fs.writeFileSync(path.join(dir, 'run.sh'), 'echo hi', { mode: 0o755 });
  await files.writeText('modes', '/run.sh', 'echo bye');
  assert.equal(fs.readFileSync(path.join(dir, 'run.sh'), 'utf8'), 'echo bye');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'run.sh')).mode & 0o777, 0o755);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('autonode-tmp')), []);
});

test('dashboard files are compressed, revalidated with an ETag, and never served from outside public/', async () => {
  const first = await call({ url: '/app.js', headers: { 'accept-encoding': 'gzip, br' } }).done;
  assert.equal(first.status, 200);
  assert.equal(first.headers['content-encoding'], 'gzip');
  assert.equal(first.headers['cache-control'], 'no-cache');
  assert.ok(first.headers.etag);
  const again = await call({ url: '/app.js', headers: { 'if-none-match': first.headers.etag } }).done;
  assert.equal(again.status, 304);
  const plain = await call({ url: '/app.js' }).done;
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.match(plain.body, /function/);
  assert.equal((await call({ url: '/some/page' }).done).headers['content-type'], 'text/html; charset=utf-8'); // app routes get index.html
  assert.equal((await call({ url: '/missing.js' }).done).status, 404);
  assert.notEqual((await call({ url: '/%2e%2e/package.json' }).done).status, 200);
});

test('folder sizes are counted without blocking, cached and shared', async () => {
  const dir = path.join(tmp, 'sized');
  fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'one.txt'), 'x'.repeat(100));
  fs.writeFileSync(path.join(dir, 'a', 'b', 'two.txt'), 'y'.repeat(50));
  assert.equal(await files.folderSizeAsync(dir), files.folderSize(dir));
  assert.equal(await files.cachedFolderSize(dir), 150);
  fs.writeFileSync(path.join(dir, 'three.txt'), 'z'.repeat(10));
  assert.equal(await files.cachedFolderSize(dir), 150, 'a fresh cached value is reused');
  assert.equal(await files.cachedFolderSize(dir, { fresh: true }), 160);
  assert.deepEqual(await Promise.all([files.cachedFolderSize(path.join(dir, 'a')), files.cachedFolderSize(path.join(dir, 'a'))]), [50, 50], 'concurrent first callers share one walk');
});
