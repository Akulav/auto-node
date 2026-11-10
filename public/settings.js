/* AutoNode — the Settings page, one small tab per topic. Made by Akulav. */
import { h, append, clear, icon, fmtBytes, fmtAgo, api, uploadResumable, toast, busy, sheet, confirmSheet, toggle, copyable, notice, siteIcon, pageHead } from './ui.js';

const TABS = [
  ['general', 'General', generalTab],
  ['server', 'Web Server', serverTab],
  ['backups', 'Backups', backupsTab],
  ['transfer', 'Export & Import', transferTab],
  ['security', 'Security', securityTab],
  ['remote', 'Remote Access', remoteTab],
];

/** #/settings/<tab> */
export async function settingsView(tab = 'general') {
  const [id, , build] = TABS.find(([t]) => t === tab) || TABS[0];
  const s = await api('GET', '/api/settings');
  return h(
    'div',
    { class: 'page settings' },
    pageHead('Settings'),
    h('div', { class: 'tabs' }, TABS.map(([t, label]) => h('a', { href: `#/settings/${t}`, class: t === id ? 'on' : '' }, label))),
    await build(s),
  );
}

/** A list row: title + explanation on the left, a control on the right. */
const row = (label, text, control) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, label), text && h('div', { class: 'small muted' }, text)), control);
const infoRow = (label, value, cls = '') => h('div', { class: 'item' }, h('div', { class: 'label' }, label), h('div', { class: `value ${cls}` }, value));

/** Save one field of /api/settings from a toggle, undoing the switch if it fails. */
const saveSetting = (key, okText) => async (v, input) => {
  try {
    await api('PATCH', '/api/settings', { [key]: v });
    toast(typeof okText === 'function' ? okText(v) : okText);
  } catch (err) {
    input.checked = !v;
    toast(err.message, 'bad');
  }
};

/* ---------------------------------------------------------------- general */

function generalTab(s) {
  const updBox = h('div');
  const install = async (e) =>
    busy(e.currentTarget, async () => {
      await api('POST', '/api/update');
      sheet(() => h('div', { class: 'center' }, h('span', { class: 'spin', style: 'width:28px;height:28px;margin:8px auto 16px;display:block' }), h('h2', {}, 'Updating AutoNode…'), h('p', { class: 'muted' }, 'Your websites keep running. This page reloads by itself.')));
      const wait = async () => {
        try {
          if ((await fetch('/api/session')).ok) return location.reload();
        } catch {}
        setTimeout(wait, 1500);
      };
      setTimeout(wait, 3000);
    });
  const check = async (e) =>
    busy(e.currentTarget, async () => {
      const r = await api('GET', '/api/update');
      clear(updBox);
      if (!r.gitInstall) return updBox.append(notice('warn', "This copy of AutoNode wasn't installed with git, so it can't update itself. Re-run the installer to get the latest version."));
      if (r.upToDate) return updBox.append(notice('good', h('b', {}, 'AutoNode is up to date. '), `Version ${r.version}.`));
      const more = r.commits.length - 5;
      updBox.append(
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'row between wrap', style: 'margin-bottom:10px' }, h('div', {}, h('h3', {}, `Version ${r.latestVersion} is available`), h('p', { class: 'small muted' }, `${r.commits.length} change${r.commits.length === 1 ? '' : 's'} since your version.`)), h('button', { class: 'btn primary', onclick: install }, 'Update Now')),
          h('div', { class: 'list flat' }, r.commits.slice(0, 5).map((c) => h('div', { class: 'item' }, h('code', { class: 'muted' }, c.hash), h('div', { class: 'grow ellipsis' }, c.subject), h('span', { class: 'small muted' }, fmtAgo(c.date))))),
          more > 0 && h('p', { class: 'small muted', style: 'margin-top:8px' }, `…and ${more} more.`),
        ),
      );
    });
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'list' },
      h('div', { class: 'item' }, h('img', { src: '/favicon.svg', width: 44, height: 44, alt: '' }), h('div', { class: 'grow' }, h('div', { class: 'label' }, `AutoNode ${s.version}`), h('div', { class: 'small muted' }, `Last checked ${fmtAgo(s.lastCheck)}`)), h('button', { class: 'btn', onclick: check }, 'Check for Updates')),
      row('Install updates automatically', 'Checks once a day. Your websites keep running while AutoNode updates.', toggle(s.selfUpdateAuto, saveSetting('selfUpdateAuto', (v) => (v ? 'Automatic updates on' : 'Automatic updates off')), 'Automatic updates')),
    ),
    updBox,
    h(
      'div',
      { class: 'card pad-lg center about' },
      h('img', { src: '/favicon.svg', width: 56, height: 56, alt: 'AutoNode' }),
      h('h2', { style: 'margin-top:10px' }, 'AutoNode'),
      h('p', { class: 'muted' }, `Version ${s.version}`),
      h('p', { style: 'margin-top:10px' }, 'Made with ♥ by ', h('b', {}, 'Akulav')),
      h('p', { class: 'small muted', style: 'margin-top:4px' }, h('a', { href: 'https://github.com/Akulav', target: '_blank', rel: 'noopener' }, 'github.com/Akulav')),
    ),
  );
}

