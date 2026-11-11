# Architecture

AutoNode is one Node.js process (`autonode.service`, running as root) that does three jobs:

1. **Dashboard** — a JSON API and a static single-page app on port `7070`, reachable only from private/LAN addresses.
2. **Reverse proxy** — listens on `80` and `443`, picks the website by `Host` header (and TLS certificate by SNI), and forwards to the site's local port.
3. **Supervisor glue** — writes systemd units for websites, runs deploys, keeps DNS updated and checks for updates.

The websites themselves are **separate systemd services**, so they keep serving even while AutoNode restarts or updates.

```
                Internet
                   │
         Cloudflare (proxy, DNS, TLS edge)
                   │  443 (Origin Certificate) / 80
   ┌───────────────▼────────────────────────────┐
   │  autonode.service (root)                    │
   │   ├─ proxy.js   :80/:443  ──► 127.0.0.1:3001 ──► autonode-site-blog.service  (user autonode)
   │   │                        ──► 127.0.0.1:3002 ──► autonode-site-shop.service
   │   ├─ server.js  :7070  ◄── browser on your LAN
   │   ├─ cloudflare.js  (DNS, dynamic DNS, origin certs)
   │   ├─ deploy.js      (git fetch → install → build → restart)
   │   └─ selfupdate.js  (git pull on /opt/autonode)
   └─────────────────────────────────────────────┘
```

## Source layout

