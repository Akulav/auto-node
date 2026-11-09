# Changelog

All notable changes to AutoNode are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