/* ------------------------------------------------------------- web server */

function serverTab(s) {
  let keep;
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'list' },
      row('Always use HTTPS', 'Send visitors to the secure version when a certificate exists.', toggle(s.redirectHttps, saveSetting('redirectHttps', 'Saved ✓'), 'Always use HTTPS')),
      row(
        'Snapshots per website',
        'Copies kept for rollback. One is made before every GitHub deploy.',
        (keep = h(
          'select',
          {
            class: 'input',
            style: 'width:auto',
            onchange: async () => {
              try {
                await api('PATCH', '/api/snapshots', { keep: Number(keep.value) });
                toast('Saved ✓');
              } catch (err) {
                toast(err.message, 'bad');
              }
            },
          },
          [...new Set([3, 5, 10, 20, s.snapshotsKeep])].sort((a, b) => a - b).map((n) => h('option', { value: n, selected: n === s.snapshotsKeep }, `Keep ${n}`)),
        )),
      ),
    ),
    h(
      'div',
      { class: 'list' },
      infoRow('Ports', `HTTP ${s.proxy.http || '✖'} · HTTPS ${s.proxy.https || '✖'} · Dashboard ${s.dashboardPort}`),
      infoRow('Websites run with', s.runner === 'systemd' ? 'systemd (survive reboots)' : 'Built-in supervisor'),
      infoRow('Node.js', s.node),
      infoRow('Website files', s.paths.sitesDir, 'mono small ellipsis'),
      infoRow('Website data', s.paths.siteDataRoot, 'mono small ellipsis'),
    ),
    (s.proxy.httpError || s.proxy.httpsError) && notice('bad', h('b', {}, 'Web traffic problem. '), [s.proxy.httpError, s.proxy.httpsError].filter(Boolean).join(' ')),
  );
}

/* ---------------------------------------------------------------- backups */

/** Review a staged backup ({ token, summary }) and restore it. */
function showRestore(up) {
  const sm = up.summary;
  sheet((close) => {
    let keepSettings;
    return h(
      'div',
      {},
      h('h2', {}, 'Restore this backup?'),
      h('p', { class: 'muted' }, `Made ${new Date(sm.createdAt).toLocaleString()}${sm.hostname ? ` on ${sm.hostname}` : ''} · AutoNode ${sm.autonodeVersion}`),
      h(
        'div',
        { class: 'list scroll-y', style: 'margin:16px 0;box-shadow:none' },
        sm.sites.length ? sm.sites.map((s) => h('div', { class: 'item' }, siteIcon(s, 32), h('div', { class: 'grow' }, h('div', { class: 'label' }, s.title || s.name), h('div', { class: 'small muted ellipsis' }, s.hostnames?.join(', ') || 'No domains')))) : h('div', { class: 'item muted' }, 'No websites in this backup.'),
        infoRow('Certificates', sm.certificates),
        infoRow('Cloudflare connection', sm.cloudflare ? 'Included' : 'Not included'),
      ),
      h('div', { class: 'row' }, (keepSettings = h('input', { type: 'checkbox', id: 'rs', checked: true })), h('label', { for: 'rs' }, 'Also restore Cloudflare and update settings')),
      notice('warn', 'Websites with the same name on this computer are replaced. Other websites and your password stay as they are.'),
      h(
        'div',
        { class: 'sheet-actions' },
        h('button', { class: 'btn', onclick: close }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: (e) =>
              busy(e.currentTarget, async () => {
                const r = await api('POST', '/api/backup/restore', { token: up.token, settings: keepSettings.checked });
                close();
                toast(`Restored ${r.sites.length} website${r.sites.length === 1 ? '' : 's'} and ${r.certificates} certificate${r.certificates === 1 ? '' : 's'} ✓${r.warnings.length ? '\n' + r.warnings.join('\n') : ''}`, r.warnings.length ? 'bad' : '');
              }),
          },
          'Restore',
        ),
      ),
    );
  });
}

