import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-feat-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const sites = await import('../src/sites.js');
const tasks = await import('../src/tasks.js');
const traffic = await import('../src/traffic.js');
const visitors = await import('../src/visitors.js');
const activity = await import('../src/activity.js');
const snapshots = await import('../src/snapshots.js');
const health = await import('../src/health.js');
const features = await import('../src/features.js');
const backup = await import('../src/backup.js');
const locks = await import('../src/locks.js');
const { siteEnv } = await import('../src/runner.js');
const { which } = await import('../src/util.js');

before(async () => {
  config.load();
  await sites.createSite({ name: 'shop', template: 'starter' });
  await sites.createSite({ name: 'blog', template: 'empty' });
  await sites.addHostname('shop', 'shop.com');
  await sites.addHostname('blog', 'blog.example.org');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/* ------------------------------------------------------------ data folder */

test('every site gets a DATA_DIR outside its code folder', () => {
  const env = siteEnv(sites.getSite('shop'));
  assert.equal(env.DATA_DIR, sites.siteDataDir('shop'));
  assert.ok(!env.DATA_DIR.startsWith(sites.siteDir('shop')));
  assert.ok(fs.existsSync(env.DATA_DIR));
});

/* ------------------------------------------------------------------ cron */

test('cron: parse, match and next run', () => {
  const at = (s) => new Date(s);
  assert.ok(tasks.cronMatches(tasks.parseCron('0 3 * * *'), at('2026-11-10T03:00:00')));
  assert.ok(!tasks.cronMatches(tasks.parseCron('0 3 * * *'), at('2026-11-10T03:01:00')));
  assert.ok(tasks.cronMatches(tasks.parseCron('*/15 * * * *'), at('2026-11-10T10:45:00')));
  assert.ok(tasks.cronMatches(tasks.parseCron('30 2 * * 1-5'), at('2026-11-13T02:30:00'))); // Friday
  assert.ok(!tasks.cronMatches(tasks.parseCron('30 2 * * 1-5'), at('2026-11-14T02:30:00'))); // Saturday
  assert.ok(tasks.cronMatches(tasks.parseCron('0 0 * * 7'), at('2026-11-15T00:00:00'))); // 7 = Sunday
  assert.ok(tasks.cronMatches(tasks.parseCron('@daily'), at('2026-11-15T00:00:00')));
  // Both day fields restricted: either matches (classic cron).
  assert.ok(tasks.cronMatches(tasks.parseCron('0 0 1 * 1'), at('2026-11-16T00:00:00'))); // a Monday, not the 1st
  assert.equal(tasks.nextRun('0 3 * * *', at('2026-11-10T03:00:00')).getHours(), 3);
  assert.equal(tasks.nextRun('0 3 * * *', at('2026-11-10T03:00:00')).getDate(), 11);
  for (const bad of ['', '* * * *', '61 * * * *', '* 24 * * *', 'a b c d e', '*/0 * * * *']) assert.throws(() => tasks.parseCron(bad), undefined, bad);
});

test('tasks: create, validate, run and keep output', async () => {
  const t = tasks.create('shop', { name: 'Hello', command: 'node -e "console.log(42)"', schedule: '0 3 * * *' });
  assert.throws(() => tasks.create('shop', { name: 'x', command: 'echo\nrm', schedule: '@daily' }), /single line/);
  assert.throws(() => tasks.create('shop', { name: 'x', command: 'echo', schedule: 'nope' }), /schedule/);
  tasks.run('shop', t.id, 'you');
  for (let i = 0; i < 200 && tasks.list('shop')[0].running; i++) await new Promise((r) => setTimeout(r, 25));
  const [listed] = tasks.list('shop');
  assert.equal(listed.lastRun.ok, true);
  assert.match(tasks.log('shop', t.id).output, /42/);
  assert.ok(listed.next);
  tasks.remove('shop', t.id);
  assert.equal(tasks.list('shop').length, 0);
});

/* --------------------------------------------------------------- traffic */

test('www handling and redirects', async () => {
  assert.equal(traffic.resolveHost('www.shop.com'), null, 'off by default');
  config.update((c) => (c.sites.shop.www = 'to-apex'));
  assert.equal(traffic.resolveHost('www.shop.com').redirectHost, 'shop.com');
  assert.equal(traffic.resolveHost('shop.com').redirectHost, undefined);
  config.update((c) => (c.sites.shop.www = 'to-www'));
  assert.equal(traffic.resolveHost('shop.com').redirectHost, 'www.shop.com');
  assert.equal(traffic.resolveHost('www.shop.com').site.name, 'shop');
  assert.deepEqual(traffic.publicHostnames(sites.getSite('shop')).sort(), ['shop.com', 'www.shop.com']);
  // Subdomains never get a www twin.
  config.update((c) => (c.sites.blog.www = 'to-apex'));
  assert.deepEqual(traffic.publicHostnames(sites.getSite('blog')), ['blog.example.org']);

  const s = { redirects: [{ from: '/old', to: '/new', code: 301 }, { from: '/blog/*', to: '/news/*', code: 302 }, { from: '/out', to: 'https://example.com/x', code: 301 }] };
  assert.deepEqual(traffic.matchRedirect(s, '/old', '?a=1'), { location: '/new?a=1', code: 301 });
  assert.deepEqual(traffic.matchRedirect(s, '/blog/2024/post', ''), { location: '/news/2024/post', code: 302 });
  assert.equal(traffic.matchRedirect(s, '/older', ''), null);
  assert.equal(traffic.matchRedirect(s, '/out', '').location, 'https://example.com/x');

  await assert.rejects(traffic.normalize({ redirects: [{ from: 'old', to: '/new' }] }, {}), /starting with \//);
  await assert.rejects(traffic.normalize({ redirects: [{ from: '/a*b', to: '/new' }] }, {}), /single \*/);
  await assert.rejects(traffic.normalize({ redirects: [{ from: '/a', to: 'javascript:alert(1)' }] }, {}), /must be a path/);
  await assert.rejects(traffic.normalize({ www: 'sideways' }, {}), /www/);
});

test('maintenance page escapes the site title and message', () => {
  const html = traffic.maintenancePage({ name: 'x', title: '<b>Shop</b>', maintenance: { message: '<script>alert(1)</script>' } });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&#60;b&#62;Shop'));
});

test('password protection: right, wrong, cache and lockout', async () => {
  const changes = await traffic.normalize({ access: { enabled: true, username: 'guest', password: 'secret-pw' } }, {});
  const site = { name: 'shop', ...changes };
  const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
  assert.equal(await traffic.checkAccess(site, basic('guest', 'secret-pw'), '1.1.1.1'), true);
  assert.equal(await traffic.checkAccess(site, basic('guest', 'secret-pw'), '1.1.1.1'), true); // cached path
  assert.equal(await traffic.checkAccess(site, basic('guest', 'nope'), '2.2.2.2'), false);
  assert.equal(await traffic.checkAccess(site, undefined, '2.2.2.2'), false);
  for (let i = 0; i < 10; i++) await traffic.checkAccess(site, basic('x', String(i)), '3.3.3.3');
  assert.equal(await traffic.checkAccess(site, basic('guest', 'secret-pw'), '3.3.3.3'), 'locked');
  // Turning it off keeps the hash for later but lets everyone in.
  const off = await traffic.normalize({ access: { enabled: false } }, site);
  assert.equal(await traffic.checkAccess({ ...site, ...off }, undefined, '9.9.9.9'), true);
  await assert.rejects(traffic.normalize({ access: { enabled: true, username: 'a', password: '123' } }, {}), /at least 6/);
});

/* -------------------------------------------------------------- visitors */

test('visitor stats: unique visitors, bots, pages and errors', () => {
  const ua = 'Mozilla/5.0 (Macintosh) Safari/605';
  visitors.record('blog', { status: 200, bytes: 1000, path: '/', ip: '10.0.0.1', ua });
  visitors.record('blog', { status: 200, bytes: 500, path: '/about?x=1', ip: '10.0.0.1', ua });
  visitors.record('blog', { status: 200, bytes: 100, path: '/app.js', ip: '10.0.0.1', ua });
  visitors.record('blog', { status: 200, bytes: 100, path: '/', ip: '10.0.0.2', ua });
  visitors.record('blog', { status: 500, bytes: 10, path: '/crash', ip: '10.0.0.3', ua });
  visitors.record('blog', { status: 200, bytes: 10, path: '/', ip: '66.249.0.1', ua: 'Googlebot/2.1' });
  const s = visitors.summary('blog', 7);
  assert.equal(s.today.requests, 6);
  assert.equal(s.today.visitors, 3);
  assert.equal(s.today.bots, 1);
  assert.equal(s.totals.s5, 1);
  assert.equal(s.totals.bytes, 1720);
  assert.deepEqual(s.pages.map((p) => [p.path, p.views]), [['/', 2], ['/about', 1]]); // no assets, no errors, no bots
  assert.equal(s.days.length, 7);
  visitors.flush();
  const saved = fs.readFileSync(path.join(config.paths.visitorsDir, 'blog.json'), 'utf8');
  assert.ok(!saved.includes('10.0.0.1'), 'no IP addresses are stored');
});

/* -------------------------------------------------------------- activity */

test('activity log records dashboard actions without secrets', () => {
  activity.fromRequest({ method: 'POST', pattern: '/api/sites/:name/start', params: { name: 'shop' }, body: {}, ok: true, ip: '::ffff:192.168.1.5' });
  activity.fromRequest({ method: 'PATCH', pattern: '/api/sites/:name/traffic', params: { name: 'shop' }, body: { access: { password: 'TOPSECRET' } }, ok: true, ip: '192.168.1.5' });
  activity.fromRequest({ method: 'PUT', pattern: '/api/chunk', params: {}, body: {}, ok: true });
  activity.record({ action: 'Scheduled backup', by: 'schedule' });
  const list = activity.list({ limit: 10 });
  assert.equal(list[0].action, 'Scheduled backup');
  assert.equal(list[2].action, 'Started website');
  assert.equal(list[2].ip, '192.168.1.5');
  const shop = activity.list({ site: 'shop' }).map((e) => e.action);
  assert.ok(shop.includes('Started website') && shop.includes('Changed redirects / access settings'));
  assert.ok(activity.list({ site: 'blog' }).every((e) => e.site === 'blog'));
  assert.ok(!fs.readFileSync(config.paths.activityFile, 'utf8').includes('TOPSECRET'));
});

/* ------------------------------------------------------------- snapshots */

test('snapshots: restore puts code back, keeps locked files and DATA_DIR', { skip: !which('tar') && 'tar not installed' }, async () => {
  const dir = sites.siteDir('blog');
  fs.writeFileSync(path.join(dir, 'index.js'), 'v1');
  fs.writeFileSync(path.join(dir, 'db.sqlite'), 'old data');
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'big.js'), 'x');
  const snap = await snapshots.create('blog', { reason: 'test' });
  assert.ok(snap?.id);

  // Things change after the snapshot…
  fs.writeFileSync(path.join(dir, 'index.js'), 'v2 broken');
  fs.writeFileSync(path.join(dir, 'new-file.js'), 'added later');
  fs.writeFileSync(path.join(dir, 'db.sqlite'), 'NEW data');
  fs.writeFileSync(path.join(sites.siteDataDir('blog'), 'uploads.txt'), 'kept');
  locks.addLocks('blog', 'db.sqlite');

  const r = await snapshots.restore('blog', snap.id);
  assert.equal(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), 'v1');
  assert.equal(fs.existsSync(path.join(dir, 'new-file.js')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'db.sqlite'), 'utf8'), 'NEW data', 'locked file keeps its current version');
  assert.equal(fs.readFileSync(path.join(sites.siteDataDir('blog'), 'uploads.txt'), 'utf8'), 'kept', 'DATA_DIR untouched');
  assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false, 'packages are not in snapshots');
  assert.ok(r.safety, 'a safety snapshot of "before restore" was taken');
  assert.equal(snapshots.list('blog').length, 2);
  await assert.rejects(snapshots.restore('blog', '../../etc'), /Invalid snapshot/);

  config.update((c) => (c.snapshots.keep = 1));
  await snapshots.create('blog', { reason: 'prune test' });
  assert.equal(snapshots.list('blog').length, 1, 'only the newest are kept');
});

