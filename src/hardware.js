/**
 * Hardware health: disk S.M.A.R.T. (through `smartctl`, part of smartmontools) and
 * temperatures (from /sys/class/hwmon and /sys/class/thermal).
 *
 * Everything here is read-only and best effort: a virtual machine, a container or a
 * server without smartmontools gets a plain sentence instead of an error. smartctl
 * results are cached for a few minutes and sleeping disks are never woken (`-n standby`),
 * so an open dashboard doesn't keep the disks busy.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { HttpError, isLinux, run } from './util.js';

const SMART_TTL = 5 * 60_000; // disks change slowly
const SMART_MIN_GAP = 15_000; // even "Refresh" doesn't run smartctl more often than this
const TEMP_TTL = 5_000;

const DEVICE_RE = /^\/dev\/[A-Za-z0-9_/.:-]{1,64}$/;
const TYPE_RE = /^[A-Za-z0-9_,+.:-]{1,64}$/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ------------------------------------------------------------ disk health */

/** smartctl is often in /usr/sbin, which isn't always on PATH. Not cached, so installing it takes effect right away. */
export function findSmartctl() {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), '/usr/sbin', '/usr/bin', '/sbin', '/usr/local/sbin', '/usr/local/bin'];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, 'smartctl');
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return p;
    } catch {}
  }
  return null;
}

/** warn / bad when a temperature gets close to the limit of that kind of part. */
function tempLevel(celsius, limit) {
  if (celsius == null) return '';
  return celsius >= limit - 5 ? 'bad' : celsius >= limit - 15 ? 'warn' : '';
}

const DISK_TEMP_LIMIT = { hdd: 65, ssd: 75, nvme: 85, disk: 70 };

/**
 * Turn the JSON of `smartctl -j -i -H -A <device>` into what the dashboard shows:
 * a verdict (good / warn / bad / unknown), the reasons in plain words, and a few numbers.
 */
