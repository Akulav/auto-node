# CLAUDE.md

Notes for AI coding assistants working on AutoNode (made by Akulav).

## What this is

A Linux-only control panel for hosting Node.js websites: one root daemon (`bin/autonode.js serve`) serving a LAN dashboard on :7070 and a reverse proxy on :80/:443, with each website as its own systemd service running as the `autonode` user. See `docs/ARCHITECTURE.md`.

## Rules

- **Zero runtime dependencies.** Node standard library only (≥ 18.17). Don't add npm packages; shell out to system tools (`systemctl`, `journalctl`, `git`, `nmcli`, `netplan`, `openssl`, `unzip`) via `run()`/`runOk()` in `src/util.js` — never through a shell with user input.
- **No build step** for the frontend. `public/app.js` builds DOM with `h()`; never use `innerHTML` with data (only the constant `ICONS`).
- **Plain language in the UI.** Users are not sysadmins: "Fixed address", not "static IPv4 lease". Errors are full sentences that say what to do.
- **Keep design tokens in `:root`** in `public/app.css` with the dark-mode override block; reuse existing components (`.card`, `.list > .item`, `.pill`, `.btn`, `sheet()`, `confirmSheet()`).
- **Security:** every file path goes through `files.resolveInSite()`; secrets stay root-only (mode 0600); strip tokens with `publicSite()` before sending to the browser; new API routes are authenticated unless passed `{ open: true }`.
- **Branding:** keep "Made with ♥ by Akulav" in the sidebar, login screen, Settings → About, CLI help and README.

## Commands

```bash
npm run dev     # dashboard at http://localhost:7070, safe on any OS (.dev/ sandbox)
npm test        # node:test, isolated temp dirs
npm run lint    # syntax check of every .js file
```

## Release

Bump `version` in `package.json`, add a `CHANGELOG.md` section `## [x.y.z] - date`, push a `vx.y.z` tag. `.github/workflows/release.yml` verifies and publishes the release; servers update from `main` via `git pull --ff-only`.
