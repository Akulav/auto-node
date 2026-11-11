/* AutoNode web app — made by Akulav. No build step, no dependencies. */
import {
  h, append, clear, icon, fmtBytes, fmtPct, fmtDur, fmtAgo, fmtNum, level, api, onUnauthorized, sleep, uploadResumable, toast, busy, copy,
  sheet, confirmSheet, promptSheet, toggle, copyable, codeBlock, notice, siteIcon, STATE_LABEL, statusPill, pageHead, healthLabel,
} from './ui.js';
import { settingsView } from './settings.js';
import { siteSettingsView } from './site-settings.js';

/* ------------------------------------------------------ locked files */

/** Same rules as src/locks.js: "file", "folder/", "*.ext" (any depth), "dir/**.json" (from root). */
function lockMatcher(locks = []) {
  const glob = (g) => {
    let re = '';
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      if (ch === '*' && g[i + 1] === '*') {
        re += '.*';
        i++;
        if (g[i + 1] === '/') i++;
      } else if (ch === '*') re += '[^/]*';
      else if (ch === '?') re += '[^/]';
      else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return re;
  };
  const tests = locks.map((l) => {
    if (l.endsWith('/')) return { l, t: (p) => p === l.slice(0, -1) || p.startsWith(l) };
    if (/[*?]/.test(l)) {
      const re = new RegExp(`^${l.includes('/') ? '' : '(?:.*/)?'}${glob(l)}(?:/.*)?$`);
      return { l, t: (p) => re.test(p) };
    }
    return { l, t: (p) => p === l || p.startsWith(l + '/') };
  });
  /** Returns the lock that covers a site-relative path, or null. */
  return (p) => tests.find((x) => x.t(String(p).replace(/^\/+/, '')))?.l || null;
}

/** Editable list of locked files/folders/patterns for a website. */
function lockEditor(siteName, initial, onChange) {
  let locks = [...initial];
  const list = h('div', { class: 'list' });
  const paint = () => {
    clear(list);
    if (!locks.length) list.append(h('div', { class: 'item' }, h('div', { class: 'muted small' }, 'Nothing locked yet.')));
    for (const l of locks)
      list.append(
        h(
          'div',
          { class: 'item' },
          h('span', { style: 'display:flex;color:var(--good)' }, icon('lock')),
          h('code', { class: 'grow ellipsis' }, l),
          h('span', { class: 'small muted' }, l.endsWith('/') ? 'Folder' : /[*?]/.test(l) ? 'Pattern' : 'File'),
          h(
            'button',
            {
              class: 'btn sm',
              onclick: async (e) =>
                busy(e.currentTarget, async () => {
                  locks = (await api('DELETE', `/api/sites/${siteName}/locks?lock=${encodeURIComponent(l)}`)).locks;
                  paint();
                  onChange?.(locks);
                  toast(`Unlocked ${l}`);
                }),
            },
            'Unlock',
          ),
        ),
      );
  };
  paint();
  const input = h('input', { class: 'input mono', placeholder: 'db.sqlite   data/   *.sqlite', autocomplete: 'off', autocapitalize: 'off' });
  const add = async (value) => {
    locks = (await api('POST', `/api/sites/${siteName}/locks`, { lock: value })).locks;
    paint();
    onChange?.(locks);
    toast(`Locked ${value} ✓`);
  };
  const suggestions = ['*.db', '*.sqlite', '*.sqlite3', '.env', 'data/', 'uploads/', 'storage/'];
  return h(
    'div',
    { class: 'stack' },
    list,
    h(
      'form',
      {
        class: 'input-row',
        onsubmit: async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          await busy(e.target.querySelector('button'), async () => {
            await add(input.value.trim());
            input.value = '';
          });
        },
      },
      input,
      h('button', { class: 'btn primary' }, icon('lock'), 'Lock'),
    ),
    h(
      'div',
      { class: 'row wrap', style: 'gap:6px' },
      h('span', { class: 'small muted' }, 'Common:'),
      suggestions.map((s) => h('button', { class: 'btn sm', type: 'button', onclick: () => !locks.includes(s) && add(s).catch((err) => toast(err.message, 'bad')) }, s)),
    ),
  );
}

/* ======================================================== components */

function ring(pct = 0) {
  const R = 42,
    C = 2 * Math.PI * R;
  let bar, val, wrap;
  wrap = h(
    'div',
    { class: 'ring', role: 'img' },
    h('svg', { viewBox: '0 0 100 100' }, h('circle', { svg: true, class: 'track', cx: 50, cy: 50, r: R, fill: 'none', 'stroke-width': 9 }), (bar = h('circle', { svg: true, class: 'bar', cx: 50, cy: 50, r: R, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C }))),
    (val = h('div', { class: 'val' }, '—')),
  );
  /** p: how full the ring is (0–100). text/lvl override the label and colour (e.g. "52°" for a temperature). */
  const set = (p, text, lvl) => {
    p = Math.max(0, Math.min(100, p || 0));
    bar.setAttribute('stroke-dashoffset', String(C * (1 - p / 100)));
    wrap.className = `ring ${lvl ?? level(p)}`;
    val.textContent = text ?? fmtPct(p);
    wrap.setAttribute('aria-label', text ?? `${Math.round(p)} percent`);
  };
  set(pct);
  return { el: wrap, set };
}

/** Single-series area sparkline with a hover crosshair + tooltip. */
function sparkline({ max = 100, format = fmtPct, label }) {
  const W = 300,
    H = 84;
  let points = [];
  let line, area;
  const svg = h(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label },
    h('line', { svg: true, class: 'grid-line', x1: 0, x2: W, y1: H / 2, y2: H / 2 }),
    h('line', { svg: true, class: 'grid-line', x1: 0, x2: W, y1: H, y2: H }),
    (area = h('path', { svg: true, class: 'area' })),
    (line = h('path', { svg: true, class: 'line' })),
  );
  const cross = h('div', { class: 'cross hidden' });
  const dot = h('div', { class: 'dotm hidden' });
  const tip = h('div', { class: 'tip hidden' });
  const box = h('div', { class: 'spark' }, svg, cross, dot, tip);
  const xy = (i, v) => [(i / Math.max(1, points.length - 1)) * W, H - (Math.min(v, max) / max) * (H - 4) - 2];
  const draw = () => {
    if (points.length < 2) return;
    const d = points.map((p, i) => xy(i, p.v)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${W},${H}L0,${H}Z`);
  };
  box.addEventListener('pointermove', (e) => {
    if (points.length < 2) return;
    const r = box.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, i))];
    const [x, y] = xy(points.indexOf(p), p.v);
    const px = (x / W) * r.width,
      py = (y / H) * r.height;
    cross.style.left = px + 'px';
    dot.style.left = px + 'px';
    dot.style.top = py + 'px';
    tip.style.left = Math.max(40, Math.min(r.width - 40, px)) + 'px';
    tip.textContent = `${format(p.v)} · ${new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    for (const el of [cross, dot, tip]) el.classList.remove('hidden');
  });
  box.addEventListener('pointerleave', () => [cross, dot, tip].forEach((el) => el.classList.add('hidden')));
  return {
    el: box,
    set(pts) {
      points = pts.filter((p) => p.v != null);
      draw();
    },
    push(p, limit = 90) {
      if (p.v == null) return;
      points.push(p);
      if (points.length > limit) points.shift();
      draw();
    },
  };
}

/* ============================================================ state */

const state = { session: null, live: null, onLive: null, cleanup: [] };
onUnauthorized(() => {
  state.session.authenticated = false;
  render();
});
let stream = null;

function connectStream() {
  if (stream) return;
  stream = new EventSource('/api/stream');
  stream.addEventListener('stats', (e) => {
    state.live = JSON.parse(e.data);
    state.onLive?.(state.live);
  });
  stream.onerror = () => {
    if (state.session && !state.session.authenticated) {
      stream.close();
      stream = null;
    }
  };
}

/* =========================================================== auth UI */

function authScreen() {
  const s = state.session;
  const setup = !s.setUp;
  let pw, pw2, code;
  const submit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    await busy(btn, async () => {
      if (setup) {
        if (pw.value !== pw2.value) throw new Error("Passwords don't match.");
        await api('POST', '/api/setup', { code: code?.value, password: pw.value });
      } else await api('POST', '/api/login', { password: pw.value });
      // Re-read the session: the computer's name and version are only shared once signed in.
      state.session = await api('GET', '/api/session').catch(() => ({ ...state.session, authenticated: true, setUp: true }));
      render();
    });
  };
  return h(
    'div',
    { class: 'auth' },
    h(
      'div',
      { class: 'box' },
      h('img', { src: '/favicon.svg', alt: 'AutoNode' }),
      h('h1', {}, setup ? 'Welcome to AutoNode' : 'AutoNode'),
      h('p', {}, setup ? 'Choose a password to protect your server.' : s.hostname ? `Sign in to ${s.hostname}` : 'Sign in to continue'),
      h(
        'form',
        { onsubmit: submit },
        setup && !s.dev && (code = h('input', { class: 'input big', placeholder: 'Setup code (shown after install)', autocomplete: 'off', autocapitalize: 'characters', required: true })),
        (pw = h('input', { class: 'input big', type: 'password', placeholder: setup ? 'New password (8+ characters)' : 'Password', autocomplete: setup ? 'new-password' : 'current-password', required: true, minlength: setup ? 8 : null })),
        setup && (pw2 = h('input', { class: 'input big', type: 'password', placeholder: 'Repeat password', autocomplete: 'new-password', required: true })),
        h('button', { class: 'btn primary lg' }, setup ? 'Get Started' : 'Sign In'),
      ),
      setup && !s.dev && h('p', { class: 'small', style: 'margin-top:16px' }, 'Lost the code? Run ', h('span', { class: 'kbd' }, 'sudo autonode setup-code'), ' on the server.'),
      h('div', { class: 'credit' }, 'Made with ♥ by ', h('b', {}, 'Akulav')),
    ),
  );
}

/* ============================================================ shell */

const NAV = [
  ['overview', 'Overview', 'home'],
  ['sites', 'Websites', 'sites'],
  ['domains', 'Domains', 'cloud'],
  ['network', 'Network', 'wifi'],
  ['activity', 'Activity', 'clock'],
  ['settings', 'Settings', 'gear'],
];

function shell(route, content) {
  const navLinks = (cls) => NAV.map(([id, label, ic]) => h('a', { href: `#/${id}`, class: route === id ? 'active' : '' }, icon(ic), cls === 'mobile' ? label.replace('Websites', 'Sites') : label));
  return h(
    'div',
    { class: 'shell' },
    h(
      'aside',
      { class: 'sidebar' },
      h('div', { class: 'brand' }, h('img', { src: '/favicon.svg', alt: '' }), h('div', {}, h('b', {}, 'AutoNode'), h('small', {}, state.session.hostname))),
      h('nav', { class: 'nav' }, navLinks()),
      h('div', { class: 'spacer' }),
      state.session.dev && h('div', { class: 'pill warn', style: 'margin:0 10px 8px;align-self:flex-start' }, 'Dev mode'),
      h('div', { class: 'credit' }, 'v', state.session.version, ' · Made with ♥ by ', h('b', {}, 'Akulav')),
    ),
    h('main', { class: 'main' }, content),
    h('nav', { class: 'mobile-bar' }, navLinks('mobile')),
  );
}

/* ========================================================= overview */

/** One Overview metric: ring and numbers on top, history at the bottom (same layout for all four, so they line up). */
function metricCard(gauge, label, big, sub, spark, card = h('div', { class: 'card metric-card' })) {
  return append(card, [h('div', { class: 'gauge-card' }, gauge.el, h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'metric-label' }, label), big, sub)), spark.el]);
}

