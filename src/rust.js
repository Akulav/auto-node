/**
 * Rust websites: a folder with a Cargo.toml (and no package.json) is built with
 * cargo and started from target/release/<binary>.
 *
 * Cargo.toml comes from the repository, so it is untrusted: we read only the
 * few keys we need with a tiny line-based reader (no dependencies), and the
 * binary name must match BIN_NAME_RE before it can reach a start command that
 * the root daemon writes into the site's start script.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as config from './config.js';
import { run, which } from './util.js';

export const BIN_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/;

/** Folders where a system-wide cargo (e.g. `apt install cargo`) lives; these are on every site's PATH. */
const SYSTEM_BIN_DIRS = ['/usr/local/bin', '/usr/bin', '/bin'];

/** rustup installs into ~/.cargo/bin of the `autonode` user (HOME is config.paths.homeDir). */
export const cargoBinDir = () => path.join(config.paths.homeDir, '.cargo', 'bin');

/** 'node' (package.json, or nothing to go on) or 'rust' (a Cargo.toml without a package.json). */
export function kindOf(dir) {
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'node';
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return 'rust';
  return 'node';
}

/** Read a TOML basic or literal string at the start of `s` ("…" or '…'). */
function tomlString(s) {
  const m = /^"((?:[^"\\]|\\.)*)"/.exec(s) || /^'([^']*)'/.exec(s);
  if (!m) return null;
  return s[0] === '"' ? m[1].replace(/\\(.)/g, '$1') : m[1];
}

/**
 * The parts of Cargo.toml that decide which program to start:
 * `[package] name` / `default-run`, the `[[bin]]` names, and whether it is a workspace.
 */
export function parseCargoToml(text) {
  const out = { packageName: null, defaultRun: null, bins: [], workspace: false };
  let table = null;
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^\[\[\s*([A-Za-z0-9_.-]+)\s*\]\]/.exec(line) || /^\[\s*([A-Za-z0-9_.-]+)\s*\]/.exec(line);
    if (header) {
      table = line.startsWith('[[') ? `[[${header[1]}]]` : header[1];
      if (table === '[[bin]]') out.bins.push(null);
      if (table === 'workspace') out.workspace = true;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+|"[^"]*")\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].replace(/^"|"$/g, '');
    const value = tomlString(kv[2]);
    if (value == null) continue;
    if (table === 'package' && key === 'name') out.packageName = value;
    else if (table === 'package' && key === 'default-run') out.defaultRun = value;
    else if (table === '[[bin]]' && key === 'name') out.bins[out.bins.length - 1] = value;
  }
  out.bins = out.bins.filter(Boolean);
  return out;
}

/**
 * The binary `cargo build --release` produces that should be started, or null.
 * Order: default-run, a [[bin]] named like the package, the first [[bin]], the package name.
 * Anything that isn't a plain name (letters, digits, - and _) is refused.
 */
export function binaryName(cargo) {
  const pick = cargo.defaultRun || (cargo.bins.includes(cargo.packageName) ? cargo.packageName : cargo.bins[0]) || cargo.packageName;
  return pick && BIN_NAME_RE.test(pick) ? pick : null;
}