const SHOWN_BACKUPS = 3;

async function backupsTab() {
  const box = h('div', { class: 'stack', style: 'gap:16px' });
  const load = async () => {
    const { settings: s, backups, running } = await api('GET', '/api/backups');
    let time, keep, copyTo, nowBtn;
    const save = async (patch, btn) => {
      const run = async () => {
        await api('PATCH', '/api/backups', patch);
        toast('Saved ✓');
      };
      if (btn) await busy(btn, run);
      else await run().catch((err) => toast(err.message, 'bad'));
    };
    const backupRow = (b) =>
      h(
        'div',
        { class: 'item' },
        h('span', { style: 'display:flex;color:var(--accent)' }, icon('disk')),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label' }, new Date(b.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })), h('div', { class: 'small muted' }, `${b.kind === 'manual' ? 'Made by you' : 'Scheduled'} · ${fmtBytes(b.size)}`)),
        h('a', { class: 'btn icon ghost', title: 'Download', href: `/api/backups/${encodeURIComponent(b.name)}` }, icon('download')),
        h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => showRestore(await api('POST', `/api/backups/${encodeURIComponent(b.name)}/prepare`))) }, 'Restore…'),
        h('button', { class: 'btn icon ghost', title: 'Delete', style: 'color:var(--bad)', onclick: async () => (await confirmSheet({ title: 'Delete this backup?', text: 'It is removed from this computer (copies in the extra folder stay).', ok: 'Delete', danger: true })) && (await api('DELETE', `/api/backups/${encodeURIComponent(b.name)}`).then(load, (err) => toast(err.message, 'bad'))) }, icon('trash')),
      );
    append(clear(box), [
      h(
        'div',
        { class: 'card pad-lg form' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Automatic backups'), h('p', { class: 'muted small' }, 'A full backup (settings, website files and data folders) every day. ', s.lastRun ? (s.lastOk ? `Last one ${fmtAgo(s.lastRun)} ✓` : `Last attempt failed ${fmtAgo(s.lastRun)}: ${s.lastError}`) : 'None made yet.')), toggle(s.enabled, (v) => save({ enabled: v }), 'Automatic backups')),
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, 'Time of day', (time = h('input', { class: 'input', type: 'time', value: s.time, onchange: () => save({ time: time.value }) }))),
          h('label', { class: 'field' }, 'Keep', (keep = h('select', { class: 'input', onchange: () => save({ keep: Number(keep.value) }) }, [...new Set([3, 7, 14, 30, 90, s.keep])].sort((a, b) => a - b).map((n) => h('option', { value: n, selected: n === s.keep }, `Last ${n} backups`))))),
        ),
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Also copy to ', h('span', { class: 'hint' }, '(optional — another disk or a network share)')),
          h('div', { class: 'input-row' }, (copyTo = h('input', { class: 'input mono', value: s.copyTo || '', placeholder: '/mnt/backup-disk/autonode' })), h('button', { class: 'btn sm', onclick: (e) => save({ copyTo: copyTo.value }, e.currentTarget) }, 'Save')),
        ),
        h('p', { class: 'small muted' }, 'Stored in ', h('code', {}, s.folder), '. Backups contain keys and tokens: keep the copy folder private.'),
      ),
      h(
        'div',
        {},
        h(
          'div',
          { class: 'section-head' },
          h('h3', {}, 'Saved backups'),
          h(
            'div',
            { class: 'row' },
            backups.length > SHOWN_BACKUPS && h('button', { class: 'btn sm', onclick: () => sheet((close) => h('div', {}, h('h2', {}, `All backups (${backups.length})`), h('div', { class: 'list scroll-y', style: 'margin-top:16px;box-shadow:none' }, backups.map(backupRow)), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', onclick: close }, 'Close')))) }, `Show all ${backups.length}`),
            (nowBtn = h(
              'button',
              {
                class: 'btn sm primary',
                disabled: running,
                onclick: async () =>
                  busy(nowBtn, async () => {
                    await api('POST', '/api/backups/run');
                    toast('Backing up… this can take a minute.');
                    setTimeout(() => load().catch(() => {}), 4000);
                  }),
              },
              running ? 'Backup running…' : 'Back Up Now',
            )),
          ),
        ),
        h('div', { class: 'list' }, backups.length ? backups.slice(0, SHOWN_BACKUPS).map(backupRow) : h('div', { class: 'item muted small' }, 'No backups saved on this computer yet.')),
      ),
    ]);
  };
  await load().catch((err) => append(clear(box), [notice('bad', err.message)]));
  return box;
}