async function overviewView() {
  const o = await api('GET', '/api/overview');
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Four matching cards: ring + numbers on top, a few minutes of history below.
  const cpuRing = ring(o.stats.cpu.percent);
  const memRing = ring((o.stats.memory.used / o.stats.memory.total) * 100);
  const diskRing = ring(0);
  const tempRing = ring(0, '—');
  const fmtTemp = (c) => `${Math.round(c)} °C`;
  const cpuSpark = sparkline({ label: 'CPU usage over the last few minutes' });
  const memSpark = sparkline({ label: 'Memory usage over the last few minutes' });
  const diskSpark = sparkline({ label: 'Disk space used over the last few minutes' });
  const tempSpark = sparkline({ label: 'Temperature over the last few minutes', format: fmtTemp });
  const historyOf = (key) => o.history.filter((p) => p[key] != null).map((p) => ({ t: p.t, v: p[key] }));
  cpuSpark.set(historyOf('cpu'));
  memSpark.set(historyOf('mem'));
  diskSpark.set(historyOf('disk'));
  tempSpark.set(historyOf('temp'));
  const cpuSub = h('div', { class: 'metric-sub' });
  const memBig = h('div', { class: 'metric-big' });
  const memSub = h('div', { class: 'metric-sub' });
  const diskBig = h('div', { class: 'metric-big' });
  const diskSub = h('div', { class: 'metric-sub' });
  const tempBig = h('div', { class: 'metric-big ellipsis' });
  const tempSub = h('div', { class: 'metric-sub' });
  const tempCard = h('div', { class: 'card metric-card' });
  const sysKv = h('dl', { class: 'kv' });
  const sitesList = h('div', { class: 'list' });

  const paint = (st, siteList) => {
    cpuRing.set(st.cpu.percent);
    cpuSub.textContent = `${st.cpu.cores} cores · load ${st.cpu.load[0].toFixed(2)}`;
    cpuSub.title = `Load over 1, 5 and 15 minutes: ${st.cpu.load.map((l) => l.toFixed(2)).join(' · ')}`;
    const memPct = (st.memory.used / st.memory.total) * 100;
    memRing.set(memPct);
    memBig.textContent = fmtBytes(st.memory.used);
    memSub.textContent = `used of ${fmtBytes(st.memory.total)}`;
    memSub.title = `${fmtBytes(st.memory.available)} available`;
    if (st.disk) {
      const used = (st.disk.used / st.disk.total) * 100;
      diskRing.set(used);
      diskBig.textContent = fmtBytes(st.disk.free);
      diskSub.textContent = `free of ${fmtBytes(st.disk.total)}`;
      diskSub.title = `${fmtBytes(st.disk.used)} used · free space updates in real time`;
    }
    // The processor (else the hottest part) leads; the ring fills towards that part's safe limit.
    const temps = st.temperatures || [];
    const main = temps.find((t) => t.kind === 'cpu') || temps.reduce((a, b) => (!a || b.celsius > a.celsius ? b : a), null);
    if (main) {
      tempRing.set((main.celsius / main.limit) * 100, `${Math.round(main.celsius)}°`, main.level);
      tempBig.textContent = main.label;
      // One more part fits on the line (the next hottest); every reading is in the tooltip.
      const next = temps.filter((t) => t !== main).sort((a, b) => b.celsius - a.celsius)[0];
      tempSub.textContent = next ? `${next.label} ${Math.round(next.celsius)} °C` : `Safe up to ${Math.round(main.limit)} °C`;
      tempCard.title = temps.map((t) => `${t.label}${t.detail ? ` (${t.detail})` : ''}: ${fmtTemp(t.celsius)}`).join('\n');
    } else {
      tempRing.set(0, '—', '');
      tempBig.textContent = 'No sensors';
      tempSub.textContent = o.dev ? 'Not in dev mode' : 'Normal on a VM';
      tempSub.title = o.dev ? 'Temperatures are read on the Linux server, not in dev mode.' : 'This computer reports no temperatures. That is normal on a virtual machine or a cloud server.';
      tempCard.title = '';
    }
    clear(sysKv).append(
      ...[
        ['Computer', st.hostname],
        ['Address', o.lanIp],
        ['Running for', fmtDur(st.uptime)],
        ['Processor', st.cpu.model],
        st.network && ['Network', `↓ ${fmtBytes(st.network.rx)}/s   ↑ ${fmtBytes(st.network.tx)}/s`],
        ['System', st.platform],
      ]
        .filter(Boolean)
        .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
    );
    if (siteList) {
      clear(sitesList);
      if (!siteList.length)
        sitesList.append(h('a', { class: 'item', href: '#/sites/new' }, h('div', { class: 'app-icon', style: { background: 'var(--accent)' } }, icon('plus')), h('div', { class: 'label' }, 'Add your first website'), icon('chev', 'chev')));
      for (const s of siteList)
        sitesList.append(
          h(
            'a',
            { class: 'item', href: `#/sites/${s.name}` },
            siteIcon(s, 36),
            h('div', { class: 'grow' }, h('div', { class: 'label ellipsis' }, s.title || s.name), h('div', { class: 'small muted ellipsis' }, s.hostnames[0] || `Port ${s.port}`)),
            statusPill(s.status),
            icon('chev', 'chev'),
          ),
        );
    }
  };
  paint(o.stats, o.sites);
  state.onLive = (live) => {
    paint(live.stats, live.sites);
    cpuSpark.push({ t: live.stats.time, v: live.stats.cpu.percent });
    memSpark.push({ t: live.stats.time, v: (live.stats.memory.used / live.stats.memory.total) * 100 });
    if (live.stats.disk) diskSpark.push({ t: live.stats.time, v: (live.stats.disk.used / live.stats.disk.total) * 100 });
    if (live.stats.temperature != null) tempSpark.push({ t: live.stats.time, v: live.stats.temperature });
  };

  const checks = [
    o.proxy.http ? ['good', 'Web traffic', `Listening on port ${o.proxy.http}${o.proxy.https ? ` and ${o.proxy.https}` : ''}`] : ['bad', 'Web traffic', o.proxy.httpError || 'Not listening'],
    o.cloudflare.connected ? (o.cloudflare.lastError ? ['warn', 'Cloudflare', 'Connected, but the last DNS update had problems'] : ['good', 'Cloudflare', o.cloudflare.lastIp ? `Domains point to ${o.cloudflare.lastIp}` : 'Connected']) : ['', 'Cloudflare', 'Not connected yet'],
    o.certs.length ? (o.certs.some((c) => c.expired) ? ['warn', 'HTTPS', 'A certificate has expired'] : ['good', 'HTTPS', `${o.certs.length} certificate${o.certs.length > 1 ? 's' : ''} installed`]) : ['', 'HTTPS', 'No certificates yet'],
  ];

  return h(
    'div',
    { class: 'page' },
    pageHead(greet, { eyebrow: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }), sub: `Here's how ${o.stats.hostname} is doing.` }),
    o.dev && notice('warn', h('b', {}, 'Dev mode. '), 'Running safely on this computer: websites run as normal processes and network changes are simulated.'),
    h(
      'div',
      { class: 'metrics-wrap', style: 'margin-top:16px' },
      h(
        'div',
        { class: 'grid metrics' },
        metricCard(cpuRing, 'Processor', h('div', { class: 'metric-big' }, 'CPU'), cpuSub, cpuSpark),
        metricCard(memRing, 'Memory', memBig, memSub, memSpark),
        metricCard(diskRing, 'Storage', diskBig, diskSub, diskSpark),
        metricCard(tempRing, 'Temperature', tempBig, tempSub, tempSpark, tempCard),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-2 section' },
      h('div', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Websites'), h('a', { class: 'btn sm', href: '#/sites/new' }, icon('plus'), 'New')), sitesList),
      h(
        'div',
        {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Health')),
        h(
          'div',
          { class: 'list' },
          checks.map(([kind, label, text]) =>
            h('div', { class: 'item' }, h('span', { class: `pill ${kind}` }, h('span', { class: 'dot' }), kind === 'good' ? 'OK' : kind === 'bad' ? 'Problem' : kind === 'warn' ? 'Check' : 'Off'), h('div', { class: 'grow' }, h('div', { class: 'label' }, label), h('div', { class: 'small muted' }, text))),
          ),
        ),
        h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', { style: 'margin-bottom:12px' }, 'This computer'), sysKv),
      ),
    ),
  );
}

/* ============================================================ sites */

async function sitesView() {
  const list = await api('GET', '/api/sites');
  const grid = h('div', { class: 'grid auto' });
  const paint = (sites) => {
    clear(grid);
    for (const s of sites) {
      grid.append(
        h(
          'a',
          { class: 'card site-card', href: `#/sites/${s.name}` },
          h('div', { class: 'row' }, siteIcon(s), h('div', { class: 'grow' }, h('h3', { class: 'ellipsis' }, s.title || s.name), h('div', { class: 'small muted ellipsis' }, s.hostnames[0] || 'No domain yet')), statusPill(s.status)),
          h(
            'div',
            { class: 'stats' },
            h('span', {}, 'Port ', s.port),
            s.status.memory != null && h('span', {}, fmtBytes(s.status.memory)),
            s.status.cpu != null && h('span', {}, `${s.status.cpu.toFixed(1)}% CPU`),
            s.status.uptime != null && h('span', {}, `Up ${fmtDur(s.status.uptime)}`),
            s.git && h('span', { class: 'row', style: 'gap:4px' }, icon('github'), s.git.branch),
          ),
        ),
      );
    }
    grid.append(h('button', { class: 'card new-card', onclick: () => newSiteSheet() }, h('div', { class: 'center' }, icon('plus'), h('div', {}, 'New Website'))));
  };
  paint(list);
  state.onLive = (live) => paint(live.sites);
  return h(
    'div',
    { class: 'page' },
    pageHead('Websites', { sub: list.length ? `${list.length} website${list.length > 1 ? 's' : ''} on this computer` : 'Host your first Node.js website in seconds.', actions: h('button', { class: 'btn primary', onclick: () => newSiteSheet() }, icon('plus'), 'New Website') }),
    !list.length
      ? h('div', { class: 'card empty' }, h('img', { src: '/favicon.svg', alt: '' }), h('h2', {}, 'No websites yet'), h('p', {}, 'Start with a ready-made page, connect a GitHub repository, or upload your own files.'), h('button', { class: 'btn primary lg', onclick: () => newSiteSheet() }, 'Create a Website'))
      : grid,
  );
}

function newSiteSheet() {
  let mode = 'starter';
  sheet((close) => {
    let name, title, repo, branch, token;
    const repoBox = h('div', { class: 'form hidden' });
    const choices = [
      ['starter', 'Starter page', 'A simple "Hello" website you can edit right away.', 'bolt'],
      ['github', 'From GitHub', 'Download code from a repository and keep it updated.', 'github'],
      ['empty', 'Upload my own files', 'Start empty, then drop in your project folder or a .zip.', 'upload'],
    ];
    const choiceEls = choices.map(([id, t, d, ic]) =>
      h(
        'button',
        {
          type: 'button',
          class: `choice ${id === mode ? 'on' : ''}`,
          onclick: () => {
            mode = id;
            choiceEls.forEach((c, i) => c.classList.toggle('on', choices[i][0] === id));
            repoBox.classList.toggle('hidden', id !== 'github');
          },
        },
        h('div', { class: 'app-icon', style: { background: id === 'github' ? '#24292f' : id === 'empty' ? 'linear-gradient(135deg,#30d158,#0a9396)' : 'linear-gradient(135deg,#3a8dff,#5e5ce6)' } }, icon(ic)),
        h('div', {}, h('b', {}, t), h('small', {}, d)),
      ),
    );
    append(repoBox, [
      h('label', { class: 'field' }, 'Repository', (repo = h('input', { class: 'input', placeholder: 'akulav/my-website  or  https://github.com/…' }))),
      h(
        'div',
        { class: 'form-grid' },
        h('label', { class: 'field' }, 'Branch', (branch = h('input', { class: 'input', value: 'main' }))),
        h('label', { class: 'field' }, h('span', {}, 'Access token ', h('span', { class: 'hint' }, '(private repos only)')), (token = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' }))),
      ),
    ]);
    const autoName = () => {
      if (name.dataset.touched) return;
      const base = (repo.value.split('/').pop() || title.value || '').replace(/\.git$/, '');
      name.value = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    };
    const submit = async (e) => {
      e.preventDefault();
      await busy(e.submitter || e.target.querySelector('.primary'), async () => {
        const r = await api('POST', '/api/sites', { name: name.value, title: title.value || name.value, template: mode === 'starter' ? 'starter' : 'empty', repo: mode === 'github' ? repo.value : undefined, branch: branch.value, token: token.value || undefined });
        close();
        if (r.warning) toast(r.warning, 'bad');
        else toast(mode === 'github' ? 'Website created — deploying from GitHub…' : 'Website created ✓');
        location.hash = `#/sites/${r.site.name}/${mode === 'empty' ? 'files' : mode === 'github' ? 'github' : 'overview'}`;
      });
    };
    title = h('input', { class: 'input', placeholder: 'My Blog', oninput: autoName });
    name = h('input', { class: 'input mono', placeholder: 'my-blog', required: true, pattern: '[a-z0-9]([a-z0-9-]*[a-z0-9])?', oninput: () => (name.dataset.touched = '1') });
    repo?.addEventListener('input', autoName);
    return h(
      'form',
      { onsubmit: submit },
      h('h2', {}, 'New Website'),
      h('p', { class: 'muted' }, 'How do you want to start?'),
      h('div', { class: 'stack', style: 'margin:18px 0' }, choiceEls),
      h('div', { class: 'form' }, h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Name', title), h('label', { class: 'field' }, h('span', {}, 'Short name ', h('span', { class: 'hint' }, '(used for the folder)')), name)), repoBox),
      h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, 'Create Website')),
    );
  });
}

/* ======================================================= site detail */

const SITE_TABS = [
  ['overview', 'Overview'],
  ['files', 'Files'],
  ['logs', 'Logs'],
  ['visitors', 'Visitors'],
  ['domains', 'Domains & Access'],
  ['github', 'Deploys'],
  ['tasks', 'Tasks'],
  ['settings', 'Settings'],
];

async function siteView(name, tab = 'overview', sub) {
  if (name === 'new') {
    setTimeout(() => newSiteSheet(), 50);
    location.replace('#/sites');
    return sitesView();
  }
  const site = await api('GET', `/api/sites/${name}`);
  const pillBox = h('span', {}, statusPill(site.status));
  const actions = h('div', { class: 'row wrap' });
  const act = (path, label) => async (e) =>
    busy(e.currentTarget, async () => {
      await api('POST', `/api/sites/${name}/${path}`);
      toast(label);
    });
  const paintActions = (st) => {
    clear(pillBox).append(statusPill(st));
    const running = st.state === 'running' || st.state === 'starting' || st.state === 'crashed';
    // append() (not Element.append) skips false/undefined, which would otherwise render as text.
    append(clear(actions), [
      site.hostnames[0] && h('a', { class: 'btn', href: `https://${site.hostnames[0]}`, target: '_blank', rel: 'noopener' }, icon('ext'), 'Visit'),
      h('a', { class: 'btn', href: site.lanUrl, target: '_blank', rel: 'noopener', title: 'Open on your local network' }, icon('ext'), 'Preview'),
      running ? h('button', { class: 'btn', onclick: act('stop', 'Stopped') }, icon('stop'), 'Stop') : h('button', { class: 'btn primary', onclick: act('start', 'Started ✓') }, icon('play'), 'Start'),
      running && h('button', { class: 'btn primary', onclick: act('restart', 'Restarted ✓') }, icon('restart'), 'Restart'),
    ]);
  };
  paintActions(site.status);
  let tabLive = null;
  let lastState = site.status.state;
  state.onLive = (live) => {
    const s = live.sites.find((x) => x.name === name);
    if (!s) return;
    if (s.status.state !== lastState) {
      lastState = s.status.state;
      paintActions(s.status);
    } else clear(pillBox).append(statusPill(s.status));
    tabLive?.(s);
  };

  const body = h('div');
  const tabs = h('div', { class: 'tabs' }, SITE_TABS.map(([id, label]) => h('a', { href: `#/sites/${name}/${id}`, class: id === tab ? 'on' : '' }, label)));
  const views = { overview: siteOverview, files: siteFiles, logs: siteLogs, visitors: siteVisitors, domains: siteDomainsAndAccess, github: siteDeploys, tasks: siteTasks, settings: siteSettingsView };
  const res = await (views[tab] || siteOverview)(site, (fn) => (tabLive = fn), sub);
  append(body, [res]);

  return h(
    'div',
    { class: 'page' },
    h('a', { class: 'back', href: '#/sites' }, icon('back'), 'Websites'),
    h('div', { class: 'page-head' }, h('div', { class: 'row grow', style: 'gap:16px' }, siteIcon(site, 56), h('div', { class: 'grow' }, h('h1', { class: 'ellipsis' }, site.title || site.name), h('div', { class: 'row wrap', style: 'margin-top:6px' }, pillBox, h('span', { class: 'muted small' }, site.hostnames[0] || `Port ${site.port}`)))), actions),
    tabs,
    body,
  );
}

function siteOverview(site, onLive) {
  const kv = h('dl', { class: 'kv' });
  const paint = (st) => {
    clear(kv).append(
      ...[
        ['Status', STATE_LABEL[st.state]?.[0] || st.state],
        ['Running for', fmtDur(st.uptime)],
        ['Memory', fmtBytes(st.memory)],
        ['CPU', st.cpu != null ? `${st.cpu.toFixed(1)}%` : '—'],
        ['Restarts', st.restarts ?? 0],
        ['Health check', h('a', { href: `#/sites/${site.name}/settings/health`, style: `color:${site.health?.state === 'failing' ? 'var(--bad)' : 'inherit'}` }, healthLabel(site.health))],
      ].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
    );
  };
  paint(site.status);
  onLive((s) => paint(s.status));
  const deployBox = h('div');
  if (site.deploy?.running) watchDeploy(site.name, deployBox);

  return h(
    'div',
    { class: 'stack', style: 'gap:16px' },
    site.status.state === 'crashed' && notice('bad', h('b', {}, 'This website keeps crashing. '), 'Open ', h('a', { href: `#/sites/${site.name}/logs` }, 'Logs'), ' to see why.'),
    deployBox,
    h(
      'div',
      { class: 'grid cols-2' },
      h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:12px' }, 'Right now'), kv),
      h(
        'div',
        { class: 'card' },
        h('h3', { style: 'margin-bottom:12px' }, 'Addresses'),
        h(
          'div',
          { class: 'stack tight' },
          site.hostnames.map((hn) => h('a', { href: `https://${hn}`, target: '_blank', rel: 'noopener', class: 'row' }, icon('globe'), `https://${hn}`, !site.certs[hn] && h('span', { class: 'pill warn' }, 'No HTTPS'))),
          h('a', { href: site.lanUrl, target: '_blank', rel: 'noopener', class: 'row' }, icon('home'), site.lanUrl, h('span', { class: 'pill' }, 'Home network')),
          !site.hostnames.length && h('a', { class: 'btn sm', href: `#/sites/${site.name}/domains`, style: 'align-self:flex-start;margin-top:8px' }, icon('plus'), 'Connect a domain'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', { style: 'margin-bottom:12px' }, 'Details'),
      h(
        'dl',
        { class: 'kv' },
        ...[
          ['Start command', h('span', { class: 'row wrap', style: 'gap:8px' }, kindPill(site), site.detectedCommand ? h('code', {}, site.detectedCommand) : h('span', { class: 'muted' }, 'Not found — set one in Settings'))],
          ['Port', site.port],
          ['Size on disk', fmtBytes(site.size)],
          ['Source', site.git ? h('span', { class: 'row' }, icon('github'), site.git.repo.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, ''), ' · ', site.git.branch) : 'Uploaded files'],
          ['Data folder', h('span', {}, h('a', { href: `#/sites/${site.name}/files?area=data` }, 'Open'), h('span', { class: 'muted' }, ' · your app reads it as '), h('code', {}, site.kind === 'rust' ? 'std::env::var("DATA_DIR")' : 'process.env.DATA_DIR'))],
          ['Created', new Date(site.createdAt).toLocaleDateString()],
        ].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      ),
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:18px' },
        h(
          'button',
          {
            class: 'btn',
            onclick: async (e) =>
              busy(e.currentTarget, async () => {
                await api('POST', `/api/sites/${site.name}/rebuild`);
                watchDeploy(site.name, deployBox);
              }),
          },
          icon('bolt'),
          'Install & Rebuild',
        ),
        h('span', { class: 'small muted' }, site.kind === 'rust' ? 'Builds the program with cargo and restarts.' : 'Installs packages, runs the build script and restarts.'),
      ),
    ),
    storageCard(site),
  );
}

/** Show a live deploy/build log until it finishes. */
function watchDeploy(name, box, onDone) {
  const term = h('div', { class: 'terminal short' });
  const head = h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'spin' }), h('h3', {}, 'Working…'));
  clear(box).append(h('div', { class: 'card' }, head, term));
  let stopped = false;
  const tick = async () => {
    if (stopped || !box.isConnected) return;
    try {
      const j = await api('GET', `/api/sites/${name}/deploy`);
      const atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 30;
      term.textContent = j.log;
      if (atBottom) term.scrollTop = term.scrollHeight;
      if (j.running) return setTimeout(tick, 1000);
      clear(head).append(h('span', { class: `pill ${j.ok ? 'good' : 'bad'}` }, h('span', { class: 'dot' }), j.ok ? 'Done' : 'Failed'), h('h3', {}, j.ok ? 'Your website is updated' : 'Something went wrong'), h('button', { class: 'btn sm right', onclick: () => clear(box) }, 'Hide'));
      toast(j.ok ? 'Deploy finished ✓' : `Deploy failed: ${j.error}`, j.ok ? '' : 'bad');
      onDone?.(j);
    } catch {
      setTimeout(tick, 2000);
    }
  };
  tick();
  return () => (stopped = true);
}

