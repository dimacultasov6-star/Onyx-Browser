'use strict';

window.BZ = window.BZ || {};

BZ.state = {
  tabs: [],
  order: [],
  activeId: null,
  settings: {},
  bookmarks: [],
  history: [],
  downloads: [],
  closedTabs: [],
  version: '1.0.0',
  platform: 'win32',
};

BZ.$ = (sel, root) => (root || document).querySelector(sel);
BZ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

BZ.el = function (tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }
  return node;
};

BZ.icon = function (paths, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size || 14);
  svg.setAttribute('height', size || 14);
  svg.innerHTML = paths;
  return svg;
};

BZ.ICONS = {
  clock: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3.2l2.2 1.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  star: '<path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  starFill: '<path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" fill="currentColor"/>',
  folder: '<path d="M2.5 4.2h3.6l1 1.2h6.4v6.4a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  search: '<circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  globe: '<circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="8" cy="8" rx="2.6" ry="5.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.4 6.2h11.2M2.4 9.8h11.2" stroke="currentColor" stroke-width="1.2"/>',
  trash: '<path d="M3.5 4.5h9M6 4.5V3.2h4v1.3M4.6 4.5l.6 8.2h5.6l.6-8.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  pin: '<path d="M9.5 2.2l4.3 4.3-2 .6-2.4 2.4.4 2.2-1.3 1.3-3-3-3.4 3.4 3.4-4.6-2.7-2.7L4.5 4.8l2.2.4L9.1 2.8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  sound: '<path d="M4 6.2h2L9 4v8L6 9.8H4z" fill="currentColor"/><path d="M11 6a3 3 0 0 1 0 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  muted: '<path d="M4 6.2h2L9 4v8L6 9.8H4z" fill="currentColor"/><path d="M11 6.2l3 3.6M14 6.2l-3 3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  doc: '<path d="M4 2.5h5l3 3v8H4z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  zoomIn: '<circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4L14 14M5.2 7h3.6M7 5.2v3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  zoomOut: '<circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4L14 14M5.2 7h3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  ext: '<path d="M9 3.5h3.5V7M12.5 3.5L8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 9.5v3H3.5V5h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  print: '<path d="M5 6V2.8h6V6M4.5 11.5h7v2.7h-7z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="2.5" y="6" width="11" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  save: '<path d="M3 3h8l2 2v8H3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.5 3v3.5h5V3M5.5 13v-3.5h5V13" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  code: '<path d="M6 4.5L2.5 8 6 11.5M10 4.5L13.5 8 10 11.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 3.5h-8v8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  check: '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="M8 1.8l5 2v4c0 3.2-2.1 5.4-5 6.4-2.9-1-5-3.2-5-6.4v-4z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  eye: '<path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" stroke-width="1.2"/>',
};

BZ.host = function (url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
};

BZ.fmtBytes = function (b) {
  if (!b || b < 0) return '—';
  const u = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
};

BZ.fmtTime = function (ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'вчера, ' + time;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + time;
};

BZ.letterColor = function (seed) {
  let h = 0;
  const s = String(seed || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'hsl(' + h + ', 55%, 45%)';
};

BZ.letterBadge = function (seed) {
  const s = String(seed || '?');
  const b = BZ.el('span', { class: 'letter', text: s.trim().charAt(0).toUpperCase() || '?' });
  b.style.background = BZ.letterColor(s);
  return b;
};

BZ.debounce = function (fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms || 120);
  };
};

