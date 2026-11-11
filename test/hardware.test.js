// Hardware health: S.M.A.R.T. parsing, disk discovery and temperatures from a fake /sys.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-hw-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const hw = await import('../src/hardware.js');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const ata = (over = {}) => ({
  device: { name: '/dev/sda', type: 'sat', protocol: 'ATA' },
  model_name: 'WDC WD40EFRX',
  serial_number: 'WD-1',
  rotation_rate: 5400,
  user_capacity: { bytes: 4e12 },
  smart_status: { passed: true },
  temperature: { current: 34 },
  power_on_time: { hours: 20000 },
  power_cycle_count: 50,
  ata_smart_attributes: { table: [{ id: 5, value: 200, raw: { value: 0 } }, { id: 197, value: 200, raw: { value: 0 } }] },
  ...over,
});

test('a healthy hard drive', () => {
  const d = hw.parseSmart(ata());
  assert.equal(d.health, 'good');
  assert.equal(d.verdict, 'Healthy');
  assert.equal(d.kind, 'hdd');
  assert.equal(d.name, 'WDC WD40EFRX');
  assert.equal(d.temperature, 34);
  assert.equal(d.powerOnHours, 20000);
  assert.deepEqual(d.problems, []);
});

test('damaged areas are a warning; a failed self-assessment is bad', () => {
  const worn = hw.parseSmart(ata({ ata_smart_attributes: { table: [{ id: 5, value: 100, raw: { value: 8 } }, { id: 197, value: 100, raw: { value: 1 } }] } }));
  assert.equal(worn.health, 'warn');
  assert.match(worn.problems.join(' '), /8 damaged areas have been replaced/);
  assert.match(worn.problems.join(' '), /1 area is hard to read/);

  const failing = hw.parseSmart(ata({ smart_status: { passed: false } }));
  assert.equal(failing.health, 'bad');
  assert.match(failing.verdict, /back up and replace/);

  const threshold = hw.parseSmart(ata({ ata_smart_attributes: { table: [{ id: 5, value: 1, when_failed: 'now', raw: { value: 0 } }] } }));
  assert.equal(threshold.health, 'bad');
});

test('NVMe wear, spare cells and critical warnings', () => {
  const nvme = (log) =>
    hw.parseSmart({ device: { name: '/dev/nvme0', type: 'nvme', protocol: 'NVMe' }, model_name: 'Samsung 980', smart_status: { passed: true }, nvme_smart_health_information_log: { temperature: 41, available_spare: 100, available_spare_threshold: 10, percentage_used: 3, media_errors: 0, power_on_hours: 100, data_units_written: 2, ...log } });
  const ok = nvme({});
  assert.equal(ok.kind, 'nvme');
  assert.equal(ok.health, 'good');
  assert.equal(ok.lifeUsedPercent, 3);
  assert.equal(ok.temperature, 41);
  assert.equal(ok.written, 1_024_000);

  assert.equal(nvme({ percentage_used: 95 }).health, 'warn');
  assert.equal(nvme({ available_spare: 5 }).health, 'warn');
  assert.equal(nvme({ critical_warning: 0x08 }).health, 'bad');
  assert.match(nvme({ critical_warning: 0x08 }).problems[0], /read-only/);
});

