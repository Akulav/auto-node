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
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
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
  // Default to text size; CSS (nav, buttons, tiles) overrides where a fixed size is wanted.
  s.setAttribute('width', '1.15em');
  s.setAttribute('height', '1.15em');
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

/* ---- chunked, resumable uploads ---- */

const CHUNK = 8 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function putChunk(id, offset, total, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/chunk?id=${id}&offset=${offset}&total=${total}`);
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    const fail = (msg, status = 0) => {
      const err = new Error(msg);
      // Retry network errors, timeouts, 408/409/429 and 5xx (except "disk full"); give up on other client errors.
      err.fatal = status === 507 || (status >= 400 && status < 500 && ![408, 409, 429].includes(status));
      reject(err);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status < 300) resolve(data);
      else fail(data.error || `Upload failed (${xhr.status})`, xhr.status);
    };
    xhr.onerror = () => fail('Connection lost');
    xhr.ontimeout = () => fail('Upload timed out');
    xhr.send(blob);
  });
}

/**
 * Upload a File in 8 MB pieces. Each piece is retried with back-off, and after a
 * failure the upload continues from what the server already has.
 * Returns the upload id to finalise with a "*-complete" endpoint.
 */
async function uploadResumable(file, { onProgress = () => {}, onRetry = () => {} } = {}) {
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const total = file.size;
  let offset = 0;
  let failures = 0;
  let pending = true; // ensures empty files still send one (empty) piece
  while (pending || offset < total) {
    pending = false;
    const start = offset;
    const end = Math.min(start + CHUNK, total);
    try {
      const r = await putChunk(id, start, total, file.slice(start, end), (n) => onProgress(start + n, total));
      offset = r.received ?? end;
      failures = 0;
      onProgress(offset, total);
    } catch (err) {
      if (err.fatal || ++failures > 10) {
        fetch(`/api/chunk?id=${id}`, { method: 'DELETE' }).catch(() => {});
        throw err;
      }
      onRetry(failures, err);
      await sleep(Math.min(20_000, 1000 * 2 ** Math.min(failures, 5)));
      try {
        offset = (await api('GET', `/api/chunk?id=${id}`)).received;
      } catch {
        offset = start;
      }
      if (total === 0) pending = true;
    }
  }
  return id;
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
// name -> 'ok' | 'none': remembered for this page, so the 2-second live repaint doesn't re-ask for missing icons.
const iconState = new Map();

/** The website's own favicon on a tile, falling back to its first letter. */
function siteIcon(s, size) {
  const tile = h('div', { class: 'site-icon', style: { background: siteColor(s.name), ...(size ? { width: size + 'px', height: size + 'px', borderRadius: size * 0.27 + 'px', fontSize: size * 0.42 + 'px' } : {}) } }, (s.title || s.name)[0]);
  if (iconState.get(s.name) === 'none') return tile;
  const img = h('img', { src: `/api/sites/${encodeURIComponent(s.name)}/icon`, alt: '', draggable: 'false' });
  img.addEventListener('load', () => {
    iconState.set(s.name, 'ok');
    tile.classList.add('has-img');
  });
  img.addEventListener('error', () => {
    iconState.set(s.name, 'none');
    img.remove();
  });
  if (iconState.get(s.name) === 'ok') tile.classList.add('has-img');
  tile.append(img);
  return tile;
}

const STATE_LABEL = { running: ['Running', 'good running'], stopped: ['Stopped', ''], starting: ['Starting…', 'info'], crashed: ['Crashed', 'bad'] };
const statusPill = (st) => {
  const [label, cls] = STATE_LABEL[st?.state] || STATE_LABEL.stopped;
  return h('span', { class: `pill ${cls}` }, h('span', { class: 'dot' }), label);
};

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
  ['visitors', 'Visitors'],
  ['domains', 'Domains & Access'],
  ['github', 'Deploys'],
  ['tasks', 'Tasks'],
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
  const views = { overview: siteOverview, files: siteFiles, logs: siteLogs, visitors: siteVisitors, domains: siteDomainsAndAccess, github: siteDeploys, tasks: siteTasks, settings: siteSettingsPlus };
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
        ['Health check', h('a', { href: `#/sites/${site.name}/settings`, style: `color:${site.health?.state === 'failing' ? 'var(--bad)' : 'inherit'}` }, healthLabel(site.health))],
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
          ['Data folder', h('span', {}, h('a', { href: `#/sites/${site.name}/files?area=data` }, 'Open'), h('span', { class: 'muted' }, ' · your app reads it as '), h('code', {}, 'process.env.DATA_DIR'))],
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
        ? notice('good', h('b', {}, 'Data folder. '), 'Store databases and uploads here — GitHub updates, rollbacks and “clean” never touch it, and it is included in full backups. Your app finds it at ', h('code', {}, 'process.env.DATA_DIR'), '.')
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
                if (!(await confirmSheet({ title: 'Use the GitHub versions?', text: `${files.map((f) => f.path).join(', ')} will be replaced with the version from GitHub. A copy of the current files is saved first, in /var/lib/autonode/rescued/${site.name}.`, ok: 'Replace Files', danger: true }))) return;
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
        h('div', { style: 'margin-top:16px' }, scheduledBackupsCard(showRestore)),
      ),
      h(
        'div',
        {},
        h('h2', { style: 'margin-bottom:12px' }, 'Security'),
        h('div', { style: 'margin-bottom:16px' }, dashboardHttpsCard(s)),
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

/* ===================================================== feature views */

const fmtNum = (n) => Number(n || 0).toLocaleString();
const healthLabel = (hs) =>
  !hs?.enabled ? 'Off' : hs.state === 'healthy' ? `Healthy${hs.lastMs != null ? ` · answers in ${hs.lastMs} ms` : ''}` : hs.state === 'failing' ? `Not answering (${hs.fails} of ${hs.threshold})` : 'Waiting for the first check';

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

function storageCard(site) {
  const box = h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, 'Storage'), h('span', { class: 'spin right' })));
  const load = async (fresh) => {
    let u;
    try {
      u = await api('GET', `/api/sites/${site.name}/usage${fresh ? '?fresh=1' : ''}`);
    } catch (err) {
      return append(clear(box), [h('h3', {}, 'Storage'), h('p', { class: 'muted small' }, err.message)]);
    }
    const clean = async (reinstall, btn) => {
      const ok = await confirmSheet({
        title: reinstall ? 'Clean and reinstall packages?' : 'Delete node_modules?',
        text: reinstall ? 'node_modules is deleted, packages are installed fresh, and the website restarts. Useful when packages behave strangely.' : 'Frees the space now. The website keeps running, but it needs “Install & Rebuild” before it can start again.',
        ok: reinstall ? 'Clean & Reinstall' : 'Delete',
        danger: !reinstall,
      });
      if (!ok) return;
      await busy(btn, async () => {
        const r = await api('POST', `/api/sites/${site.name}/clean`, { reinstall });
        toast(`Freed ${fmtBytes(r.freed)}${reinstall ? ' — reinstalling…' : ''}`);
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
        meterRow('Packages', u.nodeModules, u.total, 'node_modules — can be reinstalled any time'),
        meterRow('Git history', u.git, u.total),
        meterRow('Data folder', u.data, u.total, 'Databases and uploads (DATA_DIR)'),
        meterRow('Snapshots', u.snapshots, u.total, 'Copies for rolling back'),
      ),
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:12px' },
        (b1 = h('button', { class: 'btn sm', disabled: !u.nodeModules, onclick: () => clean(true, b1) }, icon('restart'), 'Clean & Reinstall Packages')),
        (b2 = h('button', { class: 'btn sm danger', disabled: !u.nodeModules, onclick: () => clean(false, b2) }, icon('trash'), 'Delete node_modules')),
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
  const [{ history }, { snapshots, keep }] = await Promise.all([api('GET', `/api/sites/${site.name}/history`), api('GET', `/api/sites/${site.name}/snapshots`)]);
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
  );
  return el;
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

/* ---- site settings: health check + memory limit */

function siteSettingsPlus(site) {
  const el = siteSettings(site);
  let hPath, hInterval, hFails, mem;
  let enabled = false;
  const result = h('div', { class: 'small muted' });
  const card = h('div', { class: 'card pad-lg form' }, h('h2', {}, 'Health & limits'), h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'Loading…'));
  api('GET', `/api/sites/${site.name}/health`)
    .then(({ settings, status }) => {
      enabled = settings.enabled;
      const fields = h(
        'div',
        { class: `form ${enabled ? '' : 'dim-off'}` },
        h(
          'div',
          { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', {}, 'Page to check ', h('span', { class: 'hint' }, '(any answer below 500 counts as healthy)')), (hPath = h('input', { class: 'input mono', value: settings.path, placeholder: '/health' }))),
          h(
            'label',
            { class: 'field' },
            'Check every',
            (hInterval = h('select', { class: 'input' }, [15, 30, 60, 300].map((s) => h('option', { value: s, selected: s === settings.interval }, s < 60 ? `${s} seconds` : `${s / 60} minute${s > 60 ? 's' : ''}`)))),
          ),
        ),
        h('label', { class: 'field' }, 'Restart after', (hFails = h('select', { class: 'input', style: 'max-width:280px' }, [2, 3, 5, 10].map((n) => h('option', { value: n, selected: n === settings.failures }, `${n} failed checks in a row`))))),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', type: 'button', onclick: async (e) => busy(e.currentTarget, async () => { const r = await api('POST', `/api/sites/${site.name}/health/test`, { path: hPath.value }); result.textContent = r.ok ? `✓ Healthy — answered ${r.status} in ${r.ms} ms` : `✖ ${r.error}`; result.style.color = r.ok ? 'var(--good)' : 'var(--bad)'; }) }, icon('heart'), 'Test Now'), result),
      );
      const hToggle = toggle(enabled, (v) => {
        enabled = v;
        fields.classList.toggle('dim-off', !v);
      }, 'Health check');
      append(clear(card), [
        h('h2', {}, 'Health & limits'),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Automatic health check'), h('p', { class: 'muted small' }, 'AutoNode visits a page every so often and restarts the website if it stops answering — even when the process still looks alive.'), status.enabled && h('p', { class: 'small', style: 'margin-top:4px' }, 'Now: ', h('b', {}, healthLabel(status)), status.restarts ? ` · restarted ${status.restarts}× since AutoNode started` : '')), hToggle),
        fields,
        h('h3', { style: 'margin-top:10px' }, 'Memory limit'),
        h('p', { class: 'muted small', style: 'margin-top:-8px' }, 'If the website uses more than this, it is restarted — so one leaking app can never slow down the others. Leave empty for no limit.'),
        h('div', { class: 'row' }, (mem = h('input', { class: 'input', type: 'number', min: 64, step: 64, value: site.memoryLimitMB || '', placeholder: 'No limit', style: 'max-width:160px' })), h('span', { class: 'muted' }, 'MB'), site.status?.memory != null && h('span', { class: 'small muted' }, `Uses ${fmtBytes(site.status.memory)} right now`)),
        h(
          'div',
          { class: 'row', style: 'margin-top:8px' },
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
                  if (before !== after && (await confirmSheet({ title: 'Saved ✓', text: 'Restart the website now so the new memory limit applies?', ok: 'Restart Now' }))) {
                    await api('POST', `/api/sites/${site.name}/restart`);
                    toast('Restarted ✓');
                  } else toast('Saved ✓');
                }),
            },
            'Save',
          ),
        ),
      ]);
    })
    .catch((err) => append(clear(card), [h('h2', {}, 'Health & limits'), notice('bad', err.message)]));
  el.insertBefore(card, el.lastChild);
  return el;
}