/** Read Cargo.toml in a site folder (a regular file only, never through a symlink). */
export function readCargo(dir) {
  try {
    const file = path.join(dir, 'Cargo.toml');
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 256 * 1024) return null;
    return parseCargoToml(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Start command for a Rust site, or '' when Cargo.toml doesn't say which program to run. */
export function startCommand(dir) {
  const cargo = readCargo(dir);
  const bin = cargo && binaryName(cargo);
  return bin ? `./target/release/${bin}` : '';
}

/** True when a shell command runs cargo (e.g. a custom "cargo run --release" start command). */
export const usesCargo = (command) => /(^|[\s;&|()])cargo(\s|$)/.test(String(command || ''));

export function buildCommand(dir) {
  return fs.existsSync(path.join(dir, 'Cargo.lock')) ? 'cargo build --release --locked' : 'cargo build --release';
}

const isExec = (p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Where the site user finds cargo, or null. Checks the autonode user's ~/.cargo/bin
 * and the system folders on the site PATH (not root's PATH: root's own rustup
 * install in /root/.cargo isn't usable by the site user). Not cached, so
 * installing Rust takes effect right away.
 */
export function findCargo() {
  if (config.DEV || process.platform === 'win32') {
    // Dev builds run with the developer's own PATH.
    const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
    for (const d of (process.env.PATH || '').split(path.delimiter)) for (const e of exts) if (d && isExec(path.join(d, 'cargo' + e))) return path.join(d, 'cargo' + e);
    return null;
  }
  for (const d of [cargoBinDir(), ...SYSTEM_BIN_DIRS]) if (isExec(path.join(d, 'cargo'))) return path.join(d, 'cargo');
  return null;
}

const manualInstall = () => `sudo -u ${config.SITE_USER} env HOME=${config.paths.homeDir} sh -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal"`;

/** Shown where AutoNode can't install Rust itself (dev mode, or not Linux). */
export function missingCargoMessage() {
  return `Rust isn't installed for the ${config.SITE_USER} user, so this website can't be built. Install it once on the server with: ${manualInstall()} — then press Install & Rebuild again.`;
}

/* ------------------------------------------------- automatic installation */

/**
 * Which rustup-init to download (https://static.rust-lang.org/rustup/dist/<triple>/rustup-init),
 * or null for a processor rustup has no installer for.
 */
export function rustupTriple(arch = process.arch, { armVersion = process.config?.variables?.arm_version, musl = isMusl() } = {}) {
  const libc = musl ? 'musl' : 'gnu';
  if (arch === 'x64') return `x86_64-unknown-linux-${libc}`;
  if (arch === 'arm64') return `aarch64-unknown-linux-${libc}`;
  if (musl) return null;
  if (arch === 'arm') return String(armVersion) === '6' ? 'arm-unknown-linux-gnueabihf' : 'armv7-unknown-linux-gnueabihf';
  if (arch === 'ia32') return 'i686-unknown-linux-gnu';
  if (arch === 'riscv64') return 'riscv64gc-unknown-linux-gnu';
  if (arch === 'ppc64') return os.endianness() === 'LE' ? 'powerpc64le-unknown-linux-gnu' : null;
  if (arch === 's390x') return 's390x-unknown-linux-gnu';
  if (arch === 'loong64') return 'loongarch64-unknown-linux-gnu';
  return null;
}

function isMusl() {
  try {
    return process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
  } catch {
    return false;
  }
}

/**
 * What Rust builds need besides cargo: a C compiler and linker (every build links with `cc`),
 * make, pkg-config and the OpenSSL headers (the most common native dependency of web crates).
 * Returns { cmd, args, update? } for the system's package manager, or null if it isn't one we know.
 */
export function systemPackages(pm) {
  if (pm === 'apt-get') return { cmd: 'apt-get', args: ['-o', 'DPkg::Lock::Timeout=120', 'install', '-y', '-qq', 'build-essential', 'pkg-config', 'libssl-dev', 'ca-certificates'], update: ['-o', 'DPkg::Lock::Timeout=120', 'update', '-qq'] };
  if (pm === 'dnf') return { cmd: 'dnf', args: ['install', '-y', '-q', 'gcc', 'gcc-c++', 'make', 'pkgconf-pkg-config', 'openssl-devel', 'ca-certificates'] };
  if (pm === 'pacman') return { cmd: 'pacman', args: ['-Sy', '--noconfirm', '--needed', 'base-devel', 'pkgconf', 'openssl', 'ca-certificates'] };
  if (pm === 'zypper') return { cmd: 'zypper', args: ['--non-interactive', 'install', 'gcc', 'gcc-c++', 'make', 'pkg-config', 'libopenssl-devel', 'ca-certificates'] };
  return null;
}

/** A status line in the deploy log (command output is passed through as it is). */
const note = (say, text) => say(`\n[${new Date().toLocaleTimeString()}] ${text}`);

const onSitePath = (bin) => SYSTEM_BIN_DIRS.some((d) => isExec(path.join(d, bin)));

/** The build tools that are missing, in plain words (empty when everything is there). */
async function missingBuildTools() {
  const missing = [];
  if (!onSitePath('cc') && !onSitePath('gcc')) missing.push('a C compiler');
  if (!onSitePath('make')) missing.push('make');
  if (!onSitePath('pkg-config')) missing.push('pkg-config');
  else if ((await run('pkg-config', ['--exists', 'openssl'], { quiet: true })).code !== 0) missing.push('the OpenSSL headers');
  return missing;
}

async function installBuildTools(say) {
  let missing = await missingBuildTools();
  if (!missing.length) return;
  const pm = ['apt-get', 'dnf', 'pacman', 'zypper'].find((p) => which(p));
  const pkgs = systemPackages(pm);
  if (pkgs) {
    note(say, `Installing build tools Rust needs (${missing.join(', ')})…\n`);
    const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
    const opts = { env, onData: say, quiet: true, timeout: 15 * 60_000 };
    if (pkgs.update) await run(pkgs.cmd, pkgs.update, opts);
    const r = await run(pkgs.cmd, pkgs.args, opts);
    missing = await missingBuildTools();
    if (r.code !== 0 && missing.length) note(say, `⚠ The package manager reported a problem (exit code ${r.code}).\n`);
  }
  if (!missing.length) return;
  // Without a C compiler nothing links; the rest only matters to some crates, so carry on.
  if (missing.includes('a C compiler')) {
    throw new Error(`AutoNode couldn't install the build tools Rust needs (${missing.join(', ')}). Install them on the server (on Ubuntu or Debian: sudo apt-get install build-essential pkg-config libssl-dev), then press Install & Rebuild again.`);
  }
  note(say, `⚠ Couldn't install ${missing.join(', ')}. Most websites build without ${missing.length === 1 ? 'it' : 'them'}; if this build fails, install ${missing.length === 1 ? 'it' : 'them'} on the server.\n`);
}

/** Environment for rustup/cargo run as the site user. */
const toolEnv = () => ({ HOME: config.paths.homeDir, PATH: `${cargoBinDir()}:${SYSTEM_BIN_DIRS.join(':')}`, LANG: process.env.LANG || 'C.UTF-8' });

async function installRustup(say, ids) {
  const triple = rustupTriple();
  if (!triple) throw new Error(`rustup has no installer for this kind of processor (${process.arch})`);
  const url = `https://static.rust-lang.org/rustup/dist/${triple}/rustup-init`;
  note(say, `Installing Rust for the ${config.SITE_USER} user (downloading rustup, this happens once)…\n`);
  const get = async (u) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(5 * 60_000) });
    if (!res.ok) throw new Error(`the download from static.rust-lang.org failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  };
  let bin, sum;
  try {
    [bin, sum] = await Promise.all([get(url), get(`${url}.sha256`)]);
  } catch (err) {
    throw new Error(/HTTP \d+/.test(err.message) ? err.message : `the download from static.rust-lang.org failed (${err.cause?.code || err.cause?.message || err.message})`);
  }
  const expected = sum.toString('utf8').trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected) || crypto.createHash('sha256').update(bin).digest('hex') !== expected) throw new Error('the downloaded installer was damaged on the way (checksum mismatch)');
  // The home folder belongs to the site user: a random name opened with O_EXCL never follows a planted link.
  // The name must start with "rustup-init": rustup decides from its own file name whether it is the installer.
  const file = path.join(config.paths.homeDir, `rustup-init-${crypto.randomBytes(8).toString('hex')}`);
  try {
    fs.writeFileSync(file, bin, { flag: 'wx', mode: 0o755 });
    const r = await run(file, ['-y', '--profile', 'minimal', '--default-toolchain', 'stable', '--no-modify-path'], { cwd: config.paths.homeDir, env: toolEnv(), uid: ids?.uid, gid: ids?.gid, onData: say, quiet: true, timeout: 20 * 60_000 });
    if (r.code !== 0) {
      const why = (r.stderr || r.stdout).trim().split('\n').pop()?.trim().slice(0, 300);
      throw new Error(`the Rust installer stopped with exit code ${r.code}${why ? ` (${why})` : ''}`);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** A rustup that lost its toolchain (interrupted install, cleaned ~/.rustup) gets the stable one back. */
async function repairToolchain(say, ids) {
  const rustup = path.join(cargoBinDir(), 'rustup');
  if (findCargo() !== path.join(cargoBinDir(), 'cargo') || !isExec(rustup)) return;
  const opts = { cwd: config.paths.homeDir, env: toolEnv(), uid: ids?.uid, gid: ids?.gid, quiet: true, timeout: 20 * 60_000 };
  if ((await run(path.join(cargoBinDir(), 'cargo'), ['--version'], opts)).code === 0) return;
  note(say, 'Rust is installed but has no working toolchain; installing the stable one…\n');
  await run(rustup, ['set', 'profile', 'minimal'], opts);
  const r = await run(rustup, ['default', 'stable'], { ...opts, onData: say });
  if (r.code !== 0) throw new Error(`rustup couldn't install the stable toolchain (exit code ${r.code})`);
}

let installing = null;

/**
 * Make sure a Rust website can be built: the system build tools (installed by root
 * with the package manager) and cargo for the site user (rustup, in its home folder).
 * Quick when everything is already there. Two deploys at once share one installation.
 * `ids` is the site user's { uid, gid }.
 */
export function ensureToolchain({ say = () => {}, ids = null } = {}) {
  if (config.DEV || process.platform !== 'linux') {
    // Never install anything on a developer's computer.
    return findCargo() ? Promise.resolve() : Promise.reject(new Error(missingCargoMessage()));
  }
  installing ||= (async () => {
    try {
      await installBuildTools(say);
      try {
        if (!findCargo()) {
          await installRustup(say, ids);
          if (!findCargo()) throw new Error('cargo is still missing after the installation');
          note(say, 'Rust is installed.\n');
        }
        await repairToolchain(say, ids);
      } catch (err) {
        throw new Error(`AutoNode couldn't install Rust by itself: ${err.message}. Check that the server is connected to the internet and has free disk space, then press Install & Rebuild again. To install it by hand, run on the server: ${manualInstall()}`);
      }
    } finally {
      installing = null;
    }
  })();
  return installing;
}
