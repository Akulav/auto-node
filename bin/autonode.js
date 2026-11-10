#!/usr/bin/env node
/**
 * AutoNode CLI — made by Akulav.
 * Host and manage Node.js websites from a friendly web dashboard on your LAN.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [, , cmd = 'help', ...args] = process.argv;
if (args.includes('--dev') || cmd === 'dev') process.env.AUTONODE_DEV = '1';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`AutoNode needs Node.js 18 or newer (you have ${process.version}).`);
  process.exit(1);
}

const config = await import('../src/config.js');
const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const sh = (command, cmdArgs, opts = {}) => spawnSync(command, cmdArgs, { stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8' });

function requireRoot() {
  if (config.DEV) return;
  if (process.platform !== 'linux') {
    console.error(c.red('AutoNode runs on Linux. Use `autonode dev` to try the dashboard on this computer.'));
    process.exit(1);
  }
  if (process.getuid?.() !== 0) {
    console.error(c.red(`Please run with sudo:  sudo autonode ${cmd}`));
    process.exit(1);
  }
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write('');
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a);
    });
  });
}

function lanIp() {
  const r = sh('hostname', ['-I'], { capture: true });
  return (r.stdout || '').trim().split(/\s+/)[0] || 'localhost';
}

const commands = {
  async help() {
    console.log(`
  ${c.bold('AutoNode')} ${c.dim(config.pkg.version)} — host Node.js websites, the simple way.
  ${c.dim('Made with ♥ by Akulav')}

  ${c.bold('Usage')}
    autonode <command>

  ${c.bold('Commands')}
    install       Set up AutoNode as a system service (run with sudo)
    uninstall     Remove the service (your websites are kept)
    serve         Run the dashboard in the foreground
    dev           Try the dashboard locally (any OS, no root, safe)
    status        Show service status and the dashboard address
    setup-code    Show the one-time code for creating your password
    passwd        Change the dashboard password
    update        Update AutoNode to the newest version
    export [file] [--with-files]
                  Back up all settings (and website files)
    import <file> Restore a backup made by "export" or the dashboard
    https on|off  Use HTTPS for the dashboard (self-signed certificate)
    remote on|off Allow opening the dashboard from outside your home network
    logs          Follow AutoNode's own logs
    version       Print the version
`);
  },

  version() {
    console.log(config.pkg.version);
  },

  async serve() {
    const { serve } = await import('../src/server.js');
    await serve();
  },

  async dev() {
    await commands.serve();
  },

  async install() {
    requireRoot();
    const step = (s) => console.log(`${c.blue('›')} ${s}`);
    step('Creating the "autonode" user that runs your websites');
    if (sh('id', ['-u', config.SITE_USER], { capture: true }).status !== 0) {
      sh('useradd', ['--system', '--home-dir', config.paths.homeDir, '--shell', '/usr/sbin/nologin', config.SITE_USER]);
    }
    step('Preparing folders');
    config.load();
    for (const d of [config.paths.sitesDir, config.paths.homeDir]) {
      fs.mkdirSync(d, { recursive: true });
      sh('chown', [`${config.SITE_USER}:${config.SITE_USER}`, d]);
    }

    step('Installing the system service');
    const entry = path.join(config.APP_ROOT, 'bin', 'autonode.js');
    fs.writeFileSync(
      '/etc/systemd/system/autonode.service',
      `# AutoNode — made by Akulav
[Unit]
Description=AutoNode dashboard and web proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${entry} serve
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`,
    );
    try {
      fs.symlinkSync(entry, '/usr/local/bin/autonode');
    } catch {}
    try {
      fs.chmodSync(entry, 0o755);
    } catch {}
    sh('systemctl', ['daemon-reload']);
    sh('systemctl', ['enable', '--now', 'autonode']);
    sh('systemctl', ['restart', 'autonode']);

    const cfg = config.load();
    console.log(`
  ${c.green('✓ AutoNode is running.')}

  Open ${c.bold(`http://${lanIp()}:${cfg.dashboard.port}`)} on any device in your home network.
  ${cfg.auth.hash ? '' : `Your setup code is ${c.bold(cfg.auth.setupCode)}\n`}
  ${c.dim('Made with ♥ by Akulav')}
`);
  },

  async uninstall() {
    requireRoot();
    sh('systemctl', ['disable', '--now', 'autonode']);
    fs.rmSync('/etc/systemd/system/autonode.service', { force: true });
    fs.rmSync('/usr/local/bin/autonode', { force: true });
    sh('systemctl', ['daemon-reload']);
    console.log(`AutoNode was removed. Your websites still run and their files are in ${config.paths.sitesDir}.`);
    console.log(`To remove everything: sudo rm -rf ${config.paths.configDir} ${config.paths.dataDir} /etc/systemd/system/autonode-site-*.service`);
  },

  async status() {
    const cfg = config.load();
    if (!config.DEV) sh('systemctl', ['--no-pager', 'status', 'autonode']);
    console.log(`\n  Dashboard: ${c.bold(`http://${lanIp()}:${cfg.dashboard.port}`)}`);
    console.log(`  Websites:  ${Object.keys(cfg.sites).length}`);
  },

  async 'setup-code'() {
    requireRoot();
    const cfg = config.load();
    if (cfg.auth.hash) console.log('A password is already set. Use "sudo autonode passwd" to change it.');
    else console.log(`Setup code: ${c.bold(cfg.auth.setupCode)}`);
  },

  async passwd() {
    requireRoot();
    config.load();
    const auth = await import('../src/auth.js');
    const a = await ask('New password: ', { hidden: true });
    const b = await ask('Repeat password: ', { hidden: true });
    if (a !== b) {
      console.error(c.red("Passwords don't match."));
      process.exit(1);
    }
    try {
      await auth.setPassword(a);
    } catch (err) {
      console.error(c.red(err.message));
      process.exit(1);
    }
    if (!config.DEV) sh('systemctl', ['restart', 'autonode']);
    console.log(c.green('✓ Password changed. Everyone was signed out.'));
  },

  async update() {
    requireRoot();
    config.load();
    const su = await import('../src/selfupdate.js');
    console.log('Checking for updates…');
    const info = await su.check();
    if (!info.gitInstall) return console.log('This copy was not installed with git. Re-run the installer to update.');
    if (info.upToDate) return console.log(c.green(`✓ You're up to date (${info.version}).`));
    console.log(`Updating ${info.version} → ${info.latestVersion} (${info.commits.length} changes)…`);
    await su.apply();
    console.log(c.green('✓ Updated. AutoNode is restarting.'));
  },

  async export() {
    requireRoot();
    config.load();
    (await import('../src/certs.js')).reload();
    const backup = await import('../src/backup.js');
    const withFiles = args.includes('--with-files') || args.includes('--all');
    const out = path.resolve(args.find((a) => !a.startsWith('--')) || backup.exportFilename(withFiles));
    if (withFiles) await backup.streamFullExport(fs.createWriteStream(out, { mode: 0o600 }));
    else fs.writeFileSync(out, JSON.stringify(backup.buildManifest(), null, 2), { mode: 0o600 });
    console.log(c.green(`✓ Saved ${withFiles ? 'full backup' : 'settings backup'} to ${out}`));
    console.log(c.dim('  It contains private keys and tokens — keep it somewhere safe.'));
  },

  async import() {
    requireRoot();
    const file = args.find((a) => !a.startsWith('--'));
    if (!file || !fs.existsSync(file)) {
      console.error('Usage: sudo autonode import <backup.json | backup.tar.gz> [--keep-settings]');
      process.exit(1);
    }
    config.load();
    (await import('../src/certs.js')).reload();
    const backup = await import('../src/backup.js');
    const s = await backup.inspect(path.resolve(file));
    console.log(`Backup from ${new Date(s.createdAt).toLocaleString()}${s.hostname ? ` (${s.hostname})` : ''}: ${s.sites.length} websites, ${s.certificates} certificates.`);
    const yes = args.includes('--yes') || /^y/i.test(await ask('Restore it? Websites with the same name will be replaced. [y/N] '));
    if (!yes) return console.log('Cancelled.');
    // Copy so the original file isn't deleted by restore().
    const tmp = path.join(config.paths.tmpDir, `cli-import-${Date.now()}`);
    fs.copyFileSync(file, tmp);
    if (!config.DEV) sh('systemctl', ['stop', 'autonode']);
    try {
      const r = await backup.restore(tmp, { settings: !args.includes('--keep-settings') });
      console.log(c.green(`✓ Restored ${r.sites.length} websites and ${r.certificates} certificates.`));
      for (const w of r.warnings) console.log(c.dim(`  • ${w}`));
    } finally {
      if (!config.DEV) sh('systemctl', ['start', 'autonode']);
    }
  },

  /** Turn the dashboard's HTTPS on/off from the server (handy if a browser refuses the certificate). */
  async https() {
    requireRoot();
    const mode = args.find((a) => !a.startsWith('--'));
    if (!['on', 'off'].includes(mode)) {
      console.error('Usage: sudo autonode https on|off');
      process.exit(1);
    }
    config.load();
    if (mode === 'on') await (await import('../src/dashtls.js')).ensureCert();
    const wasRemote = config.get().dashboard.allowPublic;
    config.update((cfg) => {
      cfg.dashboard.https = mode === 'on';
      if (mode === 'off') cfg.dashboard.allowPublic = false; // remote access is only allowed over HTTPS
    });
    if (!config.DEV) sh('systemctl', ['restart', 'autonode']);
    console.log(c.green(`✓ Dashboard is now ${mode === 'on' ? 'https' : 'http'}://${lanIp()}:${config.get().dashboard.port}`));
    if (mode === 'off' && wasRemote) console.log(c.dim('  Remote access was turned off too: it needs HTTPS.'));
  },

  /** Allow or block opening the dashboard from outside the home network. */
  async remote() {
    requireRoot();
    const mode = args.find((a) => !a.startsWith('--'));
    if (!['on', 'off'].includes(mode)) {
      console.error('Usage: sudo autonode remote on|off');
      process.exit(1);
    }
    config.load();
    if (mode === 'on' && !config.get().dashboard.https) {
      console.error(c.red('Turn on HTTPS first, so your password is encrypted on the internet:  sudo autonode https on'));
      process.exit(1);
    }
    if (mode === 'on' && !config.get().auth.hash) {
      console.error(c.red('Choose a dashboard password first (open the dashboard at home, or run: sudo autonode passwd).'));
      process.exit(1);
    }
    config.update((cfg) => (cfg.dashboard.allowPublic = mode === 'on'));
    if (!config.DEV) sh('systemctl', ['restart', 'autonode']);
    console.log(c.green(mode === 'on' ? `✓ Remote access is on. Forward port ${config.get().dashboard.port} (TCP) on your router to this computer.` : '✓ Remote access is off. Only your home network can open the dashboard.'));
  },

  logs() {
    sh('journalctl', ['-u', 'autonode', '-f', '-n', '100']);
  },
};

const fn = commands[cmd] || commands[cmd.replace(/^--?/, '')];
if (!fn) {
  console.error(`Unknown command "${cmd}".`);
  await commands.help();
  process.exit(1);
}
try {
  await fn();
} catch (err) {
  console.error(c.red(err.message));
  process.exit(1);
}
