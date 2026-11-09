import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-icons-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const config = await import('../src/config.js');
const sites = await import('../src/sites.js');
const icons = await import('../src/icons.js');

const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const put = (site, rel, data) => {
  const f = path.join(sites.siteDir(site), rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};

before(async () => {
  config.load();
  for (const n of ['plain', 'linked', 'fake', 'none', 'next']) await sites.createSite({ name: n, template: 'empty' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('types come from the bytes, not the name', () => {
  assert.equal(icons.sniff(ICO), 'image/x-icon');
  assert.equal(icons.sniff(PNG), 'image/png');
  assert.equal(icons.sniff(SVG), 'image/svg+xml');
  assert.equal(icons.sniff(Buffer.from('<!doctype html><title>404</title>')), null);
  assert.equal(icons.sniff(Buffer.alloc(0)), null);
});

test('finds public/favicon.ico', () => {
  put('plain', 'public/favicon.ico', ICO);
  const r = icons.findOnDisk('plain');
  assert.equal(r.source, 'public/favicon.ico');
  assert.equal(r.type, 'image/x-icon');
});

test('prefers the icon index.html links to', () => {
  put('linked', 'public/favicon.ico', ICO);
  put('linked', 'public/brand/logo.svg', SVG);
  put('linked', 'public/index.html', '<html><head><link rel="shortcut icon" href="/brand/logo.svg?v=2"><link rel="icon" href="https://cdn.example.com/x.png"></head></html>');
  const r = icons.findOnDisk('linked');
  assert.equal(r.source, 'public/brand/logo.svg');
  assert.equal(r.type, 'image/svg+xml');
});

test('finds a Next.js app/icon.png', () => {
  put('next', 'app/icon.png', PNG);
  assert.equal(icons.findOnDisk('next').source, 'app/icon.png');
});

test('ignores fake, empty and oversized icons', async () => {
  put('fake', 'favicon.ico', '<!doctype html>not an icon');
  put('fake', 'public/favicon.ico', Buffer.alloc(0));
  put('fake', 'public/favicon.png', Buffer.concat([PNG, Buffer.alloc(600 * 1024)]));
  assert.equal(icons.findOnDisk('fake'), null);
  await assert.rejects(icons.getIcon('none'), (e) => e.status === 404); // not running, nothing on disk
});

test('never reads through a symlink', (t) => {
  const outside = fs.mkdtempSync(path.join(tmp, 'outside-'));
  fs.writeFileSync(path.join(outside, 'favicon.ico'), ICO);
  try {
    fs.symlinkSync(outside, path.join(sites.siteDir('none'), 'public'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) {
    t.skip(`can't create symlinks here: ${err.code}`);
    return;
  }
  assert.equal(icons.findOnDisk('none'), null);
});
