/* AutoNode web app — made by Akulav. No build step, no dependencies. */

/* =========================================================== helpers */

function h(tag, props, ...kids) {
  const el = tag === 'svg' || props?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'svg') continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = !!v;
    else if (k === 'ref') v(el);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
};

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  sites: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
  wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.4a10 10 0 0 1 14 0M8.5 15.9a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" stroke="none"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  github: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  zip: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M11 5h2M11 8h2M11 11h2M10 14h4v3h-4z"/>',
  dots: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = ICONS[name] || '';
  return s;
}

const fmtBytes = (n, d = 1) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) (n /= 1024), i++;
  return `${n.toFixed(i === 0 ? 0 : n < 10 ? d : 0)} ${u[i]}`;
};
const fmtPct = (n) => (n == null ? '—' : `${Math.round(n)}%`);
const fmtDur = (s) => {
  if (s == null) return '—';
  s = Math.floor(s);
  const d = Math.floor(s / 86400),
    hh = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${hh}h`;
  if (hh) return `${hh}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
};
const fmtAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const level = (pct) => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : '');

class ApiError extends Error {}
async function api(method, url, body, { raw } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (raw) opts.body = body;
    else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError("Can't reach AutoNode. Is the server running?");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/password')) {
    state.session.authenticated = false;
    render();
    throw new ApiError('Please sign in.');
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, kind === 'bad' ? 6000 : 3200);
}

/** Wrap an async button action with a spinner and error toast. */
async function busy(btn, fn) {
  const old = [...btn.childNodes];
  btn.disabled = true;
  clear(btn).append(h('span', { class: 'spin' }));
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false;
    clear(btn).append(...old);
  }
}

async function copy(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(`${what} ✓`);
}