/* -------------------------------------------------------- export & import */

function transferTab() {
  const importInput = h('input', { type: 'file', accept: '.json,.gz,.tar.gz,application/json,application/gzip', class: 'hidden', onchange: (e) => e.target.files[0] && importBackup(e.target.files[0]) });
  async function importBackup(file) {
    importInput.value = '';
    const bar = h('i', { style: 'width:0%' });
    const status = h('p', { class: 'muted' }, `${file.name} · ${fmtBytes(file.size)}`);
    const wait = sheet(() => h('div', { class: 'center' }, h('h2', { style: 'margin-bottom:8px' }, 'Uploading backup…'), status, h('div', { class: 'progress', style: 'margin-top:16px' }, bar)));
    let up;
    try {
      const id = await uploadResumable(file, {
        onProgress: (n, t) => {
          bar.style.width = ((n / Math.max(1, t)) * 100).toFixed(1) + '%';
          status.textContent = `${file.name} · ${fmtBytes(n)} of ${fmtBytes(t)}`;
        },
        onRetry: (a) => (status.textContent = `Connection hiccup — retrying (${a})…`),
      });
      status.textContent = 'Reading backup…';
      up = await api('POST', '/api/backup/upload-complete', { id, total: file.size });
    } catch (err) {
      wait();
      return toast(err.message, 'bad');
    }
    wait();
    showRestore(up);
  }
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h('p', { class: 'muted' }, 'Move everything to a new computer, or keep a copy somewhere safe. Backups contain your keys and tokens — store them privately.'),
    h(
      'div',
      { class: 'list' },
      row('Settings only', 'Websites, domains, environment variables, certificates and Cloudflare — a small .json file.', h('a', { class: 'btn', href: '/api/backup' }, icon('download'), 'Export')),
      row('Everything', 'Settings plus all website files and data folders, as a .tar.gz. Packages are reinstalled on restore.', h('a', { class: 'btn', href: '/api/backup?files=1' }, icon('download'), 'Export')),
      row('Restore from a backup', 'Choose a .json or .tar.gz made by AutoNode. You can review it before anything changes.', h('button', { class: 'btn primary', onclick: () => importInput.click() }, icon('upload'), 'Import…')),
    ),
    importInput,
    h('p', { class: 'small muted' }, 'Backups saved on this computer can be restored from the ', h('a', { href: '#/settings/backups' }, 'Backups'), ' tab.'),
  );
}

/* --------------------------------------------------------------- security */