export function parseSmart(j) {
  j = j && typeof j === 'object' ? j : {};
  const nv = j.nvme_smart_health_information_log && typeof j.nvme_smart_health_information_log === 'object' ? j.nvme_smart_health_information_log : null;
  const table = Array.isArray(j.ata_smart_attributes?.table) ? j.ata_smart_attributes.table : [];
  const attr = (id) => table.find((a) => a && a.id === id) || null;
  const raw = (id) => num(attr(id)?.raw?.value);

  const kind = nv || /nvme/i.test(String(j.device?.protocol || j.device?.type || '')) ? 'nvme' : j.rotation_rate === 0 ? 'ssd' : num(j.rotation_rate) > 0 ? 'hdd' : 'disk';
  const device = typeof j.device?.name === 'string' ? j.device.name : null;
  const model = [j.model_name, j.scsi_model_name, [j.scsi_vendor, j.scsi_product].filter(Boolean).join(' ')].find((m) => typeof m === 'string' && m.trim())?.trim() || null;

  const disk = {
    device,
    name: model || device || 'Disk',
    model,
    serial: typeof j.serial_number === 'string' ? j.serial_number : null,
    kind,
    size: num(j.user_capacity?.bytes) ?? num(j.nvme_total_capacity),
    health: 'unknown',
    verdict: 'No health information',
    problems: [],
    asleep: false,
    temperature: num(j.temperature?.current) ?? num(nv?.temperature),
    temperatureLevel: '',
    powerOnHours: num(j.power_on_time?.hours) ?? num(nv?.power_on_hours),
    powerCycles: num(j.power_cycle_count) ?? num(nv?.power_cycles),
    reallocated: raw(5),
    pending: raw(197),
    uncorrectable: raw(198),
    lifeUsedPercent: null,
    spare: num(nv?.available_spare),
    mediaErrors: num(nv?.media_errors),
    written: num(nv?.data_units_written) != null ? nv.data_units_written * 512_000 : null,
  };
  if (disk.temperature != null && (disk.temperature <= 0 || disk.temperature > 150)) disk.temperature = null;
  disk.temperatureLevel = tempLevel(disk.temperature, DISK_TEMP_LIMIT[kind]);

  // SSD wear. NVMe reports "percentage used"; SATA SSDs report life left as a normalised value (100 = new).
  if (num(nv?.percentage_used) != null) disk.lifeUsedPercent = nv.percentage_used;
  else if (kind !== 'hdd') {
    const wear = [231, 233, 177, 202].map(attr).find((a) => a && num(a.value) != null && a.value >= 0 && a.value <= 100);
    if (wear) disk.lifeUsedPercent = 100 - wear.value;
  }

  const messages = (Array.isArray(j.smartctl?.messages) ? j.smartctl.messages : []).map((m) => String(m?.string || ''));
  if (j.smart_status == null && messages.some((m) => /STANDBY|SLEEP/i.test(m))) {
    disk.asleep = true;
    disk.verdict = 'Asleep — checked when it wakes up';
    return disk;
  }

  const passed = typeof j.smart_status?.passed === 'boolean' ? j.smart_status.passed : null;
  const bad = [];
  const warn = [];
  const plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

  if (passed === false) bad.push('The disk itself reports that it is about to fail.');
  if (table.some((a) => a && a.when_failed === 'now')) bad.push('One of its health measurements is below the level the manufacturer considers safe.');
  if (nv) {
    const cw = num(nv.critical_warning) || 0;
    if (cw & 0x01) bad.push('It has run out of spare storage cells.');
    if (cw & 0x04) bad.push('It reports that it is no longer reliable.');
    if (cw & 0x08) bad.push('It has switched to read-only to protect your data.');
    if (cw & 0x02) warn.push('It reports that it is running too hot.');
    if (cw & 0x10) warn.push('Its power-loss protection has failed.');
    if (!(cw & 0x01) && disk.spare != null && num(nv.available_spare_threshold) != null && disk.spare <= nv.available_spare_threshold) warn.push(`Only ${disk.spare}% of its spare storage cells are left.`);
    if (disk.mediaErrors > 0) warn.push(`It could not read or write data correctly ${plural(disk.mediaErrors, 'time', 'times')}.`);
  }
  if (disk.reallocated > 0) warn.push(`${plural(disk.reallocated, 'damaged area has', 'damaged areas have')} been replaced with spare space.`);
  if (disk.pending > 0) warn.push(`${plural(disk.pending, 'area is', 'areas are')} hard to read and may be damaged.`);
  if (disk.uncorrectable > 0) warn.push(`${plural(disk.uncorrectable, 'area', 'areas')} could not be read at all.`);
  if (disk.lifeUsedPercent != null && disk.lifeUsedPercent >= 90) warn.push(`It has used about ${Math.min(100, Math.round(disk.lifeUsedPercent))}% of its expected lifetime.`);

  if (bad.length) {
    disk.health = 'bad';
    disk.verdict = 'Failing — back up and replace this disk';
  } else if (warn.length) {
    disk.health = 'warn';
    disk.verdict = 'Showing wear — keep a backup';
  } else if (passed === true) {
    disk.health = 'good';
    disk.verdict = 'Healthy';
  } else if (/permission denied/i.test(messages.join(' '))) {
    disk.verdict = 'AutoNode is not allowed to read this disk';
  } else if (j.smart_support?.available === false || passed == null) {
    disk.verdict = "This disk doesn't report its health";
  }
  disk.problems = [...bad, ...warn];
  return disk;
}