function sheet(build, { wide = false, onClose } = {}) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    bd.remove();
    document.removeEventListener('keydown', esc);
    onClose?.();
  };
  const esc = (e) => e.key === 'Escape' && close();
  const box = h('div', { class: `sheet ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
  const bd = h('div', { class: 'backdrop', onmousedown: (e) => e.target === bd && close() }, box);
  append(box, [build(close)]);
  document.body.append(bd);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('input,textarea,select')?.focus(), 30);
  return close;
}

function confirmSheet({ title, text, ok = 'Continue', danger = false, typeToConfirm }) {
  return new Promise((resolve) => {
    let input;
    sheet(
      (close) => {
        const done = (v) => {
          resolve(v);
          close();
        };
        const okBtn = h('button', { class: `btn ${danger ? 'danger solid' : 'primary'}`, disabled: !!typeToConfirm, onclick: () => done(true) }, ok);
        return h(
          'div',
          {},
          h('h2', {}, title),
          h('p', { class: 'muted' }, text),
          typeToConfirm &&
            h(
              'label',
              { class: 'field', style: 'margin-top:16px' },
              h('span', {}, 'Type ', h('b', {}, typeToConfirm), ' to confirm'),
              (input = h('input', { class: 'input', autocomplete: 'off', oninput: () => (okBtn.disabled = input.value !== typeToConfirm) })),
            ),
          h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), okBtn),
        );
      },
      { onClose: () => resolve(false) },
    );
  });
}

function promptSheet({ title, text, label, value = '', placeholder = '', ok = 'Save' }) {
  return new Promise((resolve) => {
    sheet(
      (close) => {
        const input = h('input', { class: 'input', value, placeholder, autocomplete: 'off' });
        const done = (v) => {
          resolve(v);
          close();
        };
        return h(
          'form',
          { onsubmit: (e) => (e.preventDefault(), input.value.trim() && done(input.value.trim())) },
          h('h2', {}, title),
          text && h('p', { class: 'muted' }, text),
          h('label', { class: 'field', style: 'margin-top:16px' }, label, input),
          h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'Cancel'), h('button', { class: 'btn primary' }, ok)),
        );
      },
      { onClose: () => resolve(null) },
    );
  });
}

const toggle = (checked, onchange, label) =>
  h('label', { class: 'switch', title: label }, h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked, e.target) }), h('span'));

const copyable = (text, label = 'Copied') => h('div', { class: 'copyable' }, h('span', { title: text }, text), h('button', { class: 'btn sm', onclick: () => copy(text, label) }, icon('copy'), 'Copy'));

const codeBlock = (text) => h('div', { class: 'code' }, h('button', { class: 'btn sm copy', onclick: () => copy(text) }, icon('copy'), 'Copy'), text);

const notice = (kind, ...kids) => h('div', { class: `notice ${kind}` }, icon(kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'warn'), h('div', {}, ...kids));

const SITE_COLORS = [
  'linear-gradient(135deg,#3a8dff,#5e5ce6)',
  'linear-gradient(135deg,#ff9f0a,#ff375f)',
  'linear-gradient(135deg,#30d158,#0a9396)',
  'linear-gradient(135deg,#bf5af2,#5e5ce6)',
  'linear-gradient(135deg,#64d2ff,#0a84ff)',
  'linear-gradient(135deg,#ff6482,#bf5af2)',
  'linear-gradient(135deg,#ffd60a,#ff9f0a)',
  'linear-gradient(135deg,#8e8e93,#48484a)',
];
const siteColor = (name) => SITE_COLORS[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % SITE_COLORS.length];
const siteIcon = (s, size) => h('div', { class: 'site-icon', style: { background: siteColor(s.name), ...(size ? { width: size + 'px', height: size + 'px', borderRadius: size * 0.27 + 'px', fontSize: size * 0.42 + 'px' } : {}) } }, (s.title || s.name)[0]);

const STATE_LABEL = { running: ['Running', 'good running'], stopped: ['Stopped', ''], starting: ['Starting…', 'info'], crashed: ['Crashed', 'bad'] };
const statusPill = (st) => {
  const [label, cls] = STATE_LABEL[st?.state] || STATE_LABEL.stopped;
  return h('span', { class: `pill ${cls}` }, h('span', { class: 'dot' }), label);
};

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
  const set = (p) => {
    p = Math.max(0, Math.min(100, p || 0));
    bar.setAttribute('stroke-dashoffset', String(C * (1 - p / 100)));
    wrap.className = `ring ${level(p)}`;
    val.textContent = fmtPct(p);
    wrap.setAttribute('aria-label', `${Math.round(p)} percent`);
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
      state.session.authenticated = true;
      state.session.setUp = true;
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
      h('p', {}, setup ? 'Choose a password to protect your server.' : `Sign in to ${s.hostname}`),
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

const pageHead = (title, { eyebrow, sub, actions, back } = {}) =>
  h(
    'div',
    { class: 'page-head' },
    h('div', { class: 'grow' }, back && h('a', { class: 'back', href: back[0] }, icon('back'), back[1]), eyebrow && h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), sub && h('div', { class: 'sub' }, sub)),
    actions && h('div', { class: 'row wrap' }, actions),
  );

/* ========================================================= overview */

async function overviewView() {
  const o = await api('GET', '/api/overview');
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const cpuRing = ring(o.stats.cpu.percent);
  const memRing = ring((o.stats.memory.used / o.stats.memory.total) * 100);
  const cpuSpark = sparkline({ label: 'CPU usage over the last few minutes' });
  const memSpark = sparkline({ label: 'Memory usage over the last few minutes' });
  cpuSpark.set(o.history.map((p) => ({ t: p.t, v: p.cpu })));
  memSpark.set(o.history.map((p) => ({ t: p.t, v: p.mem })));
  const cpuSub = h('div', { class: 'metric-sub' });
  const memBig = h('div', { class: 'metric-big' });
  const memSub = h('div', { class: 'metric-sub' });
  const diskBig = h('div', { class: 'metric-big' });
  const diskSub = h('div', { class: 'metric-sub' });
  const diskBar = h('div', { class: 'bar-meter' }, h('i'));
  const sysKv = h('dl', { class: 'kv' });
  const sitesList = h('div', { class: 'list' });

  const paint = (st, siteList) => {
    cpuRing.set(st.cpu.percent);
    cpuSub.textContent = `${st.cpu.cores} cores · load ${st.cpu.load.map((l) => l.toFixed(2)).join(' ')}`;
    const memPct = (st.memory.used / st.memory.total) * 100;
    memRing.set(memPct);
    memBig.textContent = fmtBytes(st.memory.used);
    memSub.textContent = `of ${fmtBytes(st.memory.total)} · ${fmtBytes(st.memory.available)} available`;
    if (st.disk) {
      const used = (st.disk.used / st.disk.total) * 100;
      diskBig.textContent = `${fmtBytes(st.disk.free)} free`;
      diskSub.textContent = `${Math.round(used)}% used · ${fmtBytes(st.disk.used)} of ${fmtBytes(st.disk.total)}`;
      diskBar.className = `bar-meter ${level(used)}`;
      diskBar.firstChild.style.width = used.toFixed(1) + '%';
    }
    clear(sysKv).append(
      ...[
        ['Computer', st.hostname],
        ['Address', o.lanIp],
        ['Running for', fmtDur(st.uptime)],
        ['Processor', st.cpu.model],
        st.temperature != null && ['Temperature', `${Math.round(st.temperature)} °C`],
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
      { class: 'grid cols-3', style: 'margin-top:16px' },
      h('div', { class: 'card' }, h('div', { class: 'gauge-card' }, cpuRing.el, h('div', { class: 'grow' }, h('div', { class: 'metric-label' }, 'Processor'), h('div', { class: 'metric-big' }, 'CPU'), cpuSub)), cpuSpark.el),
      h('div', { class: 'card' }, h('div', { class: 'gauge-card' }, memRing.el, h('div', { class: 'grow' }, h('div', { class: 'metric-label' }, 'Memory'), memBig, memSub)), memSpark.el),
      h('div', { class: 'card' }, h('div', { class: 'metric-label' }, 'Storage'), h('div', { style: 'margin-top:14px' }, diskBig), diskSub, diskBar, h('div', { class: 'small muted', style: 'margin-top:14px' }, 'Free space updates in real time.')),
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
  ['domains', 'Domains'],
  ['github', 'GitHub & Updates'],
  ['settings', 'Settings'],
];

async function siteView(name, tab = 'overview') {
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
    clear(actions).append(
      site.hostnames[0] && h('a', { class: 'btn', href: `https://${site.hostnames[0]}`, target: '_blank', rel: 'noopener' }, icon('ext'), 'Visit'),
      h('a', { class: 'btn', href: site.lanUrl, target: '_blank', rel: 'noopener', title: 'Open on your local network' }, icon('ext'), 'Preview'),
      running ? h('button', { class: 'btn', onclick: act('stop', 'Stopped') }, icon('stop'), 'Stop') : h('button', { class: 'btn primary', onclick: act('start', 'Started ✓') }, icon('play'), 'Start'),
      running && h('button', { class: 'btn primary', onclick: act('restart', 'Restarted ✓') }, icon('restart'), 'Restart'),
    );
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
  const views = { overview: siteOverview, files: siteFiles, logs: siteLogs, domains: siteDomains, github: siteGithub, settings: siteSettings };
  const res = await (views[tab] || siteOverview)(site, (fn) => (tabLive = fn));
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
          ['Start command', h('code', {}, site.detectedCommand)],
          ['Port', site.port],
          ['Size on disk', fmtBytes(site.size)],
          ['Source', site.git ? h('span', { class: 'row' }, icon('github'), site.git.repo.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, ''), ' · ', site.git.branch) : 'Uploaded files'],
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
        h('span', { class: 'small muted' }, 'Installs packages, runs the build script and restarts.'),
      ),
    ),
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
  const api_ = (p) => `/api/sites/${site.name}${p}`;

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
    const parts = cwd.split('/').filter(Boolean);
    clear(crumbs).append(h('a', { href: '#', onclick: (e) => (e.preventDefault(), load('/')) }, site.name), ...parts.flatMap((p, i) => [h('span', {}, '›'), h('a', { href: '#', onclick: (e) => (e.preventDefault(), load(join(...parts.slice(0, i + 1)))) }, p)]));
    clear(table);
    if (cwd !== '/') table.append(h('tr', {}, h('td', { colspan: 4 }, h('div', { class: 'name', onclick: () => load(join(...parts.slice(0, -1))) }, icon('back'), h('span', { class: 'muted' }, 'Back')))));
    if (!entries.length)
      table.append(h('tr', {}, h('td', { colspan: 4 }, h('div', { class: 'empty' }, h('h3', {}, 'This folder is empty'), h('p', {}, 'Drag files or a whole project folder here, or use the Upload buttons.')))));
    for (const e of entries) {
      const p = join(cwd, e.name);
      const open = () => (e.type === 'dir' ? load(p) : openEditor(p));
      table.append(
        h(
          'tr',
          { class: e.heavy ? 'dim' : '' },
          h('td', {}, h('div', { class: 'name', onclick: open, title: e.name }, e.type === 'dir' ? h('span', { style: 'color:#5ac8fa;display:flex' }, icon('folder')) : h('span', { class: 'muted', style: 'display:flex' }, icon(e.name.endsWith('.zip') ? 'zip' : 'file')), h('span', {}, e.name))),
          h('td', { class: 'meta' }, e.type === 'dir' ? '—' : fmtBytes(e.size)),
          h('td', { class: 'meta opt' }, e.mtime ? fmtAgo(e.mtime) : ''),
          h(
            'td',
            { class: 'acts' },
            e.name.endsWith('.zip') && h('button', { class: 'btn sm', title: 'Extract here', onclick: () => doUnzip(p) }, 'Unzip'),
            e.type === 'file' && h('a', { class: 'btn icon ghost', title: 'Download', href: api_(`/file?download=1&path=${encodeURIComponent(p)}`) }, icon('download')),
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

  function uploadOne(path, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', api_(`/upload?path=${encodeURIComponent(path)}`));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText || '{}').error || `Upload failed (${xhr.status})`)));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });
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
    const update = () => (bar.style.width = ((([...loaded.values()].reduce((a, b) => a + b, 0)) / total) * 100).toFixed(1) + '%');
    let i = 0,
      failed = 0;
    const worker = async () => {
      while (i < items.length) {
        const [rel, file] = items[i++];
        try {
          await uploadOne(join(cwd, rel), file, (n) => (loaded.set(rel, n), update()));
          loaded.set(rel, file.size);
          update();
        } catch (err) {
          failed++;
          toast(`${rel}: ${err.message}`, 'bad');
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
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
  return h(
    'div',
    { class: 'stack', style: 'gap:14px' },
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
  const deployNow = async (e) =>
    busy(e.currentTarget, async () => {
      await api('POST', `/api/sites/${site.name}/deploy`);
      clear(updatesBox);
      watchDeploy(site.name, deployBox, () => render());
    });

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
      ld && h('div', { style: 'margin-top:16px' }, ld.ok ? notice('good', h('b', {}, 'Last deploy succeeded '), fmtAgo(ld.at), ld.commit ? ` · ${ld.commit.hash} “${ld.commit.subject}”` : '') : notice('bad', h('b', {}, 'Last deploy failed '), fmtAgo(ld.at), ' — ', ld.error || '')),
    ),
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

/* --------------------------------------------------------- settings */

function siteSettings(site) {
  let title, start, install, build, port;
  const envRows = h('div', { class: 'stack tight' });
  const addEnv = (k = '', v = '') => {
    const row = h('div', { class: 'env-row' }, h('input', { class: 'input', placeholder: 'NAME', value: k, autocapitalize: 'characters' }), h('input', { class: 'input', placeholder: 'value', value: v }), h('button', { class: 'btn icon ghost', type: 'button', style: 'color:var(--bad);align-self:center', onclick: () => row.remove(), title: 'Remove' }, icon('trash')));
    envRows.append(row);
  };
  Object.entries(site.env || {}).forEach(([k, v]) => addEnv(k, v));
  const save = async (e) => {
    e.preventDefault();
    const env = {};
    for (const row of envRows.children) {
      const [k, v] = row.querySelectorAll('input');
      if (k.value.trim()) env[k.value.trim()] = v.value;
    }
    await busy(e.target.querySelector('.primary'), async () => {
      await api('PATCH', `/api/sites/${site.name}`, { title: title.value, startCommand: start.value, installCommand: install.value, buildCommand: build.value, port: Number(port.value), env });
      const restart = await confirmSheet({ title: 'Saved ✓', text: 'Restart the website now so the changes take effect?', ok: 'Restart Now' });
      if (restart) {
        await api('POST', `/api/sites/${site.name}/restart`);
        toast('Restarted ✓');
      }
    });
  };
  return h(
    'div',
    { class: 'stack', style: 'gap:18px' },
    h(
      'form',
      { class: 'card pad-lg form', onsubmit: save },
      h('h2', {}, 'General'),
      h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Display name', (title = h('input', { class: 'input', value: site.title }))), h('label', { class: 'field' }, h('span', {}, 'Internal port ', h('span', { class: 'hint' }, '(given to your app as PORT)')), (port = h('input', { class: 'input', type: 'number', value: site.port, min: 1024, max: 65535 })))),
      h('h2', { style: 'margin-top:12px' }, 'Commands'),
      h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'Leave empty and AutoNode figures it out from package.json.'),
      h('label', { class: 'field' }, 'Start', (start = h('input', { class: 'input mono', value: site.startCommand, placeholder: site.detectedCommand }))),
      h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Install', (install = h('input', { class: 'input mono', value: site.installCommand, placeholder: 'npm ci' }))), h('label', { class: 'field' }, 'Build', (build = h('input', { class: 'input mono', value: site.buildCommand, placeholder: 'npm run build (if present)' })))),
      h('h2', { style: 'margin-top:12px' }, 'Environment variables'),
      h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'Secrets like API keys and database URLs. Available to your app as process.env.NAME.'),
      envRows,
      h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => addEnv() }, icon('plus'), 'Add Variable')),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn primary' }, 'Save Changes')),
    ),
    h(
      'div',
      { class: 'card pad-lg', style: 'border-color:var(--bad-soft)' },
      h('h2', {}, 'Delete website'),
      h('p', { class: 'muted', style: 'margin:6px 0 16px' }, 'Stops the website and permanently deletes all of its files. This cannot be undone.'),
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
    ),
  );
}

/* ========================================================== domains */

async function domainsView() {
  const [cf, certs] = await Promise.all([api('GET', '/api/cloudflare'), api('GET', '/api/certs')]);
  const zones = cf.zones || [];
  const zoneHasCert = (z) => certs.some((c) => c.names.includes(z.name) || c.names.includes(`*.${z.name}`));
  const routerUrl = cf.lanIp ? `http://${cf.lanIp.replace(/\.\d+$/, '.1')}` : null;

  const tokenInput = h('input', { class: 'input', type: 'password', placeholder: 'Paste your API token', autocomplete: 'off' });
  const connectForm = h(
    'form',
    {
      class: 'input-row',
      onsubmit: async (e) => {
        e.preventDefault();
        await busy(e.target.querySelector('button'), async () => {
          const r = await api('POST', '/api/cloudflare/connect', { token: tokenInput.value });
          toast(`Connected ✓ Found ${r.zones.length} domain${r.zones.length === 1 ? '' : 's'}: ${r.zones.join(', ')}`);
          render();
        });
      },
    },
    tokenInput,
    h('button', { class: 'btn primary' }, 'Connect'),
  );

  const certSheet = () =>
    sheet(
      (close) => {
        let cert, key;
        return h(
          'form',
          {
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
          h('h2', {}, 'Add Certificate'),
          h('p', { class: 'muted' }, 'Paste the two boxes Cloudflare shows after you create an Origin Certificate.'),
          h('div', { class: 'form', style: 'margin-top:16px' }, h('label', { class: 'field' }, 'Origin Certificate', (cert = h('textarea', { class: 'input', placeholder: '-----BEGIN CERTIFICATE-----', required: true }))), h('label', { class: 'field' }, 'Private Key', (key = h('textarea', { class: 'input', placeholder: '-----BEGIN PRIVATE KEY-----', required: true })))),
          h('div', { class: 'sheet-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary' }, 'Install Certificate')),
        );
      },
      { wide: false },
    );

  const autoCert = (z) => async (e) =>
    busy(e.currentTarget, async () => {
      const r = await api('POST', '/api/cloudflare/origin-cert', { domain: z.name });
      toast(`Certificate created for ${r.names.join(', ')} ✓${r.strict ? ' · SSL set to Full (strict)' : ''}`);
      render();
    });

  const portsOk = cf.proxy?.http && cf.proxy?.https;
  const doneCF = cf.connected;
  const doneCert = certs.length > 0;

  return h(
    'div',
    { class: 'page' },
    pageHead('Domains', { sub: 'Put your websites on the internet with your own domain, like akulav.com.' }),
    h(
      'div',
      { class: 'grid cols-3' },
      h('div', { class: 'card' }, h('div', { class: 'metric-label' }, 'Your internet address'), h('div', { class: 'metric-big', style: 'margin-top:8px;font-size:24px' }, cf.publicIp || 'Unknown'), h('div', { class: 'metric-sub' }, 'Where visitors reach you (public IP)')),
      h('div', { class: 'card' }, h('div', { class: 'metric-label' }, 'This computer at home'), h('div', { class: 'metric-big', style: 'margin-top:8px;font-size:24px' }, cf.lanIp), h('div', { class: 'metric-sub' }, h('a', { href: '#/network' }, 'Make this address permanent →'))),
      h('div', { class: 'card' }, h('div', { class: 'metric-label' }, 'Web traffic'), h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { class: `pill ${cf.proxy?.http ? 'good' : 'bad'}` }, `HTTP ${cf.proxy?.http || 'off'}`), h('span', { class: `pill ${cf.proxy?.https ? 'good' : 'bad'}` }, `HTTPS ${cf.proxy?.https || 'off'}`)), h('div', { class: 'metric-sub', style: 'margin-top:8px' }, portsOk ? 'Ready to receive visitors' : cf.proxy?.httpError || cf.proxy?.httpsError)),
    ),

    h(
      'div',
      { class: 'section' },
      h('h2', {}, 'Set up your domain'),
      h('p', { class: 'muted', style: 'margin:4px 0 22px' }, 'Follow these steps once. It takes about 5 minutes.'),
      h(
        'div',
        { class: 'card pad-lg' },
        h(
          'div',
          { class: 'steps' },
          h(
            'div',
            { class: `step ${zones.length ? 'done' : ''}` },
            h('h3', {}, 'Have your domain on Cloudflare'),
            h('p', {}, 'Bought it on ', h('b', {}, 'Cloudflare Registrar'), '? It\'s already set up — nothing to do here. Have several domains? They can all live on this computer; each one shows up below.'),
            h(
              'details',
              { class: 'more' },
              h('summary', {}, 'Bought it somewhere else (GoDaddy, Namecheap…)?'),
              h(
                'div',
                {},
                h(
                  'ol',
                  {},
                  h('li', {}, 'Go to ', h('a', { href: 'https://dash.cloudflare.com', target: '_blank', rel: 'noopener' }, 'dash.cloudflare.com'), ' → ', h('b', {}, 'Add a domain'), ', type your domain, choose the ', h('b', {}, 'Free'), ' plan.'),
                  h('li', {}, 'Cloudflare shows two ', h('b', {}, 'nameservers'), '. At your registrar, replace the existing nameservers with those two.'),
                  h('li', {}, 'Wait until Cloudflare emails you that the domain is active (minutes to a few hours).'),
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: `step ${doneCF ? 'done' : ''}` },
            h('h3', {}, 'Connect your Cloudflare account'),
            doneCF
              ? h(
                  'div',
                  {},
                  h('p', {}, 'Connected. AutoNode creates DNS records for you and keeps them pointed at your home even if your internet address changes.'),
                  h(
                    'div',
                    { class: 'list', style: 'margin-top:12px' },
                    zones.map((z) => h('div', { class: 'item' }, h('div', { class: 'app-icon', style: { background: 'linear-gradient(135deg,#ff9f0a,#ff6a00)' } }, icon('cloud')), h('div', { class: 'grow' }, h('div', { class: 'label' }, z.name), h('div', { class: 'small muted' }, `${z.plan || ''} · ${z.status}`)), h('span', { class: `pill ${z.status === 'active' ? 'good' : 'warn'}` }, z.status === 'active' ? 'Active' : 'Pending'))),
                    cf.zonesError && h('div', { class: 'item' }, notice('bad', cf.zonesError)),
                    h(
                      'div',
                      { class: 'item' },
                      h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Keep DNS updated automatically'), h('div', { class: 'small muted' }, `Checks every 5 minutes · last update ${fmtAgo(cf.lastSync)}${cf.lastIp ? ` → ${cf.lastIp}` : ''}`)),
                      h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', '/api/cloudflare/sync'), toast('DNS updated ✓'), render())) }, 'Update Now'),
                      toggle(cf.ddns, async (v) => (await api('PATCH', '/api/cloudflare', { ddns: v }), toast(v ? 'Automatic DNS on' : 'Automatic DNS off')), 'Automatic DNS'),
                    ),
                  ),
                  cf.lastError && h('div', { style: 'margin-top:10px' }, notice('bad', h('b', {}, 'Last DNS update had problems: '), cf.lastError)),
                  h('button', { class: 'btn sm danger', style: 'margin-top:12px', onclick: async () => (await confirmSheet({ title: 'Disconnect Cloudflare?', text: 'Existing DNS records stay in Cloudflare, but AutoNode will stop updating them.', ok: 'Disconnect', danger: true })) && (await api('DELETE', '/api/cloudflare'), render()) }, 'Disconnect'),
                )
              : h(
                  'div',
                  {},
                  h('p', {}, 'This lets AutoNode create DNS records and HTTPS certificates for you. Create an ', h('b', {}, 'API token'), ':'),
                  h(
                    'ol',
                    {},
                    h('li', {}, 'Open ', h('a', { href: 'https://dash.cloudflare.com/profile/api-tokens', target: '_blank', rel: 'noopener' }, 'dash.cloudflare.com/profile/api-tokens'), ' and click ', h('b', {}, 'Create Token'), '.'),
                    h('li', {}, 'Next to ', h('b', {}, 'Edit zone DNS'), ' click ', h('b', {}, 'Use template'), '.'),
                    h('li', {}, 'Under ', h('b', {}, 'Permissions'), ' click ', h('b', {}, '+ Add more'), ' and add:', h('ul', {}, h('li', {}, h('b', {}, 'Zone → SSL and Certificates → Edit')), h('li', {}, h('b', {}, 'Zone → Zone Settings → Edit')), h('li', {}, h('b', {}, 'Zone → Zone → Read')))),
                    h('li', {}, 'Under ', h('b', {}, 'Zone Resources'), ' choose ', h('b', {}, 'Include → All zones'), ' (or just akulav.com).'),
                    h('li', {}, 'Click ', h('b', {}, 'Continue to summary'), ' → ', h('b', {}, 'Create Token'), ', then copy it and paste below.'),
                  ),
                  h('div', { style: 'margin-top:14px' }, connectForm),
                  h('p', { class: 'small muted', style: 'margin-top:8px' }, 'The token is stored only on this computer.'),
                ),
          ),
          h(
            'div',
            { class: 'step' },
            h('h3', {}, 'Let visitors reach this computer'),
            h('p', {}, 'Your router needs to send website traffic to this computer. Choose one option:'),
            h(
              'div',
              { class: 'grid cols-2' },
              h(
                'div',
                { class: 'card' },
                h('span', { class: 'pill info' }, 'Most common'),
                h('h3', { style: 'margin:10px 0 6px' }, 'Port forwarding'),
                h(
                  'ol',
                  { class: 'small' },
                  h('li', {}, 'Open your router\'s settings', routerUrl ? [' (usually ', h('a', { href: routerUrl, target: '_blank', rel: 'noopener' }, routerUrl), ')'] : '', ' and sign in. The password is often on a sticker on the router.'),
                  h('li', {}, 'Find ', h('b', {}, 'Port Forwarding'), ' (sometimes called Virtual Server, NAT or Gaming).'),
                  h('li', {}, 'Add two rules to ', h('b', {}, cf.lanIp), ': TCP port ', h('b', {}, '80 → 80'), ' and TCP port ', h('b', {}, '443 → 443'), '.'),
                  h('li', {}, 'Give this computer a ', h('a', { href: '#/network' }, 'fixed address'), ' so the rules keep working.'),
                ),
              ),
              h(
                'div',
                { class: 'card' },
                h('span', { class: 'pill' }, 'No router access'),
                h('h3', { style: 'margin:10px 0 6px' }, 'Cloudflare Tunnel'),
                h(
                  'ol',
                  { class: 'small' },
                  h('li', {}, 'Open ', h('a', { href: 'https://one.dash.cloudflare.com', target: '_blank', rel: 'noopener' }, 'Cloudflare Zero Trust'), ' → ', h('b', {}, 'Networks → Tunnels → Create a tunnel'), ' → Cloudflared.'),
                  h('li', {}, 'Choose ', h('b', {}, 'Debian'), ' and run the install command it shows on this computer.'),
                  h('li', {}, 'Add a ', h('b', {}, 'Public hostname'), ' for each domain: Service ', h('b', {}, 'HTTP'), ', URL ', h('b', {}, 'localhost:80'), '.'),
                  h('li', {}, 'Turn off “Keep DNS updated automatically” above — the tunnel manages DNS.'),
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: `step ${doneCert ? 'done' : ''}` },
            h('h3', {}, 'Turn on HTTPS (the padlock)'),
            h('p', {}, 'A free Cloudflare ', h('b', {}, 'Origin Certificate'), ' encrypts traffic between Cloudflare and this computer. It lasts 15 years.'),
            doneCF && zones.length
              ? h(
                  'div',
                  { class: 'list', style: 'margin-top:12px' },
                  zones.map((z) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, z.name), h('div', { class: 'small muted' }, `Covers ${z.name} and *.${z.name}`)), zoneHasCert(z) ? h('span', { class: 'pill good' }, icon('lock'), 'Installed') : h('button', { class: 'btn primary sm', onclick: autoCert(z) }, 'Create Automatically'))),
                )
              : null,
            h(
              'details',
              { class: 'more', open: !doneCF },
              h('summary', {}, doneCF ? 'Or paste a certificate by hand' : 'Create and paste a certificate'),
              h(
                'div',
                {},
                h(
                  'ol',
                  {},
                  h('li', {}, 'In ', h('a', { href: 'https://dash.cloudflare.com', target: '_blank', rel: 'noopener' }, 'Cloudflare'), ', open your domain → ', h('b', {}, 'SSL/TLS'), ' → ', h('b', {}, 'Origin Server'), ' → ', h('b', {}, 'Create Certificate'), '.'),
                  h('li', {}, 'Keep ', h('b', {}, 'Generate private key and CSR with Cloudflare'), ', key type ', h('b', {}, 'RSA (2048)'), '.'),
                  h('li', {}, 'Hostnames should list ', h('b', {}, '*.akulav.com'), ' and ', h('b', {}, 'akulav.com'), ' (your domain). Validity ', h('b', {}, '15 years'), '. Click ', h('b', {}, 'Create'), '.'),
                  h('li', {}, 'Copy the ', h('b', {}, 'Origin Certificate'), ' and ', h('b', {}, 'Private Key'), ' into AutoNode. The key is shown only once.'),
                ),
                h('button', { class: 'btn primary', style: 'margin-top:12px', onclick: certSheet }, icon('lock'), 'Paste Certificate'),
              ),
            ),
          ),
          h(
            'div',
            { class: 'step' },
            h('h3', {}, 'Set encryption to Full (strict)'),
            h('p', {}, 'In Cloudflare: your domain → ', h('b', {}, 'SSL/TLS'), ' → ', h('b', {}, 'Overview'), ' → ', h('b', {}, 'Configure'), ' → choose ', h('b', {}, 'Full (strict)'), '. This prevents redirect loops and keeps things secure.'),
            doneCF && zones.length > 0 && h('div', { class: 'row wrap', style: 'margin-top:10px' }, zones.map((z) => h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', '/api/cloudflare/strict', { domain: z.name }), toast(`${z.name} set to Full (strict) ✓`))) }, `Set for ${z.name}`))),
          ),
          h('div', { class: 'step' }, h('h3', {}, 'Connect a domain to a website'), h('p', {}, 'Open a website → ', h('b', {}, 'Domains'), ' and add akulav.com or a subdomain like blog.akulav.com. That\'s it — your site is live.'), h('a', { class: 'btn sm', href: '#/sites', style: 'margin-top:10px' }, 'Go to Websites')),
        ),
      ),
    ),

    h(
      'div',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Certificates'), h('button', { class: 'btn sm', onclick: certSheet }, icon('plus'), 'Add')),
      h(
        'div',
        { class: 'list' },
        !certs.length && h('div', { class: 'item' }, h('div', { class: 'muted' }, 'No certificates yet.')),
        certs.map((c) =>
          h(
            'div',
            { class: 'item' },
            h('div', { class: 'app-icon', style: { background: c.expired ? '#ff3b30' : '#34c759' } }, icon('lock')),
            h('div', { class: 'grow' }, h('div', { class: 'label ellipsis' }, c.names.join(', ')), h('div', { class: 'small muted' }, `${c.issuer} · ${c.expired ? 'expired' : 'valid until'} ${new Date(c.validTo).toLocaleDateString()}`)),
            h('button', { class: 'btn sm danger', onclick: async () => (await confirmSheet({ title: 'Remove certificate?', text: `HTTPS will stop working for ${c.names.join(', ')} until you add another.`, ok: 'Remove', danger: true })) && (await api('DELETE', `/api/certs/${c.id}`), render()) }, 'Remove'),
          ),
        ),
      ),
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

/* ========================================================= settings */

async function settingsView() {
  const s = await api('GET', '/api/settings');
  const updBox = h('div');
  const check = async (e) =>
    busy(e.currentTarget, async () => {
      const r = await api('GET', '/api/update');
      clear(updBox);
      if (!r.gitInstall) return updBox.append(notice('warn', 'This copy of AutoNode wasn\'t installed with git, so it can\'t update itself. Re-run the installer to get the latest version.'));
      if (r.upToDate) return updBox.append(notice('good', h('b', {}, 'AutoNode is up to date. '), `Version ${r.version}.`));
      updBox.append(
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'row between wrap', style: 'margin-bottom:10px' }, h('div', {}, h('h3', {}, `Version ${r.latestVersion} is available`), h('p', { class: 'small muted' }, `${r.commits.length} change${r.commits.length === 1 ? '' : 's'} since your version.`)), h('button', { class: 'btn primary', onclick: install }, 'Update Now')),
          h('div', { class: 'list', style: 'box-shadow:none' }, r.commits.slice(0, 10).map((c) => h('div', { class: 'item' }, h('code', { class: 'muted' }, c.hash), h('div', { class: 'grow ellipsis' }, c.subject), h('span', { class: 'small muted' }, fmtAgo(c.date))))),
        ),
      );
    });
  const install = async (e) =>
    busy(e.currentTarget, async () => {
      await api('POST', '/api/update');
      sheet(() => h('div', { class: 'center' }, h('span', { class: 'spin', style: 'width:28px;height:28px;margin:8px auto 16px;display:block' }), h('h2', {}, 'Updating AutoNode…'), h('p', { class: 'muted' }, 'Your websites keep running. This page reloads by itself.')));
      const wait = async () => {
        try {
          const r = await fetch('/api/session');
          if (r.ok) return location.reload();
        } catch {}
        setTimeout(wait, 1500);
      };
      setTimeout(wait, 3000);
    });

  const importInput = h('input', { type: 'file', accept: '.json,.gz,.tar.gz,application/json,application/gzip', class: 'hidden', onchange: (e) => e.target.files[0] && importBackup(e.target.files[0]) });
  async function importBackup(file) {
    importInput.value = '';
    const wait = sheet(() => h('div', { class: 'center' }, h('span', { class: 'spin', style: 'width:28px;height:28px;margin:8px auto 16px;display:block' }), h('h2', {}, 'Reading backup…'), h('p', { class: 'muted' }, `${file.name} · ${fmtBytes(file.size)}`)));
    let up;
    try {
      up = await api('PUT', '/api/backup/upload', file, { raw: true });
    } catch (err) {
      wait();
      return toast(err.message, 'bad');
    }
    wait();
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
          { class: 'list', style: 'margin:16px 0;box-shadow:none' },
          sm.sites.length ? sm.sites.map((s) => h('div', { class: 'item' }, siteIcon(s, 32), h('div', { class: 'grow' }, h('div', { class: 'label' }, s.title || s.name), h('div', { class: 'small muted ellipsis' }, s.hostnames?.join(', ') || 'No domains')))) : h('div', { class: 'item muted' }, 'No websites in this backup.'),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Certificates'), h('div', { class: 'value' }, sm.certificates)),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Cloudflare connection'), h('div', { class: 'value' }, sm.cloudflare ? 'Included' : 'Not included')),
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

  let cur, next;
  return h(
    'div',
    { class: 'page' },
    pageHead('Settings'),
    h(
      'div',
      { class: 'stack', style: 'gap:28px' },
      h(
        'div',
        {},
        h('h2', { style: 'margin-bottom:12px' }, 'Software Update'),
        h(
          'div',
          { class: 'list' },
          h('div', { class: 'item' }, h('img', { src: '/favicon.svg', width: 44, height: 44, alt: '' }), h('div', { class: 'grow' }, h('div', { class: 'label' }, `AutoNode ${s.version}`), h('div', { class: 'small muted' }, `Last checked ${fmtAgo(s.lastCheck)}`)), h('button', { class: 'btn', onclick: check }, 'Check for Updates')),
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Install updates automatically'), h('div', { class: 'small muted' }, 'Checks once a day. Your websites keep running while AutoNode updates.')), toggle(s.selfUpdateAuto, async (v) => (await api('PATCH', '/api/settings', { selfUpdateAuto: v }), toast(v ? 'Automatic updates on' : 'Automatic updates off')), 'Automatic updates')),
        ),
        h('div', { style: 'margin-top:12px' }, updBox),
      ),
      h(
        'div',
        {},
        h('h2', { style: 'margin-bottom:12px' }, 'Web Server'),
        h(
          'div',
          { class: 'list' },
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Always use HTTPS'), h('div', { class: 'small muted' }, 'Send visitors to the secure version when a certificate exists.')), toggle(s.redirectHttps, async (v) => (await api('PATCH', '/api/settings', { redirectHttps: v }), toast('Saved ✓')), 'Always use HTTPS')),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Ports'), h('div', { class: 'value' }, `HTTP ${s.proxy.http || '✖'} · HTTPS ${s.proxy.https || '✖'} · Dashboard ${s.dashboardPort}`)),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Websites run with'), h('div', { class: 'value' }, s.runner === 'systemd' ? 'systemd (survive reboots)' : 'Built-in supervisor')),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Node.js'), h('div', { class: 'value' }, s.node)),
          h('div', { class: 'item' }, h('div', { class: 'label' }, 'Website files'), h('div', { class: 'value mono small ellipsis' }, s.paths.sitesDir)),
        ),
      ),
      h(
        'div',
        {},
        h('h2', { style: 'margin-bottom:4px' }, 'Backup & Restore'),
        h('p', { class: 'muted small', style: 'margin-bottom:12px' }, 'Move everything to a new computer, or keep a copy somewhere safe. Backups contain your keys and tokens — store them privately.'),
        h(
          'div',
          { class: 'list' },
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Settings only'), h('div', { class: 'small muted' }, 'Websites, domains, environment variables, certificates and Cloudflare — a small .json file.')), h('a', { class: 'btn', href: '/api/backup' }, icon('download'), 'Export')),
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Everything'), h('div', { class: 'small muted' }, 'Settings plus all website files, as a .tar.gz. Packages are reinstalled on restore.')), h('a', { class: 'btn', href: '/api/backup?files=1' }, icon('download'), 'Export')),
          h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Restore from a backup'), h('div', { class: 'small muted' }, 'Choose a .json or .tar.gz made by AutoNode. You can review it before anything changes.')), h('button', { class: 'btn primary', onclick: () => importInput.click() }, icon('upload'), 'Import…')),
        ),
        importInput,
      ),
      h(
        'div',
        {},
        h('h2', { style: 'margin-bottom:12px' }, 'Security'),
        h(
          'form',
          {
            class: 'card pad-lg form',
            onsubmit: async (e) => {
              e.preventDefault();
              await busy(e.target.querySelector('.primary'), async () => {
                await api('POST', '/api/password', { current: cur.value, next: next.value });
                cur.value = next.value = '';
                toast('Password changed ✓');
              });
            },
          },
          h('h3', {}, 'Change password'),
          h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Current password', (cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true }))), h('label', { class: 'field' }, 'New password', (next = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8, required: true })))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary' }, 'Change Password'), h('button', { class: 'btn right', type: 'button', onclick: async () => (await api('POST', '/api/logout'), location.reload()) }, icon('logout'), 'Sign Out')),
        ),
        h('p', { class: 'small muted', style: 'margin-top:10px' }, 'The dashboard only answers devices on your home network. Forgot your password? Run ', h('span', { class: 'kbd' }, 'sudo autonode passwd'), ' on the server.'),
      ),
      h(
        'div',
        { class: 'card pad-lg center' },
        h('img', { src: '/favicon.svg', width: 72, height: 72, alt: 'AutoNode' }),
        h('h2', { style: 'margin-top:12px' }, 'AutoNode'),
        h('p', { class: 'muted' }, `Version ${s.version}`),
        h('p', { style: 'margin-top:14px' }, 'Made with ♥ by ', h('b', {}, 'Akulav')),
        h('p', { class: 'small muted', style: 'margin-top:4px' }, h('a', { href: 'https://github.com/Akulav', target: '_blank', rel: 'noopener' }, 'github.com/Akulav')),
      ),
    ),
  );
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
  const [, route = 'overview', a, b] = (location.hash || '#/overview').split('/');
  let view;
  try {
    if (route === 'sites' && a) view = await siteView(decodeURIComponent(a), b);
    else view = await ({ overview: overviewView, sites: sitesView, domains: domainsView, network: networkView, settings: settingsView }[route] || overviewView)();
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