/* ---- activity */

async function activityView() {
  let entries = (await api('GET', '/api/activity?limit=150')).entries;
  let onlyProblems = false;
  const listBox = h('div', { class: 'stack', style: 'gap:18px' });
  const more = h('button', { class: 'btn', onclick: async (e) => busy(e.currentTarget, async () => { const older = (await api('GET', `/api/activity?limit=150&before=${encodeURIComponent(entries.at(-1).at)}`)).entries; entries = entries.concat(older); if (older.length < 150) more.classList.add('hidden'); paint(); }) }, 'Show Older');
  if (entries.length < 150) more.classList.add('hidden');
  const paint = () => {
    clear(listBox);
    const shown = onlyProblems ? entries.filter((e) => !e.ok) : entries;
    if (!shown.length) return listBox.append(h('div', { class: 'card empty' }, h('h2', {}, onlyProblems ? 'No problems' : 'Nothing yet'), h('p', {}, onlyProblems ? 'Nothing has failed recently.' : 'Changes, deploys, sign-ins and automatic actions show up here.')));
    const groups = new Map();
    for (const e of shown) {
      const k = new Date(e.at).toDateString();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    for (const [day, items] of groups) {
      const d = new Date(day);
      const today = new Date().toDateString() === day;
      listBox.append(
        h(
          'div',
          {},
          h('div', { class: 'metric-label', style: 'margin:0 0 8px 4px' }, today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
          h(
            'div',
            { class: 'list' },
            items.map((e) =>
              h(
                'div',
                { class: 'item' },
                h('span', { class: `pill ${e.ok ? '' : 'bad'}`, style: 'min-width:54px;justify-content:center' }, new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
                h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label ellipsis' }, e.action, e.site && h('a', { class: 'muted', href: `#/sites/${e.site}`, style: 'font-weight:400' }, ` · ${e.site}`)), e.detail && h('div', { class: 'small muted ellipsis', title: e.detail }, e.detail)),
                h('span', { class: 'small muted', style: 'white-space:nowrap' }, e.by === 'you' ? `you${e.ip ? ` · ${e.ip}` : ''}` : e.by === 'someone' ? `someone · ${e.ip || '?'}` : e.by),
              ),
            ),
          ),
        ),
      );
    }
  };
  paint();
  const seg = h(
    'div',
    { class: 'segmented' },
    [
      [false, 'Everything'],
      [true, 'Problems'],
    ].map(([v, label]) => h('button', { class: v === onlyProblems ? 'on' : '', onclick: (e) => ((onlyProblems = v), [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)), paint()) }, label)),
  );
  return h('div', { class: 'page' }, pageHead('Activity', { sub: 'Who did what, and when — including automatic updates, health-check restarts, backups and sign-ins.', actions: seg }), listBox, h('div', { class: 'center', style: 'margin-top:18px' }, more));
}

/* ---- settings: scheduled backups + dashboard HTTPS */

function scheduledBackupsCard(showRestore) {
  const card = h('div', { class: 'card pad-lg' }, h('h3', {}, 'Automatic backups'), h('p', { class: 'muted small' }, 'Loading…'));
  const load = async () => {
    const { settings: s, backups, running } = await api('GET', '/api/backups');
    let time, keep, copyTo;
    const save = async (patch, btn) => {
      const run = async () => {
        await api('PATCH', '/api/backups', patch);
        toast('Saved ✓');
      };
      if (btn) await busy(btn, run);
      else await run().catch((err) => toast(err.message, 'bad'));
    };
    let nowBtn;
    append(clear(card), [
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, 'Automatic backups'), h('p', { class: 'muted small' }, 'A full backup (settings, website files and data folders) every day. ', s.lastRun ? (s.lastOk ? `Last one ${fmtAgo(s.lastRun)} ✓` : `Last attempt failed ${fmtAgo(s.lastRun)}: ${s.lastError}`) : 'None made yet.')), toggle(s.enabled, (v) => save({ enabled: v }), 'Automatic backups')),
      h(
        'div',
        { class: 'form-grid', style: 'margin-top:14px' },
        h('label', { class: 'field' }, 'Time of day', (time = h('input', { class: 'input', type: 'time', value: s.time, onchange: () => save({ time: time.value }) }))),
        h('label', { class: 'field' }, 'Keep', (keep = h('select', { class: 'input', onchange: () => save({ keep: Number(keep.value) }) }, [3, 7, 14, 30, 90].map((n) => h('option', { value: n, selected: n === s.keep }, `Last ${n} backups`))))),
      ),
      h(
        'label',
        { class: 'field', style: 'margin-top:14px' },
        h('span', {}, 'Also copy to ', h('span', { class: 'hint' }, '(optional — another disk or a mounted network share, e.g. /mnt/nas/autonode)')),
        h('div', { class: 'input-row' }, (copyTo = h('input', { class: 'input mono', value: s.copyTo || '', placeholder: '/mnt/backup-disk/autonode' })), h('button', { class: 'btn sm', onclick: (e) => save({ copyTo: copyTo.value }, e.currentTarget) }, 'Save')),
      ),
      h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Stored in ', h('code', {}, s.folder), '. Backups contain keys and tokens: keep the copy folder private.'),
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:14px' },
        (nowBtn = h(
          'button',
          {
            class: 'btn',
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
      backups.length > 0 &&
        h(
          'div',
          { class: 'list flat', style: 'margin-top:14px' },
          backups.slice(0, 10).map((b) =>
            h(
              'div',
              { class: 'item' },
              h('span', { style: 'display:flex;color:var(--accent)' }, icon('disk')),
              h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'label' }, new Date(b.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })), h('div', { class: 'small muted' }, `${b.kind === 'manual' ? 'Made by you' : 'Scheduled'} · ${fmtBytes(b.size)}`)),
              h('a', { class: 'btn icon ghost', title: 'Download', href: `/api/backups/${encodeURIComponent(b.name)}` }, icon('download')),
              h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => showRestore(await api('POST', `/api/backups/${encodeURIComponent(b.name)}/prepare`))) }, 'Restore…'),
              h('button', { class: 'btn icon ghost', title: 'Delete', style: 'color:var(--bad)', onclick: async () => (await confirmSheet({ title: 'Delete this backup?', text: 'It is removed from this computer (copies in the extra folder stay).', ok: 'Delete', danger: true })) && (await api('DELETE', `/api/backups/${encodeURIComponent(b.name)}`), load()) }, icon('trash')),
            ),
          ),
        ),
    ]);
  };
  load().catch((err) => append(clear(card), [h('h3', {}, 'Automatic backups'), notice('bad', err.message)]));
  return card;
}

