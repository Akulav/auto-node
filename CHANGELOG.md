# Changelog

All notable changes to AutoNode are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-09

### Added

- **Data folder.** Every website gets `process.env.DATA_DIR` (`/var/lib/autonode/sitedata/<site>`) for databases and uploads. Deploys, rollbacks and cleanups never touch it. It's browsable in the Files tab ("Data folder") and included in full backups.
- **Snapshots & rollback.** A snapshot of the website folder (code + git history, without `node_modules`) is taken before every GitHub deploy, plus on demand. **Roll back** restores it, keeps locked files and the data folder, takes a safety snapshot first, pauses automatic updates and reinstalls. The newest 5 per site are kept.
- **Deploy history.** The last 50 deploys per site with commit, previous version, who/what started it, duration and full log. **Redeploy** any earlier commit (automatic updates pause so it stays), or **Undo** a deploy from its snapshot.
- **Health checks.** Optional per site: AutoNode requests a page every 15 s–5 min and restarts the site after 2–10 failures in a row, with a startup grace period and a cooldown. **Memory limit** per site (systemd `MemoryMax`).
- **Automatic backups.** Nightly full backups at a time you choose, keeping the last N (manual ones are never pruned), optionally copied to another disk or share. Download, restore or delete them in Settings.
- **Visitor stats.** A Visitors tab with visitors, requests, server errors, bandwidth, a per-day chart, the last 24 hours and top pages. Counted by the proxy, with no cookies or scripts. Visitors are counted with a daily-salted hash, so no IP addresses are stored. Bots are counted separately.
- **www handling and redirects.** `www.x → x` or `x → www.x` (DNS for the twin is created when Cloudflare is connected), plus custom redirects with exact paths or `/section/*` prefixes.
- **Maintenance mode.** A "Back soon" page (503 with `Retry-After`) for visitors, while the home-network Preview link still reaches the site.
- **Password protection.** Optional username/password for a site (HTTP Basic, scrypt-hashed, cached, 10 wrong tries per visitor → 5-minute wait). The password never reaches the website.
- **Scheduled tasks.** Cron-style jobs per site (5-field schedules and `@daily`…), with a schedule preview, Run Now, timeout, output and the last 20 runs.
- **Disk usage.** A Storage card per site (code, packages, git, data, snapshots) with **Clean & Reinstall Packages** and **Delete node_modules**.
- **Dashboard HTTPS.** An optional self-signed certificate for this computer, on the same port: plain-HTTP visits are redirected. Download the certificate to trust it, regenerate it after an IP change, or `sudo autonode https off` from the server.
- **Activity log.** A new Activity page: dashboard changes, deploys (and who started them), health-check restarts, backups, task failures and sign-ins, including failed ones with the IP.

### Fixed

- A deploy reported "finished" before its result was saved, so the UI could briefly show the previous deploy.

## [1.2.0] - 2026-11-09

### Added

- **Website icons.** Each website shows its own favicon in the dashboard (website cards, overview list, page header, backup preview) instead of a letter. AutoNode finds it in the site's files (`favicon.ico`/`.svg`/`.png` in the root, `public/`, `static/`, Next.js `app/icon.*`, build folders, or whatever `index.html` links to with `<link rel="icon">`), or asks the running site for `/favicon.ico`. Sites without an icon keep the colored letter.
  - Safe by design: the file type is detected from the bytes (an HTML 404 page named `favicon.ico` is ignored), icons are capped at 512 KB, symlinks are never followed, and icons are served with a sandboxing Content-Security-Policy so an SVG can't run scripts.

## [1.1.1] - 2026-11-09

### Security

- **Dashboard could be exposed to the internet.** A website's port could be set to the dashboard's own port (7070), or to the proxy's ports. The public proxy then forwarded internet traffic to the dashboard from 127.0.0.1, which passed the "home network only" check. Those ports are now reserved for websites, backups that use them get a new port on restore, and the proxy refuses to forward to them even if an old config has one.
- **Root could follow symlinks during updates.** Keeping or restoring locked or changed files during a GitHub update copied files as root and followed symlinks, so a symlink planted by the repository or the website could make AutoNode read or write files outside the site. Copies now refuse symlinks at every step (`O_NOFOLLOW`), and a symlink in the way of a kept file is replaced, never written through. The copies in `/var/lib/autonode/rescued` are now root-only.
- **Unzip could move another folder into a website.** The "flatten a single top-level folder" step followed symlinks, so a zip containing only a link to another folder with a `package.json` (another website, or AutoNode itself) made root move that folder's files. It now ignores symlinks.
- **Visitor IPs could be faked.** `CF-Connecting-IP` and `X-Forwarded-*` from any client were passed to websites as the visitor's real IP. They are now only trusted from Cloudflare's published IP ranges or a local Cloudflare Tunnel. Direct visitors get their real address.
- **Webhook memory exhaustion.** The public deploy webhook buffered up to 5 MB of every request before checking credentials. Requests without a signature or token are now rejected immediately, and wrong tokens are rejected before the body is read. Non-ASCII tokens now give a clean 401 instead of an error.
- **Proxy crash guard.** An unexpected error thrown while handling a public request could crash the whole daemon. It now returns an error page.
- Website build commands and git no longer inherit the root daemon's environment variables. `chown` never follows symlinks (`-h`).

