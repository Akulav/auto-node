# Changelog

All notable changes to AutoNode are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
