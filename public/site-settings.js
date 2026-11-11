/* AutoNode — a website's Settings tab, split into small sections. Made by Akulav. */
import { h, icon, fmtBytes, api, toast, busy, confirmSheet, toggle, healthLabel } from './ui.js';

const SECTIONS = [
  ['general', 'General', generalSection],
  ['env', 'Environment', envSection],
  ['health', 'Health & Limits', healthSection],
  ['delete', 'Delete', deleteSection],
];

/** #/sites/<name>/settings/<section> */
export async function siteSettingsView(site, onLive, section = 'general') {
  const [id, , build] = SECTIONS.find(([s]) => s === section) || SECTIONS[0];
  return h(
    'div',
    { class: 'stack site-settings', style: 'gap:16px' },
    h('nav', { class: 'segmented wrap-seg', 'aria-label': 'Website settings' }, SECTIONS.map(([s, label]) => h('a', { href: `#/sites/${site.name}/settings/${s}`, class: s === id ? 'on' : '', 'aria-current': s === id ? 'page' : null }, label))),
    await build(site),
  );
}

/** Ask to restart after a change that only applies on the next start. */
async function offerRestart(site, text = 'Restart the website now so the changes take effect?') {
  if (await confirmSheet({ title: 'Saved ✓', text, ok: 'Restart Now' })) {
    await api('POST', `/api/sites/${site.name}/restart`);
    toast('Restarted ✓');
  }
}

/* ---------------------------------------------------------------- general */

function generalSection(site) {
  let title, start, install, build, port;
  const rust = site.kind === 'rust';
  const save = async (e) => {
    e.preventDefault();
    await busy(e.target.querySelector('.primary'), async () => {
      const next = await api('PATCH', `/api/sites/${site.name}`, { title: title.value, startCommand: start.value, installCommand: install.value, buildCommand: build.value, port: Number(port.value) });
      const needsRestart = ['startCommand', 'port'].some((k) => next[k] !== site[k]);
      Object.assign(site, next);
      if (needsRestart) await offerRestart(site);
      else toast('Saved ✓');
    });
  };
  return h(
    'form',
    { class: 'card pad-lg form', onsubmit: save },
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Display name', (title = h('input', { class: 'input', value: site.title, maxlength: 80 }))), h('label', { class: 'field' }, h('span', {}, 'Internal port ', h('span', { class: 'hint' }, '(given to your app as PORT)')), (port = h('input', { class: 'input', type: 'number', value: site.port, min: 1024, max: 65535, required: true })))),
    h('div', { class: 'section-title' }, h('h3', {}, 'Commands'), h('span', { class: 'row', style: 'gap:8px' }, h('span', { class: 'pill' }, rust ? 'Rust' : 'Node.js'), h('span', { class: 'muted small' }, `Leave empty and AutoNode figures it out from ${rust ? 'Cargo.toml' : 'package.json'}.`))),
    h('label', { class: 'field' }, 'Start', (start = h('input', { class: 'input mono', value: site.startCommand, placeholder: site.detectedCommand || './target/release/my-app' }))),
    h(
      'div',
      { class: 'form-grid' },
      h('label', { class: 'field' }, 'Install', (install = h('input', { class: 'input mono', value: site.installCommand, placeholder: rust ? 'Not needed (cargo fetches crates while building)' : 'npm ci' }))),
      h('label', { class: 'field' }, 'Build', (build = h('input', { class: 'input mono', value: site.buildCommand, placeholder: rust ? 'cargo build --release' : 'npm run build (if present)' }))),
    ),
    h('div', { class: 'row' }, h('button', { class: 'btn primary' }, 'Save Changes')),
  );
}

/* ------------------------------------------------------------ environment */

function envSection(site) {
  const rows = h('div', { class: 'stack tight env-list' });
  const empty = h('p', { class: 'small muted' }, 'No variables yet.');
  const syncEmpty = () => empty.classList.toggle('hidden', rows.children.length > 0);
  const addEnv = (k = '', v = '', focus = false) => {
    const key = h('input', { class: 'input', placeholder: 'NAME', value: k, autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Variable name' });
    const row = h(
      'div',
      { class: 'env-row' },
      key,
      h('input', { class: 'input', placeholder: 'value', value: v, spellcheck: 'false', 'aria-label': 'Value' }),
      h('button', { class: 'btn icon ghost', type: 'button', style: 'color:var(--bad);align-self:center', onclick: () => (row.remove(), syncEmpty()), title: 'Remove' }, icon('trash')),
    );
    rows.append(row);
    syncEmpty();
    if (focus) {
      key.focus();
      rows.scrollTop = rows.scrollHeight;
    }
  };
  Object.entries(site.env || {}).forEach(([k, v]) => addEnv(k, v));
  syncEmpty();
  const save = async (e) => {
    e.preventDefault();
    const env = {};
    for (const row of rows.children) {
      const [k, v] = row.querySelectorAll('input');
      const name = k.value.trim();
      if (!name) continue;
      if (Object.hasOwn(env, name)) return toast(`"${name}" is listed twice. Keep one of them.`, 'bad');
      env[name] = v.value;
    }
    await busy(e.target.querySelector('.primary'), async () => {
      const next = await api('PATCH', `/api/sites/${site.name}`, { env });
      site.env = next.env;
      await offerRestart(site);
    });
  };
  return h(
    'form',
    { class: 'card pad-lg form', onsubmit: save },
    h('div', {}, h('h3', {}, 'Environment variables'), h('p', { class: 'muted small' }, 'Secrets like API keys and database URLs. Available to your app as process.env.NAME. PORT and DATA_DIR are set by AutoNode.')),
    rows,
    empty,
    h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: () => addEnv('', '', true) }, icon('plus'), 'Add Variable'), h('button', { class: 'btn primary right' }, 'Save Variables')),
  );
}

