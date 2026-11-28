/**
 * Disk health (S.M.A.R.T.) for the Overview.
 *
 * Disks come from /sys/block; health from `smartctl --json` (smartmontools 7+), run as
 * root without a shell. Best effort and read-only:
 *  • A virtual machine's disks are virtual (virtio, QEMU, VMware, Hyper-V…): they have no
 *    S.M.A.R.T. data and the host looks after the real disks, so smartctl is not even run.
 *    A physical disk passed through to a VM is checked like any other.
 *  • `-n standby` keeps a sleeping hard drive asleep; the last reading is shown instead.
 *  • Results are cached: S.M.A.R.T. values change over days, not seconds.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { isLinux, run, which } from './util.js';

const CACHE_MS = 30 * 60_000;
const MIN_REFRESH_MS = 30_000;
const SKIP = /^(loop|ram|zram|dm-|md|sr|fd|nbd|mtdblock|mmcblk\d+boot|mmcblk\d+rpmb)/;
// Disks a hypervisor or cloud makes up: no S.M.A.R.T., the host checks the real hardware.
const VIRTUAL_NAME = /^(vd|xvd)/;
const VIRTUAL_MODEL = /qemu|vbox|virtual|vmware|msft|hyper-?v|xen|bhyve|parallels|google|persistentdisk|elastic block|amazon|blockvolume|nutanix|red hat|virtio/i;

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
};

/** Whole disks this computer has: [{ name, model, size, kind: 'nvme' | 'ssd' | 'hdd', virtual }]. */
export function listDisks(root = '/sys') {
  let names = [];
  try {
    names = fs.readdirSync(path.join(root, 'block')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  } catch {}
  const out = [];
  for (const name of names) {
    if (SKIP.test(name)) continue;
    const dir = path.join(root, 'block', name);
    const size = Number(readText(path.join(dir, 'size'))) * 512;
    if (!size) continue; // empty card reader, ejected disk
    if (readText(path.join(dir, 'removable')) === '1') continue; // USB sticks, SD cards
    const model = readText(path.join(dir, 'device', 'model')).replace(/\s+/g, ' ');
    const vendor = readText(path.join(dir, 'device', 'vendor'));
    const nvme = name.startsWith('nvme');
    const kind = nvme ? 'nvme' : readText(path.join(dir, 'queue', 'rotational')) === '0' ? 'ssd' : 'hdd';
    const virtual = VIRTUAL_NAME.test(name) || VIRTUAL_MODEL.test(`${vendor} ${model}`);
    out.push({ name, model: model || null, size, kind, virtual });
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Turn one `smartctl --json` answer into plain language.
 * `exit` is smartctl's exit status: a bit mask (see `man smartctl`, EXIT STATUS).
 */
export function evaluate(json, exit = 0, kind = 'hdd') {
  const issues = [];
  let status = 'good';
  const worse = (s) => {
    const rank = { good: 0, warn: 1, bad: 2 };
    if (rank[s] > rank[status]) status = s;
  };

  if (!json || typeof json !== 'object' || (exit & 0b11 && !json.smart_status)) {
    return { status: 'unknown', issues: ["This disk doesn't share its health information."], temperature: null, powerOnHours: null, wear: null };
  }
  if (json.smart_status?.passed === false || exit & 8) {
    worse('bad');
    issues.push('The disk reports that it is failing. Copy your data off it and replace it soon.');
  }

  const temperature = num(json.temperature?.current);
  const powerOnHours = num(json.power_on_time?.hours);
  let wear = num(json.endurance_used?.current_percent);

  const nv = json.nvme_smart_health_information_log;
  if (nv) {
    wear ??= num(nv.percentage_used);
    if (num(nv.critical_warning)) {
      worse('bad');
      issues.push('The disk raised a critical warning.');
    }
    const spare = num(nv.available_spare);
    const spareMin = num(nv.available_spare_threshold);
    if (spare != null && spareMin != null && spare < spareMin) {
      worse('bad');
      issues.push('The disk has almost no spare space left to replace worn-out cells.');
    }
    if (num(nv.media_errors) > 0) {
      worse('warn');
      issues.push(`The disk found ${nv.media_errors} damaged spot${nv.media_errors === 1 ? '' : 's'} while reading or writing.`);
    }
  }

  const attrs = json.ata_smart_attributes?.table;
  if (Array.isArray(attrs)) {
    const raw = (id) => num(attrs.find((a) => a.id === id)?.raw?.value);
    const norm = (id) => num(attrs.find((a) => a.id === id)?.value);
    if (attrs.some((a) => a.when_failed === 'now')) {
      worse('bad');
      issues.push('A health value has dropped below the safe limit set by the maker.');
    }
    const moved = raw(5);
    if (moved > 0) {
      worse('warn');
      issues.push(`${moved} damaged sector${moved === 1 ? ' was' : 's were'} replaced with spares.`);
    }
    const pending = (raw(197) || 0) + (raw(198) || 0);
    if (pending > 0) {
      worse('warn');
      issues.push(`${pending} sector${pending === 1 ? '' : 's'} could not be read.`);
    }
    // SSD life left, as the maker counts it (100 = new).
    if (wear == null && kind !== 'hdd') {
      const left = norm(231) ?? norm(233) ?? norm(177) ?? norm(202);
      if (left != null && left <= 100) wear = 100 - left;
    }
  }

  if (exit & 16 && status !== 'bad') {
    worse('bad');
    issues.push('A health value has dropped below the safe limit set by the maker.');
  }
  if (exit & 0b11000000 && !issues.length) {
    worse('warn');
    issues.push('The disk has recorded errors in the past.');
  }
  if (wear != null) {
    wear = Math.max(0, Math.min(100, Math.round(wear)));
    if (wear >= 90) {
      worse(wear >= 100 ? 'bad' : 'warn');
      issues.push(`The disk is ${wear}% worn out. Plan to replace it.`);
    }
  }
  const hot = kind === 'nvme' ? 75 : 55;
  if (temperature != null && temperature >= hot) {
    worse('warn');
    issues.push(`The disk is hot (${temperature} °C). Check the fans and airflow.`);
  }
  return { status, issues, temperature, powerOnHours, wear };
}

let cache = null; // { at, value }
let pending = null;
const lastGood = new Map(); // disk name -> last reading (shown while a hard drive sleeps)

async function detectVirt() {
  if (!which('systemd-detect-virt')) return null;
  const r = await run('systemd-detect-virt', ['--vm'], { quiet: true, timeout: 5000 });
  const v = r.stdout.trim();
  return r.code === 0 && v && v !== 'none' ? v : null;
}

const VM_NAMES = { kvm: 'KVM', qemu: 'QEMU', vmware: 'VMware', oracle: 'VirtualBox', microsoft: 'Hyper-V', xen: 'Xen', parallels: 'Parallels', bhyve: 'bhyve', amazon: 'AWS', google: 'Google Cloud', apple: 'Apple' };

async function readDisk(d) {
  const base = { name: d.name, model: d.model, size: d.size, kind: d.kind };
  if (d.virtual) return { ...base, status: 'virtual', issues: [], temperature: null, powerOnHours: null, wear: null };
  const r = await run('smartctl', ['--json', '-H', '-A', '-i', '-n', 'standby', `/dev/${d.name}`], { quiet: true, timeout: 20_000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  // A sleeping hard drive: -n standby skipped it (exit 2) instead of spinning it up.
  if (/standby|sleep/i.test(JSON.stringify(json?.smartctl?.messages || '')) || (/standby|sleep/i.test(r.stdout) && !json?.smart_status)) {
    const prev = lastGood.get(d.name);
    return { ...base, ...(prev || { issues: [], temperature: null, powerOnHours: null, wear: null }), status: prev?.status || 'sleeping', sleeping: true };
  }
  const health = evaluate(json, r.code, d.kind);
  const model = json?.model_name || base.model;
  const out = { ...base, model, ...health };
  if (health.status !== 'unknown') lastGood.set(d.name, health);
  return out;
}

async function collect() {
  if (!isLinux || config.DEV) return { available: false, reason: 'dev', disks: [], checkedAt: Date.now() };
  const [all, vm] = await Promise.all([listDisks(), detectVirt()]);
  const vmName = vm ? VM_NAMES[vm] || vm : null;
  const physical = all.filter((d) => !d.virtual);
  if (!all.length) return { available: false, reason: vm ? 'virtual' : 'none', vm: vmName, disks: [], checkedAt: Date.now() };
  if (!physical.length) return { available: false, reason: 'virtual', vm: vmName, disks: all.map((d) => ({ name: d.name, model: d.model, size: d.size, kind: d.kind, status: 'virtual', issues: [] })), checkedAt: Date.now() };
  if (!which('smartctl')) return { available: false, reason: 'no-tool', vm: vmName, disks: all.map((d) => ({ name: d.name, model: d.model, size: d.size, kind: d.kind, status: d.virtual ? 'virtual' : 'unknown', issues: [] })), checkedAt: Date.now() };
  const disks = [];
  for (const d of all) disks.push(await readDisk(d)); // one at a time: gentle on busy disks
  return { available: true, vm: vmName, disks, checkedAt: Date.now() };
}

/** Health of every disk, cached for 30 minutes. `fresh` re-reads (at most every 30 s). */
export function diskHealth({ fresh = false } = {}) {
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && (age < CACHE_MS && !(fresh && age > MIN_REFRESH_MS))) return Promise.resolve(cache.value);
  return (pending ||= collect()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => (pending = null)));
}

/** Warm the cache in the background so the Overview never waits for smartctl. */
export function startChecks() {
  const tick = () => diskHealth({ fresh: true }).catch((err) => console.error('[disks]', err.message));
  setTimeout(tick, 5000).unref();
  setInterval(tick, CACHE_MS).unref();
}
