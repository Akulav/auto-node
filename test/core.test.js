import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Isolated dev-mode sandbox — never touches /etc or /var.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-test-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const auth = await import('../src/auth.js');
const sites = await import('../src/sites.js');
const files = await import('../src/files.js');
const deploy = await import('../src/deploy.js');
const { HOSTNAME_RE, SITE_NAME_RE, normalizeHostname } = await import('../src/util.js');

before(() => config.load());
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('site start scripts live outside the root-only config folder', () => {
  // The site user can't enter configDir (mode 700), so scripts there fail with "Permission denied".
  const rel = path.relative(config.paths.configDir, config.paths.runDir);
  assert.ok(rel.startsWith('..') || path.isAbsolute(rel), `runDir ${config.paths.runDir} is inside ${config.paths.configDir}`);
  assert.ok(fs.statSync(config.paths.runDir).isDirectory());
});

test('private address detection', () => {
  for (const a of ['127.0.0.1', '::1', '10.1.2.3', '192.168.1.20', '172.20.0.5', '::ffff:192.168.0.9', 'fd00::1', '100.100.1.1']) assert.equal(auth.isPrivateAddress(a), true, a);
  for (const a of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) assert.equal(auth.isPrivateAddress(a), false, a);
});

test('password + session cookie round-trip', async () => {
  await auth.setPassword('correct horse');
  assert.equal(await auth.verifyPassword('correct horse', 'a'), true);
  assert.equal(await auth.verifyPassword('wrong', 'b'), false);
  const cookie = auth.createSessionCookie(false).split(';')[0];
  assert.equal(auth.isAuthenticated({ headers: { cookie } }), true);
  assert.equal(auth.isAuthenticated({ headers: { cookie: cookie.slice(0, -2) + 'xx' } }), false);
  await assert.rejects(auth.setPassword('short'));
});

test('hostname and site-name validation', () => {
  assert.equal(normalizeHostname('https://Blog.Akulav.com/path'), 'blog.akulav.com');
  assert.ok(HOSTNAME_RE.test('akulav.com'));
  assert.ok(HOSTNAME_RE.test('a.b.akulav.com'));
  assert.ok(!HOSTNAME_RE.test('akulav'));
  assert.ok(SITE_NAME_RE.test('my-blog'));
  assert.ok(!SITE_NAME_RE.test('-bad'));
  assert.ok(!SITE_NAME_RE.test('Bad'));
});

test('repo normalisation', () => {
  assert.equal(deploy.normalizeRepo('akulav/site'), 'https://github.com/akulav/site.git');
  assert.equal(deploy.normalizeRepo('git@github.com:akulav/site.git'), 'https://github.com/akulav/site.git');
  assert.throws(() => deploy.normalizeRepo('ftp://x'));
});

test('create site, detect command, hostnames', async () => {
  const s = await sites.createSite({ name: 'demo', template: 'starter' });
  assert.equal(s.port, 3001);
  assert.equal(sites.detectStartCommand(s), 'npm start');
  await sites.addHostname('demo', 'Demo.Akulav.com');
  assert.deepEqual(sites.getSite('demo').hostnames, ['demo.akulav.com']);
  await assert.rejects(sites.addHostname('demo', 'demo.akulav.com'), /already connected/);
  await assert.rejects(sites.createSite({ name: 'demo' }), /already exists/);
});

test('file access is confined to the site folder', async () => {
  const { full, rel } = files.resolveInSite('demo', '/../../../etc/passwd');
  assert.equal(rel, '/etc/passwd');
  assert.ok(full.startsWith(sites.siteDir('demo')));
  await files.writeText('demo', '/public/hello.txt', 'hi');
  assert.equal(files.readText('demo', '/public/hello.txt').content, 'hi');
  assert.throws(() => files.remove('demo', '/'), /can't delete/);
  files.remove('demo', '/public');
  assert.ok(!files.list('demo', '/').some((e) => e.name === 'public'));
});

test('certificates: wildcard matching and key check', async () => {
  const certs = await import('../src/certs.js');
  const { execFileSync } = await import('node:child_process');
  let pem;
  try {
    const dir = fs.mkdtempSync(path.join(tmp, 'c-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=akulav.com', '-addext', 'subjectAltName=DNS:akulav.com,DNS:*.akulav.com'], { stdio: 'ignore' });
    pem = { cert: fs.readFileSync(path.join(dir, 'c.pem'), 'utf8'), key: fs.readFileSync(path.join(dir, 'k.pem'), 'utf8') };
  } catch {
    return; // openssl not available on this machine
  }
  const info = certs.add(pem.cert, pem.key);
  assert.deepEqual(info.names.sort(), ['*.akulav.com', 'akulav.com']);
  assert.ok(certs.hasCertFor('akulav.com'));
  assert.ok(certs.hasCertFor('blog.akulav.com'));
  assert.ok(!certs.hasCertFor('a.b.akulav.com'));
  assert.ok(!certs.hasCertFor('example.com'));
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => certs.add(pem.cert, other), /doesn't belong/);
});

test('backup: settings-only and full export round-trip', async () => {
  const backup = await import('../src/backup.js');
  await sites.createSite({ name: 'shop', template: 'starter' });
  await sites.addHostname('shop', 'shop.example.org'); // a second domain on the same machine
  await sites.updateSite('shop', { env: { API_KEY: 'secret "quoted"' } });
  await files.writeText('shop', '/public/index.html', '<h1>shop</h1>');

  // Settings-only JSON
  const jsonFile = path.join(tmp, 'b.json');
  fs.writeFileSync(jsonFile, JSON.stringify(backup.buildManifest()));
  const sum = await backup.inspect(jsonFile);
  assert.deepEqual(sum.sites.map((s) => s.name).sort(), ['demo', 'shop']);
  config.update((c) => delete c.sites.shop);
  const r1 = await backup.restore(jsonFile, { startSites: false });
  assert.ok(r1.sites.includes('shop'));
  assert.equal(sites.getSite('shop').env.API_KEY, 'secret "quoted"');
  assert.deepEqual(sites.getSite('shop').hostnames, ['shop.example.org']);

  // Full archive with files (needs `tar`)
  const { which } = await import('../src/util.js');
  if (!which('tar')) return;
  const tarFile = path.join(tmp, 'b.tar.gz');
  await backup.streamFullExport(fs.createWriteStream(tarFile));
  fs.rmSync(sites.siteDir('shop'), { recursive: true, force: true });
  config.update((c) => delete c.sites.shop);
  const r2 = await backup.restore(tarFile, { startSites: false });
  assert.equal(r2.filesRestored, true);
  assert.equal(files.readText('shop', '/public/index.html').content, '<h1>shop</h1>');

  // Not a backup
  const junk = path.join(tmp, 'junk.json');
  fs.writeFileSync(junk, '{"hello":1}');
  await assert.rejects(backup.inspect(junk), /isn't an AutoNode backup/);
});

test('deploy workflow yaml mentions the site and secret name', () => {
  const y = deploy.workflowYaml({ name: 'demo', git: { branch: 'main' } }, 'https://demo.akulav.com');
  assert.match(y, /AUTONODE_DEPLOY_TOKEN/);
  assert.match(y, /https:\/\/demo\.akulav\.com\/\.autonode\/deploy\/demo/);
});