BZ.escapeHtml = function (s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

BZ.faviconFor = function (url, size) {
  const box = BZ.el('span', { class: size === 'big' ? 'row-ico' : 'tab-fav' });
  const host = BZ.host(url);
  if (url && /^https?:/i.test(url)) {
    const origin = new URL(url).origin;
    box.appendChild(
      BZ.el('img', {
        src: origin + '/favicon.ico',
        onerror: (e) => {
          const p = e.target.parentNode;
          while (p.firstChild) p.removeChild(p.firstChild);
          p.appendChild(BZ.letterBadge(host));
        },
      })
    );
  } else {
    box.appendChild(BZ.letterBadge(host || url || '?'));
  }
  return box;
};

BZ.menu = function (anchor, items, opts) {
  opts = opts || {};
  const box = BZ.el('div', { class: 'popup' + (opts.wide ? ' wide' : '') });
  items.forEach((it) => {
    if (it === '-' || it.sep) {
      box.appendChild(BZ.el('div', { class: 'sep' }));
      return;
    }
    if (it.title) {
      box.appendChild(BZ.el('div', { class: 'title', text: it.title }));
      return;
    }
    const row = BZ.el('div', { class: 'mi' + (it.disabled ? ' disabled' : '') });
    if (it.icon) row.appendChild(BZ.icon(it.icon, 14));
    else if (it.iconEl) row.appendChild(it.iconEl);
    row.appendChild(BZ.el('span', { text: it.label }));
    if (it.kbd) row.appendChild(BZ.el('span', { class: 'kbd', text: it.kbd }));
    if (!it.disabled) {
      row.addEventListener('click', () => {
        hideMenus();
        if (it.action) it.action();
      });
    }
    box.appendChild(row);
  });
  document.body.appendChild(box);
  const r = anchor.getBoundingClientRect();
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  let left = opts.align === 'right' ? r.right - w : r.left;
  let top = r.bottom + 4;
  if (left + w > window.innerWidth - 6) left = window.innerWidth - w - 6;
  if (left < 6) left = 6;
  if (top + h > window.innerHeight - 6) top = Math.max(6, r.top - h - 4);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  BZ._menu = box;
  return box;
};

BZ.hideMenus = function () {
  if (BZ._menu) {
    BZ._menu.remove();
    BZ._menu = null;
  }
  if (BZ._ctx) {
    BZ._ctx.remove();
    BZ._ctx = null;
  }
  BZ.$$('.popup,#ctxmenu').forEach((n) => n.classList.add('hidden'));
};

BZ.contextMenu = function (x, y, items) {
  BZ.hideMenus();
  const box = BZ.el('div', { class: 'popup ctxmenu' });
  items.forEach((it) => {
    if (it === '-') {
      box.appendChild(BZ.el('div', { class: 'sep' }));
      return;
    }
    const row = BZ.el('div', { class: 'mi' + (it.disabled ? ' disabled' : '') });
    if (it.icon) row.appendChild(BZ.icon(it.icon, 14));
    row.appendChild(BZ.el('span', { text: it.label }));
    if (it.kbd) row.appendChild(BZ.el('span', { class: 'kbd', text: it.kbd }));
    if (!it.disabled) {
      row.addEventListener('click', () => {
        hideMenus();
        if (it.action) it.action();
      });
    }
    box.appendChild(row);
  });
  document.body.appendChild(box);
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  box.style.left = Math.min(x, window.innerWidth - w - 6) + 'px';
  box.style.top = Math.min(y, window.innerHeight - h - 6) + 'px';
  box.classList.remove('hidden');
  BZ._ctx = box;
};

BZ.toast = function (text, ms) {
  const t = BZ.$('#toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(BZ._toastT);
  BZ._toastT = setTimeout(() => t.classList.add('hidden'), ms || 1800);
};

BZ.switchField = function (label, sub, checked, onChange) {
  const wrap = BZ.el('div', { class: 'row-field' });
  const grow = BZ.el('div', { class: 'grow' }, [BZ.el('div', { text: label })]);
  if (sub) grow.appendChild(BZ.el('div', { class: 'sub', text: sub }));
  const sw = BZ.el('label', { class: 'switch' });
  const input = BZ.el('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  sw.appendChild(input);
  sw.appendChild(BZ.el('i'));
  wrap.appendChild(grow);
  wrap.appendChild(sw);
  return wrap;
};

BZ.textField = function (label, value, hint, onChange) {
  const f = BZ.el('div', { class: 'field' });
  f.appendChild(BZ.el('label', { text: label }));
  const input = BZ.el('input', { type: 'text', value: value === undefined || value === null ? '' : String(value) });
  input.addEventListener('change', () => onChange(input.value));
  f.appendChild(input);
  if (hint) f.appendChild(BZ.el('div', { class: 'hint', text: hint }));
  return f;
};

BZ.selectField = function (label, value, options, onChange) {
  const f = BZ.el('div', { class: 'field' });
  f.appendChild(BZ.el('label', { text: label }));
  const sel = BZ.el('select');
  options.forEach((o) => {
    const op = BZ.el('option', { value: o.value, text: o.label });
    if (o.value === value) op.selected = true;
    sel.appendChild(op);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  f.appendChild(sel);
  return f;
};