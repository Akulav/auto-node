/**
 * Rust websites: a folder with a Cargo.toml (and no package.json) is built with
 * cargo and started from target/release/<binary>.
 *
 * Cargo.toml comes from the repository, so it is untrusted: we read only the
 * few keys we need with a tiny line-based reader (no dependencies), and the
 * binary name must match BIN_NAME_RE before it can reach a start command that
 * the root daemon writes into the site's start script.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';

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
 * installing Rust takes effect on the next deploy.
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

export function missingCargoMessage() {
  const home = config.paths.homeDir;
  return (
    `Rust isn't installed for the ${config.SITE_USER} user, so this website can't be built. ` +
    `Install it once on the server with: sudo -u ${config.SITE_USER} env HOME=${home} sh -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal" ` +
    `— then press Install & Rebuild again.`
  );
}
