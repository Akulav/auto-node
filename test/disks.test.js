// Disk health: disks from a fake /sys, and S.M.A.R.T. answers turned into plain language.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-disks-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const disks = await import('../src/disks.js');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const sys = path.join(tmp, 'sys');
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(sys, rel)), { recursive: true });
  fs.writeFileSync(path.join(sys, rel), text);
};
const disk = (name, { size = 1953525168, model, vendor, rotational = '0', removable = '0' } = {}) => {
  put(`block/${name}/size`, String(size));
  put(`block/${name}/removable`, removable);
  put(`block/${name}/queue/rotational`, rotational);
  if (model) put(`block/${name}/device/model`, model + '   \n');
  if (vendor) put(`block/${name}/device/vendor`, vendor);
};

test('lists real disks, skips partitions-only devices, and spots virtual ones', () => {
  disk('nvme0n1', { model: 'Samsung SSD 980 PRO 1TB' });
  disk('sda', { model: 'WDC WD40EFRX-68N', rotational: '1' });
  disk('sdb', { model: 'QEMU HARDDISK', vendor: 'ATA' });
  disk('vda', {});
  disk('loop0', {});
  disk('sr0', {});
  disk('zram0', {});
  disk('sdc', { removable: '1' }); // USB stick
  disk('sdd', { size: 0 }); // empty card reader
  const got = disks.listDisks(sys);
  assert.deepEqual(
    got.map((d) => [d.name, d.kind, d.virtual]),
    [
      ['nvme0n1', 'nvme', false],
      ['sda', 'hdd', false],
      ['sdb', 'ssd', true],
      ['vda', 'ssd', true],
    ],
  );
  assert.equal(got[0].model, 'Samsung SSD 980 PRO 1TB');
  assert.equal(got[0].size, 1953525168 * 512);
  assert.deepEqual(disks.listDisks(path.join(tmp, 'missing')), []);
});

test('a healthy NVMe drive', () => {
  const r = disks.evaluate(
    { smart_status: { passed: true }, temperature: { current: 41 }, power_on_time: { hours: 9000 }, nvme_smart_health_information_log: { critical_warning: 0, available_spare: 100, available_spare_threshold: 10, percentage_used: 3, media_errors: 0 } },
    0,
    'nvme',
  );
  assert.deepEqual(r, { status: 'good', issues: [], temperature: 41, powerOnHours: 9000, wear: 3 });
});

test('a hard drive with replaced sectors needs a look; a failing one is bad', () => {
  const attrs = (reallocated, pending = 0) => ({ table: [{ id: 5, value: 100, raw: { value: reallocated } }, { id: 197, value: 100, raw: { value: pending } }, { id: 198, value: 100, raw: { value: 0 } }] });
  const warn = disks.evaluate({ smart_status: { passed: true }, ata_smart_attributes: attrs(8, 2) }, 0, 'hdd');
  assert.equal(warn.status, 'warn');
  assert.equal(warn.issues.length, 2);
  assert.match(warn.issues[0], /8 damaged sectors were replaced/);
  const bad = disks.evaluate({ smart_status: { passed: false }, ata_smart_attributes: attrs(0) }, 8, 'hdd');
  assert.equal(bad.status, 'bad');
  assert.match(bad.issues[0], /failing/);
});

test('SSD wear from the maker attribute, heat and no answer', () => {
  const worn = disks.evaluate({ smart_status: { passed: true }, ata_smart_attributes: { table: [{ id: 231, value: 8, raw: { value: 8 } }] } }, 0, 'ssd');
  assert.equal(worn.wear, 92);
  assert.equal(worn.status, 'warn');
  const hot = disks.evaluate({ smart_status: { passed: true }, temperature: { current: 58 } }, 0, 'hdd');
  assert.equal(hot.status, 'warn');
  assert.match(hot.issues[0], /hot/);
  assert.equal(disks.evaluate(null, 2).status, 'unknown');
  assert.equal(disks.evaluate({ smartctl: {} }, 2).status, 'unknown');
});

test('dev mode answers without running smartctl', async () => {
  const r = await disks.diskHealth();
  assert.equal(r.available, false);
  assert.equal(r.reason, 'dev');
});