### Fixed

- Uploads to websites through the public proxy were cut off after 5 minutes (Node's default request timeout). The limit is now 1 hour, still with a 60-second header timeout. The idle timeout for slow responses went from 2 to 10 minutes.

## [1.1.0] - 2026-11-09

### Added

- **Update safety check.** GitHub updates no longer overwrite data your website saved. Before updating, AutoNode compares the new version with the files on the server:
  - files the website made that aren't in the repository are always kept and never block an update;
  - a repository file the website changed, and that the update removes (e.g. a database moved into `.gitignore`), is kept automatically;
  - a repository file the website changed that the update would replace, or a website-made file at a path the update adds, **pauses** the update (and automatic updates) and lists the files. Choose **Keep Server Versions & Update** (also locks them) or **Use GitHub Versions**.
  - Every kept or replaced file is copied to `/var/lib/autonode/rescued/<site>/` first (last 20 kept).
- **Locked files.** Lock a file (`db.sqlite`), folder (`data/`) or pattern (`*.sqlite`) on the GitHub & Updates tab or straight from the file list. Updates never change or delete locked files.

### Fixed

- The website header showed stray "undefined"/"false" text next to the buttons when a site had no domain.
- The dashboard's scripts were cached for 5 minutes, so a self-update could leave an old interface on screen.

## [1.0.3] - 2026-11-09

### Security

- A single malformed request (for example `GET //`, or a broken `%` escape in the address) crashed the whole AutoNode daemon. The deploy-hook address on the public ports 80/443 had the same problem, so anyone on the internet could take it down. Bad requests now get a 400/404 and the server keeps running.
- The first-run setup code can no longer be guessed endlessly: it uses the same 5-tries-then-wait lockout as the password.
- Restoring a backup checks that each website's name matches its entry, so a crafted backup can't point a website folder outside `/var/lib/autonode/sites` (restore deletes and replaces that folder as root). Ports and domain lists are checked too, and archive owners are no longer recreated.
- `.zip` files are extracted as the website user instead of root, so links inside an archive can't write outside the website folder.
- Branch names starting with `-` are refused (git would treat them as options).
- Static IP: the network interface name must be one that exists, since it is written into the netplan file.
- Website names like `__proto__` or `constructor` no longer resolve to internal objects.

### Fixed

- Downloading a file whose name has accents or other non-English letters failed with an error.
- A website title containing `` ` ``, `$`, `<` or quotes broke the starter page's `server.js`.
- Odd cookies from other apps on the same address could cause sign-in errors.
- Uploads sent to an address with a trailing slash could hang.

## [1.0.2] - 2026-11-09

### Fixed

- Large uploads were unreliable: files were sent in one request, so any network hiccup lost the whole upload. Uploads (website files and backup imports) now go in 8 MB pieces with automatic retries and resume, show speed and progress, check free disk space first, and send big files one at a time.
- Icons in the website Addresses and Details cards were drawn far too large.
- Website "Up" time was stuck at 0 s inside containers (Proxmox/LXC): it compared systemd's host-monotonic start time with the container's uptime. It now uses the same monotonic clock as systemd.

## [1.0.1] - 2026-11-09

### Fixed

- Websites failed to start with `cannot open /etc/autonode/run/<site>.sh: Permission denied`. Start scripts now live in `/var/lib/autonode/run/`, which the site user can read. Existing websites are repaired and restarted automatically when AutoNode starts.
- Self-update refused to run ("AutoNode files were modified locally") because the installer's `chmod +x` looked like a local edit. File-mode changes are now ignored, the scripts are stored as executable, and the error names any files that really changed.
- CI: tests now run on Node 22 and 24 (`node --test` no longer accepts a folder there). GitHub Actions bumped to v5.

## [1.0.0] - 2026-11-09

First release. Made with ♥ by Akulav.

### Added

- Dashboard with live CPU, memory, disk, network and temperature, plus history charts.
- Websites: create from a starter page, GitHub or uploaded files; start, stop, restart; one systemd service per site running as the `autonode` user.
- File manager: browse, upload files/folders/.zip, edit, rename, download, delete.
- Live logs from journald.
- Reverse proxy on ports 80/443 with SNI certificates, WebSockets and HTTPS redirects.
- Cloudflare: API-token connection, automatic DNS records, dynamic DNS, automatic Origin Certificates, one-click Full (strict).
- GitHub deploys: public/private repos, update checks, one-click deploys, scheduled auto-updates, signed webhooks and a generated GitHub Actions workflow.
- Static IP configuration through NetworkManager or netplan.
- Self-update from GitHub, manual or automatic.
- Multiple domains on one machine: any number of Cloudflare zones, several hostnames per website, per-domain certificates via SNI.
- Backup & restore: settings-only `.json` or full `.tar.gz` with website files; preview before import; automatic port/domain clash resolution.
- CLI: `install`, `uninstall`, `status`, `setup-code`, `passwd`, `update`, `export`, `import`, `logs`, `dev`.
- One-line installer, CI and release workflows.
