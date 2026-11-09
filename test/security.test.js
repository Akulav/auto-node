// Regression tests for security fixes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-sec-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const sites = await import('../src/sites.js');
const proxy = await import('../src/proxy.js');
const deploy = await import('../src/deploy.js');

before(async () => {
  config.load();
  await sites.createSite({ name: 'web', template: 'empty' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("a website can't take the dashboard's or the proxy's port", async () => {
  const { dashboard, proxy: p } = config.get();
  for (const port of [dashboard.port, p.httpPort, p.httpsPort]) await assert.rejects(sites.updateSite('web', { port }), /used by AutoNode/, String(port));
  // Even if a config already has it (old version, hand edit), the proxy refuses to route there.
  await sites.addHostname('web', 'web.example.com');
  const before = sites.getSite('web').port;
  config.update((c) => (c.sites.web.port = dashboard.port));
  assert.equal(proxy.routeFor('web.example.com'), null);
  config.update((c) => (c.sites.web.port = before));
  assert.equal(proxy.routeFor('web.example.com')?.name, 'web');
});

test('visitor IP headers are only trusted from Cloudflare or a local tunnel', () => {
  const req = (remoteAddress) => ({ socket: { remoteAddress }, headers: { host: 'a.com', 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '1.2.3.4', 'x-forwarded-proto': 'https', 'cf-visitor': '{"scheme":"https"}' } });

  const direct = proxy.forwardHeaders(req('203.0.113.9'), false);
  assert.equal(direct['x-real-ip'], '203.0.113.9');
  assert.equal(direct['x-forwarded-for'], '203.0.113.9');
  assert.equal(direct['x-forwarded-proto'], 'http');
  assert.equal(direct['cf-connecting-ip'], undefined);
  assert.equal(direct['cf-visitor'], undefined);

  for (const edge of ['104.16.0.5', '::ffff:172.64.1.1', '2606:4700::1', '127.0.0.1']) {
    const h = proxy.forwardHeaders(req(edge), false);
    assert.equal(h['x-real-ip'], '6.6.6.6', edge);
    assert.equal(h['x-forwarded-proto'], 'https', edge);
  }
  assert.equal(proxy.isTrustedProxy('8.8.8.8'), false);
  assert.equal(proxy.isTrustedProxy('not an ip'), false);
});

function fakeHook(headers, body = '') {
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { method: 'POST', url: '/.autonode/deploy/web', headers });
  let resumed = false;
  const origResume = req.resume.bind(req);
  req.resume = () => ((resumed = true), origResume());
  const res = { status: 0, body: null, writeHead(s) { this.status = s; }, setHeader() {}, end(b) { this.body = b; } };
  return { req, res, wasResumed: () => resumed };
}

test('the public deploy webhook rejects anonymous and bad requests without buffering them', async () => {
  config.update((c) => (c.sites.web.git = { repo: 'https://github.com/a/b.git', branch: 'main', webhookSecret: 'right-secret' }));

  const anon = fakeHook({}, 'x'.repeat(1000));
  await deploy.handleHook(anon.req, anon.res);
  assert.equal(anon.res.status, 401);
  assert.ok(anon.wasResumed(), 'body is drained, not buffered');

  const wrong = fakeHook({ authorization: 'Bearer wrong' });
  await deploy.handleHook(wrong.req, wrong.res);
  assert.equal(wrong.res.status, 401);

  // Non-ASCII used to make timingSafeEqual throw (500) instead of a clean 401.
  const odd = fakeHook({ authorization: 'Bearer ríght-secret' });
  await deploy.handleHook(odd.req, odd.res);
  assert.equal(odd.res.status, 401);

  const sig = fakeHook({ 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }, '{}');
  await deploy.handleHook(sig.req, sig.res);
  assert.equal(sig.res.status, 401);
});

test('update file handling never follows symlinks', (t) => {
  const site = sites.getSite('web');
  const dir = sites.siteDir('web');
  const outside = fs.mkdtempSync(path.join(tmp, 'outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'root only');
  fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'real', 'ok.txt'), 'ok');
  try {
    // Junctions work on Windows without admin rights; real symlinks elsewhere.
    fs.symlinkSync(outside, path.join(dir, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    t.skip(`can't create symlinks here: ${err.code}`);
    return;
  }
  assert.equal(deploy.plainFile(site, 'real/ok.txt'), true);
  assert.equal(deploy.plainFile(site, 'link/secret.txt'), false, 'path through a symlinked folder');
  assert.equal(deploy.plainFile(site, 'link'), false);
  assert.equal(deploy.plainFile(site, '../outside/secret.txt'), false);
  assert.equal(deploy.plainFile(site, 'real'), false, 'folders are not files');
});