/* ------------------------------------------------------------ files */

function siteFiles(site) {
  let cwd = '/';
  const crumbs = h('div', { class: 'crumbs' });
  const table = h('table', { class: 'files' });
  const progressBox = h('div', { class: 'stack tight' });
  const dz = h('div', { class: 'card flush dropzone' }, table);
  const fileInput = h('input', { type: 'file', multiple: true, class: 'hidden', onchange: (e) => uploadFiles([...e.target.files].map((f) => [f.name, f])) });
  const folderInput = h('input', { type: 'file', multiple: true, webkitdirectory: true, class: 'hidden', onchange: (e) => uploadFiles([...e.target.files].map((f) => [f.webkitRelativePath || f.name, f])) });
  const zipInput = h('input', { type: 'file', accept: '.zip', class: 'hidden', onchange: (e) => e.target.files[0] && uploadFiles([[e.target.files[0].name, e.target.files[0]]], { unzip: true }) });
  const join = (...p) => ('/' + p.join('/')).replace(/\/+/g, '/');
  // "code" = the website folder (deploys update it); "data" = DATA_DIR (never touched by deploys).
  let area = new URLSearchParams(location.hash.split('?')[1] || '').get('area') === 'data' ? 'data' : 'code';
  const api_ = (p) => `/api/sites/${site.name}${p}${p.includes('?') ? '&' : '?'}area=${area}`;
  let locks = site.locks || [];
  let lockedBy = lockMatcher(locks);
  let lastEntries = [];

  async function toggleLock(p, e, by) {
    const rel = p.replace(/^\/+/, '') + (e.type === 'dir' ? '/' : '');
    try {
      if (by && by !== rel) {
        toast(`Locked by the pattern “${by}”. Remove it on the Deploys tab.`);
        return;
      }
      const r = by ? await api('DELETE', api_(`/locks?lock=${encodeURIComponent(rel)}`)) : await api('POST', api_('/locks'), { lock: rel });
      locks = r.locks;
      site.locks = locks;
      lockedBy = lockMatcher(locks);
      toast(by ? `Unlocked ${rel}` : `Locked ${rel} — GitHub updates will never change or delete it ✓`);
      paint(lastEntries);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function load(path = cwd) {
    try {
      const r = await api('GET', api_(`/files?path=${encodeURIComponent(path)}`));
      cwd = r.path;
      paint(r.entries);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function paint(entries) {
    lastEntries = entries;
    const parts = cwd.split('/').filter(Boolean);
    clear(crumbs).append(h('a', { href: '#', onclick: (e) => (e.preventDefault(), load('/')) }, area === 'data' ? 'Data folder' : site.name), ...parts.flatMap((p, i) => [h('span', {}, '›'), h('a', { href: '#', onclick: (e) => (e.preventDefault(), load(join(...parts.slice(0, i + 1)))) }, p)]));
    clear(table);
    if (cwd !== '/') table.append(h('tr', {}, h('td', { colspan: 4 }, h('div', { class: 'name', onclick: () => load(join(...parts.slice(0, -1))) }, icon('back'), h('span', { class: 'muted' }, 'Back')))));
    if (!entries.length)
      table.append(h('tr', {}, h('td', { colspan: 4 }, h('div', { class: 'empty' }, h('h3', {}, 'This folder is empty'), h('p', {}, 'Drag files or a whole project folder here, or use the Upload buttons.')))));
    for (const e of entries) {
      const p = join(cwd, e.name);
      const open = () => (e.type === 'dir' ? load(p) : openEditor(p));
      const by = e.heavy || area === 'data' ? null : lockedBy(p.replace(/^\/+/, '') + (e.type === 'dir' ? '/' : ''));
      table.append(
        h(
          'tr',
          { class: e.heavy ? 'dim' : '' },
          h(
            'td',
            {},
            h(
              'div',
              { class: 'name', onclick: open, title: e.name },
              e.type === 'dir' ? h('span', { style: 'color:#5ac8fa;display:flex' }, icon('folder')) : h('span', { class: 'muted', style: 'display:flex' }, icon(e.name.endsWith('.zip') ? 'zip' : 'file')),
              h('span', {}, e.name),
              by && h('span', { class: 'pill good', title: `Locked by “${by}”: GitHub updates never change or delete it` }, icon('lock'), 'Locked'),
            ),
          ),
          h('td', { class: 'meta' }, e.type === 'dir' ? '—' : fmtBytes(e.size)),
          h('td', { class: 'meta opt' }, e.mtime ? fmtAgo(e.mtime) : ''),
          h(
            'td',
            { class: 'acts' },
            e.name.endsWith('.zip') && h('button', { class: 'btn sm', title: 'Extract here', onclick: () => doUnzip(p) }, 'Unzip'),
            e.type === 'file' && h('a', { class: 'btn icon ghost', title: 'Download', href: api_(`/file?download=1&path=${encodeURIComponent(p)}`) }, icon('download')),
            !e.heavy && area === 'code' && h('button', { class: 'btn icon ghost', title: by ? 'Unlock (allow GitHub updates to change it)' : 'Lock (GitHub updates will never change or delete it)', style: by ? 'color:var(--good)' : '', onclick: () => toggleLock(p, e, by) }, icon(by ? 'lock' : 'unlock')),
            h('button', { class: 'btn icon ghost', title: 'Rename', onclick: () => doRename(p, e.name) }, icon('edit')),
            h('button', { class: 'btn icon ghost', title: 'Delete', style: 'color:var(--bad)', onclick: () => doDelete(p, e) }, icon('trash')),
          ),
        ),
      );
    }
  }

  async function doDelete(p, e) {
    if (!(await confirmSheet({ title: `Delete “${e.name}”?`, text: e.type === 'dir' ? 'This folder and everything inside it will be permanently deleted.' : 'This file will be permanently deleted.', ok: 'Delete', danger: true }))) return;
    try {
      await api('DELETE', api_(`/files?path=${encodeURIComponent(p)}`));
      toast('Deleted');
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
  async function doRename(p, old) {
    const n = await promptSheet({ title: 'Rename', label: 'New name', value: old, ok: 'Rename' });
    if (!n || n === old) return;
    try {
      await api('POST', api_('/rename'), { from: p, to: join(cwd, n) });
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
  async function doUnzip(p) {
    try {
      toast('Extracting…');
      await api('POST', api_('/unzip'), { path: p });
      toast('Extracted ✓');
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
  async function newFolder() {
    const n = await promptSheet({ title: 'New Folder', label: 'Folder name', placeholder: 'public', ok: 'Create' });
    if (!n) return;
    try {
      await api('POST', api_('/mkdir'), { path: join(cwd, n) });
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }
  async function newFile() {
    const n = await promptSheet({ title: 'New File', label: 'File name', placeholder: 'index.js', ok: 'Create' });
    if (!n) return;
    try {
      await api('PUT', api_(`/file?path=${encodeURIComponent(join(cwd, n))}`), '', { raw: true });
      await load();
      openEditor(join(cwd, n));
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function uploadOne(path, file, onProgress, onRetry) {
    const id = await uploadResumable(file, { onProgress, onRetry });
    await api('POST', api_('/upload-complete'), { id, path, total: file.size });
  }

  async function uploadFiles(items, { unzip = false } = {}) {
    items = items.filter(([rel]) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(rel));
    if (!items.length) return toast('Nothing to upload (node_modules and .git are skipped).');
    const total = items.reduce((a, [, f]) => a + f.size, 0) || 1;
    const loaded = new Map();
    const bar = h('i', { style: 'width:0%' });
    const label = h('div', { class: 'small muted' }, `Uploading ${items.length} file${items.length > 1 ? 's' : ''}…`);
    const row = h('div', { class: 'card stack tight' }, label, h('div', { class: 'progress' }, bar));
    progressBox.append(row);
    const t0 = Date.now();
    let done = 0;
    const update = () => {
      const sent = [...loaded.values()].reduce((a, b) => a + b, 0);
      bar.style.width = ((sent / total) * 100).toFixed(1) + '%';
      const rate = sent / Math.max(1, (Date.now() - t0) / 1000);
      label.textContent = `Uploading ${done}/${items.length} · ${fmtBytes(sent)} of ${fmtBytes(total)} · ${fmtBytes(rate)}/s`;
    };
    let i = 0,
      failed = 0;
    const worker = async () => {
      while (i < items.length) {
        const [rel, file] = items[i++];
        try {
          await uploadOne(
            join(cwd, rel),
            file,
            (n) => (loaded.set(rel, n), update()),
            (attempt) => (label.textContent = `Connection hiccup on ${rel} — retrying (${attempt})…`),
          );
          done++;
          loaded.set(rel, file.size);
          update();
        } catch (err) {
          failed++;
          toast(`${rel}: ${err.message}`, 'bad');
        }
      }
    };
    // Big files go one at a time (steadier); lots of small files go three at a time.
    await Promise.all(items.some(([, f]) => f.size > 64 * 1024 * 1024) ? [worker()] : [worker(), worker(), worker()]);
    row.remove();
    if (unzip && !failed) await doUnzip(join(cwd, items[0][0]));
    else toast(failed ? `Uploaded with ${failed} error${failed > 1 ? 's' : ''}` : `Uploaded ${items.length} file${items.length > 1 ? 's' : ''} ✓`, failed ? 'bad' : '');
    fileInput.value = folderInput.value = zipInput.value = '';
    load();
  }

  // Drag & drop, including whole folders.
  const readEntry = (entry, prefix = '') =>
    new Promise((resolve) => {
      if (entry.isFile) entry.file((f) => resolve([[prefix + f.name, f]]), () => resolve([]));
      else if (entry.isDirectory) {
        if (entry.name === 'node_modules' || entry.name === '.git') return resolve([]);
        const reader = entry.createReader();
        const all = [];
        const next = () =>
          reader.readEntries(async (batch) => {
            if (!batch.length) {
              const nested = await Promise.all(all.map((e) => readEntry(e, prefix + entry.name + '/')));
              return resolve(nested.flat());
            }
            all.push(...batch);
            next();
          });
        next();
      } else resolve([]);
    });
  dz.addEventListener('dragover', (e) => (e.preventDefault(), dz.classList.add('drag')));
  dz.addEventListener('dragleave', (e) => e.target === dz && dz.classList.remove('drag'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const items = entries.length ? (await Promise.all(entries.map((en) => readEntry(en)))).flat() : [...e.dataTransfer.files].map((f) => [f.name, f]);
    uploadFiles(items);
  });

  async function openEditor(path) {
    let data;
    try {
      data = await api('GET', api_(`/file?path=${encodeURIComponent(path)}`));
    } catch (err) {
      return toast(err.message, 'bad');
    }
    const dl = api_(`/file?download=1&path=${encodeURIComponent(path)}`);
    if (data.binary || data.tooLarge)
      return sheet((close) =>
        h('div', {}, h('h2', {}, path.split('/').pop()), h('p', { class: 'muted' }, data.binary ? `This is a binary file (${fmtBytes(data.size)}) and can't be edited here.` : `This file is too large to edit here (${fmtBytes(data.size)}).`), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', onclick: close }, 'Close'), h('a', { class: 'btn primary', href: dl }, icon('download'), 'Download'))),
      );
    sheet(
      (close) => {
        let dirty = false;
        const ta = h('textarea', {
          class: 'input',
          spellcheck: 'false',
          style: 'height:min(60vh,600px)',
          oninput: () => (dirty = true),
          onkeydown: (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
              dirty = true;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              save.click();
            }
          },
        });
        ta.value = data.content;
        const save = h(
          'button',
          {
            class: 'btn primary',
            onclick: (e) =>
              busy(e.currentTarget, async () => {
                await api('PUT', api_(`/file?path=${encodeURIComponent(path)}`), ta.value, { raw: true });
                dirty = false;
                toast('Saved ✓ — restart the website to apply code changes.');
              }),
          },
          'Save',
        );
        return h(
          'div',
          {},
          h('div', { class: 'row between', style: 'margin-bottom:14px' }, h('div', { class: 'grow' }, h('h2', { class: 'ellipsis' }, path.split('/').pop()), h('div', { class: 'small muted mono ellipsis' }, path)), h('a', { class: 'btn sm', href: dl }, icon('download'), 'Download')),
          ta,
          h('div', { class: 'sheet-actions' }, h('span', { class: 'small muted', style: 'margin-right:auto;align-self:center' }, 'Ctrl/⌘ + S to save'), h('button', { class: 'btn', onclick: async () => (!dirty || (await confirmSheet({ title: 'Discard changes?', text: 'Your edits have not been saved.', ok: 'Discard', danger: true }))) && close() }, 'Close'), save),
        );
      },
      { wide: true },
    );
  }

  load('/');
  const areaNote = h('div');
  const paintNote = () =>
    append(clear(areaNote), [
      area === 'data'
        ? notice('good', h('b', {}, 'Data folder. '), 'Store databases and uploads here — GitHub updates, rollbacks and “clean” never touch it, and it is included in full backups. Your app finds it at ', h('code', {}, site.kind === 'rust' ? 'std::env::var("DATA_DIR")' : 'process.env.DATA_DIR'), '.')
        : null,
    ]);
  paintNote();
  const areaSeg = h(
    'div',
    { class: 'segmented' },
    [
      ['code', 'Website files'],
      ['data', 'Data folder'],
    ].map(([id, label]) =>
      h(
        'button',
        {
          class: id === area ? 'on' : '',
          onclick: (ev) => {
            area = id;
            [...areaSeg.children].forEach((b) => b.classList.toggle('on', b === ev.currentTarget));
            paintNote();
            load('/');
          },
        },
        label,
      ),
    ),
  );
  return h(
    'div',
    { class: 'stack', style: 'gap:14px' },
    h('div', { class: 'row wrap between' }, areaSeg),
    areaNote,
    h(
      'div',
      { class: 'row wrap between' },
      crumbs,
      h(
        'div',
        { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: newFile }, icon('file'), 'New File'),
        h('button', { class: 'btn sm', onclick: newFolder }, icon('plus'), 'New Folder'),
        h('button', { class: 'btn sm', onclick: () => zipInput.click() }, icon('zip'), 'Upload .zip'),
        h('button', { class: 'btn sm', onclick: () => folderInput.click() }, icon('folder'), 'Upload Folder'),
        h('button', { class: 'btn sm primary', onclick: () => fileInput.click() }, icon('upload'), 'Upload Files'),
      ),
    ),
    progressBox,
    dz,
    h('p', { class: 'small muted' }, 'Tip: drag a project folder onto the list. ', h('code', {}, 'node_modules'), ' is skipped — use “Install & Rebuild” on the Overview tab afterwards.'),
    fileInput,
    folderInput,
    zipInput,
  );
}

/* ------------------------------------------------------------- logs */

async function siteLogs(site) {
  const term = h('div', { class: 'terminal', role: 'log' });
  let follow = true;
  const addLine = (line) => {
    const cls = /error|exception|fail|✖|ERR!/i.test(line) ? 'err' : /listening|ready|started|✓|▶/i.test(line) ? 'ok' : '';
    term.append(h('div', { class: cls }, line));
    while (term.childNodes.length > 3000) term.firstChild.remove();
    if (follow) term.scrollTop = term.scrollHeight;
  };
  const { text } = await api('GET', `/api/sites/${site.name}/logs`);
  (text || '').split('\n').filter(Boolean).forEach(addLine);
  if (!text) term.append(h('div', { class: 'dim' }, 'No output yet. Start the website to see its logs here.'));
  const es = new EventSource(`/api/sites/${site.name}/logs/stream`);
  es.addEventListener('line', (e) => addLine(JSON.parse(e.data)));
  state.cleanup.push(() => es.close());
  setTimeout(() => (term.scrollTop = term.scrollHeight), 0);
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'row between wrap' }, h('div', { class: 'row' }, h('span', { class: 'pill good running' }, h('span', { class: 'dot' }), 'Live'), h('span', { class: 'small muted' }, 'Everything your website prints shows up here.')), h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Auto-scroll'), toggle(true, (v) => (follow = v), 'Auto-scroll'), h('button', { class: 'btn sm', onclick: () => clear(term) }, 'Clear'), h('button', { class: 'btn sm', onclick: () => copy(term.innerText, 'Logs copied') }, icon('copy'), 'Copy'))),
    term,
  );
}

/* ---------------------------------------------------------- domains */

async function siteDomains(site) {
  const cf = await api('GET', '/api/cloudflare').catch(() => ({ connected: false }));
  const listBox = h('div', { class: 'list' });
  const paint = () => {
    clear(listBox);
    if (!site.hostnames.length) listBox.append(h('div', { class: 'item' }, h('div', { class: 'muted' }, 'No domains yet. Add one below.')));
    for (const hn of site.hostnames) {
      listBox.append(
        h(
          'div',
          { class: 'item' },
          h('div', { class: 'app-icon', style: { background: 'linear-gradient(135deg,#ff9f0a,#ff6a00)' } }, icon('globe')),
          h('div', { class: 'grow' }, h('a', { class: 'label', href: `https://${hn}`, target: '_blank', rel: 'noopener' }, hn), h('div', { class: 'row wrap', style: 'margin-top:4px;gap:6px' }, site.certs[hn] ? h('span', { class: 'pill good' }, icon('lock'), 'HTTPS ready') : h('a', { class: 'pill warn', href: '#/domains' }, 'Needs certificate'), cf.connected && h('span', { class: 'pill info' }, 'DNS managed'))),
          h(
            'button',
            {
              class: 'btn sm danger',
              onclick: async () => {
                if (!(await confirmSheet({ title: `Disconnect ${hn}?`, text: cf.connected ? 'The website stays, and AutoNode removes the DNS record it created.' : 'The website stays; this domain will stop pointing to it.', ok: 'Disconnect', danger: true }))) return;
                try {
                  await api('DELETE', `/api/sites/${site.name}/hostnames/${encodeURIComponent(hn)}`);
                  site.hostnames = site.hostnames.filter((x) => x !== hn);
                  paint();
                } catch (err) {
                  toast(err.message, 'bad');
                }
              },
            },
            'Remove',
          ),
        ),
      );
    }
  };
  paint();
  const input = h('input', { class: 'input', placeholder: 'akulav.com  or  blog.akulav.com', autocapitalize: 'off', autocomplete: 'off' });
  const add = async (e) => {
    e.preventDefault();
    await busy(e.target.querySelector('button'), async () => {
      const r = await api('POST', `/api/sites/${site.name}/hostnames`, { hostname: input.value });
      site.hostnames.push(r.hostname);
      site.certs[r.hostname] = r.hasCert;
      input.value = '';
      paint();
      if (r.dns?.action === 'error') toast(`Added, but DNS failed: ${r.dns.error}`, 'bad');
      else if (r.dns) toast(`${r.hostname} connected and DNS ${r.dns.action} ✓`);
      else toast(`${r.hostname} added ✓`);
    });
  };
  const zones = cf.zones || [];
  const suggestions = zones.flatMap((z) => [z.name, `www.${z.name}`, `${site.name}.${z.name}`]).filter((s) => !site.hostnames.includes(s)).slice(0, 6);
  return h(
    'div',
    { class: 'stack', style: 'gap:18px' },
    !cf.connected && notice('info', h('b', {}, 'Tip: '), 'Connect Cloudflare on the ', h('a', { href: '#/domains' }, 'Domains'), ' page and AutoNode will create DNS records and keep them updated automatically.'),
    listBox,
    h(
      'div',
      { class: 'card' },
      h('h3', {}, 'Add a domain or subdomain'),
      h('p', { class: 'muted small' }, 'Use your main domain (akulav.com) or any subdomain (blog.akulav.com, shop.akulav.com).'),
      h('form', { class: 'input-row', style: 'margin-top:14px', onsubmit: add }, input, h('button', { class: 'btn primary' }, 'Add')),
      suggestions.length > 0 && h('div', { class: 'row wrap', style: 'margin-top:12px;gap:6px' }, h('span', { class: 'small muted' }, 'Suggestions:'), suggestions.map((s) => h('button', { class: 'btn sm', type: 'button', onclick: () => (input.value = s) }, s))),
      !cf.connected &&
        h(
          'details',
          { class: 'more' },
          h('summary', {}, 'Setting up DNS by hand'),
          h(
            'div',
            { class: 'small', style: 'color:var(--text-2)' },
            h(
              'ol',
              { style: 'padding-left:18px;display:flex;flex-direction:column;gap:6px' },
              h('li', {}, 'Open ', h('a', { href: 'https://dash.cloudflare.com', target: '_blank', rel: 'noopener' }, 'dash.cloudflare.com'), ' → your domain → ', h('b', {}, 'DNS'), ' → ', h('b', {}, 'Records'), ' → ', h('b', {}, 'Add record'), '.'),
              h('li', {}, 'Type ', h('b', {}, 'A'), '. Name: ', h('b', {}, '@'), ' for the main domain, or the subdomain part (e.g. ', h('b', {}, 'blog'), ').'),
              h('li', {}, 'IPv4 address: ', h('b', {}, cf.publicIp || 'your public IP'), '. Keep ', h('b', {}, 'Proxied'), ' (orange cloud) on. Save.'),
            ),
          ),
        ),
    ),
  );
}

/* ----------------------------------------------------------- github */

async function siteGithub(site) {
  const g = await api('GET', `/api/sites/${site.name}/git`);
  const wrap = h('div', { class: 'stack', style: 'gap:18px' });
  if (!g.connected) {
    let repo, branch, token, auto;
    const submit = async (e) => {
      e.preventDefault();
      await busy(e.target.querySelector('.primary'), async () => {
        await api('PUT', `/api/sites/${site.name}/git`, { repo: repo.value, branch: branch.value, token: token.value, autoUpdate: auto.checked });
        toast('Connected to GitHub ✓');
        const ok = await confirmSheet({ title: 'Deploy now?', text: 'AutoNode will download the code, install packages, build and start the website. Files with the same names will be replaced.', ok: 'Deploy' });
        if (ok) await api('POST', `/api/sites/${site.name}/deploy`);
        render();
      });
    };
    append(wrap, [
      h(
        'div',
        { class: 'card pad-lg' },
        h('div', { class: 'row', style: 'gap:14px;margin-bottom:18px' }, h('div', { class: 'app-icon', style: { background: '#24292f', width: '48px', height: '48px', borderRadius: '13px' } }, icon('github')), h('div', {}, h('h2', {}, 'Connect to GitHub'), h('p', { class: 'muted' }, 'Deploy your code from a repository and keep it up to date.'))),
        h(
          'form',
          { class: 'form', onsubmit: submit },
          h('label', { class: 'field' }, 'Repository', (repo = h('input', { class: 'input', placeholder: 'akulav/my-website', required: true }))),
          h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Branch', (branch = h('input', { class: 'input', value: 'main' }))), h('label', { class: 'field' }, h('span', {}, 'Access token ', h('span', { class: 'hint' }, '(only for private repos)')), (token = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' })))),
          h(
            'details',
            { class: 'more' },
            h('summary', {}, 'How do I get a token?'),
            h(
              'div',
              { class: 'small', style: 'color:var(--text-2)' },
              h(
                'ol',
                { style: 'padding-left:18px;display:flex;flex-direction:column;gap:6px' },
                h('li', {}, 'Open ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → Settings → Developer settings → Fine-grained tokens'), '.'),
                h('li', {}, 'Name it “AutoNode”, pick an expiration, and under ', h('b', {}, 'Repository access'), ' choose ', h('b', {}, 'Only select repositories'), ' → your repo.'),
                h('li', {}, 'Under ', h('b', {}, 'Repository permissions'), ', set ', h('b', {}, 'Contents'), ' to ', h('b', {}, 'Read-only'), '.'),
                h('li', {}, 'Click ', h('b', {}, 'Generate token'), ' and paste it here.'),
              ),
            ),
          ),
          h('div', { class: 'row' }, (auto = h('input', { type: 'checkbox', id: 'au', checked: true })), h('label', { for: 'au' }, 'Check for new commits automatically and update the website')),
          h('div', { class: 'row' }, h('button', { class: 'btn primary' }, 'Connect Repository')),
        ),
      ),
    ]);
    return wrap;
  }

  const deployBox = h('div');
  const updatesBox = h('div');
  if (g.job?.running) watchDeploy(site.name, deployBox, () => render());
  const repoShort = g.repo.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '');
  const ld = g.lastDeploy;
  const hasDomain = site.hostnames.length > 0;

  const check = async (e) =>
    busy(e.currentTarget, async () => {
      const r = await api('POST', `/api/sites/${site.name}/git/check`);
      clear(updatesBox).append(
        r.upToDate
          ? notice('good', h('b', {}, 'Up to date. '), `Running the latest commit${r.current ? ` (${r.current.hash})` : ''}.`)
          : h(
              'div',
              { class: 'card' },
              h('div', { class: 'row between', style: 'margin-bottom:10px' }, h('h3', {}, `${r.behind}${r.behind >= 20 ? '+' : ''} new change${r.behind === 1 ? '' : 's'}`), h('button', { class: 'btn primary sm', onclick: deployNow }, 'Update Now')),
              h('div', { class: 'list', style: 'box-shadow:none' }, r.commits.map((c) => h('div', { class: 'item' }, h('code', { class: 'muted' }, c.hash), h('div', { class: 'grow ellipsis' }, c.subject), h('span', { class: 'small muted' }, `${c.author} · ${fmtAgo(c.date)}`)))),
            ),
      );
    });
  const deployNow = async (e, resolve) =>
    busy(e.currentTarget, async () => {
      await api('POST', `/api/sites/${site.name}/deploy`, resolve ? { resolve } : {});
      clear(updatesBox);
      clear(blockedBox);
      watchDeploy(site.name, deployBox, () => render());
    });

  // An update that was stopped because it would overwrite website data.
  const blockedBox = h('div');
  if (g.blocked?.files?.length) {
    const files = g.blocked.files;
    append(blockedBox, [
      h(
        'div',
        { class: 'card pad-lg', style: 'border-color:var(--warn)' },
        h('div', { class: 'row', style: 'gap:12px;margin-bottom:10px' }, h('span', { class: 'pill warn' }, icon('warn'), 'Update paused'), h('h3', {}, 'This update would overwrite data your website saved')),
        h('p', { class: 'muted' }, `Nothing was changed. Automatic updates are paused until you choose. Files your website created that aren't in the repository are always kept — these ${files.length === 1 ? 'is' : 'are'} the ${files.length === 1 ? 'one' : files.length} that would be replaced:`),
        h(
          'div',
          { class: 'list', style: 'margin:14px 0;box-shadow:none' },
          files.map((f) => h('div', { class: 'item' }, h('code', { class: 'grow ellipsis' }, f.path), h('span', { class: 'small muted' }, f.reason === 'changed' ? 'Changed on the server' : 'Created by the website'))),
        ),
        h(
          'div',
          { class: 'row wrap' },
          h('button', { class: 'btn primary', onclick: (e) => deployNow(e, 'keep') }, icon('lock'), 'Keep Server Versions & Update'),
          h(
            'button',
            {
              class: 'btn danger',
              onclick: async (e) => {
                const btn = e.currentTarget;
                if (!(await confirmSheet({ title: 'Use the GitHub versions?', text: `${files.map((f) => f.path).join(', ')} will be replaced with the version from GitHub. A copy of the current files is saved first — you'll find it under Rescued files on the Deploys tab.`, ok: 'Replace Files', danger: true }))) return;
                deployNow({ currentTarget: btn }, 'overwrite');
              },
            },
            'Use GitHub Versions',
          ),
        ),
        h('p', { class: 'small muted', style: 'margin-top:12px' }, '“Keep server versions” also locks these files, so future updates leave them alone automatically.'),
      ),
    ]);
  }

  append(wrap, [
    h(
      'div',
      { class: 'card pad-lg' },
      h(
        'div',
        { class: 'row wrap', style: 'gap:14px' },
        h('div', { class: 'app-icon', style: { background: '#24292f', width: '48px', height: '48px', borderRadius: '13px' } }, icon('github')),
        h('div', { class: 'grow' }, h('h2', {}, h('a', { href: g.repo.replace(/\.git$/, ''), target: '_blank', rel: 'noopener', style: 'color:inherit' }, repoShort)), h('div', { class: 'muted small' }, `Branch ${g.branch}${g.hasToken ? ' · private (token saved)' : ''} · checked ${fmtAgo(g.lastCheck)}`)),
        h('button', { class: 'btn', onclick: check }, icon('restart'), 'Check for Updates'),
        h('button', { class: 'btn primary', onclick: deployNow }, icon('download'), 'Deploy Now'),
      ),
      ld && !g.blocked && h('div', { style: 'margin-top:16px' }, ld.ok ? notice('good', h('b', {}, 'Last deploy succeeded '), fmtAgo(ld.at), ld.commit ? ` · ${ld.commit.hash} “${ld.commit.subject}”` : '') : notice('bad', h('b', {}, 'Last deploy failed '), fmtAgo(ld.at), ' — ', ld.error || '')),
    ),
    blockedBox,
    updatesBox,
    deployBox,
    h(
      'div',
      { class: 'list' },
      h(
        'div',
        { class: 'item' },
        h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Automatic updates'), h('div', { class: 'small muted' }, 'Pull new commits and redeploy on its own.')),
        h(
          'select',
          {
            class: 'input',
            style: 'width:auto',
            onchange: async (e) => {
              await api('PUT', `/api/sites/${site.name}/git`, { repo: g.repo, branch: g.branch, interval: Number(e.target.value), autoUpdate: g.autoUpdate });
              toast('Saved ✓');
            },
          },
          [1, 5, 15, 60, 360, 1440].map((m) => h('option', { value: m, selected: m === g.interval }, m < 60 ? `Every ${m} min` : m === 60 ? 'Every hour' : m === 1440 ? 'Once a day' : `Every ${m / 60} hours`)),
        ),
        toggle(g.autoUpdate, async (v) => {
          await api('PUT', `/api/sites/${site.name}/git`, { repo: g.repo, branch: g.branch, autoUpdate: v });
          g.autoUpdate = v;
          toast(v ? 'Automatic updates on' : 'Automatic updates off');
        }, 'Automatic updates'),
      ),
    ),
    h(
      'div',
      { class: 'section', style: 'margin-top:12px' },
      h('h2', {}, 'Locked files'),
      h('p', { class: 'muted', style: 'margin:4px 0 16px' }, 'Updates from GitHub never change or delete locked files — perfect for databases, uploads and .env. You can also lock items from the Files tab.'),
      lockEditor(site.name, g.locks || []),
    ),
    h(
      'div',
      { class: 'section', style: 'margin-top:12px' },
      h('h2', {}, 'Deploy instantly when you push'),
      h('p', { class: 'muted', style: 'margin:4px 0 16px' }, 'Instead of waiting for the next check, let GitHub tell AutoNode about new code. Pick one.'),
      !hasDomain && notice('warn', h('b', {}, 'Connect a domain first. '), 'GitHub needs a public address to reach this computer. ', h('a', { href: `#/sites/${site.name}/domains` }, 'Add a domain'), '.'),
      h(
        'div',
        { class: 'grid cols-2', style: 'margin-top:14px' },
        h(
          'div',
          { class: 'card' },
          h('span', { class: 'pill info' }, 'Easiest'),
          h('h3', { style: 'margin:10px 0 4px' }, 'GitHub Webhook'),
          h('p', { class: 'muted small' }, 'Deploys every push to ', h('b', {}, g.branch), '.'),
          h(
            'ol',
            { class: 'small', style: 'padding-left:18px;color:var(--text-2);display:flex;flex-direction:column;gap:8px' },
            h('li', {}, 'In your repo: ', h('a', { href: g.repo.replace(/\.git$/, '') + '/settings/hooks/new', target: '_blank', rel: 'noopener' }, 'Settings → Webhooks → Add webhook'), '.'),
            h('li', {}, h('b', {}, 'Payload URL:'), copyable(g.webhookUrl, 'URL copied')),
            h('li', {}, h('b', {}, 'Content type:'), ' application/json'),
            h('li', {}, h('b', {}, 'Secret:'), copyable(g.webhookSecret, 'Secret copied')),
            h('li', {}, 'Keep “Just the push event” and click ', h('b', {}, 'Add webhook'), '.'),
          ),
        ),
        h(
          'div',
          { class: 'card' },
          h('span', { class: 'pill' }, 'Test first'),
          h('h3', { style: 'margin:10px 0 4px' }, 'GitHub Actions'),
          h('p', { class: 'muted small' }, 'Runs your tests and build on GitHub; only deploys if they pass.'),
          h(
            'ol',
            { class: 'small', style: 'padding-left:18px;color:var(--text-2);display:flex;flex-direction:column;gap:8px' },
            h('li', {}, 'In your repo: ', h('a', { href: g.repo.replace(/\.git$/, '') + '/settings/secrets/actions/new', target: '_blank', rel: 'noopener' }, 'Settings → Secrets → Actions → New secret'), '.'),
            h('li', {}, 'Name ', h('b', {}, 'AUTONODE_DEPLOY_TOKEN'), ', value:', copyable(g.webhookSecret, 'Token copied')),
            h('li', {}, 'Add this file as ', h('code', {}, '.github/workflows/deploy.yml'), ' and push:'),
          ),
          h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => sheet((close) => h('div', {}, h('h2', {}, 'deploy.yml'), h('p', { class: 'muted', style: 'margin-bottom:14px' }, 'Save as .github/workflows/deploy.yml in your repository.'), codeBlock(g.workflow), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', onclick: close }, 'Close'))), { wide: true }) }, icon('file'), 'Show Workflow File'),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row wrap', style: 'margin-top:8px' },
      h(
        'button',
        {
          class: 'btn sm',
          onclick: async () => {
            if (!(await confirmSheet({ title: 'Create a new secret?', text: 'The old secret stops working. Update it in your GitHub webhook or Actions secret.', ok: 'Create New Secret' }))) return;
            await api('POST', `/api/sites/${site.name}/git/rotate`);
            render();
          },
        },
        'New Secret',
      ),
      h(
        'button',
        {
          class: 'btn sm danger',
          onclick: async () => {
            if (!(await confirmSheet({ title: 'Disconnect GitHub?', text: 'The website and its files stay as they are. It just stops receiving updates.', ok: 'Disconnect', danger: true }))) return;
            await api('DELETE', `/api/sites/${site.name}/git`);
            render();
          },
        },
        'Disconnect GitHub',
      ),
    ),
  ]);
  return wrap;
}

/* ========================================================== domains */

const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** A sheet with step-by-step instructions (kept out of the page so it fits on one screen). */
// A body part may be a function of `close`, for buttons that finish the job.
const guideSheet = (title, ...body) => sheet((close) => h('div', { class: 'guide' }, h('h2', {}, title), ...body.map((b) => (typeof b === 'function' ? b(close) : b)), h('div',{ class: 'sheet-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Done'))));

async function domainsView() {
  const [cf, certs] = await Promise.all([api('GET', '/api/cloudflare'), api('GET', '/api/certs')]);
  const zones = cf.zones || [];
  const zoneHasCert = (z) => certs.some((c) => c.names.includes(z.name) || c.names.includes(`*.${z.name}`));
  const routerUrl = cf.lanIp ? `http://${cf.lanIp.replace(/\.\d+$/, '.1')}` : null;
  const portsOk = cf.proxy?.http && cf.proxy?.https;

  /* ---- sheets with the detailed instructions ---- */

  const registrarHelp = () =>
    guideSheet(
      'Have your domain on Cloudflare',
      h('p', {}, 'Bought it on ', h('b', {}, 'Cloudflare Registrar'), "? It's already set up — nothing to do. Several domains can all live on this computer."),
      h('h3', {}, 'Bought it somewhere else (GoDaddy, Namecheap…)?'),
      h(
        'ol',
        {},
        h('li', {}, 'Go to ', ext('https://dash.cloudflare.com', 'dash.cloudflare.com'), ' → ', h('b', {}, 'Add a domain'), ', type your domain, choose the ', h('b', {}, 'Free'), ' plan.'),
        h('li', {}, 'Cloudflare shows two ', h('b', {}, 'nameservers'), '. At your registrar, replace the existing nameservers with those two.'),
        h('li', {}, 'Wait until Cloudflare emails you that the domain is active (minutes to a few hours).'),
      ),
    );

  const connectSheet = () =>
    sheet((close) => {
      const token = h('input', { class: 'input', type: 'password', placeholder: 'Paste your API token', autocomplete: 'off', required: true });
      return h(
        'form',
        {
          class: 'guide',
          onsubmit: async (e) => {
            e.preventDefault();
            await busy(e.target.querySelector('.primary'), async () => {
              const r = await api('POST', '/api/cloudflare/connect', { token: token.value });
              close();
              toast(`Connected ✓ Found ${r.zones.length} domain${r.zones.length === 1 ? '' : 's'}: ${r.zones.join(', ')}`);
              render();
            });
          },
        },
        h('h2', {}, 'Connect Cloudflare'),
        h('p', {}, 'This lets AutoNode create DNS records and HTTPS certificates for you. Create an ', h('b', {}, 'API token'), ':'),
        h(
          'ol',
          {},
          h('li', {}, 'Open ', ext('https://dash.cloudflare.com/profile/api-tokens', 'dash.cloudflare.com/profile/api-tokens'), ' and click ', h('b', {}, 'Create Token'), '.'),
          h('li', {}, 'Next to ', h('b', {}, 'Edit zone DNS'), ' click ', h('b', {}, 'Use template'), '.'),
          h('li', {}, 'Under ', h('b', {}, 'Permissions'), ' click ', h('b', {}, '+ Add more'), ' and add ', h('b', {}, 'Zone → SSL and Certificates → Edit'), ', ', h('b', {}, 'Zone → Zone Settings → Edit'), ' and ', h('b', {}, 'Zone → Zone → Read'), '.'),
          h('li', {}, 'Under ', h('b', {}, 'Zone Resources'), ' choose ', h('b', {}, 'Include → All zones'), '.'),
          h('li', {}, 'Click ', h('b', {}, 'Continue to summary'), ' → ', h('b', {}, 'Create Token'), ', then copy it and paste it here.'),
        ),
        h('label', { class: 'field', style: 'margin-top:14px' }, 'API token', token),
        h('p', { class: 'small muted', style: 'margin-top:6px' }, 'The token is stored only on this computer.'),
        h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, 'Connect')),
      );
    });

  const reachHelp = () =>
    guideSheet(
      'Let visitors reach this computer',
      h('p', {}, 'Your router needs to send website traffic to this computer. Choose one option:'),
      h('h3', {}, 'Port forwarding ', h('span', { class: 'pill info' }, 'Most common')),
      h(
        'ol',
        {},
        h('li', {}, "Open your router's settings", routerUrl ? [' (usually ', ext(routerUrl, routerUrl), ')'] : '', ' and sign in. The password is often on a sticker on the router.'),
        h('li', {}, 'Find ', h('b', {}, 'Port Forwarding'), ' (sometimes called Virtual Server, NAT or Gaming).'),
        h('li', {}, 'Add two rules to ', h('b', {}, cf.lanIp), ': TCP port ', h('b', {}, '80 → 80'), ' and TCP port ', h('b', {}, '443 → 443'), '.'),
        h('li', {}, 'Give this computer a ', h('a', { href: '#/network' }, 'fixed address'), ' so the rules keep working.'),
      ),
      h('h3', {}, 'Cloudflare Tunnel ', h('span', { class: 'pill' }, 'No router access')),
      h(
        'ol',
        {},
        h('li', {}, 'Open ', ext('https://one.dash.cloudflare.com', 'Cloudflare Zero Trust'), ' → ', h('b', {}, 'Networks → Tunnels → Create a tunnel'), ' → Cloudflared.'),
        h('li', {}, 'Choose ', h('b', {}, 'Debian'), ' and run the install command it shows on this computer.'),
        h('li', {}, 'Add a ', h('b', {}, 'Public hostname'), ' for each domain: Service ', h('b', {}, 'HTTP'), ', URL ', h('b', {}, 'localhost:80'), '.'),
        h('li', {}, 'Turn off “Keep DNS updated automatically” — the tunnel manages DNS.'),
      ),
    );

  const certSheet = () =>
    sheet((close) => {
      let cert, key;
      return h(
        'form',
        {
          class: 'guide',
          onsubmit: async (e) => {
            e.preventDefault();
            await busy(e.target.querySelector('.primary'), async () => {
              const r = await api('POST', '/api/certs', { cert: cert.value, key: key.value });
              toast(`Certificate installed for ${r.names.join(', ')} ✓`);
              close();
              render();
            });
          },
        },
        h('h2', {}, 'Paste a certificate'),
        h(
          'details',
          { class: 'more' },
          h('summary', {}, 'How to create one in Cloudflare'),
          h(
            'div',
            {},
            h(
              'ol',
              {},
              h('li', {}, 'Open your domain → ', h('b', {}, 'SSL/TLS'), ' → ', h('b', {}, 'Origin Server'), ' → ', h('b', {}, 'Create Certificate'), '.'),
              h('li', {}, 'Keep ', h('b', {}, 'Generate private key and CSR with Cloudflare'), ', key type ', h('b', {}, 'RSA (2048)'), '.'),
              h('li', {}, 'Hostnames: ', h('b', {}, '*.yourdomain.com'), ' and ', h('b', {}, 'yourdomain.com'), '. Validity ', h('b', {}, '15 years'), '. Click ', h('b', {}, 'Create'), '.'),
              h('li', {}, 'Copy both boxes below. The key is shown only once.'),
            ),
          ),
        ),
        h('div', { class: 'form', style: 'margin-top:14px' }, h('label', { class: 'field' }, 'Origin Certificate', (cert = h('textarea', { class: 'input', placeholder: '-----BEGIN CERTIFICATE-----', required: true }))), h('label', { class: 'field' }, 'Private Key', (key = h('textarea', { class: 'input', placeholder: '-----BEGIN PRIVATE KEY-----', required: true })))),
        h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, 'Install Certificate')),
      );
    });

  const httpsSheet = () =>
    guideSheet(
      'Turn on HTTPS (the padlock)',
      h('p', {}, 'A free Cloudflare ', h('b', {}, 'Origin Certificate'), ' encrypts traffic between Cloudflare and this computer. It lasts 15 years.'),
      cf.connected && zones.length
        ? (close) => h(
            'div',
            { class: 'list scroll-y', style: 'margin-top:14px;box-shadow:none' },
            zones.map((z) =>
              h(
                'div',
                { class: 'item' },
                h('div', { class: 'grow' }, h('div', { class: 'label' }, z.name), h('div', { class: 'small muted' }, `Covers ${z.name} and *.${z.name}`)),
                zoneHasCert(z)
                  ? h('span', { class: 'pill good' }, icon('lock'), 'Installed')
                  : h('button', { class: 'btn primary sm', onclick: (e) => busy(e.currentTarget, async () => { const r = await api('POST', '/api/cloudflare/origin-cert', { domain: z.name }); toast(`Certificate created for ${r.names.join(', ')} ✓${r.strict ? ' · SSL set to Full (strict)' : ''}`); close(); render(); }) }, 'Create Automatically'),
              ),
            ),
          )
        : h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Connect Cloudflare and AutoNode can create it for you, or paste one by hand.'),
      h('button', { class: 'btn', style: 'margin-top:14px', onclick: certSheet }, icon('lock'), 'Paste a Certificate by Hand'),
    );

  const strictSheet = () =>
    guideSheet(
      'Set encryption to Full (strict)',
      h('p', {}, 'In Cloudflare: your domain → ', h('b', {}, 'SSL/TLS'), ' → ', h('b', {}, 'Overview'), ' → ', h('b', {}, 'Configure'), ' → choose ', h('b', {}, 'Full (strict)'), '. This prevents redirect loops and keeps things secure.'),
      cf.connected && zones.length > 0 && [h('p', { style: 'margin-top:12px' }, 'Or let AutoNode do it:'), h('div', { class: 'row wrap', style: 'margin-top:8px' }, zones.map((z) => h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, async () => (await api('POST', '/api/cloudflare/strict', { domain: z.name }), toast(`${z.name} set to Full (strict) ✓`))) }, `Set for ${z.name}`)))],
    );

  /* ---- the page ---- */

  const step = (n, done, title, text, action) =>
    h('div', { class: 'item' }, h('span', { class: `step-dot ${done ? 'done' : ''}`, 'aria-label': done ? 'Done' : `Step ${n}` }, done ? '✓' : n), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label' }, title), h('div', { class: 'small muted' }, text)), action);
  const how = (fn, label = 'How?') => h('button', { class: 'btn sm', onclick: fn }, label);

  const statusCell = (label, value, sub) => h('div', {}, h('div', { class: 'metric-label' }, label), h('div', { class: 'status-value' }, value), h('div', { class: 'small muted ellipsis' }, sub));

  const cloudflareCard = cf.connected
    ? h(
        'div',
        { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', {}, 'Cloudflare'), h('button', { class: 'btn sm danger', onclick: async () => (await confirmSheet({ title: 'Disconnect Cloudflare?', text: 'Existing DNS records stay in Cloudflare, but AutoNode will stop updating them.', ok: 'Disconnect', danger: true })) && (await api('DELETE', '/api/cloudflare'), render()) }, 'Disconnect')),
        h(
          'div',
          { class: 'list flat scroll-y short' },
          zones.length ? zones.map((z) => h('div', { class: 'item' }, h('div', { class: 'app-icon', style: { background: 'linear-gradient(135deg,#ff9f0a,#ff6a00)' } }, icon('cloud')), h('div', { class: 'grow' }, h('div', { class: 'label' }, z.name), h('div', { class: 'small muted' }, `${z.plan || ''} · ${z.status}`)), h('span', { class: `pill ${z.status === 'active' ? 'good' : 'warn'}` }, z.status === 'active' ? 'Active' : 'Pending'))) : h('div', { class: 'item small muted' }, 'No domains in this Cloudflare account yet.'),
        ),
        cf.zonesError && notice('bad', cf.zonesError),
        h(
          'div',
          { class: 'row', style: 'margin-top:10px' },
          h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Keep DNS updated automatically'), h('div', { class: 'small muted' }, `Every 5 minutes · last ${fmtAgo(cf.lastSync)}${cf.lastIp ? ` → ${cf.lastIp}` : ''}`)),
          h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', '/api/cloudflare/sync'), toast('DNS updated ✓'), render())) }, 'Update Now'),
          toggle(cf.ddns, async (v) => (await api('PATCH', '/api/cloudflare', { ddns: v }), toast(v ? 'Automatic DNS on' : 'Automatic DNS off')), 'Automatic DNS'),
        ),
        cf.lastError && h('div', { style: 'margin-top:10px' }, notice('bad', h('b', {}, 'Last DNS update had problems: '), cf.lastError)),
      )
    : h('div', { class: 'card' }, h('h3', {}, 'Cloudflare'), h('p', { class: 'small muted', style: 'margin:6px 0 12px' }, 'Not connected. Connect it and AutoNode creates DNS records and certificates for you, and keeps your domains pointed at home when your internet address changes.'), h('button', { class: 'btn primary sm', onclick: connectSheet }, icon('cloud'), 'Connect Cloudflare…'));

  const certCard = h(
    'div',
    { class: 'card' },
    h('div', { class: 'section-head' }, h('h3', {}, 'Certificates'), h('button', { class: 'btn sm', onclick: certSheet }, icon('plus'), 'Add')),
    h(
      'div',
      { class: 'list flat scroll-y short' },
      !certs.length && h('div', { class: 'item small muted' }, 'No certificates yet.'),
      certs.map((c) =>
        h(
          'div',
          { class: 'item' },
          h('div', { class: 'app-icon', style: { background: c.expired ? '#ff3b30' : '#34c759' } }, icon('lock')),
          h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label ellipsis', title: c.names.join(', ') }, c.names.join(', ')), h('div', { class: 'small muted' }, `${c.issuer} · ${c.expired ? 'expired' : 'valid until'} ${new Date(c.validTo).toLocaleDateString()}`)),
          h('button', { class: 'btn sm danger', onclick: async () => (await confirmSheet({ title: 'Remove certificate?', text: `HTTPS will stop working for ${c.names.join(', ')} until you add another.`, ok: 'Remove', danger: true })) && (await api('DELETE', `/api/certs/${c.id}`), render()) }, 'Remove'),
        ),
      ),
    ),
  );

  return h(
    'div',
    { class: 'page domains' },
    pageHead('Domains', { sub: 'Put your websites on the internet with your own domain, like akulav.com.' }),
    h(
      'div',
      { class: 'card status-strip' },
      statusCell('Your internet address', cf.publicIp || 'Unknown', 'Where visitors reach you'),
      statusCell('This computer at home', cf.lanIp, h('a', { href: '#/network' }, 'Make it permanent →')),
      statusCell('Web traffic', h('span', { class: 'row', style: 'gap:6px' }, h('span', { class: `pill ${cf.proxy?.http ? 'good' : 'bad'}` }, `HTTP ${cf.proxy?.http || 'off'}`), h('span', { class: `pill ${cf.proxy?.https ? 'good' : 'bad'}` }, `HTTPS ${cf.proxy?.https || 'off'}`)), portsOk ? 'Ready to receive visitors' : cf.proxy?.httpError || cf.proxy?.httpsError),
    ),
    h(
      'div',
      { class: 'grid cols-2 domains-grid' },
      h(
        'div',
        {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Set up your domain'), h('span', { class: 'small muted' }, 'Once, about 5 minutes')),
        h(
          'div',
          { class: 'list' },
          step(1, zones.length > 0, 'Have your domain on Cloudflare', 'Bought on Cloudflare? Nothing to do.', how(registrarHelp)),
          step(2, cf.connected, 'Connect your Cloudflare account', cf.connected ? 'Connected — DNS is managed for you.' : 'Lets AutoNode manage DNS and HTTPS.', cf.connected ? null : how(connectSheet, 'Connect…')),
          step(3, false, 'Let visitors reach this computer', 'Port forwarding or a Cloudflare Tunnel.', how(reachHelp)),
          step(4, certs.length > 0, 'Turn on HTTPS (the padlock)', 'A free 15-year Origin Certificate.', how(httpsSheet, certs.length ? 'Manage' : 'Set Up…')),
          step(5, false, 'Set encryption to Full (strict)', 'One setting in Cloudflare.', how(strictSheet)),
          step(6, false, 'Connect a domain to a website', 'Website → Domains & Access.', h('a', { class: 'btn sm', href: '#/sites' }, 'Websites')),
        ),
      ),
      h('div', { class: 'stack', style: 'gap:16px' }, cloudflareCard, certCard),
    ),
  );
}

/* ========================================================== network */

async function networkView() {
  const n = await api('GET', '/api/network');
  let mode = n.mode === 'static' ? 'static' : 'dhcp';
  let address, prefix, gateway, dns;
  const fields = h(
    'div',
    { class: `form ${mode === 'static' ? '' : 'hidden'}`, style: 'margin-top:18px' },
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'IP address ', h('span', { class: 'hint' }, '(pick one outside your router\'s DHCP range, e.g. .50–.99)')), (address = h('input', { class: 'input mono', value: n.address || '', placeholder: '192.168.1.50' }))), h('label', { class: 'field' }, h('span', {}, 'Subnet ', h('span', { class: 'hint' }, '(almost always /24)')), (prefix = h('select', { class: 'input' }, [16, 20, 22, 23, 24, 25, 26, 27, 28].map((p) => h('option', { value: p, selected: p === (n.prefix || 24) }, `/${p}${p === 24 ? ' (255.255.255.0)' : ''}`)))))),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Router', (gateway = h('input', { class: 'input mono', value: n.gateway || '', placeholder: '192.168.1.1' }))), h('label', { class: 'field' }, 'DNS servers', (dns = h('input', { class: 'input mono', value: '1.1.1.1, 1.0.0.1', placeholder: '1.1.1.1, 1.0.0.1' })))),
  );
  const seg = h(
    'div',
    { class: 'segmented' },
    [
      ['dhcp', 'Automatic'],
      ['static', 'Fixed address'],
    ].map(([id, label]) =>
      h(
        'button',
        {
          class: id === mode ? 'on' : '',
          onclick: (e) => {
            mode = id;
            [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget));
            fields.classList.toggle('hidden', id !== 'static');
          },
        },
        label,
      ),
    ),
  );
  const apply = async (e) => {
    const btn = e.currentTarget;
    const newUrl = mode === 'static' ? `http://${address.value}:${location.port || 80}` : null;
    const ok = await confirmSheet({
      title: mode === 'static' ? `Switch to ${address.value}?` : 'Switch to automatic?',
      text: mode === 'static' ? `This computer's network will restart for a few seconds. Afterwards, open AutoNode at ${newUrl}. If you use port forwarding, update the rules to the new address.` : 'Your router will assign an address. It may change, so you might need to find AutoNode again in your router\'s device list.',
      ok: 'Apply',
    });
    if (!ok) return;
    await busy(btn, async () => {
      const r = await api('POST', '/api/network', { mode, interface: n.interface, address: address.value, prefix: Number(prefix.value), gateway: gateway.value, dns: dns.value });
      if (r.demo) return toast('Dev mode: settings validated, nothing was changed.');
      sheet(() => h('div', { class: 'center' }, h('span', { class: 'spin', style: 'width:28px;height:28px;margin:8px auto 16px;display:block' }), h('h2', {}, 'Applying network settings…'), h('p', { class: 'muted', style: 'margin:8px 0 18px' }, r.newUrl ? 'In about 10 seconds, continue at:' : 'Reload in a few seconds.'), r.newUrl ? h('a', { class: 'btn primary lg', href: r.newUrl }, r.newUrl) : h('button', { class: 'btn primary lg', onclick: () => location.reload() }, 'Reload')));
    });
  };

  return h(
    'div',
    { class: 'page' },
    pageHead('Network', { sub: 'Give this computer a fixed address so your domains and bookmarks always find it.' }),
    h(
      'div',
      { class: 'grid cols-2' },
      h('div', { class: 'card pad-lg' }, h('div', { class: 'metric-label' }, 'Current address'), h('div', { class: 'metric-big', style: 'margin-top:8px' }, n.address || '—'), h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: `pill ${n.mode === 'static' ? 'good' : 'info'}` }, n.mode === 'static' ? 'Fixed' : n.mode === 'dhcp' ? 'Automatic (DHCP)' : 'Unknown'), n.interface && h('span', { class: 'pill' }, n.interface))),
      h('div', { class: 'card pad-lg' }, h('dl', { class: 'kv' }, ...[['Router', n.gateway], ['DNS', n.dns.join(', ') || '—'], ['Computer name', n.hostname], ['Managed by', { networkmanager: 'NetworkManager', netplan: 'Netplan', demo: 'Simulated (dev mode)' }[n.backend] || 'Not supported']].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v || '—')]))),
    ),
    h(
      'div',
      { class: 'section' },
      !n.supported
        ? notice('warn', h('b', {}, "This system's network can't be changed from here. "), 'Set a fixed address in your router instead: find this computer in the router\'s device list and choose “Reserve IP” / “DHCP reservation”.')
        : h(
            'div',
            { class: 'card pad-lg' },
            h('div', { class: 'row between wrap' }, h('div', {}, h('h2', {}, 'IP address'), h('p', { class: 'muted small' }, 'Automatic lets your router choose. Fixed always uses the same address.')), seg),
            fields,
            h('div', { class: 'row', style: 'margin-top:22px' }, h('button', { class: 'btn primary', onclick: apply }, 'Apply'), h('span', { class: 'small muted' }, 'AutoNode checks the address isn\'t already used by another device.')),
          ),
      h('details', { class: 'more', style: 'margin-top:18px' }, h('summary', {}, 'Prefer to do it in the router?'), h('div', { class: 'muted' }, 'Most routers can “reserve” an address for a device. Look for DHCP Reservation or Address Reservation, pick this computer (', n.interfaces[0]?.mac || 'its MAC address', ') and assign the address you want. That works just as well.')),
    ),
  );
}

