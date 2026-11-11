<div align="center">

<img src="public/favicon.svg" width="96" height="96" alt="AutoNode logo">

# AutoNode

**Your websites, your server.** Host Node.js and Rust websites on your own Linux machine and run them from a beautiful dashboard on your home network — domains, HTTPS, GitHub deploys, files, logs and live system stats, with all the technical stuff hidden away. Plain Node.js, zero dependencies.

![Node](https://img.shields.io/badge/node-%E2%89%A5%2018.17-5fb3a1)
![Platform](https://img.shields.io/badge/platform-linux-5fb3a1)
![License](https://img.shields.io/badge/license-source--available-8ea1a4)

Made with ♥ by **Akulav**

</div>

---

## Features

| | |
| --- | --- |
| **Live overview** | CPU, memory and free disk space in real time, with history charts, temperature, network speed and uptime. |
| **Websites** | Create a site from a starter page, a GitHub repo or your own files. Start, stop and restart with one click. Each site runs as its own system service and survives reboots. |
| **Node.js and Rust** | AutoNode sees what kind of website it is. Node.js: `npm`/`pnpm`/`yarn` install, `npm run build`, `npm start`. Rust (a `Cargo.toml`): `cargo build --release`, then the program from `target/release/`. Your own start, install and build commands always win. |
| **Files** | Browse, upload (files, whole folders or a .zip), edit, rename, download and delete — right in the browser. |
| **Logs** | Everything your site prints, streamed live. |
| **Domains** | Step-by-step Cloudflare setup. Paste an API token and AutoNode creates DNS records, keeps them pointed at your home IP (dynamic DNS) and connects subdomains like `blog.akulav.com`. |
| **Many domains, one PC** | Host as many domains as you like side by side — `akulav.com`, `another-site.dev`, `shop.example.org` — each website can have several domains and subdomains, and every domain gets its own certificate. |
| **HTTPS** | Paste a Cloudflare Origin Certificate, or let AutoNode create one automatically. Built-in reverse proxy with SNI, WebSockets and HTTP → HTTPS redirects. |
| **GitHub deploys** | Connect a repo (public or private), check for new commits, deploy with one click, auto-update on a schedule, or deploy instantly via webhook or a ready-made GitHub Actions workflow. |
| **Safe updates** | Updates never silently overwrite data your website saved. Files your site creates are always kept; if an update would replace a file the site changed, it pauses and asks. Lock files, folders or patterns (`db.sqlite`, `data/`, `*.sqlite`) so updates never touch them. |
| **Data folder** | Every website gets a `DATA_DIR` environment variable (`process.env.DATA_DIR`, `std::env::var("DATA_DIR")`), a folder for databases and uploads that deploys, rollbacks and cleanups never touch. Browse it in the Files tab; it's included in full backups. |
| **Rollback & history** | A snapshot before every GitHub deploy, with one-click **Roll back** / **Undo**. Deploy history shows every deploy (commit, who, how long, full log) with **Redeploy** for any earlier version. |
| **Health checks & limits** | AutoNode pings each site and restarts it if it stops answering, even when the process still looks alive. Optional memory cap per site so one leaking app can't slow the others. |
| **Visitor stats** | Visitors, requests, errors, bandwidth and top pages per site, counted by the proxy. No cookies, no tracking scripts, no IP addresses stored; bots counted separately. |
| **Traffic rules** | `www` ↔ apex handling, custom redirects (`/old` → `/new`, `/blog/*` → `/news/*`), maintenance mode with a "Back soon" page, and password protection for staging or private sites. |
| **Scheduled tasks** | Cron-style jobs per site (`0 3 * * *`, `@daily`…), run as the site user with its environment, with output and history for every run. |
| **Disk usage** | See how much each site uses (code, packages or Rust build files, git, data, snapshots) and clean or reinstall `node_modules` — or clean and rebuild a Rust site's `target/` — in one click. |
| **Automatic backups** | Nightly full backups, keeping the last N, optionally copied to another disk or network share. Download or restore any of them from Settings. |
| **Activity log** | Who did what, and when: dashboard changes, deploys, health-check restarts, backups, tasks and sign-ins (including failed ones). |
| **Network** | See your IP, router and DNS. Switch to a fixed (static) IP from the dashboard — NetworkManager and netplan supported. |
| **Backup & restore** | Export all settings (websites, domains, env vars, certificates, Cloudflare) as one `.json`, or everything including website files as a `.tar.gz`. Import on any machine to restore or migrate — with a preview before anything changes. |
| **Self-updating** | AutoNode checks its own repository and updates itself (optionally automatically). |
| **Safe by default** | Password-protected dashboard that only your home network can reach (optional remote access over HTTPS), with optional HTTPS on the same port. Websites run as an unprivileged `autonode` user with systemd hardening. |

## Requirements

- A Linux machine with systemd (Ubuntu, Debian, Raspberry Pi OS, Fedora, Arch…)
- Node.js 18.17 or newer (the installer adds Node 22 if missing)
- `git`, `unzip`, `openssl` (installed automatically)
- For Rust websites: nothing to do. The first deploy installs Rust (rustup, for the `autonode` user) and the build tools it needs
  (a system-wide `cargo` in `/usr/bin` works too)
- Optional: a domain on [Cloudflare](https://dash.cloudflare.com) — e.g. one bought through Cloudflare Registrar

## Getting started

```bash
curl -fsSL https://raw.githubusercontent.com/Akulav/auto-node/main/install.sh | sudo bash
```

The installer prints the dashboard address (for example `http://192.168.1.50:7070`) and a one-time **setup code**. Open the address from any device on your home network, enter the code and choose a password. Lost the code? Run `sudo autonode setup-code`.

Prefer to install by hand:

```bash
sudo git clone https://github.com/Akulav/auto-node.git /opt/autonode
sudo node /opt/autonode/bin/autonode.js install
```

Want to try the dashboard first, on any OS, without root? Dev mode keeps everything in a local `.dev/` folder and simulates network changes:

```bash
npm run dev     # then open http://localhost:7070
```

Run the tests:

```bash
npm test
```

### Putting a website on your domain

1. **Domains** → follow the five steps (connect Cloudflare, forward ports 80/443 or use a Cloudflare Tunnel, create the HTTPS certificate, set SSL to *Full (strict)*).
2. **Websites** → **New Website** → pick *Starter page*, *From GitHub* or *Upload my own files*.
3. Open the website → **Domains** → add `akulav.com` or `blog.akulav.com`. Done.

Have more domains? With an API token that covers *All zones*, the Domains page lists every one — create a certificate for each, then attach them to whichever websites you like. One computer can serve any number of domains.

Your app only needs to listen on `process.env.PORT`.

## CLI

| Command | What it does |
| --- | --- |
| `sudo autonode install` | Install or repair the system service |
| `sudo autonode uninstall` | Remove the service (websites keep running, files are kept) |
| `autonode status` | Service status and dashboard address |
| `sudo autonode setup-code` | Show the first-run setup code |
| `sudo autonode passwd` | Change the dashboard password |
| `sudo autonode update` | Update AutoNode now |
| `sudo autonode export [file] [--with-files]` | Back up settings (and website files with `--with-files`) |
| `sudo autonode import <file> [--keep-settings]` | Restore a backup from the CLI or the dashboard |
| `sudo autonode https on\|off` | Turn HTTPS for the dashboard on or off (use `off` if a browser locks you out) |
| `sudo autonode remote on\|off` | Allow opening the dashboard from outside your home network (needs HTTPS) |
| `autonode logs` | Follow AutoNode's own logs |
| `autonode dev` | Run the dashboard locally in dev mode |

## Configuration

Most settings live in the dashboard. A few can be set with environment variables (for example in `/etc/systemd/system/autonode.service`):

| Variable | Default | Description |
| --- | --- | --- |
| `AUTONODE_CONFIG_DIR` | `/etc/autonode` | Settings, certificates and per-site environment files |
| `AUTONODE_DATA_DIR` | `/var/lib/autonode` | Website files and the site user's home |
| `AUTONODE_DEV` | — | `1` runs in dev mode (local folders, no systemd, simulated network) |
| `AUTONODE_REPO` | `https://github.com/Akulav/auto-node.git` | Installer: where to download AutoNode from |
| `AUTONODE_DIR` | `/opt/autonode` | Installer: where to install AutoNode |

Ports (dashboard `7070`, HTTP `80`, HTTPS `443`) can be changed in `/etc/autonode/config.json`; restart with `sudo systemctl restart autonode`.

### Remote access

The dashboard only answers your home network (and VPNs like Tailscale) by default. To open it from anywhere, turn on **Settings → Security → Secure dashboard (HTTPS)**, then **Settings → Remote Access**, and forward port `7070` (TCP) on your router to the server. Outside visitors are only ever served over HTTPS, wrong passwords lock an address for longer each time, and a burst of wrong passwords from the internet pauses outside sign-ins while home sign-ins keep working. Turn it off from the dashboard or with `sudo autonode remote off`.

## Upgrading

AutoNode updates itself from GitHub. Your websites keep running during the update.

1. Open **Settings** → **General** → **Check for Updates**.
2. Click **Update Now**, or turn on **Install updates automatically** (checks daily).
3. From a terminal you can also run `sudo autonode update`.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## Data and backups

Everything AutoNode stores lives in two folders:

```
/etc/autonode/
  config.json       settings, websites, password hash, Cloudflare token (root-only)
  certs/            HTTPS certificates and private keys
  env/              environment variables for each website
/var/lib/autonode/
  sites/<name>/     each website's files
  sitedata/<name>/  each website's DATA_DIR (databases, uploads)
  snapshots/        rollback copies, newest 5 per site (root only)
  history/          deploy history and logs (root only)
  backups/          automatic and manual full backups (root only)
  visitors/         visitor stats per site (root only, no IP addresses)
  tasks/            scheduled task output (root only)
  activity.log      activity log (root only)
  run/              generated start scripts
  home/             the site user's home: npm cache, and Rust (~/.cargo, ~/.rustup) if installed
/etc/systemd/system/autonode-site-<name>.service   one service per website
```

The easy way to back up is **Settings → Backup & Restore**:

- **Settings only** (`.json`): websites, domains, environment variables, certificates with private keys, Cloudflare token and preferences.
- **Everything** (`.tar.gz`): the above plus every website's files (`node_modules` and Rust `target/` folders are skipped, and reinstalled or rebuilt on restore).

Import shows what's inside before applying. Websites with the same name are replaced, others are kept, and the dashboard password of the machine you restore onto stays the same. Port or domain clashes are resolved automatically and reported.

From a terminal — for example to move to a new server:

```bash
sudo autonode export ~/autonode.tar.gz --with-files    # old machine
sudo autonode import ~/autonode.tar.gz                 # new machine (after installing AutoNode)
```

Backups contain private keys and tokens; store them somewhere private.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit together — services, proxy, deploys, security model
- [docs/API.md](docs/API.md): the dashboard's HTTP API and the deploy webhook
- [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md): the full Cloudflare walkthrough, with troubleshooting
- [CLAUDE.md](CLAUDE.md): notes for AI coding assistants working on this repo
- [CHANGELOG.md](CHANGELOG.md): release history

## Tech stack

- **Backend:** Node.js (≥ 18.17) standard library only — `http`/`https` reverse proxy with SNI, systemd for process supervision, journald for logs, Cloudflare API via `fetch`.
- **Frontend:** a single-page app in plain JavaScript and CSS — no framework, no build step. Light and dark mode, works on phones.

## License

Source-available. See [LICENSE](LICENSE). © 2026 Akulav.