/* ------------------------------------------------------- health & limits */

async function healthSection(site) {
  let hPath, hInterval, hFails, mem;
  const { settings, status } = await api('GET', `/api/sites/${site.name}/health`);
  let enabled = settings.enabled;
  const result = h('div', { class: 'small muted' });
  const fields = h(
    'div',
    { class: `form ${enabled ? '' : 'dim-off'}` },
    h(
      'div',
      { class: 'form-grid three' },
      h('label', { class: 'field' }, h('span', {}, 'Page to check'), (hPath = h('input', { class: 'input mono', value: settings.path, placeholder: '/health' }))),
      h('label', { class: 'field' }, 'Check every', (hInterval = h('select', { class: 'input' }, [15, 30, 60, 300].map((s) => h('option', { value: s, selected: s === settings.interval }, s < 60 ? `${s} seconds` : `${s / 60} minute${s > 60 ? 's' : ''}`))))),
      h('label', { class: 'field' }, 'Restart after', (hFails = h('select', { class: 'input' }, [2, 3, 5, 10].map((n) => h('option', { value: n, selected: n === settings.failures }, `${n} failed checks`))))),
    ),
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        {
          class: 'btn sm',
          type: 'button',
          onclick: async (e) =>
            busy(e.currentTarget, async () => {
              const r = await api('POST', `/api/sites/${site.name}/health/test`, { path: hPath.value });
              result.textContent = r.ok ? `✓ Healthy — answered ${r.status} in ${r.ms} ms` : `✖ ${r.error}`;
              result.style.color = r.ok ? 'var(--good)' : 'var(--bad)';
            }),
        },
        icon('heart'),
        'Test Now',
      ),
      result,
    ),
  );
  const hToggle = toggle(
    enabled,
    (v) => {
      enabled = v;
      fields.classList.toggle('dim-off', !v);
    },
    'Health check',
  );
  return h(
    'div',
    { class: 'card pad-lg form' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Automatic health check'), h('p', { class: 'muted small' }, 'AutoNode visits a page every so often and restarts the website if it stops answering (any answer below 500 counts as healthy).'), status.enabled && h('p', { class: 'small', style: 'margin-top:4px' }, 'Now: ', h('b', {}, healthLabel(status)), status.restarts ? ` · restarted ${status.restarts}× since AutoNode started` : '')), hToggle),
    fields,
    h('div', { class: 'section-title' }, h('h3', {}, 'Memory limit'), h('span', { class: 'muted small' }, 'Restart the website if it uses more, so one leaking app never slows down the others.')),
    h('div', { class: 'row' }, (mem =h('input', { class: 'input', type: 'number', min: 64, step: 64, value: site.memoryLimitMB || '', placeholder: 'No limit', style: 'max-width:160px', 'aria-label': 'Memory limit in MB' })), h('span', { class: 'muted' }, 'MB'), site.status?.memory != null && h('span', { class: 'small muted' }, `Uses ${fmtBytes(site.status.memory)} right now`)),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn primary',
          onclick: async (e) =>
            busy(e.currentTarget, async () => {
              const before = site.memoryLimitMB || null;
              const after = mem.value ? Number(mem.value) : null;
              await api('PATCH', `/api/sites/${site.name}`, { health: { enabled, path: hPath.value, interval: Number(hInterval.value), failures: Number(hFails.value) }, memoryLimitMB: after });
              site.memoryLimitMB = after;
              if (before !== after) await offerRestart(site, 'Restart the website now so the new memory limit applies?');
              else toast('Saved ✓');
            }),
        },
        'Save',
      ),
    ),
  );
}

/* ----------------------------------------------------------------- delete */

function deleteSection(site) {
  return h(
    'div',
    { class: 'card pad-lg', style: 'border:1px solid var(--bad-soft)' },
    h('h3', {}, 'Delete website'),
    h('p', { class: 'muted', style: 'margin:6px 0 16px' }, 'Stops the website and permanently deletes its files, data folder, snapshots and domains. This cannot be undone — make a backup first if you might need it again.'),
    h(
      'div',
      { class: 'row wrap' },
      h(
        'button',
        {
          class: 'btn danger',
          onclick: async (e) => {
            if (!(await confirmSheet({ title: `Delete ${site.title || site.name}?`, text: 'All files, settings and domains for this website will be removed permanently.', ok: 'Delete Forever', danger: true, typeToConfirm: site.name }))) return;
            await busy(e.target, async () => {
              await api('DELETE', `/api/sites/${site.name}`);
              toast('Website deleted');
              location.hash = '#/sites';
            });
          },
        },
        icon('trash'),
        'Delete Website',
      ),
      h('a', { class: 'btn', href: '#/settings/backups' }, icon('disk'), 'Make a Backup First'),
    ),
  );
}