function dashboardHttpsCard(s) {
  const on = location.protocol === 'https:' || s.dashboardHttps;
  return h(
    'div',
    { class: 'card pad-lg' },
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'grow' }, h('h3', {}, 'Secure dashboard (HTTPS)'), h('p', { class: 'muted small' }, 'Encrypts the connection to this dashboard so nobody on your Wi-Fi can read your password. Your browser asks you to trust the certificate once.')),
      toggle(
        on,
        async (v, input) => {
          if (v && !(await confirmSheet({ title: 'Turn on HTTPS?', text: 'The dashboard reloads at https://… Your browser will warn that the certificate is “not trusted” — that is expected for a home server. Choose “Advanced → Continue” once (or install the certificate to remove the warning). If you ever get locked out, run “sudo autonode https off” on the server.', ok: 'Turn On' }))) return (input.checked = false);
          if (!v && s.remoteAccess && !(await confirmSheet({ title: 'Turn off HTTPS?', text: 'Remote access needs HTTPS, so it will be turned off too. Only devices on your home network will reach the dashboard.', ok: 'Turn Off', danger: true }))) return (input.checked = true);
          try {
            const r = await api('PATCH', '/api/settings', { dashboardHttps: v });
            toast(v ? 'Switching to HTTPS…' : 'Switching back to HTTP…');
            setTimeout(() => (location.href = r.url), 600);
          } catch (err) {
            input.checked = !v;
            toast(err.message, 'bad');
          }
        },
        'Secure dashboard',
      ),
    ),
    s.dashboardCert?.hasCert &&
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:14px' },
        h('a', { class: 'btn sm', href: '/api/dashboard-cert' }, icon('download'), 'Download Certificate'),
        h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', '/api/dashboard-cert/regenerate'), toast('New certificate made ✓ — reload the page'))) }, 'Make New Certificate'),
        h('button', { class: 'btn sm ghost', onclick: () => certHelpSheet(s.dashboardCert) }, icon('info'), 'Remove the browser warning'),
      ),
  );
}

function certHelpSheet(cert) {
  sheet((close) =>
    h(
      'div',
      {},
      h('h2', {}, 'Trust the dashboard certificate'),
      h('p', { class: 'muted small', style: 'margin:6px 0 14px' }, `Download it first. It covers ${cert.names.slice(0, 4).join(', ')}${cert.names.length > 4 ? '…' : ''} — make a new one if this computer's address changed.`),
      h(
        'ol',
        { class: 'small', style: 'padding-left:18px;display:flex;flex-direction:column;gap:8px;color:var(--text-2)' },
        h('li', {}, h('b', {}, 'Mac: '), 'open the downloaded file → Keychain Access → double-click it → Trust → “Always Trust”.'),
        h('li', {}, h('b', {}, 'Windows: '), 'open the file → Install Certificate → Local Machine → “Trusted Root Certification Authorities”.'),
        h('li', {}, h('b', {}, 'iPhone/iPad: '), 'open the file, install the profile, then Settings → General → About → Certificate Trust Settings → turn it on.'),
        h('li', {}, h('b', {}, 'Android: '), 'Settings → Security → Encryption & credentials → Install a certificate → CA certificate.'),
      ),
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Done')),
    ),
  );
}

function securityTab(s) {
  let cur, next, again;
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    dashboardHttpsCard(s),
    h(
      'form',
      {
        class: 'card pad-lg form',
        onsubmit: async (e) => {
          e.preventDefault();
          await busy(e.target.querySelector('.primary'), async () => {
            if (next.value !== again.value) throw new Error("The new passwords don't match.");
            await api('POST', '/api/password', { current: cur.value, next: next.value });
            cur.value = next.value = again.value = '';
            toast('Password changed ✓ — other devices were signed out');
          });
        },
      },
      h('h3', {}, 'Change password'),
      h(
        'div',
        { class: 'form-grid three' },
        h('label', { class: 'field' }, 'Current password', (cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true }))),
        h('label', { class: 'field' }, 'New password', (next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }))),
        h('label', { class: 'field' }, 'Repeat new password', (again = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8, required: true }))),
      ),
      h('div', { class: 'row' }, h('button', { class: 'btn primary' }, 'Change Password')),
    ),
    h(
      'div',
      { class: 'list' },
      row('Sign out', 'Sign out on this device.', h('button', { class: 'btn', onclick: async () => (await api('POST', '/api/logout'), location.reload()) }, icon('logout'), 'Sign Out')),
      row(
        'Sign out everywhere',
        'Ends every session on every device, including this one. Use it if you lost a phone or signed in on a computer that isn’t yours.',
        h(
          'button',
          {
            class: 'btn danger',
            onclick: async (e) => {
              if (!(await confirmSheet({ title: 'Sign out everywhere?', text: 'Every device, including this one, has to sign in again with the password.', ok: 'Sign Out Everywhere', danger: true }))) return;
              await busy(e.target, async () => {
                await api('POST', '/api/sessions/revoke');
                location.reload();
              });
            },
          },
          'Sign Out All',
        ),
      ),
    ),
    h('p', { class: 'small muted' }, s.remoteAccess ? 'Remote access is on: the sign-in page can be reached from the internet. ' : 'The dashboard only answers devices on your home network. ', 'Forgot your password? Run ', h('span', { class: 'kbd' }, 'sudo autonode passwd'), ' on the server.'),
  );
}

