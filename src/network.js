/**
 * Network info and static IP configuration.
 * Supports NetworkManager (nmcli – Ubuntu Desktop, Debian, Fedora, Raspberry Pi OS Bookworm)
 * and netplan (Ubuntu Server).
 */
import fs from 'node:fs';
import os from 'node:os';
import { run, runOk, which, HttpError, isLinux } from './util.js';
import * as config from './config.js';

const NETPLAN_FILE = '/etc/netplan/99-autonode.yaml';
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

async function backend() {
  if (config.DEV || !isLinux) return 'demo';
  if (which('nmcli')) {
    const r = await run('nmcli', ['-t', '-f', 'RUNNING', 'general'], { quiet: true });
    if (r.stdout.trim() === 'running') return 'networkmanager';
  }
  if (which('netplan') && fs.existsSync('/etc/netplan')) return 'netplan';
  return null;
}

function dnsServers() {
  try {
    const conf = fs.readFileSync('/run/systemd/resolve/resolv.conf', 'utf8');
    const s = [...conf.matchAll(/^nameserver\s+(\S+)/gm)].map((m) => m[1]);
    if (s.length) return s;
  } catch {}
  try {
    return [...fs.readFileSync('/etc/resolv.conf', 'utf8').matchAll(/^nameserver\s+(\S+)/gm)].map((m) => m[1]).filter((s) => !s.startsWith('127.'));
  } catch {
    return [];
  }
}

export async function info() {
  const kind = await backend();
  const ifaces = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (name === 'lo' || /^(docker|veth|br-|virbr|tailscale|zt|wg)/.test(name)) continue;
    const v4 = addrs.find((a) => a.family === 'IPv4' && !a.internal);
    if (!v4) continue;
    ifaces.push({ name, address: v4.address, prefix: Number(v4.cidr?.split('/')[1] || 24), mac: v4.mac, wireless: name.startsWith('wl') });
  }
  let gateway = null;
  let defaultIface = ifaces[0]?.name || null;
  if (isLinux) {
    const r = await run('ip', ['-j', 'route', 'show', 'default'], { quiet: true });
    try {
      const routes = JSON.parse(r.stdout || '[]');
      if (routes[0]) {
        gateway = routes[0].gateway;
        defaultIface = routes[0].dev;
      }
    } catch {}
  }
  let mode = 'unknown';
  let connection = null;
  if (kind === 'networkmanager' && defaultIface) {
    const r = await run('nmcli', ['-t', '-f', 'GENERAL.CONNECTION', 'device', 'show', defaultIface], { quiet: true });
    connection = r.stdout.split(':').slice(1).join(':').trim() || null;
    if (connection) {
      const m = await run('nmcli', ['-g', 'ipv4.method', 'connection', 'show', connection], { quiet: true });
      mode = m.stdout.trim() === 'manual' ? 'static' : 'dhcp';
    }
  } else if (kind === 'netplan') {
    mode = fs.existsSync(NETPLAN_FILE) ? 'static' : 'dhcp';
  } else if (kind === 'demo') mode = 'dhcp';

  const primary = ifaces.find((i) => i.name === defaultIface) || ifaces[0] || null;
  return {
    backend: kind,
    supported: !!kind,
    mode,
    connection,
    interface: primary?.name || null,
    address: primary?.address || null,
    prefix: primary?.prefix || 24,
    gateway: gateway || (primary ? primary.address.replace(/\.\d+$/, '.1') : null),
    dns: dnsServers(),
    interfaces: ifaces,
    hostname: os.hostname(),
    dashboardUrl: primary ? `http://${primary.address}:${config.get().dashboard.port}` : null,
  };
}

