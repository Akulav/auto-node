/* AutoNode web app — shared helpers and components. Made by Akulav. */

export function h(tag, props, ...kids) {
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
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
};

export const ICONS = {
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
export function icon(name, cls) {
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

export const fmtBytes = (n, d = 1) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) (n /= 1024), i++;
  return `${n.toFixed(i === 0 ? 0 : n < 10 ? d : 0)} ${u[i]}`;
};
export const fmtPct = (n) => (n == null ? '—' : `${Math.round(n)}%`);
export const fmtDur = (s) => {
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
export const fmtAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
export const level = (pct) => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : '');

export class ApiError extends Error {}
let unauthorized = () => {};
/** Called when the server says the session ended (app.js shows the sign-in screen). */
export const onUnauthorized = (fn) => (unauthorized = fn);
export async function api(method, url, body, { raw } = {}) {
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
    unauthorized();
    throw new ApiError('Please sign in.');
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---- chunked, resumable uploads ---- */

export const CHUNK = 8 * 1024 * 1024;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function putChunk(id, offset, total, blob, onProgress) {
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
export async function uploadResumable(file, { onProgress = () => {}, onRetry = () => {} } = {}) {
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

export function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, kind === 'bad' ? 6000 : 3200);
}

/** Wrap an async button action with a spinner and error toast. */
export async function busy(btn, fn) {
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

export async function copy(text, what = 'Copied') {
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

export function sheet(build, { wide = false, onClose } = {}) {
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

export function confirmSheet({ title, text, ok = 'Continue', danger = false, typeToConfirm }) {
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

export function promptSheet({ title, text, label, value = '', placeholder = '', ok = 'Save' }) {
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

export const toggle = (checked, onchange, label) =>
  h('label', { class: 'switch', title: label }, h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked, e.target) }), h('span'));

export const copyable = (text, label = 'Copied') => h('div', { class: 'copyable' }, h('span', { title: text }, text), h('button', { class: 'btn sm', onclick: () => copy(text, label) }, icon('copy'), 'Copy'));

export const codeBlock = (text) => h('div', { class: 'code' }, h('button', { class: 'btn sm copy', onclick: () => copy(text) }, icon('copy'), 'Copy'), text);

export const notice = (kind, ...kids) => h('div', { class: `notice ${kind}` }, icon(kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'warn'), h('div', {}, ...kids));

export const SITE_COLORS = [
  'linear-gradient(135deg,#3a8dff,#5e5ce6)',
  'linear-gradient(135deg,#ff9f0a,#ff375f)',
  'linear-gradient(135deg,#30d158,#0a9396)',
  'linear-gradient(135deg,#bf5af2,#5e5ce6)',
  'linear-gradient(135deg,#64d2ff,#0a84ff)',
  'linear-gradient(135deg,#ff6482,#bf5af2)',
  'linear-gradient(135deg,#ffd60a,#ff9f0a)',
  'linear-gradient(135deg,#8e8e93,#48484a)',
];
export const siteColor = (name) => SITE_COLORS[[...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % SITE_COLORS.length];
// name -> 'ok' | time of the last miss, so the 2-second live repaint doesn't re-ask for missing icons
// every time. A miss (site still starting, or AutoNode just updated) is retried after 30 s, like the
// server's own live lookup, instead of hiding the icon until the page is reloaded.
export const iconState = new Map();
const ICON_RETRY_MS = 30_000;

/** The website's own favicon on a tile, falling back to its first letter. */
export function siteIcon(s, size) {
  const tile = h('div', { class: 'site-icon', style: { background: siteColor(s.name), ...(size ? { width: size + 'px', height: size + 'px', borderRadius: size * 0.27 + 'px', fontSize: size * 0.42 + 'px' } : {}) } }, (s.title || s.name)[0]);
  const missed = iconState.get(s.name);
  if (typeof missed === 'number' && Date.now() - missed < ICON_RETRY_MS) return tile;
  const img = h('img', { src: `/api/sites/${encodeURIComponent(s.name)}/icon`, alt: '', draggable: 'false' });
  img.addEventListener('load', () => {
    iconState.set(s.name, 'ok');
    tile.classList.add('has-img');
  });
  img.addEventListener('error', () => {
    iconState.set(s.name, Date.now());
    img.remove();
  });
  if (iconState.get(s.name) === 'ok') tile.classList.add('has-img');
  tile.append(img);
  return tile;
}

export const STATE_LABEL = { running: ['Running', 'good running'], stopped: ['Stopped', ''], starting: ['Starting…', 'info'], crashed: ['Crashed', 'bad'] };
export const statusPill = (st) => {
  const [label, cls] = STATE_LABEL[st?.state] || STATE_LABEL.stopped;
  return h('span', { class: `pill ${cls}` }, h('span', { class: 'dot' }), label);
};

export const pageHead = (title, { eyebrow, sub, actions, back } = {}) =>
  h(
    'div',
    { class: 'page-head' },
    h('div', { class: 'grow' }, back && h('a', { class: 'back', href: back[0] }, icon('back'), back[1]), eyebrow && h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), sub && h('div', { class: 'sub' }, sub)),
    actions && h('div', { class: 'row wrap' }, actions),
  );

export const fmtNum = (n) => Number(n || 0).toLocaleString();
export const healthLabel = (hs) =>
  !hs?.enabled ? 'Off' : hs.state === 'healthy' ? `Healthy${hs.lastMs != null ? ` · answers in ${hs.lastMs} ms` : ''}` : hs.state === 'failing' ? `Not answering (${hs.fails} of ${hs.threshold})` : 'Waiting for the first check';
