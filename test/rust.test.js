// Rust websites: detection from Cargo.toml, build/start command choice, snapshots and disk usage.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonode-rust-'));
process.env.AUTONODE_DEV = '1';
process.env.AUTONODE_CONFIG_DIR = path.join(tmp, 'etc');
process.env.AUTONODE_DATA_DIR = path.join(tmp, 'data');

const { which } = await import('../src/util.js');
const config = await import('../src/config.js');
const sites = await import('../src/sites.js');
const deploy = await import('../src/deploy.js');
const rust = await import('../src/rust.js');
const runner = await import('../src/runner.js');

let n = 0;
/** A fresh empty site with the given files. */
async function siteWith(files) {
  const site = await sites.createSite({ name: `r${++n}`, template: 'empty' });
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(sites.siteDir(site.name), rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return sites.getSite(site.name);
}

before(() => config.load());
after(async () => {
  await runner.stopAllChildren();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('Cargo.toml parsing: package name, [[bin]] names, default-run, comments and quotes', () => {
  const c = rust.parseCargoToml(`
# a comment
[package]
name = "my-site"   # trailing comment
version = "0.1.0"
default-run = 'server'

[dependencies]
name = "not-the-package"

[[bin]]
name = "server"
path = "src/main.rs"

[[bin]]
path = "src/no-name.rs"

[[bin]]
name = "migrate"
`);
  assert.equal(c.packageName, 'my-site');
  assert.equal(c.defaultRun, 'server');
  assert.deepEqual(c.bins, ['server', 'migrate']);
  assert.equal(rust.binaryName(c), 'server');

  assert.equal(rust.binaryName(rust.parseCargoToml('[package]\nname = "web_app"\n')), 'web_app');
  assert.equal(rust.binaryName(rust.parseCargoToml('[package]\nname="a"\n[[bin]]\nname="b"\n[[bin]]\nname="a"\n')), 'a', 'a [[bin]] named like the package wins');
  assert.equal(rust.binaryName(rust.parseCargoToml('[package]\nname="a"\n[[bin]]\nname="b"\n')), 'b');
  assert.equal(rust.binaryName(rust.parseCargoToml('[workspace]\nmembers = ["x"]\n')), null);
});

test('unsafe binary names never reach a start command', () => {
  for (const bad of ['a b', 'x;rm -rf /', '$(id)', '../etc', 'a/b', '`id`', 'a"b', '-', 'x'.repeat(65)]) {
    assert.equal(rust.binaryName({ packageName: bad, defaultRun: null, bins: [] }), null, bad);
  }
  const escaped = rust.parseCargoToml('[package]\nname = "a\\"; touch /tmp/x; \\""\n');
  assert.equal(rust.binaryName(escaped), null);
});

test('a Cargo.toml site is Rust: start from target/release, build with cargo (--locked only with Cargo.lock)', async () => {
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "hello-web"\nversion = "0.1.0"\n', 'src/main.rs': 'fn main() {}' });
  assert.equal(sites.siteKind(site), 'rust');
  assert.equal(sites.detectStartCommand(site), './target/release/hello-web');
  assert.equal(deploy.pickBuild(site), 'cargo build --release');
  assert.equal(deploy.pickInstall(site), null);
  fs.writeFileSync(path.join(sites.siteDir(site.name), 'Cargo.lock'), '');
  assert.equal(deploy.pickBuild(site), 'cargo build --release --locked');
  const pub = sites.publicSite(site);
  assert.equal(pub.kind, 'rust');
  assert.equal(pub.detectedCommand, './target/release/hello-web');
});

test('[[bin]] decides the binary', async () => {
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "pkg"\n\n[[bin]]\nname = "api-server"\npath = "src/bin.rs"\n' });
  assert.equal(sites.detectStartCommand(site), './target/release/api-server');
});

test('custom start, install and build commands still win for Rust sites', async () => {
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "pkg"\n' });
  await sites.updateSite(site.name, { startCommand: './run.sh', installCommand: 'cargo fetch', buildCommand: 'cargo build --release --features web' });
  const s = sites.getSite(site.name);
  assert.equal(sites.detectStartCommand(s), './run.sh');
  assert.equal(deploy.pickInstall(s), 'cargo fetch');
  assert.equal(deploy.pickBuild(s), 'cargo build --release --features web');
});

test('package.json wins over Cargo.toml (Node is detected first)', async () => {
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "native"\n', 'package.json': JSON.stringify({ scripts: { start: 'node server.js', build: 'napi build' } }) });
  assert.equal(sites.siteKind(site), 'node');
  assert.equal(sites.detectStartCommand(site), 'npm start');
  assert.equal(deploy.pickBuild(site), 'npm run build');
  const plain = await siteWith({ 'server.js': '' });
  assert.equal(sites.siteKind(plain), 'node');
  assert.equal(sites.detectStartCommand(plain), 'node server.js');
});

test('a Rust site with no program to start explains how to fix it instead of starting', async () => {
  const site = await siteWith({ 'Cargo.toml': '[workspace]\nmembers = ["a", "b"]\n' });
  assert.equal(sites.detectStartCommand(site), '');
  await assert.rejects(sites.startSite(site.name), /Start command/);
});

test('every site gets the autonode user’s ~/.cargo/bin on PATH, after node', async () => {
  const r = await siteWith({ 'Cargo.toml': '[package]\nname = "p"\n' });
  // A Node.js project with a Rust server next to it (package.json + Cargo.toml) needs cargo too.
  const mixed = await siteWith({ 'package.json': '{}', 'Cargo.toml': '[package]\nname = "p"\n' });
  for (const s of [r, mixed]) {
    const p = runner.siteEnv(s).PATH;
    assert.ok(p.includes(`:${rust.cargoBinDir()}:`), `after node’s own folder: ${p}`);
    assert.ok(p.startsWith(path.dirname(process.execPath)), p);
  }
  assert.equal(rust.cargoBinDir(), path.join(config.paths.homeDir, '.cargo', 'bin'));
  assert.match(rust.missingCargoMessage(), /rustup/);
  assert.match(rust.missingCargoMessage(), /sudo -u autonode/);
});

test('custom commands that call cargo make a site need Rust, and starting without cargo explains what to do', async () => {
  for (const c of ['cargo run --release', 'cd server && cargo run', 'npm run build; cargo build --release', '(cargo run)']) assert.ok(rust.usesCargo(c), c);
  for (const c of ['npm start', './target/release/cargo-app', 'node cargo.js', 'cargoes', '']) assert.ok(!rust.usesCargo(c), c);

  const mixed = await siteWith({ 'package.json': '{}', 'Cargo.toml': '[package]\nname = "farm"\n' });
  assert.equal(sites.siteKind(mixed), 'node', 'package.json still wins detection');
  assert.equal(sites.needsRust(mixed), false);
  await sites.updateSite(mixed.name, { startCommand: 'cargo run --release' });
  assert.equal(sites.needsRust(sites.getSite(mixed.name)), true);

  const savedPath = process.env.PATH; // dev mode looks for cargo on PATH: hide it
  process.env.PATH = path.join(tmp, 'empty-bin');
  try {
    await assert.rejects(sites.startSite(mixed.name), /uses cargo, but Rust isn't installed.*Install & Rebuild/);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('automatic Rust install: the right rustup for the processor, the right packages for the system', async () => {
  assert.equal(rust.rustupTriple('x64', { musl: false }), 'x86_64-unknown-linux-gnu');
  assert.equal(rust.rustupTriple('arm64', { musl: false }), 'aarch64-unknown-linux-gnu');
  assert.equal(rust.rustupTriple('arm64', { musl: true }), 'aarch64-unknown-linux-musl');
  assert.equal(rust.rustupTriple('arm', { armVersion: '7', musl: false }), 'armv7-unknown-linux-gnueabihf');
  assert.equal(rust.rustupTriple('arm', { armVersion: '6', musl: false }), 'arm-unknown-linux-gnueabihf');
  assert.equal(rust.rustupTriple('mips', { musl: false }), null);

  const apt = rust.systemPackages('apt-get');
  for (const p of ['build-essential', 'pkg-config', 'libssl-dev']) assert.ok(apt.args.includes(p), p);
  assert.ok(apt.update.includes('update'));
  assert.ok(rust.systemPackages('dnf').args.includes('openssl-devel'));
  assert.ok(rust.systemPackages('pacman').args.includes('base-devel'));
  assert.equal(rust.systemPackages(undefined), null);

  // Dev mode never installs anything on the developer's computer.
  const savedPath = process.env.PATH;
  process.env.PATH = path.join(tmp, 'empty-bin');
  try {
    await assert.rejects(rust.ensureToolchain(), /Rust isn't installed/);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('a deploy without cargo fails with a plain sentence about installing Rust', async () => {
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "p"\n' });
  const savedPath = process.env.PATH; // dev mode looks for cargo on PATH: hide it
  process.env.PATH = path.join(tmp, 'empty-bin');
  try {
    assert.equal(rust.findCargo(), null);
    deploy.deploy(site.name, { pull: false });
    for (let i = 0; i < 400 && deploy.jobStatus(site.name).running; i++) await new Promise((r) => setTimeout(r, 25));
  } finally {
    process.env.PATH = savedPath;
  }
  const j = deploy.jobStatus(site.name);
  assert.equal(j.ok, false);
  assert.match(j.error, /Rust isn't installed/);
});

test('disk usage counts target/ as build files; snapshots skip it', async (t) => {
  const { usage } = await import('../src/features.js');
  const site = await siteWith({ 'Cargo.toml': '[package]\nname = "p"\n', 'src/main.rs': 'fn main() {}', 'target/release/p': 'x'.repeat(4000), 'src/target/keep.rs': 'kept' });
  const u = await usage(site.name, { fresh: true });
  assert.equal(u.kind, 'rust');
  assert.ok(u.target >= 4000, `target counted: ${u.target}`);
  assert.ok(u.code < 4000, `code excludes target: ${u.code}`);

  if (!which('tar')) return t.skip('tar is not installed');
  const snapshots = await import('../src/snapshots.js');
  const snap = await snapshots.create(site.name, { reason: 'test' });
  fs.rmSync(path.join(sites.siteDir(site.name), 'src'), { recursive: true });
  await snapshots.restore(site.name, snap.id);
  const dir = sites.siteDir(site.name);
  assert.ok(fs.existsSync(path.join(dir, 'src', 'main.rs')));
  assert.ok(fs.existsSync(path.join(dir, 'src', 'target', 'keep.rs')), 'only the top-level target/ is skipped');
  assert.equal(fs.existsSync(path.join(dir, 'target')), false, 'build output is not in snapshots');
});