const parseJson = (text) => {
  try {
    const j = JSON.parse(text);
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
};

/**
 * Ask smartctl about every disk. `exec(args)` runs smartctl and resolves { code, stdout }
 * (injected in tests). `previous` lets a sleeping disk keep its last known numbers.
 * Returns { state, message, disks } where state is ok | none | old | error.
 */
export async function collectSmart(exec, previous = []) {
  const scan = await exec(['--scan', '-j']);
  const list = parseJson(scan.stdout);
  if (!list) {
    if (scan.code === 127) return { state: 'error', message: "The disk health tool couldn't be started on this server.", disks: [] };
    return { state: 'old', message: "The disk health tool on this server is too old for AutoNode to read (smartmontools 7 or newer is needed). Update the server's packages to see disk health.", disks: [] };
  }
  const devices = (Array.isArray(list.devices) ? list.devices : []).filter((d) => d && DEVICE_RE.test(String(d.name)));
  const disks = [];
  const seen = new Set();
  for (const d of devices.slice(0, 32)) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    const args = ['-j', '-i', '-H', '-A', '-n', 'standby'];
    if (typeof d.type === 'string' && TYPE_RE.test(d.type)) args.push('-d', d.type);
    args.push(d.name);
    // The exit code is a set of flags (a failing disk sets some), so only the JSON matters.
    const j = parseJson((await exec(args)).stdout);
    if (!j) continue;
    let disk = parseSmart(j);
    disk.device ||= d.name;
    if (disk.name === 'Disk') disk.name = d.name;
    if (disk.asleep) {
      const old = previous.find((p) => p.device === disk.device && !p.asleep);
      if (old) disk = { ...old, asleep: true, temperature: null, temperatureLevel: '' };
    }
    disks.push(disk);
  }
  if (!disks.length) return { state: 'none', message: 'No disks that report their health were found. That is normal on a virtual machine or a cloud server, where the disks are not real hardware.', disks };
  return { state: 'ok', message: null, disks };
}

/* ----------------------------------------------------------- temperatures */

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
};

/** A sysfs temperature in thousandths of a degree → °C, or null when missing or nonsense. */
const readMilli = (file) => {
  const t = readText(file);
  if (t == null || t === '') return null;
  const c = Number(t) / 1000;
  return Number.isFinite(c) && c > 0 && c < 150 ? Math.round(c * 10) / 10 : null;
};

const KINDS = [
  ['cpu', /^(coretemp|k10temp|k8temp|zenpower|zenergy|via_cputemp|fam15h_power|x86_pkg_temp|cpu|soc|.*[_-]cpu|cpu[_-].*|soc[_-].*|.*_soc)/i],
  ['gpu', /^(amdgpu|radeon|nouveau|nvidia|gpu|.*gpu.*)/i],
  ['disk', /^(nvme|drivetemp)/i],
  ['wifi', /^(iwlwifi|ath\d+k|mt7\d+|rtw|brcm)/i],
  ['chipset', /^pch_/i],
  ['battery', /^BAT/],
  ['board', /^(acpitz|thinkpad|it87|nct\d|w83|f71|asus|dell_smm|applesmc|gigabyte)/i],
];
const KIND_LABEL = { cpu: 'Processor', gpu: 'Graphics card', disk: 'Disk', wifi: 'Wi-Fi adapter', chipset: 'Chipset', battery: 'Battery', board: 'Mainboard' };
const KIND_LIMIT = { cpu: 100, gpu: 100, disk: 70, wifi: 100, chipset: 105, battery: 60, board: 100 };

const kindOf = (name) => KINDS.find(([, re]) => re.test(name))?.[0] || 'other';

/**
 * Temperatures the computer reports, one per part: [{ kind, label, celsius, limit, level }].
 * A chip with several sensors (one per CPU core, say) is shown as its hottest reading,
 * preferring the one that stands for the whole part (the CPU package).
 */