function dashboardHttpsCard(s) {
  const on = location.protocol === 'https:' || s.dashboardHttps;
  return h(
    'div',
    { class: 'card pad-lg' },
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'grow' }, h('h3', {}, 'Secure dashboard (HTTPS)'), h('p', { class: 'muted small' }, 'Encrypts the connection to this dashboard so nobody on your Wi-Fi can read your password. Uses a certificate made for this computer: your browser asks you to trust it once.')),
      toggle(on, async (v, input) => {
        if (v && !(await confirmSheet({ title: 'Turn on HTTPS?', text: 'The dashboard reloads at https://… Your browser will warn that the certificate is “not trusted” — that is expected for a home server. Choose “Advanced → Continue” once (or install the certificate below to remove the warning). If you ever get locked out, run “sudo autonode https off” on the server.', ok: 'Turn On' }))) return (input.checked = false);
        try {
          const r = await api('PATCH', '/api/settings', { dashboardHttps: v });
          toast(v ? 'Switching to HTTPS…' : 'Switching back to HTTP…');
          setTimeout(() => (location.href = r.url), 600);
        } catch (err) {
          input.checked = !v;
          toast(err.message, 'bad');
        }
      }, 'Secure dashboard'),
    ),
    s.dashboardCert?.hasCert &&
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:14px' },
        h('a', { class: 'btn sm', href: '/api/dashboard-cert' }, icon('download'), 'Download Certificate'),
        h('button', { class: 'btn sm', onclick: async (e) => busy(e.currentTarget, async () => (await api('POST', '/api/dashboard-cert/regenerate'), toast('New certificate made ✓ — reload the page'))) }, 'Make New Certificate'),
        h('span', { class: 'small muted' }, `Covers ${s.dashboardCert.names.slice(0, 4).join(', ')}${s.dashboardCert.names.length > 4 ? '…' : ''}. Make a new one if this computer's address changed.`),
      ),
    s.dashboardCert?.hasCert && h('details', { class: 'more' }, h('summary', {}, 'Remove the browser warning'), h('div', { class: 'small', style: 'color:var(--text-2)' }, h('ol', { style: 'padding-left:18px;display:flex;flex-direction:column;gap:6px' }, h('li', {}, h('b', {}, 'Mac: '), 'open the downloaded file → Keychain Access → double-click it → Trust → “Always Trust”.'), h('li', {}, h('b', {}, 'Windows: '), 'open the file → Install Certificate → Local Machine → “Trusted Root Certification Authorities”.'), h('li', {}, h('b', {}, 'iPhone/iPad: '), 'open the file, install the profile, then Settings → General → About → Certificate Trust Settings → turn it on.'), h('li', {}, h('b', {}, 'Android: '), 'Settings → Security → Encryption & credentials → Install a certificate → CA certificate.')))),
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
  const [, route = 'overview', a, b] = (location.hash || '#/overview').split('?')[0].split('/'); // "?…" = view options (e.g. ?area=data)
  let view;
  try {
    if (route === 'sites' && a) view = await siteView(decodeURIComponent(a), b);
    else view = await ({ overview: overviewView, sites: sitesView, domains: domainsView, network: networkView, activity: activityView, settings: settingsView }[route] || overviewView)();
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
