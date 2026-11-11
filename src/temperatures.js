/**
 * Temperatures the computer reports, from /sys/class/hwmon and /sys/class/thermal.
 * Read-only and best effort: a virtual machine or container usually has no sensors,
 * and then the list is simply empty.
 */
import fs from 'node:fs';
import path from 'node:path';

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

/** warn / bad when a temperature gets close to the limit of that kind of part. */
export function tempLevel(celsius, limit) {
  if (celsius == null) return '';
  return celsius >= limit - 5 ? 'bad' : celsius >= limit - 15 ? 'warn' : '';
}

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
// NVMe drives are built to run hotter than hard drives (they slow down around 80–85 °C).
const KIND_LIMIT = { cpu: 100, gpu: 100, disk: 70, nvme: 85, wifi: 100, chipset: 105, battery: 60, board: 100 };

const kindOf = (name) => KINDS.find(([, re]) => re.test(name))?.[0] || 'other';

/**
 * One reading per part: [{ kind, label, detail, celsius, limit, level }], processor first.
 * A chip with several sensors (one per CPU core, say) is shown as the reading that stands
 * for the whole part (the CPU package), else its hottest.
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
    const fallback = /^nvme/i.test(name) ? KIND_LIMIT.nvme : KIND_LIMIT[kind] ?? 100;
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

/** The reading the Overview leads with: the processor, else the hottest part. */
export function mainTemperature(list) {
  return list.find((t) => t.kind === 'cpu') || list.reduce((a, b) => (!a || b.celsius > a.celsius ? b : a), null);
}