| File | Responsibility |
| --- | --- |
| `bin/autonode.js` | CLI entry point (`install`, `serve`, `passwd`, …) |
| `src/config.js` | Paths, defaults, atomic JSON config (`/etc/autonode/config.json`, mode 600) |
| `src/server.js` | HTTP API router, auth gate, CSRF/origin check, static files, startup |
| `src/auth.js` | scrypt password hash, HMAC-signed session cookie, LAN address check |
| `src/stats.js` | CPU/memory/disk/network sampling every 2 s, 3-minute history, SSE fan-out |
| `src/sites.js` | Website CRUD, port allocation, start-command detection, ownership |
| `src/runner.js` | systemd units, status (`systemctl show`), logs (`journalctl`); in-process fallback for dev |
| `src/proxy.js` | Reverse proxy with SNI, WebSocket upgrade, HTTPS redirect, deploy-hook path |
| `src/certs.js` | Store/validate certificates, SAN parsing, exact + wildcard matching |
| `src/cloudflare.js` | Cloudflare API: zones, A records, dynamic DNS loop, Origin CA, SSL mode |
| `src/files.js` | Path-confined file operations, unzip, placing finished uploads |
| `src/uploads.js` | Chunked, resumable uploads (idempotent pieces at byte offsets, free-space check, stale cleanup) |
| `src/deploy.js` | Git connect/check/deploy, auto-update loop, webhook verification, workflow generator |
| `src/settings.js` | API routes behind the Settings page, grouped like its tabs: updates, web server, backups, export & import, security, remote access |
| `src/features.js` | API routes for the per-website features below (registered into the router in `server.js`) |
| `src/activity.js` | Activity log (JSONL, rotated at 5 MB, kept 30 days, pruned hourly or up to a chosen date) and plain-language labels for dashboard actions |
| `src/snapshots.js` | Pre-deploy and manual snapshots (`tar`, no `node_modules` or a Rust site's top-level `target/`); restore runs tar as the site user, keeps locked files |
| `src/history.js` | Last 50 deploys per site with logs |
| `src/health.js` | Health-check loop: probe `127.0.0.1:port/path`, restart after N failures, startup grace and cooldown |
| `src/traffic.js` | www handling, redirects, maintenance page, password protection (scrypt + cache + lockout) |
| `src/visitors.js` | Visitor stats: hourly/daily buckets, daily-salted visitor hashes, bot filter |
| `src/tasks.js` | Cron parser and per-site scheduled tasks |
| `src/dashtls.js` | Self-signed certificate for the dashboard; the dashboard port sniffs the first byte to serve HTTP and HTTPS |
| `src/icons.js` | Finds each website's favicon (files, `index.html` links, then the live site) with byte-level type detection |
| `src/locks.js` | Locked files: patterns that GitHub updates never modify or delete |
| `src/network.js` | Interface info, static IP via `nmcli` or netplan |
| `src/selfupdate.js` | Update AutoNode from its own git checkout |
| `src/backup.js` | Export (JSON manifest or `.tar.gz` with site files) and restore with clash resolution |
| `public/` | The web app, plain ES modules: `ui.js` (shared helpers: `h()`, `api()`, sheets, toasts…), `app.js` (shell, router, pages), `settings.js` (Settings tabs at `#/settings/<tab>`), `site-settings.js` (a website's Settings sections at `#/sites/<name>/settings/<section>`), `app.css` |

## Websites

Each website has:

- a folder: `/var/lib/autonode/sites/<name>` owned by `autonode:autonode`
- a local port (from `3001` up), passed to the app as `PORT`
- `/var/lib/autonode/run/<name>.sh` — `cd` + `exec <start command>` (root-owned, mode 755: the site user can run it but not change it; it can't live in `/etc/autonode`, which is root-only)
- `/etc/autonode/env/<name>.env` — `PORT`, `NODE_ENV=production`, `HOST`, `PATH` and the user's variables
- `/etc/systemd/system/autonode-site-<name>.service` — `User=autonode`, `Restart=always`, `NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`

A website is **Node.js** or **Rust** (`src/rust.js`): a folder with a `Cargo.toml` and no `package.json` is Rust; everything else is Node.js. The dashboard shows which.

The start command is auto-detected unless set:

- **Node.js:** `npm start` if `package.json` has a start script, else `node <main>`, else the first of `server.js`, `index.js`, `app.js`, …
- **Rust:** `./target/release/<binary>`. The binary is `[package] default-run`, else a `[[bin]]` named like the package, else the first `[[bin]]`, else `[package] name`. `Cargo.toml` is untrusted, so it is read by a small line-based reader (no dependencies) and the name must match `^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$` before it can go into the root-written start script. If no name is found (e.g. a bare workspace) the site refuses to start and asks for a Start command.

Rust sites get the `autonode` user's `~/.cargo/bin` (`/var/lib/autonode/home/.cargo/bin`, where rustup installs) on their `PATH`, for builds, tasks and the running site. Before a Rust site's install/build steps, `rust.ensureToolchain()` makes sure it can be built: as root it installs missing build tools with the package manager (C compiler, `make`, `pkg-config`, OpenSSL headers; apt/dnf/pacman/zypper), and if there is no `cargo` it downloads `rustup-init` for this processor from `static.rust-lang.org`, checks its SHA-256, and runs it as the `autonode` user (`-y --profile minimal --no-modify-path`). A rustup without a working toolchain gets `stable` back. Nothing is installed in dev mode. A missing C compiler or a failed Rust install stops the deploy with a sentence saying what to do; other missing tools are only a warning.

## Deploys

`deploy(name)` runs as the `autonode` user:

1. `git init` + `remote add` (first time) — works even if the folder already has files
2. `git fetch --depth 50 origin <branch>`, then the **update safety check** (`planUpdate()`), then `git reset --hard FETCH_HEAD`:
   - Untracked files (made by the website, not in the repo) are untouched by `reset` and never block.
   - A tracked file modified on the server that the new commit deletes is copied aside and restored (it becomes untracked).
   - A tracked file modified on the server that the new commit still has, or an untracked file at a path the new commit adds, is a **conflict** (unless the content is identical or a lock covers it). Conflicts pause the deploy, store `git.blocked`, and stop auto-updates until the user picks `resolve: "keep"` (keep + lock) or `"overwrite"`.
   - Files matched by the site's **locks** (`src/locks.js`: exact paths, `folder/`, globs) are always copied aside and restored.
   - Every kept/overwritten file is first copied to `/var/lib/autonode/rescued/<site>/<timestamp>-kept|overwritten/`.
3. Install: `npm ci` (lockfile) / `npm install`, or pnpm/yarn if their lockfile and binary exist, or the custom command. Rust sites skip it (cargo fetches crates while building).
4. Build: `npm run build` if a build script exists; for Rust `cargo build --release --locked` (without `--locked` when there's no `Cargo.lock`); or the custom command
5. Restart the service

Private repositories use a fine-grained token passed through `GIT_CONFIG_*` environment variables (never written to `.git/config` and not visible in `ps`).

Triggers: the dashboard button, the auto-update loop (polls every N minutes), and `POST /.autonode/deploy/<name>` on any public hostname — accepted with a GitHub `X-Hub-Signature-256` HMAC or `Authorization: Bearer <secret>`.

## Security model

- Websites can't use the dashboard or proxy ports, and the proxy never forwards to them: proxied traffic arrives from 127.0.0.1 and would otherwise pass the LAN check below.
- The proxy only believes `CF-Connecting-IP` / `X-Forwarded-*` from Cloudflare's IP ranges or loopback (Tunnel); otherwise it replaces them with the real peer address.
- Root never follows symlinks when copying website files during updates (`plainFile()`, `O_NOFOLLOW`), and `chown -R -h` doesn't either.
- The dashboard rejects any client outside private ranges (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`, loopback, IPv6 ULA/link-local) unless **Remote Access** (`dashboard.allowPublic`) is on. Remote access can only be turned on while dashboard HTTPS is on, turning HTTPS off turns it off, and outside clients are refused over plain HTTP even if a hand-edited config says otherwise. Outside visitors get HSTS and `/api/session` tells signed-out strangers neither the hostname nor the version. `sudo autonode remote off` is the escape hatch.
- First-run password creation requires the setup code printed by the installer, and a device on the home network.
- Passwords use scrypt; sessions are HMAC-signed cookies (`HttpOnly`, `SameSite=Strict`); changing the password or "Sign out everywhere" rotates the signing secret.
- Mutating requests with a foreign `Origin` (or, without `Origin`, a cross-site `Sec-Fetch-Site`) are rejected; strict CSP and `X-Frame-Options: DENY` on all pages.
- Login lockouts escalate per address (5 → 1 min, 10 → 15 min, 20+ → 1 h). 30 wrong passwords from the internet within 15 minutes pause *outside* sign-ins for 15 minutes; home-network sign-ins keep working.
- Websites run unprivileged; secrets (`config.json`, keys, env files) are root-only (`0600`).
- File operations resolve real paths and refuse anything outside the site folder. Because the website's own code can change its folder at any time, root opens files with `O_NOFOLLOW`, checks where the opened descriptor really is (`/proc/self/fd`), and writes through a fresh random temp file (`O_EXCL`) that is renamed into place — never through a path the website could have turned into a symlink.

## Data reliability

- `config.json` and every state file (deploy history, task runs, visitor stats, snapshot metadata, certificates) are written with `writeFileAtomic()`: temp file → `fsync` → rename → `fsync` of the folder, so a crash or power cut leaves the old or the new version, never half a file.
- Before each config save the current file is kept as `config.json.bak`. If `config.json` can't be parsed at startup, AutoNode restores the `.bak`, keeps the damaged file as `config.json.damaged-<time>`, and logs it.
- `config.update()` is all-or-nothing: if the change throws or the disk is full, the in-memory settings are rolled back too.
- Damaged visitor-stat files are set aside instead of being overwritten; deleting a website also clears its in-memory stats, health state, icon and disk-usage caches.
- Edited and uploaded website files are replaced atomically and keep their permissions.

## Dev mode

`autonode dev` (or any non-Linux OS) uses `./.dev/` for config and data, an in-process supervisor instead of systemd, ports 8080/8443 for the proxy, skips the setup code and simulates network changes. Nothing on the host system is modified.