/* ===================================================== feature views */


/** Single-series bar chart with a per-bar hover readout. */
function barChart(points, { value, label, format = fmtNum, height = 150, ariaLabel }) {
  const max = Math.max(1, ...points.map(value));
  const tip = h('div', { class: 'tip hidden' });
  const bars = h('div', { class: 'bars', style: `height:${height}px`, role: 'img', 'aria-label': ariaLabel });
  const wrap = h('div', { class: 'chart' }, bars, tip);
  for (const p of points) {
    const v = value(p);
    const col = h('div', { class: 'bar-col' }, h('div', { class: 'bar', style: `height:${v ? Math.max(2, (v / max) * 100) : 0}%` }));
    col.addEventListener('pointerenter', () => {
      tip.textContent = `${label(p)} · ${format(v)}`;
      tip.classList.remove('hidden');
      const r = col.getBoundingClientRect();
      const pr = wrap.getBoundingClientRect();
      tip.style.left = `${Math.max(60, Math.min(pr.width - 60, r.left - pr.left + r.width / 2))}px`;
      tip.style.top = `${height - (v / max) * height}px`;
      col.classList.add('on');
    });
    col.addEventListener('pointerleave', () => {
      tip.classList.add('hidden');
      col.classList.remove('on');
    });
    bars.append(col);
  }
  return wrap;
}
const axisRow = (labels) => h('div', { class: 'axis' }, h('span', {}, labels[0] || ''), h('span', {}, labels[Math.floor(labels.length / 2)] || ''), h('span', {}, labels.at(-1) || ''));

