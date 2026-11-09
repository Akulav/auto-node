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
| `src/locks.js` | Locked files: patterns that GitHub updates never modify or delete |
| `src/network.js` | Interface info, static IP via `nmcli` or netplan |
| `src/selfupdate.js` | Update AutoNode from its own git checkout |
| `src/backup.js` | Export (JSON manifest or `.tar.gz` with site files) and restore with clash resolution |
| `public/` | The web app (`index.html`, `app.js`, `app.css`, icon) |

## Websites

Each website has:

- a folder: `/var/lib/autonode/sites/<name>` owned by `autonode:autonode`
- a local port (from `3001` up), passed to the app as `PORT`
- `/var/lib/autonode/run/<name>.sh` — `cd` + `exec <start command>` (root-owned, mode 755: the site user can run it but not change it; it can't live in `/etc/autonode`, which is root-only)
- `/etc/autonode/env/<name>.env` — `PORT`, `NODE_ENV=production`, `HOST`, `PATH` and the user's variables
- `/etc/systemd/system/autonode-site-<name>.service` — `User=autonode`, `Restart=always`, `NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`

The start command is auto-detected unless set: `npm start` if `package.json` has a start script, else `node <main>`, else the first of `server.js`, `index.js`, `app.js`, …

## Deploys

`deploy(name)` runs as the `autonode` user:

1. `git init` + `remote add` (first time) — works even if the folder already has files
2. `git fetch --depth 50 origin <branch>`, then the **update safety check** (`planUpdate()`), then `git reset --hard FETCH_HEAD`:
   - Untracked files (made by the website, not in the repo) are untouched by `reset` and never block.
   - A tracked file modified on the server that the new commit deletes is copied aside and restored (it becomes untracked).
   - A tracked file modified on the server that the new commit still has, or an untracked file at a path the new commit adds, is a **conflict** (unless the content is identical or a lock covers it). Conflicts pause the deploy, store `git.blocked`, and stop auto-updates until the user picks `resolve: "keep"` (keep + lock) or `"overwrite"`.
   - Files matched by the site's **locks** (`src/locks.js`: exact paths, `folder/`, globs) are always copied aside and restored.
   - Every kept/overwritten file is first copied to `/var/lib/autonode/rescued/<site>/<timestamp>-kept|overwritten/`.
3. Install: `npm ci` (lockfile) / `npm install`, or pnpm/yarn if their lockfile and binary exist, or the custom command
4. Build: `npm run build` if a build script exists, or the custom command
5. Restart the service

Private repositories use a fine-grained token passed through `GIT_CONFIG_*` environment variables (never written to `.git/config` and not visible in `ps`).

Triggers: the dashboard button, the auto-update loop (polls every N minutes), and `POST /.autonode/deploy/<name>` on any public hostname — accepted with a GitHub `X-Hub-Signature-256` HMAC or `Authorization: Bearer <secret>`.

## Security model

- Websites can't use the dashboard or proxy ports, and the proxy never forwards to them: proxied traffic arrives from 127.0.0.1 and would otherwise pass the LAN check below.
- The proxy only believes `CF-Connecting-IP` / `X-Forwarded-*` from Cloudflare's IP ranges or loopback (Tunnel); otherwise it replaces them with the real peer address.
- Root never follows symlinks when copying website files during updates (`plainFile()`, `O_NOFOLLOW`), and `chown -R -h` doesn't either.
- The dashboard rejects any client outside private ranges (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`, loopback, IPv6 ULA/link-local) unless `dashboard.allowPublic` is set.
- First-run password creation requires the setup code printed by the installer.
- Passwords use scrypt; sessions are HMAC-signed cookies (`HttpOnly`, `SameSite=Strict`); changing the password rotates the signing secret.
- Mutating requests with a foreign `Origin` are rejected; strict CSP and `X-Frame-Options: DENY` on all pages.
- Login is rate-limited per IP.
- Websites run unprivileged; secrets (`config.json`, keys, env files) are root-only (`0600`).
- File operations resolve real paths and refuse anything outside the site folder.

## Dev mode

`autonode dev` (or any non-Linux OS) uses `./.dev/` for config and data, an in-process supervisor instead of systemd, ports 8080/8443 for the proxy, skips the setup code and simulates network changes. Nothing on the host system is modified.