export function readTemperatures(root = '/sys') {
  const out = [];
  const hwmonDir = path.join(root, 'class', 'hwmon');
  let chips = [];
  try {
    chips = fs.readdirSync(hwmonDir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {}
  const hwmonNames = new Set();
  for (const chip of chips) {
    const dir = path.join(hwmonDir, chip);
    const name = readText(path.join(dir, 'name')) || chip;
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const readings = [];
    for (const f of files) {
      const m = /^temp(\d+)_input$/.exec(f);
      if (!m) continue;
      const celsius = readMilli(path.join(dir, f));
      if (celsius == null) continue;
      const crit = readMilli(path.join(dir, `temp${m[1]}_crit`)) ?? readMilli(path.join(dir, `temp${m[1]}_max`));
      readings.push({ celsius, crit: crit != null && crit > 40 && crit < 130 ? crit : null, label: readText(path.join(dir, `temp${m[1]}_label`)) || '' });
    }
    if (!readings.length) continue;
    hwmonNames.add(name.replace(/-/g, '_'));
    const kind = kindOf(name);
    const pick = readings.find((r) => /^(Package id|Tctl|Tdie|Composite)/i.test(r.label)) || readings.reduce((a, b) => (b.celsius > a.celsius ? b : a));
    const model = kind === 'disk' ? readText(path.join(dir, 'device', 'model')) : null;
    // NVMe drives are built to run hotter than hard drives (they slow down around 80–85 °C).
    const fallback = /^nvme/i.test(name) ? DISK_TEMP_LIMIT.nvme : KIND_LIMIT[kind] ?? 100;
    out.push({ kind, label: KIND_LABEL[kind] || `Sensor (${name})`, detail: model || null, celsius: pick.celsius, limit: pick.crit ?? fallback });
  }

  // Thermal zones mostly repeat hwmon; add the ones that tell us about a part hwmon didn't cover.
  const zoneDir = path.join(root, 'class', 'thermal');
  let zones = [];
  try {
    zones = fs.readdirSync(zoneDir).filter((z) => z.startsWith('thermal_zone')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {}
  const have = new Set(out.map((s) => s.kind));
  const fromZones = new Map();
  for (const z of zones) {
    const celsius = readMilli(path.join(zoneDir, z, 'temp'));
    if (celsius == null) continue;
    const type = readText(path.join(zoneDir, z, 'type')) || z;
    if (hwmonNames.has(type.replace(/-/g, '_'))) continue;
    const kind = kindOf(type);
    if (kind !== 'other' && have.has(kind)) continue;
    const key = kind === 'other' ? `other:${type}` : kind;
    const old = fromZones.get(key);
    if (!old || celsius > old.celsius) fromZones.set(key, { kind, label: KIND_LABEL[kind] || `Sensor (${type})`, detail: null, celsius, limit: KIND_LIMIT[kind] ?? 100 });
  }
  out.push(...fromZones.values());

  // "Processor", "Processor 2", … when a part appears more than once.
  const count = new Map();
  for (const s of out) {
    const n = (count.get(s.label) || 0) + 1;
    count.set(s.label, n);
    if (n > 1) s.label = `${s.label} ${n}`;
    s.level = tempLevel(s.celsius, s.limit);
  }
  const order = ['cpu', 'gpu', 'board', 'chipset', 'disk', 'wifi', 'battery', 'other'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/* --------------------------------------------------------------- snapshot */

const packageManager = () => ['apt-get', 'dnf', 'pacman', 'zypper'].find((pm) => ['/usr/bin', '/usr/sbin', '/bin', '/usr/local/bin'].some((d) => fs.existsSync(path.join(d, pm)))) || null;

/** How to install smartmontools with the system's package manager: { cmd, args, update? } or null. */
export function installCommand(pm) {
  if (pm === 'apt-get') return { cmd: 'apt-get', args: ['-o', 'DPkg::Lock::Timeout=120', 'install', '-y', '-qq', '--no-install-recommends', 'smartmontools'], update: ['-o', 'DPkg::Lock::Timeout=120', 'update', '-qq'] };
  if (pm === 'dnf') return { cmd: 'dnf', args: ['install', '-y', '-q', 'smartmontools'] };
  if (pm === 'pacman') return { cmd: 'pacman', args: ['-Sy', '--noconfirm', '--needed', 'smartmontools'] };
  if (pm === 'zypper') return { cmd: 'zypper', args: ['--non-interactive', 'install', 'smartmontools'] };
  return null;
}

const canInstall = () => isLinux && !config.DEV && process.getuid?.() === 0 && !!installCommand(packageManager());

let smart = null; // { at, state, message, disks }
let smartRunning = null;
let temps = null; // { at, list }

async function smartStatus(fresh) {
  if (!isLinux) return { state: 'unavailable', message: 'Disk health is read on the Linux server. This computer is running AutoNode in dev mode, so there is nothing to show here.', disks: [] };
  const age = smart ? Date.now() - smart.at : Infinity;
  if (smart && age < (fresh ? SMART_MIN_GAP : SMART_TTL)) return smart;
  smartRunning ||= (async () => {
    try {
      const bin = findSmartctl();
      let result;
      if (!bin) {
        result = { state: 'missing', message: canInstall() ? 'Disk health needs a small extra tool (smartmontools) that is not installed on this server yet.' : 'Disk health needs the smartmontools package, which is not installed on this server. Install it on the server (on Ubuntu or Debian: sudo apt-get install smartmontools), then come back to this page.', disks: [] };
      } else {
        try {
          result = await collectSmart((args) => run(bin, args, { quiet: true, timeout: 30_000 }), smart?.disks || []);
        } catch (err) {
          result = { state: 'error', message: `Disk health could not be read: ${err.message}`, disks: [] };
        }
      }
      smart = { at: Date.now(), ...result };
      return smart;
    } finally {
      smartRunning = null;
    }
  })();
  return smartRunning;
}

function temperatureList() {
  if (!isLinux) return [];
  if (!temps || Date.now() - temps.at > TEMP_TTL) temps = { at: Date.now(), list: readTemperatures() };
  return temps.list;
}

/** Everything the dashboard's Hardware section shows. `fresh` re-reads the disks (at most every 15 s). */
export async function snapshot({ fresh = false } = {}) {
  const s = await smartStatus(fresh);
  let temperatures = temperatureList();
  // Disks that already show their temperature on their own card aren't listed twice.
  if (s.disks.some((d) => d.temperature != null)) temperatures = temperatures.filter((t) => t.kind !== 'disk');
  const noTemps = !temperatures.length && !s.disks.some((d) => d.temperature != null);
  return {
    time: Date.now(),
    smart: { state: s.state, message: s.message, canInstall: s.state === 'missing' && canInstall(), checkedAt: s.at || null },
    disks: s.disks,
    temperatures,
    temperaturesMessage: !temperatures.length ? (isLinux ? (noTemps ? "This computer doesn't report any temperatures. That is normal on a virtual machine or a cloud server." : null) : 'Temperatures are read on the Linux server, not in dev mode.') : null,
  };
}

let installing = null;

/** Install smartmontools with the package manager (root only; never on a developer's computer). */
export function install() {
  if (config.DEV || !isLinux) throw new HttpError(400, 'Nothing is installed in dev mode. On the real server this button installs the smartmontools package.');
  if (findSmartctl()) return Promise.resolve({ ok: true });
  const pkgs = installCommand(packageManager());
  if (!pkgs || process.getuid?.() !== 0) throw new HttpError(400, "AutoNode doesn't know how to install packages on this system. Install the smartmontools package on the server yourself, then come back to this page.");
  installing ||= (async () => {
    try {
      const opts = { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }, quiet: true, timeout: 10 * 60_000 };
      if (pkgs.update) await run(pkgs.cmd, pkgs.update, opts);
      const r = await run(pkgs.cmd, pkgs.args, opts);
      if (!findSmartctl()) {
        const why = (r.stderr || r.stdout).trim().split('\n').pop()?.trim().slice(0, 300);
        throw new HttpError(500, `The disk health tool couldn't be installed${why ? ` (${why})` : ''}. Check that the server is connected to the internet, or install it on the server with: sudo ${pkgs.cmd} install smartmontools`);
      }
      smart = null; // read the disks on the next request
      return { ok: true };
    } finally {
      installing = null;
    }
  })();
  return installing;
}