/* ---- overview: storage */

function meterRow(label, value, total, hint) {
  const pct = total > 0 && value ? Math.max(0.5, (value / total) * 100) : 0;
  return h(
    'div',
    { class: 'item meter-row' },
    h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'label' }, label), hint && h('div', { class: 'small muted' }, hint)), h('div', { class: 'mono small' }, fmtBytes(value))),
    h('div', { class: 'bar-meter thin' }, h('i', { style: `width:${pct.toFixed(1)}%` })),
  );
}

/** "Node.js" or "Rust": what kind of program the website is (from package.json / Cargo.toml). */
function kindPill(site) {
  return h('span', { class: 'pill', title: site.kind === 'rust' ? 'Built with cargo from Cargo.toml' : 'Runs with Node.js from package.json' }, site.kind === 'rust' ? 'Rust' : 'Node.js');
}

function storageCard(site) {
  const rust = site.kind === 'rust';
  const box = h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Storage'), h('span', { class: 'spin right' })));
  const load = async (fresh) => {
    let u;
    try {
      u = await api('GET', `/api/sites/${site.name}/usage${fresh ? '?fresh=1' : ''}`);
    } catch (err) {
      return append(clear(box), [h('h3', {}, 'Storage'), h('p', { class: 'muted small' }, err.message)]);
    }
    const clean = async (reinstall, btn) => {
      const ok = await confirmSheet(
        rust
          ? {
              title: reinstall ? 'Clean and rebuild?' : 'Delete build files?',
              text: reinstall ? 'The target folder is deleted (like “cargo clean”), the program is built from scratch, and the website restarts. The build can take several minutes.' : 'Deletes the target folder to free the space now. The website keeps running, but it needs “Install & Rebuild” before it can start again.',
              ok: reinstall ? 'Clean & Rebuild' : 'Delete',
              danger: !reinstall,
            }
          : {
              title: reinstall ? 'Clean and reinstall packages?' : 'Delete node_modules?',
              text: reinstall ? 'node_modules is deleted, packages are installed fresh, and the website restarts. Useful when packages behave strangely.' : 'Frees the space now. The website keeps running, but it needs “Install & Rebuild” before it can start again.',
              ok: reinstall ? 'Clean & Reinstall' : 'Delete',
              danger: !reinstall,
            },
      );
      if (!ok) return;
      await busy(btn, async () => {
        const r = await api('POST', `/api/sites/${site.name}/clean`, { reinstall });
        toast(`Freed ${fmtBytes(r.freed)}${reinstall ? (rust ? ' — rebuilding…' : ' — reinstalling…') : ''}`);
        load(true);
      });
    };
    let b1, b2;
    append(clear(box), [
      h('div', { class: 'row between', style: 'margin-bottom:4px' }, h('h3', {}, 'Storage'), h('span', { class: 'metric-sub' }, `${fmtBytes(u.total)} in total`)),
      h(
        'div',
        { class: 'list flat' },
        meterRow('Website files', u.code, u.total, 'Your code and build output'),
        rust ? meterRow('Build files', u.target, u.total, 'target — cargo rebuilds it any time') : meterRow('Packages', u.nodeModules, u.total, 'node_modules — can be reinstalled any time'),
        meterRow('Git history', u.git, u.total),
        meterRow('Data folder', u.data, u.total, 'Databases and uploads (DATA_DIR)'),
        meterRow('Snapshots', u.snapshots, u.total, 'Copies for rolling back'),
      ),
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:12px' },
        (b1 = h('button', { class: 'btn sm', disabled: !(rust ? u.target : u.nodeModules), onclick: () => clean(true, b1) }, icon('restart'), rust ? 'Clean & Rebuild' : 'Clean & Reinstall Packages')),
        (b2 = h('button', { class: 'btn sm danger', disabled: !(rust ? u.target : u.nodeModules), onclick: () => clean(false, b2) }, icon('trash'), rust ? 'Delete Build Files' : 'Delete node_modules')),
        h('button', { class: 'btn sm ghost right', onclick: () => load(true) }, 'Refresh'),
      ),
    ]);
  };
  load(false);
  return box;
}