test('SATA SSD life left, sleeping disks, disks without health data', () => {
  const ssd = hw.parseSmart(ata({ rotation_rate: 0, ata_smart_attributes: { table: [{ id: 231, value: 7, raw: { value: 0 } }] } }));
  assert.equal(ssd.kind, 'ssd');
  assert.equal(ssd.lifeUsedPercent, 93);
  assert.equal(ssd.health, 'warn');

  const asleep = hw.parseSmart({ device: { name: '/dev/sdb' }, smartctl: { messages: [{ string: 'Device is in STANDBY mode, exit(2)' }] } });
  assert.equal(asleep.asleep, true);
  assert.equal(asleep.health, 'unknown');

  const usb = hw.parseSmart({ device: { name: '/dev/sdc' }, smart_support: { available: false } });
  assert.equal(usb.health, 'unknown');
  assert.match(usb.verdict, /doesn't report/);

  assert.equal(hw.parseSmart(null).health, 'unknown');
  assert.equal(hw.parseSmart(ata({ temperature: { current: 300 } })).temperature, null, 'nonsense temperatures are dropped');
});

test('collectSmart: scans, skips odd device names, keeps a sleeping disk’s last numbers', async () => {
  const calls = [];
  let asleep = false;
  const exec = async (args) => {
    calls.push(args);
    if (args[0] === '--scan') return { code: 0, stdout: JSON.stringify({ devices: [{ name: '/dev/sda', type: 'sat' }, { name: '/dev/sda', type: 'sat' }, { name: '-rf /', type: 'x' }, { name: '/dev/nvme0', type: 'nvme; rm' }] }) };
    const dev = args.at(-1);
    if (dev === '/dev/sda') return { code: 0, stdout: JSON.stringify(asleep ? { device: { name: dev }, smartctl: { messages: [{ string: 'Device is in STANDBY mode' }] } } : ata()) };
    return { code: 4, stdout: JSON.stringify({ device: { name: dev }, model_name: 'NV', smart_status: { passed: true }, nvme_smart_health_information_log: { temperature: 40 } }) };
  };
  const r = await hw.collectSmart(exec);
  assert.equal(r.state, 'ok');
  assert.deepEqual(r.disks.map((d) => d.device), ['/dev/sda', '/dev/nvme0']);
  const nvCall = calls.find((a) => a.at(-1) === '/dev/nvme0');
  assert.ok(!nvCall.includes('-d'), 'an unsafe device type is not passed on');
  assert.ok(calls.every((a) => a[0] === '--scan' || a.includes('standby')), 'sleeping disks are never woken');

  asleep = true;
  const again = await hw.collectSmart(exec, r.disks);
  const sda = again.disks.find((d) => d.device === '/dev/sda');
  assert.equal(sda.asleep, true);
  assert.equal(sda.health, 'good', 'last known health is kept');
  assert.equal(sda.temperature, null);
});

test('collectSmart: old smartctl, no disks, tool that cannot start', async () => {
  assert.equal((await hw.collectSmart(async () => ({ code: 1, stdout: 'smartctl 6.6 ... unrecognized option -j' }))).state, 'old');
  assert.equal((await hw.collectSmart(async () => ({ code: 127, stdout: '' }))).state, 'error');
  const none = await hw.collectSmart(async () => ({ code: 0, stdout: '{"devices":[]}' }));
  assert.equal(none.state, 'none');
  assert.match(none.message, /virtual machine/);
});

test('temperatures from hwmon and thermal zones, one per part', () => {
  const sys = path.join(tmp, 'sys');
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(sys, rel)), { recursive: true });
    fs.writeFileSync(path.join(sys, rel), text);
  };
  // CPU with package + cores: the package reading stands for the CPU.
  put('class/hwmon/hwmon0/name', 'coretemp\n');
  put('class/hwmon/hwmon0/temp1_label', 'Package id 0');
  put('class/hwmon/hwmon0/temp1_input', '52000');
  put('class/hwmon/hwmon0/temp1_crit', '100000');
  put('class/hwmon/hwmon0/temp2_label', 'Core 0');
  put('class/hwmon/hwmon0/temp2_input', '61000');
  // NVMe drive with a model name.
  put('class/hwmon/hwmon1/name', 'nvme');
  put('class/hwmon/hwmon1/temp1_label', 'Composite');
  put('class/hwmon/hwmon1/temp1_input', '78000');
  put('class/hwmon/hwmon1/device/model', 'Samsung SSD 980');
  // A broken sensor is ignored.
  put('class/hwmon/hwmon2/name', 'acpitz');
  put('class/hwmon/hwmon2/temp1_input', '-273000');
  // Thermal zones: x86_pkg_temp repeats the CPU, acpitz is new information (board).
  put('class/thermal/thermal_zone0/type', 'x86_pkg_temp');
  put('class/thermal/thermal_zone0/temp', '53000');
  put('class/thermal/thermal_zone1/type', 'acpitz');
  put('class/thermal/thermal_zone1/temp', '27800');
  put('class/thermal/cooling_device0/type', 'Processor');

  const list = hw.readTemperatures(sys);
  assert.deepEqual(
    list.map((t) => [t.kind, t.label, t.celsius]),
    [
      ['cpu', 'Processor', 52],
      ['board', 'Mainboard', 27.8],
      ['disk', 'Disk', 78],
    ],
  );
  assert.equal(list.find((t) => t.kind === 'disk').detail, 'Samsung SSD 980');
  assert.equal(list.find((t) => t.kind === 'disk').level, 'warn', '78 °C is getting warm for a disk');
  assert.equal(list.find((t) => t.kind === 'cpu').level, '');
  assert.deepEqual(hw.readTemperatures(path.join(tmp, 'nothing')), []);
});

test('installing smartmontools uses fixed package-manager arguments; nothing is installed in dev mode', async () => {
  assert.deepEqual(hw.installCommand('apt-get').args.slice(-1), ['smartmontools']);
  assert.equal(hw.installCommand('dnf').cmd, 'dnf');
  assert.equal(hw.installCommand('brew'), null);
  assert.throws(() => hw.install(), /dev mode/);
  const snap = await hw.snapshot();
  assert.ok(snap.smart && Array.isArray(snap.disks) && Array.isArray(snap.temperatures));
});