/* ---------------------------------------------------------------- health */

test('health probe: healthy, server error and down', async () => {
  const srv = http.createServer((req, res) => {
    res.statusCode = req.url === '/broken' ? 503 : 200;
    res.end('ok');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  assert.equal((await health.probe(port, '/')).ok, true);
  const bad = await health.probe(port, '/broken');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /503/);
  srv.close();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await health.probe(port, '/')).ok, false);
  assert.throws(() => health.normalize({ path: 'health' }), /start with/);
  assert.deepEqual(health.normalize({ enabled: true, interval: 1, failures: 99 }), { enabled: true, path: '/', interval: 10, failures: 20 });
});

/* ----------------------------------------------------- usage and backups */

test('disk usage separates code, packages and data', async () => {
  const dir = sites.siteDir('shop');
  fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'x'.repeat(5000));
  fs.writeFileSync(path.join(sites.siteDataDir('shop'), 'app.db'), 'y'.repeat(3000));
  const u = await features.usage('shop', { fresh: true });
  assert.equal(u.nodeModules, 5000);
  assert.equal(u.data, 3000);
  assert.ok(u.code > 0);
  assert.equal(u.total, u.code + u.nodeModules + u.git + u.data + u.snapshots);
});

test('scheduled backups: run, include DATA_DIR, prune and validate settings', { skip: !which('tar') && 'tar not installed' }, async () => {
  assert.throws(() => backup.setSchedule({ time: '25:00' }), /03:00/);
  assert.throws(() => backup.setSchedule({ copyTo: 'relative/path' }), /full folder path/);
  assert.throws(() => backup.setSchedule({ copyTo: sites.siteDir('shop') }), /inside a website folder/);
  const extra = fs.mkdtempSync(path.join(tmp, 'nas-'));
  backup.setSchedule({ enabled: true, keep: 1, copyTo: extra });
  const a = await backup.runNow({ kind: 'scheduled' });
  await new Promise((r) => setTimeout(r, 1100)); // distinct file names
  const b = await backup.runNow({ kind: 'scheduled' });
  assert.ok(fs.existsSync(path.join(extra, b.name)));
  assert.deepEqual(backup.listStored().map((x) => x.name), [b.name], 'only the newest is kept');
  assert.ok(!fs.existsSync(path.join(config.paths.backupsDir, a.name)));

  // The backup carries the data folder: wipe it, restore, and it's back.
  fs.rmSync(sites.siteDataDir('shop'), { recursive: true, force: true });
  const copy = path.join(tmp, 'restore.tar.gz');
  fs.copyFileSync(backup.storedFile(b.name), copy);
  await backup.restore(copy, { startSites: false });
  assert.equal(fs.readFileSync(path.join(sites.siteDataDir('shop'), 'app.db'), 'utf8'), 'y'.repeat(3000));
  assert.throws(() => backup.storedFile('../../etc/passwd'), /Invalid backup/);
});