/* ---- visitors */

async function siteVisitors(site) {
  let days = 14;
  const wrap = h('div', { class: 'stack', style: 'gap:16px' });
  const dateLabel = (d) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const tile = (label, big, sub) => h('div', { class: 'card' }, h('div', { class: 'metric-label' }, label), h('div', { class: 'metric-big', style: 'margin-top:6px' }, big), sub && h('div', { class: 'metric-sub' }, sub));
  const paint = async () => {
    const v = await api('GET', `/api/sites/${site.name}/visitors?days=${days}`);
    const t = v.totals;
    const errRate = t.requests ? (t.s5 / t.requests) * 100 : 0;
    const seg = h(
      'div',
      { class: 'segmented' },
      [7, 14, 30, 90].map((d) => h('button', { class: d === days ? 'on' : '', onclick: () => ((days = d), paint().catch((err) => toast(err.message, 'bad'))) }, `${d} days`)),
    );
    const top = v.pages[0]?.views || 1;
    append(clear(wrap), [
      h('div', { class: 'row between wrap' }, h('p', { class: 'muted small' }, 'Counted by AutoNode as visitors arrive — no cookies, no tracking scripts, no IP addresses stored. Bots are counted separately.'), seg),
      !site.hostnames.length && notice('info', 'Visitors are counted for traffic that comes in through your domains. ', h('a', { href: `#/sites/${site.name}/domains` }, 'Connect a domain'), ' to start.'),
      h(
        'div',
        { class: 'grid cols-4' },
        tile('Visitors', fmtNum(t.visitors), `${fmtNum(v.today.visitors)} today`),
        tile('Requests', fmtNum(t.requests), `${fmtNum(v.today.requests)} today`),
        tile('Server errors', `${errRate.toFixed(errRate && errRate < 10 ? 1 : 0)}%`, `${fmtNum(t.s5)} errors · ${fmtNum(t.s4)} not found`),
        tile('Data sent', fmtBytes(t.bytes), `${fmtNum(t.bots)} bot requests`),
      ),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'row between', style: 'margin-bottom:14px' }, h('h3', {}, 'Visitors per day'), h('span', { class: 'small muted' }, `Last ${days} days`)),
        barChart(v.days, { value: (p) => p.visitors, label: (p) => dateLabel(p.date), format: (n) => `${fmtNum(n)} visitor${n === 1 ? '' : 's'}`, ariaLabel: `Visitors per day for the last ${days} days` }),
        axisRow(v.days.map((p) => dateLabel(p.date))),
      ),
      h(
        'div',
        { class: 'grid cols-2' },
        h(
          'div',
          { class: 'card' },
          h('h3', { style: 'margin-bottom:14px' }, 'Last 24 hours'),
          barChart(v.hours, { value: (p) => p.requests, label: (p) => `${p.hour.slice(11)}:00`, format: (n) => `${fmtNum(n)} request${n === 1 ? '' : 's'}`, height: 110, ariaLabel: 'Requests per hour, last 24 hours' }),
          axisRow(v.hours.map((p) => `${p.hour.slice(11)}:00`)),
        ),
        h(
          'div',
          { class: 'card' },
          h('h3', { style: 'margin-bottom:12px' }, 'Top pages'),
          v.pages.length
            ? h(
                'div',
                { class: 'stack tight' },
                v.pages.map((p) =>
                  h('div', { class: 'page-row' }, h('div', { class: 'row between' }, h('span', { class: 'mono small ellipsis', title: p.path }, p.path), h('span', { class: 'small muted' }, fmtNum(p.views))), h('div', { class: 'bar-meter thin' }, h('i', { style: `width:${((p.views / top) * 100).toFixed(1)}%` }))),
                ),
              )
            : h('p', { class: 'muted small' }, 'No page views yet.'),
        ),
      ),
    ]);
  };
  await paint();
  return wrap;
}