function validate({ address, prefix, gateway, dns }) {
  if (!IPV4.test(address)) throw new HttpError(400, 'Enter a valid IP address, like 192.168.1.50.');
  if (!IPV4.test(gateway)) throw new HttpError(400, 'Enter a valid router address, like 192.168.1.1.');
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 8 || p > 30) throw new HttpError(400, 'Subnet size should be between /8 and /30 (usually /24).');
  const list = (Array.isArray(dns) ? dns : String(dns || '').split(/[\s,]+/)).filter(Boolean);
  for (const d of list) if (!IPV4.test(d)) throw new HttpError(400, `"${d}" is not a valid DNS server.`);
  const mask = (~0 << (32 - p)) >>> 0;
  const toInt = (ip) => ip.split('.').reduce((a, b) => ((a << 8) | Number(b)) >>> 0, 0);
  if (((toInt(address) & mask) >>> 0) !== ((toInt(gateway) & mask) >>> 0)) throw new HttpError(400, 'The IP address and router must be on the same network.');
  return { address, prefix: p, gateway, dns: list.length ? list : ['1.1.1.1', '1.0.0.1'] };
}

/** Check that nobody else on the LAN already uses the address. */
export async function isAddressTaken(address) {
  if (!isLinux) return false;
  const mine = Object.values(os.networkInterfaces()).flat().some((a) => a.address === address);
  if (mine) return false;
  const r = await run('ping', ['-c', '1', '-W', '1', address], { quiet: true, timeout: 4000 });
  return r.code === 0;
}

/** Apply settings a moment after responding, so the browser gets the answer first. */
export async function apply(input) {
  const cur = await info();
  if (!cur.supported) throw new HttpError(400, "This system's network can't be configured automatically.");
  const iface = input.interface || cur.interface;
  if (!iface) throw new HttpError(400, 'No network interface found.');
  // The name goes into the netplan YAML, so only accept interfaces that really exist.
  if (!cur.interfaces.some((i) => i.name === iface)) throw new HttpError(400, `There is no network interface called "${iface}".`);
  const mode = input.mode === 'static' ? 'static' : 'dhcp';
  let cfg = null;
  if (mode === 'static') {
    cfg = validate(input);
    if (cfg.address !== cur.address && (await isAddressTaken(cfg.address))) throw new HttpError(409, `Another device already uses ${cfg.address}. Pick a different address.`);
  }
  if (cur.backend === 'demo') return { ok: true, demo: true, newUrl: cfg ? `http://${cfg.address}:${config.get().dashboard.port}` : null };

  const job = async () => {
    if (cur.backend === 'networkmanager') {
      const conn = cur.connection;
      if (!conn) throw new Error('No active NetworkManager connection.');
      const args =
        mode === 'static'
          ? ['connection', 'modify', conn, 'ipv4.method', 'manual', 'ipv4.addresses', `${cfg.address}/${cfg.prefix}`, 'ipv4.gateway', cfg.gateway, 'ipv4.dns', cfg.dns.join(' '), 'ipv4.ignore-auto-dns', 'yes']
          : ['connection', 'modify', conn, 'ipv4.method', 'auto', 'ipv4.addresses', '', 'ipv4.gateway', '', 'ipv4.dns', '', 'ipv4.ignore-auto-dns', 'no'];
      await runOk('nmcli', args);
      await runOk('nmcli', ['connection', 'up', conn]);
    } else if (cur.backend === 'netplan') {
      if (mode === 'static') {
        const section = iface.startsWith('wl') ? null : 'ethernets';
        if (!section) throw new Error('Wi-Fi on netplan must be configured manually.');
        const yaml = `# Managed by AutoNode
network:
  version: 2
  ${section}:
    ${iface}:
      dhcp4: false
      addresses: [${cfg.address}/${cfg.prefix}]
      routes:
        - to: default
          via: ${cfg.gateway}
      nameservers:
        addresses: [${cfg.dns.join(', ')}]
`;
        fs.writeFileSync(NETPLAN_FILE, yaml, { mode: 0o600 });
      } else fs.rmSync(NETPLAN_FILE, { force: true });
      await runOk('netplan', ['apply']);
    }
  };
  setTimeout(() => job().catch((err) => console.error(`[network] ${err.message}`)), 1500);
  return { ok: true, newUrl: cfg ? `http://${cfg.address}:${config.get().dashboard.port}` : null };
}