/* ---------------------------------------------------------- remote access */

async function remoteTab(s) {
  const r = await api('GET', '/api/remote-access');
  const port = r.port;
  const addr = r.publicIp ? `https://${r.publicIp}:${port}` : null;
  const status = h('div');
  const paintStatus = (enabled) =>
    clear(status).append(
      enabled
        ? notice('good', h('b', {}, 'Remote access is on. '), 'You can sign in from anywhere. Wrong passwords from the internet are limited, and sign-ins from outside pause automatically during an attack.')
        : notice('info', h('b', {}, 'Home network only. '), 'Devices outside your network get “not available” before they ever see the sign-in page.'),
    );
  paintStatus(r.enabled);
  const sw = toggle(
    r.enabled,
    async (v, input) => {
      if (v && !(await confirmSheet({ title: 'Allow access from the internet?', text: 'Anyone who finds the address will see the sign-in page, so use a strong password. You can turn this off at any time — or on the server with “sudo autonode remote off”.', ok: 'Allow' }))) return (input.checked = false);
      try {
        await api('PATCH', '/api/remote-access', { enabled: v });
        paintStatus(v);
        toast(v ? 'Remote access on' : 'Remote access off');
      } catch (err) {
        input.checked = !v;
        toast(err.message, 'bad');
      }
    },
    'Remote access',
  );
  if (!r.https) sw.querySelector('input').disabled = true;
  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    h(
      'div',
      { class: 'card pad-lg' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Allow access from outside my home network'), h('p', { class: 'muted small' }, 'Open this dashboard from work, a phone on mobile data, or while travelling.')), sw),
      !r.https && h('div', { style: 'margin-top:14px' }, notice('warn', h('b', {}, 'Turn on the secure dashboard first. '), 'Over the internet your password must be encrypted. ', h('a', { href: '#/settings/security' }, 'Go to Security →'))),
      h('div', { style: 'margin-top:14px' }, status),
    ),
    h(
      'div',
      { class: 'grid cols-2' },
      h(
        'div',
        { class: 'card pad-lg' },
        h('h3', {}, 'How to reach it'),
        h(
          'ol',
          { class: 'small steps' },
          h('li', {}, 'In your router, forward port ', h('b', {}, `${port} (TCP)`), ' to this computer', r.lanIp ? [' (', h('b', {}, r.lanIp), ')'] : '', '.'),
          h('li', {}, 'Open this address from anywhere:'),
        ),
        addr ? copyable(addr, 'Address copied') : h('p', { class: 'small muted' }, "Couldn't find your public address right now."),
        h('p', { class: 'small muted', style: 'margin-top:8px' }, 'If your address changes often, connect Cloudflare on the Domains page and use one of your domains instead.'),
      ),
      h(
        'div',
        { class: 'card pad-lg' },
        h('h3', {}, 'Safer alternative: a private VPN'),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, 'With a VPN such as Tailscale or WireGuard your phone joins your home network from anywhere, and nothing is exposed to the internet. VPN devices already work without turning remote access on.'),
        h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Locked out? Run ', h('span', { class: 'kbd' }, 'sudo autonode remote off'), ' on the server.'),
      ),
    ),
  );
}
