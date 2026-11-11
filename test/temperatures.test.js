// Temperatures from a fake /sys, and how they reach the Overview's live stats.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-temps-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const temps = await import('../src/temperatures.js');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const sys = path.join(tmp, 'sys');
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(sys, rel)), { recursive: true });
  fs.writeFileSync(path.join(sys, rel), text);
};

test('one reading per part from hwmon and thermal zones', () => {
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

  const list = temps.readTemperatures(sys);
  assert.deepEqual(
    list.map((t) => [t.kind, t.label, t.celsius]),
    [
      ['cpu', 'Processor', 52],
      ['board', 'Mainboard', 27.8],
      ['disk', 'Disk', 78],
    ],
  );
  const disk = list.find((t) => t.kind === 'disk');
  assert.equal(disk.detail, 'Samsung SSD 980');
  assert.equal(disk.limit, 85, 'NVMe drives get the NVMe limit, not the hard-drive one');
  assert.equal(disk.level, 'warn');
  assert.equal(list.find((t) => t.kind === 'cpu').level, '');
  assert.equal(temps.mainTemperature(list).kind, 'cpu', 'the processor leads');
  assert.equal(temps.mainTemperature(list.filter((t) => t.kind !== 'cpu')).kind, 'disk', 'else the hottest part');
  assert.equal(temps.mainTemperature([]), null);
});

test('no sensors (virtual machine, container): an empty list', () => {
  assert.deepEqual(temps.readTemperatures(path.join(tmp, 'nothing')), []);
});

test('temperature levels: warn 15 °C below the limit, bad 5 °C below', () => {
  assert.equal(temps.tempLevel(84, 100), '');
  assert.equal(temps.tempLevel(85, 100), 'warn');
  assert.equal(temps.tempLevel(95, 100), 'bad');
  assert.equal(temps.tempLevel(null, 100), '');
});

test('live stats carry the temperatures and history for all four Overview cards', async () => {
  const stats = await import('../src/stats.js');
  const s = stats.sample();
  assert.ok(Array.isArray(s.temperatures));
  assert.ok('temperature' in s);
  const point = stats.getHistory().at(-1);
  for (const k of ['cpu', 'mem', 'disk', 'temp']) assert.ok(k in point, k);
});