/* ---- domains & access: www, maintenance, password, redirects */

async function siteDomainsAndAccess(site) {
  const el = await siteDomains(site);
  const t = await api('GET', `/api/sites/${site.name}/traffic`);
  const save = (patch, btn, msg = 'Saved ✓') =>
    busy(btn, async () => {
      const r = await api('PATCH', `/api/sites/${site.name}/traffic`, patch);
      Object.assign(t, patch);
      const bad = (r.dns || []).filter((d) => d.action === 'error');
      toast(bad.length ? `Saved, but DNS failed for ${bad.map((d) => d.hostname).join(', ')}: ${bad[0].error}` : msg, bad.length ? 'bad' : '');
    });

  // www
  const apex = t.apexHostnames[0];
  const wwwOpts = [
    ['off', 'Leave as is'],
    ['to-apex', apex ? `www.${apex} → ${apex}` : 'www → main domain'],
    ['to-www', apex ? `${apex} → www.${apex}` : 'main domain → www'],
  ];
  const wwwSeg = h(
    'div',
    { class: 'segmented wrap-seg' },
    wwwOpts.map(([id, label]) =>
      h(
        'button',
        {
          class: id === (t.www || 'off') ? 'on' : '',
          disabled: !apex,
          onclick: (e) => {
            const btn = e.currentTarget;
            [...wwwSeg.children].forEach((b) => b.classList.toggle('on', b === btn));
            save({ www: id }, btn, id === 'off' ? 'www handling off' : 'Saved ✓ — both addresses now lead to one place');
          },
        },
        label,
      ),
    ),
  );

  // Maintenance
  const mMsg = h('input', { class: 'input', value: t.maintenance.message || '', placeholder: "We're making some improvements and will be back shortly." });
  const mToggle = toggle(t.maintenance.enabled, async (v, input) => {
    try {
      await api('PATCH', `/api/sites/${site.name}/traffic`, { maintenance: { enabled: v, message: mMsg.value } });
      toast(v ? 'Maintenance mode on — visitors see “Back soon”' : 'Maintenance mode off — website is public again');
    } catch (err) {
      input.checked = !v;
      toast(err.message, 'bad');
    }
  }, 'Maintenance mode');

  // Password
  let aUser, aPass, aSave;
  const accessFields = h(
    'div',
    { class: `form ${t.access.enabled ? '' : 'hidden'}`, style: 'margin-top:14px' },
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Username', (aUser = h('input', { class: 'input', value: t.access.username || '', autocomplete: 'off', placeholder: 'guest' }))), h('label', { class: 'field' }, h('span', {}, 'Password ', h('span', { class: 'hint' }, t.access.hasPassword ? '(leave empty to keep the current one)' : '')), (aPass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: t.access.hasPassword ? '••••••••' : 'At least 6 characters' })))),
    h('div', { class: 'row' }, (aSave = h('button', { class: 'btn primary sm', onclick: () => save({ access: { enabled: true, username: aUser.value, password: aPass.value } }, aSave, 'Password protection on ✓').then(() => (aPass.value = '')) }, 'Save'))),
  );
  const aToggle = toggle(t.access.enabled, async (v, input) => {
    if (v) {
      accessFields.classList.remove('hidden');
      aUser.focus();
      return;
    }
    try {
      await api('PATCH', `/api/sites/${site.name}/traffic`, { access: { enabled: false } });
      accessFields.classList.add('hidden');
      toast('Password protection off');
    } catch (err) {
      input.checked = true;
      toast(err.message, 'bad');
    }
  }, 'Password protection');

  // Redirects
  let rules = [...t.redirects];
  const rulesBox = h('div', { class: 'list' });
  const paintRules = () => {
    clear(rulesBox);
    if (!rules.length) rulesBox.append(h('div', { class: 'item' }, h('div', { class: 'muted small' }, 'No redirects yet.')));
    rules.forEach((r, i) =>
      rulesBox.append(
        h(
          'div',
          { class: 'item' },
          h('code', { class: 'ellipsis', style: 'max-width:40%' }, r.from),
          h('span', { class: 'muted' }, '→'),
          h('code', { class: 'grow ellipsis' }, r.to),
          h('span', { class: 'pill' }, r.code === 301 || r.code === 308 ? 'Permanent' : 'Temporary'),
          h('button', { class: 'btn icon ghost', title: 'Remove', style: 'color:var(--bad)', onclick: async (e) => ((rules = rules.filter((_, j) => j !== i)), await save({ redirects: rules }, e.currentTarget, 'Redirect removed'), paintRules()) }, icon('trash')),
        ),
      ),
    );
  };
  paintRules();
  let rFrom, rTo, rCode;
  const addRule = async (e) => {
    e.preventDefault();
    const next = [...rules, { from: rFrom.value.trim(), to: rTo.value.trim(), code: Number(rCode.value) }];
    const btn = e.target.querySelector('button');
    await busy(btn, async () => {
      await api('PATCH', `/api/sites/${site.name}/traffic`, { redirects: next });
      rules = next;
      rFrom.value = rTo.value = '';
      paintRules();
      toast('Redirect added ✓');
    });
  };

  el.append(
    h(
      'div',
      { class: 'section', style: 'margin-top:12px' },
      h('h2', {}, 'www'),
      h('p', { class: 'muted', style: 'margin:4px 0 14px' }, 'Make both akulav.com and www.akulav.com work, sending visitors to the one you prefer.'),
      apex ? wwwSeg : notice('info', 'Add your main domain (like akulav.com) above to use this.'),
      apex && t.www !== 'off' && h('p', { class: 'small muted', style: 'margin-top:10px' }, 'With Cloudflare connected, AutoNode adds the DNS record for the www address too. A wildcard certificate (*.domain) covers it.'),
    ),
    h(
      'div',
      { class: 'card pad-lg' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Maintenance mode'), h('p', { class: 'muted small' }, 'Visitors see a clean “Back soon” page while you work. The Preview link (home network) still shows the real site.')), mToggle),
      h('div', { class: 'input-row', style: 'margin-top:14px' }, mMsg, h('button', { class: 'btn sm', onclick: (e) => save({ maintenance: { enabled: t.maintenance.enabled, message: mMsg.value } }, e.currentTarget, 'Message saved ✓') }, 'Save Message')),
    ),
    h(
      'div',
      { class: 'card pad-lg' },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Password protection'), h('p', { class: 'muted small' }, 'Ask visitors for a username and password before showing the site — great for staging or private sites.')), aToggle),
      accessFields,
      t.access.enabled && !site.hostnames.every((hn) => site.certs[hn]) && h('div', { style: 'margin-top:12px' }, notice('warn', 'Add an HTTPS certificate for this domain so the password is never sent unencrypted.')),
    ),
    h(
      'div',
      { class: 'section', style: 'margin-top:12px' },
      h('h2', {}, 'Redirects'),
      h('p', { class: 'muted', style: 'margin:4px 0 14px' }, 'Send old addresses to new ones. End with * to redirect a whole section, e.g. /blog/* → /news/*.'),
      rulesBox,
      h(
        'form',
        { class: 'row wrap', style: 'margin-top:12px', onsubmit: addRule },
        (rFrom = h('input', { class: 'input mono', placeholder: '/old-page', style: 'flex:1;min-width:140px', required: true })),
        h('span', { class: 'muted' }, '→'),
        (rTo = h('input', { class: 'input mono', placeholder: '/new-page or https://…', style: 'flex:2;min-width:180px', required: true })),
        (rCode = h('select', { class: 'input', style: 'width:auto' }, h('option', { value: 301 }, 'Permanent (301)'), h('option', { value: 302 }, 'Temporary (302)'))),
        h('button', { class: 'btn primary' }, 'Add'),
      ),
    ),
  );
  return el;
}

/* ---- deploys: history + snapshots */

async function siteDeploys(site) {
  const el = await siteGithub(site);
  const [{ history }, { snapshots, keep }, { rescued }] = await Promise.all([api('GET', `/api/sites/${site.name}/history`), api('GET', `/api/sites/${site.name}/snapshots`), api('GET', `/api/sites/${site.name}/rescued`)]);
  const snapIds = new Set(snapshots.map((s) => s.id));

  const restoreSnap = async (id, btn) => {
    const ok = await confirmSheet({
      title: 'Roll back to this snapshot?',
      text: 'The website files go back to how they were then, and packages are reinstalled. Locked files and the data folder keep their current content. A snapshot of right now is taken first, so you can undo this.' + (site.git?.autoUpdate ? ' Automatic updates will be paused.' : ''),
      ok: 'Roll Back',
    });
    if (!ok) return;
    await busy(btn, async () => {
      const r = await api('POST', `/api/sites/${site.name}/snapshots/${id}/restore`);
      toast(`Rolled back ✓ — reinstalling and restarting…${r.autoUpdatePaused ? ' Automatic updates paused.' : ''}`);
      render();
    });
  };

  const showLog = async (id) => {
    try {
      const { log } = await api('GET', `/api/sites/${site.name}/history/${id}/log`);
      sheet((close) => h('div', {}, h('h2', { style: 'margin-bottom:12px' }, 'Deploy log'), h('div', { class: 'terminal' }, log || 'No output.'), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', onclick: () => copy(log, 'Log copied') }, icon('copy'), 'Copy'), h('button', { class: 'btn primary', onclick: close }, 'Close'))), { wide: true });
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const historyList = h(
    'div',
    { class: 'list' },
    !history.length && h('div', { class: 'item' }, h('div', { class: 'muted small' }, 'No deploys yet.')),
    history.slice(0, 20).map((e) => {
      const title = e.commit ? h('span', {}, h('code', { class: 'muted' }, e.commit.hash), ' ', e.commit.subject) : e.kind === 'build' ? 'Install & rebuild' : 'Deploy';
      return h(
        'div',
        { class: 'item' },
        h('span', { class: `pill ${e.ok ? 'good' : 'bad'}` }, h('span', { class: 'dot' }), e.ok ? 'OK' : 'Failed'),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label ellipsis' }, title), h('div', { class: 'small muted ellipsis' }, `${fmtAgo(e.at)} · ${e.by === 'you' ? 'by you' : e.by} · ${e.reason} · ${Math.max(1, Math.round((e.durationMs || 0) / 1000))} s${e.ok ? '' : ` · ${e.error || ''}`}`)),
        h('button', { class: 'btn sm', onclick: () => showLog(e.id) }, 'Log'),
        e.snapshot && snapIds.has(e.snapshot) && h('button', { class: 'btn sm', title: 'Put the files back as they were just before this deploy', onclick: (ev) => restoreSnap(e.snapshot, ev.currentTarget) }, 'Undo'),
        site.git &&
          e.ok &&
          e.commit &&
          h(
            'button',
            {
              class: 'btn sm',
              title: 'Deploy exactly this commit again',
              onclick: async (ev) => {
                const btn = ev.currentTarget;
                if (!(await confirmSheet({ title: `Deploy ${e.commit.hash} again?`, text: `“${e.commit.subject}” will be downloaded and deployed. Automatic updates will be paused so this version stays until you turn them back on.`, ok: 'Deploy This Version' }))) return;
                await busy(btn, async () => {
                  await api('POST', `/api/sites/${site.name}/deploy`, { ref: e.commit.hash });
                  toast(`Deploying ${e.commit.hash}…`);
                  render();
                });
              },
            },
            'Redeploy',
          ),
      );
    }),
  );

  let snapBtn;
  const snapList = h(
    'div',
    { class: 'list' },
    !snapshots.length && h('div', { class: 'item' }, h('div', { class: 'muted small' }, 'No snapshots yet. One is taken automatically before every GitHub deploy.')),
    snapshots.map((s) =>
      h(
        'div',
        { class: 'item' },
        h('span', { style: 'display:flex;color:var(--accent)' }, icon('box')),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label' }, new Date(s.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })), h('div', { class: 'small muted ellipsis' }, `${s.reason}${s.commit ? ` · ${s.commit.hash} ${s.commit.subject}` : ''} · ${fmtBytes(s.size)}`)),
        h('button', { class: 'btn sm', onclick: (ev) => restoreSnap(s.id, ev.currentTarget) }, 'Roll Back'),
        h('button', { class: 'btn icon ghost', title: 'Delete snapshot', style: 'color:var(--bad)', onclick: async () => (await confirmSheet({ title: 'Delete this snapshot?', text: "You won't be able to roll back to it.", ok: 'Delete', danger: true })) && (await api('DELETE', `/api/sites/${site.name}/snapshots/${s.id}`), render()) }, icon('trash')),
      ),
    ),
  );

  el.append(
    h('div', { class: 'section', style: 'margin-top:12px' }, h('div', { class: 'section-head' }, h('h2', {}, 'Deploy history'), h('span', { class: 'small muted' }, history.length ? `Last ${Math.min(20, history.length)} of ${history.length}` : '')), historyList),
    h(
      'div',
      { class: 'section', style: 'margin-top:12px' },
      h('div', { class: 'section-head' }, h('div', {}, h('h2', {}, 'Snapshots'), h('p', { class: 'muted small' }, `Copies of the website folder for rolling back. Taken before every GitHub deploy; the newest ${keep} are kept.`)), (snapBtn = h('button', { class: 'btn sm', onclick: () => busy(snapBtn, async () => (await api('POST', `/api/sites/${site.name}/snapshots`), toast('Snapshot saved ✓'), render())) }, icon('box'), 'Take Snapshot Now'))),
      snapList,
    ),
    (site.git || rescued.length > 0) && rescuedSection(site, rescued),
  );
  return el;
}

/** Copies of files saved before a GitHub update kept or replaced them. */
function rescuedSection(site, rescued) {
  const base = `/api/sites/${site.name}/rescued`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  let allBtn;
  const removeAll = async () => {
    const ok = await confirmSheet({ title: 'Delete all saved copies?', text: `${rescued.length === 1 ? '1 saved copy' : `${rescued.length} saved copies`} of website files will be deleted. This can't be undone. Your website's current files are not affected.`, ok: 'Delete All', danger: true });
    if (!ok) return;
    await busy(allBtn, async () => {
      await api('DELETE', base);
      toast('Saved copies deleted ✓');
      render();
    });
  };
  const removeOne = async (r, btn) => {
    const ok = await confirmSheet({ title: 'Delete this saved copy?', text: `${r.files.map((f) => f.path).join(', ')} — this copy will be deleted and can't be brought back. Your website's current files are not affected.`, ok: 'Delete', danger: true });
    if (!ok) return;
    await busy(btn, async () => {
      await api('DELETE', `${base}/${r.id}`);
      toast('Saved copy deleted ✓');
      render();
    });
  };
  const total = rescued.reduce((n, r) => n + r.size, 0);

  const list = h(
    'div',
    { class: 'list' },
    !rescued.length && h('div', { class: 'item' }, h('div', { class: 'muted small' }, 'Nothing saved yet. When an update keeps or replaces files your website changed, a copy of them appears here.')),
    rescued.map((r) => {
      let delBtn;
      return h(
        'div',
        { class: 'item', style: 'flex-wrap:wrap' },
        h('span', { style: 'display:flex;color:var(--accent)' }, icon(r.kind === 'kept' ? 'lock' : 'download')),
        h(
          'div',
          { class: 'grow', style: 'min-width:0' },
          h('div', { class: 'label' }, new Date(r.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })),
          h('div', { class: 'small muted ellipsis' }, `${r.kind === 'kept' ? 'Server versions kept' : 'Replaced with the GitHub versions'} · ${plural(r.files.length, 'file')} · ${fmtBytes(r.size)}`),
        ),
        (delBtn = h('button', { class: 'btn icon ghost', title: 'Delete saved copy', style: 'color:var(--bad)', onclick: () => removeOne(r, delBtn) }, icon('trash'))),
        r.files.length > 0 &&
          h(
            'details',
            { class: 'more', style: 'flex-basis:100%' },
            h('summary', {}, 'Show files'),
            h(
              'div',
              { class: 'list', style: 'box-shadow:none;margin-top:8px' },
              r.files.map((f) =>
                h(
                  'div',
                  { class: 'item' },
                  h('code', { class: 'grow ellipsis' }, f.path),
                  h('span', { class: 'small muted' }, fmtBytes(f.size)),
                  h('a', { class: 'btn icon ghost', title: 'Download', href: `${base}/${encodeURIComponent(r.id)}/file?path=${encodeURIComponent(f.path)}` }, icon('download')),
                ),
              ),
            ),
          ),
      );
    }),
  );

  return h(
    'div',
    { class: 'section', style: 'margin-top:12px' },
    h(
      'div',
      { class: 'section-head' },
      h('div', {}, h('h2', {}, 'Rescued files'), h('p', { class: 'muted small' }, `Copies saved before an update kept or replaced files your website changed. The newest 20 are kept${rescued.length ? ` · ${fmtBytes(total)} in total` : ''}.`)),
      rescued.length > 0 && (allBtn = h('button', { class: 'btn sm danger', onclick: removeAll }, icon('trash'), 'Delete All')),
    ),
    list,
  );
}

/* ---- scheduled tasks */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function describeCron(expr) {
  const e = String(expr).trim();
  const presets = { '@hourly': 'Every hour', '@daily': 'Every day at 00:00', '@midnight': 'Every day at 00:00', '@weekly': 'Every Sunday at 00:00', '@monthly': 'On the 1st of every month at 00:00' };
  if (presets[e]) return presets[e];
  const [mi, hr, dom, mon, dow] = e.split(/\s+/);
  const at = /^\d+$/.test(mi) && /^\d+$/.test(hr) ? `${hr.padStart(2, '0')}:${mi.padStart(2, '0')}` : null;
  if (/^\*\/\d+$/.test(mi) && hr === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${mi.slice(2)} minutes`;
  if (/^\d+$/.test(mi) && hr === '*' && dom === '*' && mon === '*' && dow === '*') return mi === '0' ? 'Every hour' : `Every hour at :${mi.padStart(2, '0')}`;
  if (at && dom === '*' && mon === '*' && dow === '*') return `Every day at ${at}`;
  if (at && dom === '*' && mon === '*' && /^[0-7]$/.test(dow)) return `Every ${WEEKDAYS[Number(dow) % 7]} at ${at}`;
  if (at && dom === '*' && mon === '*' && dow === '1-5') return `Weekdays at ${at}`;
  if (at && /^\d+$/.test(dom) && mon === '*' && dow === '*') return `Monthly on day ${dom} at ${at}`;
  return e;
}

function taskSheet(site, task, onSaved) {
  const PRESETS = [
    ['*/15 * * * *', 'Every 15 minutes'],
    ['0 * * * *', 'Every hour'],
    ['0 3 * * *', 'Every day at 03:00'],
    ['0 9 * * 1', 'Every Monday at 09:00'],
    ['0 4 1 * *', 'Monthly, 1st at 04:00'],
    ['custom', 'Custom…'],
  ];
  sheet((close) => {
    let name, command, preset, custom, timeout;
    const preview = h('div', { class: 'small muted' });
    const current = task?.schedule || '0 3 * * *';
    const isPreset = PRESETS.some(([v]) => v === current);
    const schedule = () => (preset.value === 'custom' ? custom.value.trim() : preset.value);
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const r = await api('POST', '/api/cron/preview', { schedule: schedule() });
          preview.textContent = r.next.length ? `${describeCron(schedule())} · next: ${r.next.map((d) => new Date(d).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })).join(', ')}` : 'This schedule never runs.';
          preview.style.color = '';
        } catch (err) {
          preview.textContent = err.message;
          preview.style.color = 'var(--bad)';
        }
      }, 250);
    };
    const submit = async (e) => {
      e.preventDefault();
      await busy(e.target.querySelector('.primary'), async () => {
        const body = { name: name.value, command: command.value, schedule: schedule(), timeoutMin: Number(timeout.value) };
        if (task) await api('PATCH', `/api/sites/${site.name}/tasks/${task.id}`, body);
        else await api('POST', `/api/sites/${site.name}/tasks`, body);
        toast(task ? 'Task saved ✓' : 'Task created ✓');
        close();
        onSaved();
      });
    };
    const el = h(
      'form',
      { onsubmit: submit },
      h('h2', {}, task ? 'Edit Task' : 'New Task'),
      h('p', { class: 'muted' }, 'Runs a command in the website folder on a schedule, with the same environment as the website (DATA_DIR, variables).'),
      h(
        'div',
        { class: 'form', style: 'margin-top:16px' },
        h('label', { class: 'field' }, 'Name', (name = h('input', { class: 'input', value: task?.name || '', placeholder: 'Clean old sessions', required: true }))),
        h('label', { class: 'field' }, 'Command', (command = h('input', { class: 'input mono', value: task?.command || '', placeholder: 'npm run cleanup', required: true }))),
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, 'When', (preset = h('select', { class: 'input', onchange: () => (custom.parentElement.classList.toggle('hidden', preset.value !== 'custom'), refresh()) }, PRESETS.map(([v, l]) => h('option', { value: v, selected: isPreset ? v === current : v === 'custom' }, l))))),
          h('label', { class: 'field' }, 'Stop after', (timeout = h('select', { class: 'input' }, [5, 15, 30, 60, 120, 240].map((m) => h('option', { value: m, selected: m === (task?.timeoutMin || 30) }, m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`))))),
        ),
        h('label', { class: `field ${isPreset ? 'hidden' : ''}` }, h('span', {}, 'Schedule ', h('span', { class: 'hint' }, 'minute hour day month weekday — e.g. 30 2 * * 1-5 = weekdays at 02:30')), (custom = h('input', { class: 'input mono', value: isPreset ? '' : current, placeholder: '0 3 * * *', oninput: refresh }))),
        preview,
      ),
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, task ? 'Save' : 'Create Task')),
    );
    refresh();
    return el;
  });
}

