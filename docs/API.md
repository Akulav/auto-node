# API

The dashboard talks to AutoNode over a small JSON API on port `7070`. All routes except the session routes need the `autonode_session` cookie. Errors return `{ "error": "Human-readable message" }` with a 4xx/5xx status.

## Session

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/api/session` | | `{ authenticated, setUp, version, dev, hostname }` |
| POST | `/api/setup` | `{ code, password }` | First run only |
| POST | `/api/login` | `{ password }` | Sets the cookie |
| POST | `/api/logout` | | |
| POST | `/api/password` | `{ current, next }` | Signs out other sessions |

## Overview & live data

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/overview` | Stats, history, websites with status, proxy/Cloudflare/cert summary |
| GET | `/api/stream` | Server-Sent Events, `stats` event every 2 s: `{ stats, sites }` |

## Websites

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/api/sites` | |
| POST | `/api/sites` | `{ name, title, template: "starter"\|"empty", repo?, branch?, token? }` |
| GET | `/api/sites/:name` | Includes `status`, `size`, `deploy`, `lanUrl`, `certs` |
| PATCH | `/api/sites/:name` | `{ title, startCommand, installCommand, buildCommand, port, env }` |
| DELETE | `/api/sites/:name` | Stops the service and deletes the files |
| POST | `/api/sites/:name/start` · `/stop` · `/restart` | |
| POST | `/api/sites/:name/rebuild` | Install + build + restart, no git pull |
| GET | `/api/sites/:name/logs` | `{ text }` — last 400 lines |
| GET | `/api/sites/:name/logs/stream` | SSE, `line` events |
| POST | `/api/sites/:name/hostnames` | `{ hostname }` — also creates the DNS record if Cloudflare is connected |
| DELETE | `/api/sites/:name/hostnames/:host` | |

## Chunked uploads

Large files are sent in pieces so a dropped connection only costs one piece, not the whole file. The browser picks a random 32-hex-character `id`, then:

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/api/chunk?id=&offset=&total=` | Raw body = one piece (the app sends 8 MB). Idempotent: resending the same offset is safe. Returns `{ received }`. `409` if `offset` is past what the server has. `507` if the disk is too full. |
| GET | `/api/chunk?id=` | `{ received }`: resume from here after a failure |
| DELETE | `/api/chunk?id=` | Abandon an upload |
| POST | `/api/sites/:name/upload-complete` | `{ id, path, total }`: move the finished file into the website |
| POST | `/api/backup/upload-complete` | `{ id, total }`: same as the backup upload below, returns `{ token, summary }` |

Unfinished pieces are kept in `/var/lib/autonode/tmp/uploads` and deleted after 24 hours.

## Files

Paths are relative to the website folder and always start with `/`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/sites/:name/files?path=/` | `{ path, entries: [{ name, type, size, mtime }] }` |
| GET | `/api/sites/:name/file?path=` | `{ content }`, or `{ binary }` / `{ tooLarge }` |
| GET | `/api/sites/:name/file?path=&download=1` | Raw download |
| PUT | `/api/sites/:name/file?path=` | Raw body = new file contents |
| PUT | `/api/sites/:name/upload?path=` | Raw body = file (streamed, any size) |
| POST | `/api/sites/:name/mkdir` | `{ path }` |
| POST | `/api/sites/:name/rename` | `{ from, to }` |
| POST | `/api/sites/:name/unzip` | `{ path }` — extracts next to the zip, then deletes it |
| DELETE | `/api/sites/:name/files?path=` | |

## GitHub & deploys

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/sites/:name/git` | Connection, last deploy, webhook URL/secret, workflow YAML, job |
| PUT | `/api/sites/:name/git` | `{ repo, branch, token?, autoUpdate?, interval? }` |
| DELETE | `/api/sites/:name/git` | |
| POST | `/api/sites/:name/git/check` | `{ upToDate, behind, commits, current }` |
| POST | `/api/sites/:name/git/rotate` | New webhook secret |
| POST | `/api/sites/:name/deploy` | `{ resolve?: "keep" \| "overwrite" }`: starts a deploy. If the update would overwrite website data, the job ends with `ok: false` ("Update paused…") and `GET …/git` returns `blocked: { files: [{ path, reason: "changed" \| "created" }] }`; deploy again with `resolve` to continue. |
| GET | `/api/sites/:name/locks` | `{ locks }` |
| PUT | `/api/sites/:name/locks` | `{ locks: [...] }`: replace the list |
| POST | `/api/sites/:name/locks` | `{ lock }`: e.g. `db.sqlite`, `data/`, `*.sqlite`, `storage/**.json` |
| DELETE | `/api/sites/:name/locks?lock=` | |
| GET | `/api/sites/:name/deploy` | `{ running, log, ok, error }` |

### Deploy webhook (public)

```
POST https://<any-site-domain>/.autonode/deploy/<site-name>
```

Authenticate with either:

- `X-Hub-Signature-256: sha256=<HMAC-SHA256 of body with the secret>` (GitHub webhooks), or
- `Authorization: Bearer <secret>` (GitHub Actions, curl).

GitHub `push` events for other branches are ignored; `ping` returns `pong`. Responds `202` when a deploy starts.

```bash
curl -X POST -H "Authorization: Bearer $SECRET" https://blog.akulav.com/.autonode/deploy/blog
```

## Domains & certificates

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/cloudflare` | Connection, zones, public & LAN IP, DNS sync status |
| POST | `/api/cloudflare/connect` | `{ token }` |
| DELETE | `/api/cloudflare` | |
| PATCH | `/api/cloudflare` | `{ ddns }` |
| POST | `/api/cloudflare/sync` | Point all domains at the current public IP |
| POST | `/api/cloudflare/origin-cert` | `{ domain }` — create + install a 15-year Origin Certificate |
| POST | `/api/cloudflare/strict` | `{ domain }` — set SSL mode to Full (strict) |
| GET | `/api/certs` | |
| POST | `/api/certs` | `{ cert, key }` (PEM) |
| DELETE | `/api/certs/:id` | |

## Backup & restore

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/api/backup` | | Download settings backup (`.json`) |
| GET | `/api/backup?files=1` | | Download full backup with website files (`.tar.gz`) |
| PUT | `/api/backup/upload` | Raw body = backup file | Validates and returns `{ token, summary }` without changing anything |
| POST | `/api/backup/restore` | `{ token, settings?: boolean }` | Applies the uploaded backup; returns `{ sites, certificates, warnings }` |

Backup JSON format: `{ format: "autonode-backup", formatVersion: 1, autonodeVersion, createdAt, hostname, config, certs: [{ id, cert, key }] }`. The `.tar.gz` contains `autonode-backup.json` and a `sites/` folder.

## Network & settings

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/network` | Interfaces, address, router, DNS, mode, backend |
| POST | `/api/network` | `{ mode: "dhcp"\|"static", interface, address, prefix, gateway, dns }` |
| GET | `/api/settings` | |
| PATCH | `/api/settings` | `{ selfUpdateAuto?, redirectHttps? }` |
| GET | `/api/update` | Check for AutoNode updates |
| POST | `/api/update` | Update and restart |