async function siteTasks(site) {
  const wrap = h('div', { class: 'stack', style: 'gap:16px' });
  const listBox = h('div', { class: 'list' });
  const paint = async () => {
    const { tasks } = await api('GET', `/api/sites/${site.name}/tasks`);
    clear(listBox);
    if (!tasks.length)
      listBox.append(h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'No tasks yet'), h('div', { class: 'small muted' }, 'Examples: clear a cache every night, send a weekly report, back up a database to DATA_DIR.'))));
    for (const t of tasks) {
      const last = t.lastRun;
      listBox.append(
        h(
          'div',
          { class: 'item', style: 'flex-wrap:wrap' },
          h('span', { style: 'display:flex;color:var(--accent)' }, icon('calendar')),
          h(
            'div',
            { class: 'grow', style: 'min-width:200px' },
            h('div', { class: 'label' }, t.name, t.running && h('span', { class: 'pill info', style: 'margin-left:8px' }, h('span', { class: 'spin', style: 'width:10px;height:10px' }), 'Running')),
            h('div', { class: 'small muted' }, h('code', {}, t.command)),
            h('div', { class: 'small muted' }, t.enabled ? `${describeCron(t.schedule)} · next ${t.next ? new Date(t.next).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}` : 'Paused', last && ` · last run ${fmtAgo(last.at)} `, last && h('span', { class: `pill ${last.ok ? 'good' : 'bad'}` }, last.ok ? 'OK' : 'Failed')),
          ),
          toggle(t.enabled, async (v, input) => {
            try {
              await api('PATCH', `/api/sites/${site.name}/tasks/${t.id}`, { enabled: v });
              toast(v ? 'Task on' : 'Task paused');
              paint();
            } catch (err) {
              input.checked = !v;
              toast(err.message, 'bad');
            }
          }, 'Enabled'),
          h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', `/api/sites/${site.name}/tasks/${t.id}/run`), toast('Started ✓'), setTimeout(paint, 800))) }, icon('play'), 'Run Now'),
          h(
            'button',
            {
              class: 'btn sm',
              onclick: async () => {
                const term = h('div', { class: 'terminal' }, 'Loading…');
                let alive = true;
                const tick = async () => {
                  if (!alive) return;
                  try {
                    const r = await api('GET', `/api/sites/${site.name}/tasks/${t.id}/log`);
                    term.textContent = r.output || 'No output yet.';
                    term.scrollTop = term.scrollHeight;
                    if (r.running) setTimeout(tick, 1000);
                  } catch {}
                };
                sheet((close) => h('div', {}, h('h2', { style: 'margin-bottom:12px' }, `${t.name} — last output`), term, h('div', { class: 'sheet-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Close'))), { wide: true, onClose: () => (alive = false) });
                tick();
              },
            },
            'Output',
          ),
          h('button', { class: 'btn icon ghost', title: 'Edit', onclick: () => taskSheet(site, t, paint) }, icon('edit')),
          h('button', { class: 'btn icon ghost', title: 'Delete', style: 'color:var(--bad)', onclick: async () => (await confirmSheet({ title: `Delete “${t.name}”?`, text: 'The task and its history are removed.', ok: 'Delete', danger: true })) && (await api('DELETE', `/api/sites/${site.name}/tasks/${t.id}`), paint()) }, icon('trash')),
        ),
      );
    }
  };
  await paint();
  append(wrap, [h('div', { class: 'row between wrap' }, h('p', { class: 'muted' }, 'Run commands on a schedule, like cron. Output and results are kept for each run.'), h('button', { class: 'btn primary', onclick: () => taskSheet(site, null, paint) }, icon('plus'), 'New Task')), listBox]);
  return wrap;
}

/* ---- activity */

const PAGE = 150;

async function activityView() {
  const first = await api('GET', `/api/activity?limit=${PAGE}`);
  let entries = first.entries;
  let hasMore = entries.length === PAGE;
  let loading = false;
  let onlyProblems = false;
  const listBox = h('div', { class: 'stack', style: 'gap:18px' });
  const more = h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, loadOlder) }, 'Show Older');
  const footer = h('div', { class: 'center small muted', style: 'padding:14px 0 4px' });
  const scroller = h('div', { class: 'activity-scroll', onscroll: () => hasMore && !loading && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 300 && loadOlder().catch(() => {}) }, listBox, footer);

  async function loadOlder() {
    if (loading || !entries.length) return;
    loading = true;
    try {
      const older = (await api('GET', `/api/activity?limit=${PAGE}&before=${encodeURIComponent(entries.at(-1).at)}`)).entries;
      entries = entries.concat(older);
      hasMore = older.length === PAGE;
      paint();
    } finally {
      loading = false;
    }
  }

  const row = (e) =>
    h(
      'div',
      { class: 'item' },
      h('span', { class: `pill ${e.ok ? '' : 'bad'}`, style: 'min-width:54px;justify-content:center' }, new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label ellipsis' }, e.action, e.site && h('a', { class: 'muted', href: `#/sites/${e.site}`, style: 'font-weight:400' }, ` · ${e.site}`)), e.detail && h('div', { class: 'small muted ellipsis', title: e.detail }, e.detail)),
      h('span', { class: 'small muted', style: 'white-space:nowrap' }, e.by === 'you' ? `you${e.ip ? ` · ${e.ip}` : ''}` : e.by === 'someone' ? `someone · ${e.ip || '?'}` : e.by),
    );

  const paint = () => {
    clear(listBox);
    clear(footer).append(hasMore ? more : entries.length ? `That's everything from the last ${first.keepDays} days.` : '');
    const shown = onlyProblems ? entries.filter((e) => !e.ok) : entries;
    if (!shown.length) return listBox.append(h('div', { class: 'card empty' }, h('h2', {}, onlyProblems ? 'No problems' : 'Nothing yet'), h('p', {}, onlyProblems ? 'Nothing has failed recently.' : 'Changes, deploys, sign-ins and automatic actions show up here.')));
    const groups = new Map();
    for (const e of shown) {
      const k = new Date(e.at).toDateString();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    for (const [day, items] of groups) {
      const today = new Date().toDateString() === day;
      listBox.append(h('div', {}, h('div', { class: 'metric-label day-head' }, today ? 'Today' : new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })), h('div', { class: 'list' }, items.map(row))));
    }
  };
  paint();

  const seg = h(
    'div',
    { class: 'segmented' },
    [
      [false, 'Everything'],
      [true, 'Problems'],
    ].map(([v, label]) => h('button', { class: v === onlyProblems ? 'on' : '', onclick: (e) => ((onlyProblems = v), [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)), paint(), (scroller.scrollTop = 0)) }, label)),
  );
  return h(
    'div',
    { class: 'page activity' },
    pageHead('Activity', { sub: `Who did what, and when — including automatic updates, health-check restarts, backups and sign-ins. Kept for ${first.keepDays} days.`, actions: [seg, h('button', { class: 'btn sm', onclick: () => clearActivitySheet(first.keepDays) }, icon('trash'), 'Clear Older…')] }),
    scroller,
  );
}

/** Choose a date and remove every activity entry from before it. */
function clearActivitySheet(keepDays) {
  const startOf = (daysAgo) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d;
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const choices = [
    [7, 'Older than a week'],
    [1, 'Everything before yesterday'],
    [0, 'Everything before today'],
  ];
  sheet((close) => {
    const date = h('input', { class: 'input', type: 'date', value: iso(startOf(7)), min: iso(startOf(keepDays)), max: iso(new Date()), required: true });
    const run = (before, btn) =>
      busy(btn, async () => {
        const label = before.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
        if (!(await confirmSheet({ title: `Clear activity before ${label}?`, text: 'Those entries are removed for good. A note that you cleared them is kept.', ok: 'Clear', danger: true }))) return;
        const r = await api('POST', '/api/activity/prune', { before: before.toISOString() });
        close();
        toast(r.removed ? `Removed ${r.removed} entr${r.removed === 1 ? 'y' : 'ies'} ✓` : 'Nothing that old to remove');
        render();
      });
    return h(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault();
          const [y, m, d] = date.value.split('-').map(Number);
          if (y) run(new Date(y, m - 1, d), e.target.querySelector('.primary'));
        },
      },
      h('h2', {}, 'Clear older activity'),
      h('p', { class: 'muted', style: 'margin-top:6px' }, `Entries older than ${keepDays} days are removed automatically. You can clear more now.`),
      h('div', { class: 'list', style: 'margin:16px 0;box-shadow:none' }, choices.map(([days, label]) => h('div', { class: 'item' }, h('div', { class: 'grow label' }, label), h('button', { class: 'btn sm danger', type: 'button', onclick: (e) => run(startOf(days), e.currentTarget) }, 'Clear')))),
      h('label', { class: 'field' }, 'Or everything before a date', date),
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, 'Clear Before Date')),
    );
  });
}

/* =========================================================== router */

let renderToken = 0;
async function render() {
  const token = ++renderToken;
  state.onLive = null;
  state.cleanup.splice(0).forEach((fn) => fn());
  const app = document.getElementById('app');
  if (!state.session) {
    try {
      state.session = await (await fetch('/api/session')).json();
    } catch {
      clear(app).append(h('div', { class: 'auth' }, h('div', { class: 'box' }, h('img', { src: '/favicon.svg', alt: '' }), h('h1', {}, 'Can\'t reach AutoNode'), h('p', {}, 'Make sure the server is running, then reload.'), h('button', { class: 'btn primary lg', onclick: () => location.reload() }, 'Reload'))));
      return;
    }
  }
  if (!state.session.authenticated) {
    if (stream) stream.close(), (stream = null);
    clear(app).append(authScreen());
    return;
  }
  connectStream();
  const [, route = 'overview', a, b, c] = (location.hash || '#/overview').split('?')[0].split('/'); // "?…" = view options (e.g. ?area=data)
  let view;
  try {
    if (route === 'sites' && a) view = await siteView(decodeURIComponent(a), b, c);
    else view = await ({ overview: overviewView, sites: sitesView, domains: domainsView, network: networkView, activity: activityView, settings: settingsView }[route] || overviewView)(a);
  } catch (err) {
    if (err.message === 'Please sign in.') return;
    view = h('div', { class: 'page' }, h('div', { class: 'card empty' }, h('h2', {}, 'Something went wrong'), h('p', {}, err.message), h('a', { class: 'btn primary', href: '#/overview' }, 'Go to Overview')));
  }
  if (token !== renderToken) return;
  const navRoute = NAV.some(([id]) => id === route) ? route : 'overview';
  const existing = app.querySelector('.shell');
  if (existing) {
    // Keep the sidebar; swap the content (avoids flicker).
    existing.querySelectorAll('.nav a, .mobile-bar a').forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#/${navRoute}`));
    clear(existing.querySelector('.main')).append(view);
  } else clear(app).append(shell(navRoute, view));
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', render);
render();
