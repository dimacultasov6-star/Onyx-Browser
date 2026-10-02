'use strict';

const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  shell,
  dialog,
  clipboard,
  nativeTheme,
  protocol,
  Menu,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Store = require('./store');

const IS_MAC = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'brauzer',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const DEFAULTS = {
  settings: {
    theme: 'dark',
    accent: '#3d7bfd',
    homepage: 'https://ru.wikipedia.org',
    searchEngine: 'duckduckgo',
    restoreSession: true,
    showBookmarksBar: true,
    confirmMultipleTabs: true,
    clearOnExit: false,
    defaultZoom: 1,
    askDownloadLocation: false,
    downloadDir: '',
    muteAudio: false,
    homepageButton: true,
    blockThirdPartyPopups: false,
  },
  bookmarks: [],
  history: [],
  closedTabs: [],
  sessionTabs: [],
};

let store = null;
let mainWindow = null;
let quitting = false;
let seq = 1;

const tabs = new Map();
const contexts = new Map();
const downloads = new Map();
let dseq = 1;

const SEARCH = {
  google: 'https://www.google.com/search?q=%s',
  duckduckgo: 'https://duckduckgo.com/?q=%s',
  yandex: 'https://yandex.ru/search/?text=%s',
  bing: 'https://www.bing.com/search?q=%s',
  brave: 'https://search.brave.com/search?q=%s',
  mailru: 'https://go.mail.ru/search?q=%s',
};
const SEARCH_NAMES = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  yandex: 'Яндекс',
  bing: 'Bing',
  brave: 'Brave',
  mailru: 'Mail.ru',
};

const DEFAULT_LINKS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Википедия', url: 'https://ru.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Почта Mail.ru', url: 'https://go.mail.ru' },
  { title: 'Habr', url: 'https://habr.com' },
  { title: 'VK', url: 'https://vk.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' },
  { title: 'Погода', url: 'https://yandex.ru/pogoda' },
];

/* ------------------------------------------------------------------ utils */

function settings() {
  return store.get('settings');
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isInternal(url) {
  return url === 'about:blank' || url === 'about:newtab' || /^brauzer:\/\//i.test(url);
}

function searchUrl(query) {
  const eng = settings().searchEngine;
  if (!eng || !SEARCH[eng]) return SEARCH.duckduckgo.replace('%s', encodeURIComponent(query));
  return SEARCH[eng].replace('%s', encodeURIComponent(query));
}

function looksLikeUrl(text) {
  const t = text.trim();
  if (!t) return false;
  if (/^(https?|ftp|file|about|brauzer|data|chrome|view-source|localhost|ws|wss):/i.test(t)) return true;
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t)) return true;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(t)) return true;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/i.test(t)) return true;
  if (/^\/[^\s]*$/.test(t)) return true;
  return false;
}

function normalizeInput(text) {
  const t = (text || '').trim();
  if (!t) return null;
  if (/^(brauzer|about|file|data|view-source|mailto|tel|chrome):/i.test(t)) return t;
  if (looksLikeUrl(t)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
    if (/^localhost(:\d+)?([/?#].*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(t)) return 'http://' + t;
    return 'http://' + t;
  }
  return searchUrl(t);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

/* --------------------------------------------------------- window context */

function ctxOf(win) {
  if (!win) return null;
  let c = contexts.get(win.id);
  if (!c) {
    c = { win, tabIds: [], layout: { x: 0, y: 0, width: 0, height: 0 }, overlay: false, chromeHidden: false };
    contexts.set(win.id, c);
  }
  return c;
}

function winOf(winOrId) {
  if (!winOrId) return mainWindow;
  if (typeof winOrId === 'object' && winOrId.webContents) return winOrId;
  return BrowserWindow.fromId(winOrId) || mainWindow;
}

function send(channel, payload, win) {
  const target = win ? winOf(win) : mainWindow;
  if (target && !target.isDestroyed() && target.webContents && !target.webContents.isDestroyed()) {
    target.webContents.send(channel, payload);
  }
}

function tabOf(win) {
  const c = ctxOf(win);
  if (!c || !c.tabIds.length) return null;
  const id = c.activeId;
  if (id && tabs.has(id)) return tabs.get(id);
  return tabs.get(c.tabIds[c.tabIds.length - 1]) || null;
}

/* ------------------------------------------------------------------- store */

function initStore() {
  store = new Store(path.join(app.getPath('userData'), 'profile.json'), DEFAULTS);
  if (!Array.isArray(store.get('bookmarks'))) store.set('bookmarks', []);
  if (!Array.isArray(store.get('history'))) store.set('history', []);
  if (!Array.isArray(store.get('closedTabs'))) store.set('closedTabs', []);
  if (!Array.isArray(store.get('sessionTabs'))) store.set('sessionTabs', []);
  if (!store.get('bookmarks').length) {
    store.set('bookmarks', [
      { id: 'seed-yt', title: 'YouTube', url: 'https://www.youtube.com', folder: 'Закладки' },
      { id: 'seed-wp', title: 'Википедия', url: 'https://ru.wikipedia.org', folder: 'Закладки' },
      { id: 'seed-mail', title: 'Почта Mail.ru', url: 'https://go.mail.ru', folder: 'Закладки' },
      { id: 'seed-gh', title: 'GitHub', url: 'https://github.com', folder: 'Разработка' },
    ]);
  }
}

function addHistory(url, title) {
  if (!url || isInternal(url)) return;
  const list = store.get('history');
  const last = list[0];
  if (last && last.url === url) {
    if (title) last.title = title;
    last.visitedAt = Date.now();
    return;
  }
  list.unshift({ url, title: title || hostOf(url) || url, visitedAt: Date.now() });
  if (list.length > 8000) list.length = 8000;
  store.set('history', list);
}

/* -------------------------------------------------------------- new tab page */

function newTabHtml() {
  const s = settings();
  const eng = SEARCH[s.searchEngine] || SEARCH.duckduckgo;
  const engName = SEARCH_NAMES[s.searchEngine] || 'DuckDuckGo';
  const bms = store.get('bookmarks').slice(0, 8);
  const links = bms.concat(DEFAULT_LINKS.filter((d) => !bms.some((b) => b.url === d.url))).slice(0, 10);
  const light = s.theme === 'light';
  const accent = escapeHtml(s.accent || '#3d7bfd');

  const cards = links
    .map((l) => {
      let host = '';
      try {
        host = new URL(l.url).hostname.replace(/^www\./, '');
      } catch (_) {}
      const letter = escapeHtml((host || l.title || '?').charAt(0).toUpperCase());
      const hue = (String(l.url).length * 47) % 360;
      return (
        '<a class="card" href="' +
        escapeHtml(l.url) +
        '"><span class="av" style="background:hsl(' +
        hue +
        ',55%,45%)">' +
        letter +
        '</span><span class="ct">' +
        escapeHtml(l.title) +
        '</span><span class="cu">' +
        escapeHtml(host) +
        '</span></a>'
      );
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"/><title>Новая вкладка</title>
<style>
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;
background:${light ? 'linear-gradient(160deg,#f3f6fb,#e6ebf5)' : 'linear-gradient(160deg,#141822,#0d0f14)'};
color:${light ? '#131722' : '#e7eaf2'};display:flex;align-items:center;justify-content:center;overflow:auto}
.wrap{width:min(760px,92vw);padding:40px 0}
.clock{text-align:center;margin-bottom:32px}
.time{font-size:62px;font-weight:200;letter-spacing:-2px;line-height:1}
.date{font-size:13px;opacity:.6;margin-top:6px}
form{display:flex;gap:8px;margin-bottom:32px}
input{flex:1;height:46px;border-radius:23px;border:1px solid ${light ? '#d3dae7' : '#2a3040'};
background:${light ? '#fff' : '#191d27'};color:inherit;font-size:14px;padding:0 20px;outline:none}
input:focus{border-color:${accent};box-shadow:0 0 0 3px ${accent}33}
button{height:46px;padding:0 22px;border:0;border-radius:23px;background:${accent};color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:10px}
.card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:15px 10px;border-radius:12px;text-decoration:none;
color:inherit;background:${light ? '#ffffffcc' : '#181c26'};border:1px solid ${light ? '#e0e5ef' : '#242a38'};transition:transform .15s,border-color .15s}
.card:hover{transform:translateY(-2px);border-color:${accent}}
.av{width:34px;height:34px;border-radius:10px;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
.ct{font-size:12.5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cu{font-size:10.5px;opacity:.45;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.foot{margin-top:26px;text-align:center;font-size:11px;opacity:.35}
</style></head>
<body><div class="wrap">
<div class="clock"><div class="time" id="t">--:--</div><div class="date" id="d"></div></div>
<form action="${escapeHtml(eng)}"><input type="text" name="q" placeholder="Поиск в ${escapeHtml(engName)} или адрес сайта" autofocus/><button type="submit">Найти</button></form>
<div class="grid">${cards}</div>
<div class="foot">Onyx ${escapeHtml(app.getVersion())} · введите адрес и нажмите Enter</div>
</div>
<script>
function tick(){var d=new Date();document.getElementById('t').textContent=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
document.getElementById('d').textContent=d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});}
tick();setInterval(tick,10000);
</script></body></html>`;
}

function registerProtocol() {
  protocol.handle('brauzer', (request) => {
    let u;
    try {
      u = new URL(request.url);
    } catch (_) {
      return new Response('bad request', { status: 400 });
    }
    const html = { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } };
    if (u.hostname === 'home') {
      const home = settings().homepage || '';
      if (home && !/^brauzer:/i.test(home) && /^https?:/i.test(home)) return Response.redirect(home);
      return new Response(newTabHtml(), html);
    }
    return new Response(newTabHtml(), html);
  });
}

/* ------------------------------------------------------------------ window */

function iconPath() {
  const p = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  return fs.existsSync(p) ? p : undefined;
}

function createWindow(opts) {
  opts = opts || {};
  const bounds = mainWindow ? null : store.get('windowBounds');
  const win = new BrowserWindow({
    width: (bounds && bounds.width) || (opts.width || 1280),
    height: (bounds && bounds.height) || (opts.height || 840),
    x: bounds && bounds.x,
    y: bounds && bounds.y,
    minWidth: 480,
    minHeight: 340,
    show: false,
    frame: false,
    backgroundColor: settings().theme === 'light' ? '#eef1f6' : '#12141a',
    title: 'Onyx',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  const ctx = ctxOf(win);
  if (!mainWindow) {
    mainWindow = win;
    if (store.get('windowMaximized')) win.maximize();
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    if (!quitting) win.show();
  });

  win.on('maximize', () => send('win:state', { maximized: true }, win));
  win.on('unmaximize', () => send('win:state', { maximized: false }, win));
  win.on('enter-full-screen', () => send('win:state', { fullscreen: true }, win));
  win.on('leave-full-screen', () => send('win:state', { fullscreen: false }, win));
  win.on('enter-html-full-screen', () => send('win:state', { fullscreen: true }, win));
  win.on('leave-html-full-screen', () => send('win:state', { fullscreen: false }, win));
  win.on('restore', () => send('win:state', { maximized: false }, win));

  let saveTimer = null;
  const saveBounds = () => {
    if (win !== mainWindow) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      store.set('windowBounds', win.getNormalBounds());
      store.set('windowMaximized', win.isMaximized());
      store.save();
    }, 400);
    if (saveTimer.unref) saveTimer.unref();
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('close', (e) => {
    if (quitting || win !== mainWindow) return;
    const n = ctx.tabIds.length;
    if (settings().confirmMultipleTabs && n > 1) {
      const { response } = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['Закрыть', 'Отмена'],
        defaultId: 0,
        cancelId: 1,
        title: 'Закрыть Onyx?',
        message: 'Открыто вкладок: ' + n,
        detail: 'При следующем запуске сессия восстановится.',
      });
      if (response === 1) {
        e.preventDefault();
        return;
      }
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) persistSession(true);
    contexts.delete(win.id);
    for (const id of ctx.tabIds.slice()) destroyTab(id);
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (handleShortcut(event, input, win)) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    newTab({ url, activate: true, win });
    return { action: 'deny' };
  });

  return win;
}

/* -------------------------------------------------------------------- tabs */

function newTab(opts) {
  opts = opts || {};
  const win = opts.win || mainWindow;
  if (!win || win.isDestroyed()) return null;
  const ctx = ctxOf(win);

  const id = seq++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      enableWebSQL: false,
    },
  });
  view.setBackgroundColor('#ffffff');

  const tab = {
    id,
    win,
    view,
    url: '',
    pendingUrl: '',
    title: '',
    favicon: '',
    loading: false,
    audible: false,
    canGoBack: false,
    canGoForward: false,
    zoom: Number(settings().defaultZoom) || 1,
    muted: !!settings().muteAudio,
    pinned: !!opts.pinned,
    crashed: false,
  };

  const wc = view.webContents;
  wc.setAudioMuted(tab.muted);

  wc.on('did-start-loading', () => {
    tab.loading = true;
    pushTab(id, {});
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
    pushTab(id, {});
  });
  wc.on('did-start-navigation', (_e, url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return;
    tab.pendingUrl = url;
    pushTab(id, {});
  });
  wc.on('did-navigate', (_e, url) => {
    tab.url = url;
    tab.pendingUrl = '';
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
    pushTab(id, {});
    addHistory(url, tab.title);
  });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    pushTab(id, {});
    addHistory(url, tab.title);
  });
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    pushTab(id, {});
    if (tab.url) addHistory(tab.url, title);
  });
  wc.on('page-favicon-updated', (favicons) => {
    const list = Array.isArray(favicons) ? favicons : [];
    if (!list.length) return;
    const small = list.find((u) => /32x32|16x16/.test(u)) || list[list.length - 1];
    if (small && small !== tab.favicon) {
      tab.favicon = small;
      pushTab(id, {});
    }
  });
  wc.on('media-started-playing', () => {
    tab.audible = true;
    pushTab(id, {});
  });
  wc.on('media-paused', () => {
    tab.audible = false;
    pushTab(id, {});
  });
  wc.on('render-process-gone', (_e, details) => {
    tab.crashed = !!(details && details.reason === 'crashed');
    pushTab(id, {});
  });
  wc.on('before-input-event', (event, input) => {
    if (handleShortcut(event, input, win, id)) event.preventDefault();
  });
  wc.on('context-menu', (_e, params) => {
    send(
      'page:contextmenu',
      {
        tabId: id,
        x: params.x,
        y: params.y,
        linkURL: params.linkURL || '',
        pageURL: params.pageURL || '',
        selectionText: params.selectionText || '',
        srcURL: params.srcURL || '',
        mediaType: params.mediaType || '',
      },
      win
    );
  });
  wc.setWindowOpenHandler((details) => {
    const url = details.url;
    if (/^brauzer:/i.test(url)) {
      newTab({ url, activate: true, win });
      return { action: 'deny' };
    }
    if (/^(https?|file):/i.test(url)) {
      newTab({ url, activate: details.disposition !== 'background-tab', win });
      return { action: 'deny' };
    }
    if (/^(mailto|tel|sms|geo|magnet|steam|obsidian|vscode|spotify):/i.test(url)) {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    }
    if (/^blob:/i.test(url)) return { action: 'allow' };
    return { action: 'deny' };
  });

  tabs.set(id, tab);
  win.contentView.addChildView(view);

  const index = opts.index === undefined || opts.index === null ? ctx.tabIds.length : clamp(opts.index, 0, ctx.tabIds.length);
  ctx.tabIds.splice(index, 0, id);

  loadInto(tab, opts.url || 'brauzer://newtab');
  applyLayouts();

  if (opts.activate !== false) activateTab(id, win);
  pushTab(id, {});
  send('tabs:order', ctx.tabIds, win);
  persistSession(false);
  return tab;
}

function destroyTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const win = tab.win;
  tabs.delete(id);
  const ctx = contexts.get(win.id);
  if (ctx) {
    const i = ctx.tabIds.indexOf(id);
    if (i >= 0) ctx.tabIds.splice(i, 1);
    if (ctx.activeId === id) ctx.activeId = null;
  }
  try {
    if (win && !win.isDestroyed()) win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
  } catch (_) {}
}

function closeTab(id, opts) {
  opts = opts || {};
  const tab = tabs.get(id);
  if (!tab) return;
  const win = tab.win;
  const ctx = ctxOf(win);
  const idx = ctx.tabIds.indexOf(id);

  if (!opts.noTrack && tab.url && !isInternal(tab.url)) {
    const closed = store.get('closedTabs');
    closed.unshift({ url: tab.url, title: tab.title, at: Date.now() });
    if (closed.length > 30) closed.length = 30;
    store.set('closedTabs', closed);
  }

  const wasActive = ctx.activeId === id;
  destroyTab(id);
  send('tab:removed', { id }, win);

  if (wasActive) {
    ctx.activeId = null;
    if (ctx.tabIds.length) {
      const next = ctx.tabIds[clamp(idx, 0, ctx.tabIds.length - 1)];
      activateTab(next, win);
    } else if (win === mainWindow && !quitting) {
      newTab({ activate: true, win });
    } else if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  applyLayouts();
  send('tabs:order', ctx.tabIds, win);
  persistSession(false);
}

function activateTab(id, winHint) {
  const tab = tabs.get(id);
  if (!tab) return;
  const win = winHint || tab.win;
  const ctx = ctxOf(win);
  ctx.activeId = id;
  if (!win.isDestroyed()) {
    try {
      tab.view.webContents.focus();
    } catch (_) {}
  }
  applyLayouts();
  send('tab:activated', { id }, win);
  send('tabs:order', ctx.tabIds, win);
  persistSession(false);
}

function moveTab(id, toIndex) {
  const tab = tabs.get(id);
  if (!tab) return;
  const win = tab.win;
  const ctx = ctxOf(win);
  const from = ctx.tabIds.indexOf(id);
  if (from < 0) return;
  ctx.tabIds.splice(from, 1);
  ctx.tabIds.splice(clamp(toIndex, 0, ctx.tabIds.length), 0, id);
  send('tabs:order', ctx.tabIds, win);
  persistSession(false);
}

function loadInto(tab, url) {
  try {
    tab.view.webContents.loadURL(url);
  } catch (_) {}
}

function pushTab(id, patch) {
  const tab = tabs.get(id);
  if (!tab) return;
  const ctx = contexts.get(tab.win.id);
  send(
    'tab:update',
    Object.assign(
      {
        id,
        index: ctx ? ctx.tabIds.indexOf(id) : -1,
        active: !!ctx && ctx.activeId === id,
        order: ctx ? ctx.tabIds : [],
        state: tabState(tab),
      },
      patch || {}
    ),
    tab.win
  );
}

function tabState(t) {
  return {
    url: t.url,
    pendingUrl: t.loading ? t.pendingUrl || t.url : t.url,
    title: t.title,
    favicon: t.favicon,
    loading: t.loading,
    pinned: t.pinned,
    audible: !!t.audible,
    muted: t.muted,
    zoom: t.zoom,
    canGoBack: t.canGoBack,
    canGoForward: t.canGoForward,
    crashed: !!t.crashed,
  };
}

function persistSession(force) {
  const ctx = mainWindow ? ctxOf(mainWindow) : null;
  const list = [];
  if (ctx) {
    for (const id of ctx.tabIds) {
      const t = tabs.get(id);
      if (!t) continue;
      const url = t.url || 'brauzer://newtab';
      if (isInternal(url)) continue;
      list.push({ url, title: t.title || '', pinned: !!t.pinned });
    }
  }
  store.set('sessionTabs', list);
  if (force) store.save();
}

/* ------------------------------------------------------------------ layout */

function applyLayouts() {
  for (const ctx of contexts.values()) {
    const win = ctx.win;
    if (!win || win.isDestroyed()) continue;
    const visibleTabs = !ctx.overlay && !ctx.chromeHidden;
    const { x, y, width, height } = ctx.layout;
    for (const id of ctx.tabIds) {
      const tab = tabs.get(id);
      if (!tab) continue;
      const visible = visibleTabs && id === ctx.activeId;
      try {
        tab.view.setVisible(visible);
        if (visible) {
          tab.view.setBounds({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.max(1, Math.round(width)),
            height: Math.max(1, Math.round(height)),
          });
        }
      } catch (_) {}
    }
  }
}

/* --------------------------------------------------------------- downloads */

function downloadPath(name) {
  const dir = settings().downloadDir && fs.existsSync(settings().downloadDir) ? settings().downloadDir : app.getPath('downloads');
  return path.join(dir, name || 'file');
}

function publicDownload(rec) {
  return {
    id: rec.id,
    filename: rec.filename,
    url: rec.url,
    totalBytes: rec.totalBytes,
    receivedBytes: rec.receivedBytes,
    state: rec.state,
    savePath: rec.savePath,
  };
}

function initDownloads() {
  session.defaultSession.on('will-download', (event, item, wc) => {
    let owner = mainWindow;
    for (const t of tabs.values()) {
      if (t.view.webContents === wc) {
        owner = t.win;
        break;
      }
    }
    const rec = {
      id: dseq++,
      filename: item.getFilename(),
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      savePath: '',
      item,
    };
    downloads.set(rec.id, rec);
    send('download:new', publicDownload(rec), owner);

    if (settings().askDownloadLocation) {
      event.preventDefault();
      dialog
        .showSaveDialog(owner, { defaultPath: downloadPath(rec.filename) })
        .then((res) => {
          if (!res || !res.filePath) {
            item.cancel();
            rec.state = 'cancelled';
            send('download:update', publicDownload(rec), owner);
            return;
          }
          rec.savePath = res.filePath;
          item.setSavePath(res.filePath);
          send('download:update', publicDownload(rec), owner);
        })
        .catch(() => {});
    }

    item.on('updated', () => {
      rec.receivedBytes = item.getReceivedBytes();
      rec.totalBytes = item.getTotalBytes();
      if (item.getState() === 'progressing') rec.state = 'progressing';
      send('download:update', publicDownload(rec), owner);
    });
    item.once('done', (_e, state) => {
      rec.state = state;
      rec.receivedBytes = item.getReceivedBytes();
      rec.totalBytes = item.getTotalBytes();
      rec.savePath = item.getSavePath() || rec.savePath;
      if (state === 'completed' && rec.savePath) shell.showItemInFolder(rec.savePath);
      send('download:update', publicDownload(rec), owner);
    });
  });
}

/* -------------------------------------------------------------------- zoom */

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function zoomTab(id, dir) {
  const t = tabs.get(id);
  if (!t) return;
  let z = t.zoom;
  if (dir === 'reset') z = Number(settings().defaultZoom) || 1;
  else {
    const i = ZOOMS.findIndex((v) => Math.abs(v - z) < 0.001);
    const base = i < 0 ? ZOOMS.indexOf(1) : i;
    z = ZOOMS[clamp(base + (dir === 'in' ? 1 : -1), 0, ZOOMS.length - 1)];
  }
  t.zoom = z;
  try {
    t.view.webContents.setZoomFactor(z);
  } catch (_) {}
  pushTab(id, {});
}

function applyZoomToAll(z) {
  for (const t of tabs.values()) {
    t.zoom = z;
    try {
      t.view.webContents.setZoomFactor(z);
    } catch (_) {}
    pushTab(t.id, {});
  }
}

/* ---------------------------------------------------------------- sessions */

function initSession(ses) {
  const ok = ['fullscreen', 'notifications', 'clipboard-sanitized-write', 'media', 'geolocation', 'midi', 'pointerLock', 'idle-detection', 'window-management', 'clipboard-read'];
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ok.includes(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ok.includes(permission));
}

/* --------------------------------------------------------------- settings */

function applySettings(patch) {
  const prev = settings();
  store.set('settings', Object.assign({}, prev, patch || {}));
  const s = settings();
  nativeTheme.themeSource = s.theme === 'light' ? 'light' : s.theme === 'dark' ? 'dark' : 'system';
  for (const ctx of contexts.values()) send('theme:changed', { theme: s.theme, accent: s.accent }, ctx.win);
  if (Number(prev.defaultZoom) !== Number(s.defaultZoom)) applyZoomToAll(Number(s.defaultZoom) || 1);
  if (prev.muteAudio !== s.muteAudio) {
    for (const t of tabs.values()) {
      t.muted = s.muteAudio;
      try {
        t.view.webContents.setAudioMuted(s.muteAudio);
      } catch (_) {}
      pushTab(t.id, {});
    }
  }
  store.save();
}

function clearBrowsingData(what) {
  const ses = session.defaultSession;
  if (what.history !== false) {
    store.set('history', []);
    store.save();
    for (const ctx of contexts.values()) send('history:cleared', {}, ctx.win);
  }
  const jobs = [ses.clearCache()];
  if (what.cookies) {
    jobs.push(ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage'] }));
    jobs.push(ses.clearAuthCache());
    jobs.push(ses.clearHostResolverCache());
  }
  return Promise.all(jobs).then(() => ({ ok: true }));
}

/* -------------------------------------------------------------- shortcuts */

function newWindow() {
  const win = createWindow({ width: 1100, height: 760 });
  win.once('ready-to-show', () => {
    win.show();
    newTab({ activate: true, win, url: 'brauzer://newtab' });
  });
  return win;
}

function doReload(id, hard) {
  const t = tabs.get(id);
  if (!t) return;
  if (hard) t.view.webContents.reloadIgnoringCache();
  else t.view.webContents.reload();
}

function goBack(id) {
  const t = tabs.get(id);
  if (!t) return;
  const nh = t.view.webContents.navigationHistory;
  if (nh.canGoBack()) nh.goBack();
}

function goForward(id) {
  const t = tabs.get(id);
  if (!t) return;
  const nh = t.view.webContents.navigationHistory;
  if (nh.canGoForward()) nh.goForward();
}

function cycleTab(win, dir) {
  const ctx = ctxOf(win);
  if (!ctx.tabIds.length) return;
  const i = ctx.tabIds.indexOf(ctx.activeId);
  const n = (i + dir + ctx.tabIds.length) % ctx.tabIds.length;
  activateTab(ctx.tabIds[n], win);
}

function restoreClosedTab(win) {
  const closed = store.get('closedTabs');
  const item = closed.shift();
  store.set('closedTabs', closed);
  const ctx = ctxOf(win);
  const index = ctx.activeId ? ctx.tabIds.indexOf(ctx.activeId) + 1 : ctx.tabIds.length;
  newTab({ url: item ? item.url : 'brauzer://newtab', activate: true, win, index });
  send('toast', { text: item ? 'Вкладка восстановлена' : 'Нет недавних вкладок' }, win);
}

function doPrint(id) {
  const t = tabs.get(id);
  if (!t) return;
  t.view.webContents.print({ silent: false, printBackground: true });
}

function doSavePage(id) {
  const t = tabs.get(id);
  if (!t || !t.url) return;
  const wc = t.view.webContents;
  const name = (t.title || hostOf(t.url) || 'страница').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  dialog
    .showSaveDialog(t.win, { defaultPath: downloadPath(name + '.html'), filters: [{ name: 'HTML-файл', extensions: ['html'] }] })
    .then((res) => {
      if (res && res.filePath) wc.savePage(res.filePath).catch(() => {});
    })
    .catch(() => {});
}

function handleShortcut(event, input, win, forcedTabId) {
  if (!win || win.isDestroyed()) return false;
  if (input.type !== 'keyDown') return false;
  const k = input.key;
  const code = input.code || '';
  const c = input.control || input.meta;
  const shift = input.shift;
  const alt = input.alt;
  const ctx = ctxOf(win);
  const id = forcedTabId || ctx.activeId;
  const t = tabs.get(id);

  if (k === 'F11' && !c) {
    win.setFullScreen(!win.isFullScreen());
    return true;
  }
  if (k === 'F10' && !c) {
    ctx.chromeHidden = !ctx.chromeHidden;
    send('chrome:toggled', { hidden: ctx.chromeHidden }, win);
    applyLayouts();
    return true;
  }
  if ((k === 'F5' || k === 'F6') && !c) {
    if (k === 'F6') send('ui:command', { command: 'focusAddress', selectAll: true }, win);
    else doReload(id, shift);
    return true;
  }
  if (k === 'F3') {
    send('find:command', { next: !shift }, win);
    return true;
  }
  if (k === 'F12' && !c) {
    if (t) t.view.webContents.toggleDevTools();
    return true;
  }
  if (k === 'Tab' && c) {
    cycleTab(win, shift ? -1 : 1);
    return true;
  }
  if (code === 'PageDown' && c) {
    cycleTab(win, 1);
    return true;
  }
  if (code === 'PageUp' && c) {
    cycleTab(win, -1);
    return true;
  }
  if (code === 'Delete' && c && shift) {
    send('ui:overlay', { open: 'clearData' }, win);
    return true;
  }
  if (k === 'ArrowLeft' && alt) {
    goBack(id);
    return true;
  }
  if (k === 'ArrowRight' && alt) {
    goForward(id);
    return true;
  }
  if (k === 'Home' && alt) {
    if (t) loadInto(t, 'brauzer://home');
    return true;
  }

  if (!c) return false;

  if (code === 'KeyT' && shift) {
    restoreClosedTab(win);
    return true;
  }
  if (code === 'KeyN') {
    newWindow();
    return true;
  }
  if (code === 'KeyW') {
    if (t) closeTab(id);
    else win.close();
    return true;
  }
  if (code === 'KeyQ') {
    quitting = true;
    app.quit();
    return true;
  }
  if (code === 'KeyL' || code === 'KeyE') {
    send('ui:command', { command: 'focusAddress', selectAll: true }, win);
    return true;
  }
  if (code === 'KeyK' && !shift) {
    send('ui:command', { command: 'focusAddress', selectAll: false, search: true }, win);
    return true;
  }
  if (code === 'KeyJ') {
    if (shift) send('ui:overlay', { open: 'settings' }, win);
    else send('ui:overlay', { open: 'downloads' }, win);
    return true;
  }
  if (code === 'KeyH') {
    send('ui:overlay', { open: 'history' }, win);
    return true;
  }
  if (code === 'KeyO' && shift) {
    send('ui:overlay', { open: 'bookmarks' }, win);
    return true;
  }
  if (code === 'KeyD') {
    send('ui:command', { command: 'bookmarkCurrent' }, win);
    return true;
  }
  if (code === 'KeyB' && shift) {
    applySettings({ showBookmarksBar: !settings().showBookmarksBar });
    return true;
  }
  if ((code === 'KeyI' || code === 'KeyC') && shift) {
    if (t) t.view.webContents.toggleDevTools();
    return true;
  }
  if (code === 'KeyM' && shift) {
    if (t) {
      t.muted = !t.muted;
      t.view.webContents.setAudioMuted(t.muted);
      pushTab(id, {});
    }
    return true;
  }
  if (code === 'KeyF') {
    send('ui:command', { command: 'openFind' }, win);
    return true;
  }
  if (code === 'KeyG') {
    send('find:command', { next: !shift }, win);
    return true;
  }
  if (code === 'KeyP') {
    doPrint(id);
    return true;
  }
  if (code === 'KeyS') {
    doSavePage(id);
    return true;
  }
  if (code === 'Comma') {
    send('ui:overlay', { open: 'settings' }, win);
    return true;
  }
  if (code === 'Equal' || k === '+' || code === 'NumpadAdd') {
    zoomTab(id, 'in');
    return true;
  }
  if (code === 'Minus' || code === 'NumpadSubtract') {
    zoomTab(id, 'out');
    return true;
  }
  if (code === 'Digit0' || code === 'Numpad0') {
    zoomTab(id, 'reset');
    return true;
  }
  if (code === 'Digit9') {
    const last = ctx.tabIds[ctx.tabIds.length - 1];
    if (last) activateTab(last, win);
    return true;
  }
  if (code === 'KeyR') {
    doReload(id, shift);
    return true;
  }
  if (code === 'BracketRight') {
    goForward(id);
    return true;
  }
  if (code === 'BracketLeft') {
    goBack(id);
    return true;
  }
  if (/^Digit[1-9]$/.test(code)) {
    const target = ctx.tabIds[Number(code.slice(5)) - 1];
    if (target) activateTab(target, win);
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------- menu */

function buildAppMenu() {
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    {
      label: 'Файл',
      submenu: [
        { label: 'Новая вкладка', accelerator: 'CmdOrCtrl+T', click: () => mainWindow && newTab({ activate: true, win: mainWindow }) },
        { label: 'Новое окно', accelerator: 'CmdOrCtrl+N', click: () => newWindow() },
        { label: 'Восстановить закрытую вкладку', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow && restoreClosedTab(mainWindow) },
        { type: 'separator' },
        { label: 'Сохранить страницу…', accelerator: 'CmdOrCtrl+S', click: () => mainWindow && doSavePage(ctxOf(mainWindow).activeId) },
        { label: 'Печать…', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && doPrint(ctxOf(mainWindow).activeId) },
        { type: 'separator' },
        IS_MAC ? { role: 'close' } : { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
        { type: 'separator' },
        { label: 'Найти на странице…', accelerator: 'CmdOrCtrl+F', click: () => mainWindow && send('ui:command', { command: 'openFind' }, mainWindow) },
        { label: 'Добавить закладку', accelerator: 'CmdOrCtrl+D', click: () => mainWindow && send('ui:command', { command: 'bookmarkCurrent' }, mainWindow) },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: () => mainWindow && goBack(ctxOf(mainWindow).activeId) },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: () => mainWindow && goForward(ctxOf(mainWindow).activeId) },
        { label: 'Обновить', accelerator: 'F5', click: () => mainWindow && doReload(ctxOf(mainWindow).activeId, false) },
        { label: 'Очистить кэш и перезагрузить', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow && doReload(ctxOf(mainWindow).activeId, true) },
        { type: 'separator' },
        { label: 'Увеличить масштаб', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow && zoomTab(ctxOf(mainWindow).activeId, 'in') },
        { label: 'Уменьшить масштаб', accelerator: 'CmdOrCtrl+-', click: () => mainWindow && zoomTab(ctxOf(mainWindow).activeId, 'out') },
        { label: 'Масштаб 100%', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && zoomTab(ctxOf(mainWindow).activeId, 'reset') },
        { type: 'separator' },
        { label: 'Полный экран', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Скрыть панель Onyxа', accelerator: 'F10', click: () => {
          const c = ctxOf(mainWindow);
          if (!c) return;
          c.chromeHidden = !c.chromeHidden;
          send('chrome:toggled', { hidden: c.chromeHidden }, mainWindow);
          applyLayouts();
        } },
        { type: 'separator' },
        { label: 'Панель закладок', accelerator: 'CmdOrCtrl+Shift+B', click: () => applySettings({ showBookmarksBar: !settings().showBookmarksBar }) },
        { label: 'Закладки', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow && send('ui:overlay', { open: 'bookmarks' }, mainWindow) },
        { label: 'История', accelerator: 'CmdOrCtrl+H', click: () => mainWindow && send('ui:overlay', { open: 'history' }, mainWindow) },
        { label: 'Загрузки', accelerator: 'CmdOrCtrl+J', click: () => mainWindow && send('ui:overlay', { open: 'downloads' }, mainWindow) },
      ],
    },
    {
      label: 'Переход',
      submenu: [
        { label: 'Домашняя страница', accelerator: 'Alt+Home', click: () => {
          const id = mainWindow && ctxOf(mainWindow).activeId;
          const t = tabs.get(id);
          if (t) loadInto(t, 'brauzer://home');
        } },
        { label: 'Следующая вкладка', accelerator: 'Ctrl+Tab', click: () => mainWindow && cycleTab(mainWindow, 1) },
        { label: 'Предыдущая вкладка', accelerator: 'Ctrl+Shift+Tab', click: () => mainWindow && cycleTab(mainWindow, -1) },
        { type: 'separator' },
        { label: 'Очистить данные', accelerator: 'CmdOrCtrl+Shift+Delete', click: () => mainWindow && send('ui:overlay', { open: 'clearData' }, mainWindow) },
        { label: 'Настройки', accelerator: 'CmdOrCtrl+,', click: () => mainWindow && send('ui:overlay', { open: 'settings' }, mainWindow) },
      ],
    },
    {
      label: 'Инструменты',
      submenu: [
        { label: 'Инструменты разработчика', accelerator: 'F12', click: () => {
          const t = tabs.get(mainWindow && ctxOf(mainWindow).activeId);
          if (t) t.view.webContents.toggleDevTools();
        } },
        { label: 'Показать код страницы', click: () => {
          const t = tabs.get(mainWindow && ctxOf(mainWindow).activeId);
          if (t && t.url) newTab({ url: 'view-source:' + t.url, activate: true, win: mainWindow });
        } },
        { label: 'Очистить данные…', click: () => mainWindow && send('ui:overlay', { open: 'clearData' }, mainWindow) },
      ],
    },
    {
      label: 'Справка',
      submenu: [
        { label: 'О Onyxе', click: () => mainWindow && send('ui:overlay', { open: 'about' }, mainWindow) },
        { label: 'Chromium: что внутри', click: () => newTab({ url: 'https://www.chromium.org/Home', activate: true, win: mainWindow }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* --------------------------------------------------------------------- IPC */

function registerIpc() {
  ipcMain.handle('state:get', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const ctx = ctxOf(win);
    return {
      settings: settings(),
      bookmarks: store.get('bookmarks'),
      history: store.get('history').slice(0, 2000),
      closedTabs: store.get('closedTabs'),
      tabs: ctx.tabIds.map((id) => {
        const t = tabs.get(id);
        return Object.assign({ id, active: id === ctx.activeId }, tabState(t));
      }),
      activeId: ctx.activeId,
      downloads: Array.from(downloads.values()),
      version: app.getVersion(),
      platform: process.platform,
      downloadDir: settings().downloadDir || app.getPath('downloads'),
    };
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userData: app.getPath('userData'),
  }));

  ipcMain.handle('tab:new', (e, opts) => {
    opts = opts || {};
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const ctx = ctxOf(win);
    const index = opts.index === undefined || opts.index === null ? ctx.tabIds.length : opts.index;
    const tab = newTab({
      url: opts.url || 'brauzer://newtab',
      activate: !opts.background,
      pinned: opts.pinned,
      win,
      index,
    });
    return tab ? tab.id : null;
  });

  ipcMain.handle('tab:close', (_e, id) => {
    closeTab(id);
    return true;
  });
  ipcMain.handle('tab:activate', (_e, id) => {
    activateTab(id);
    return true;
  });
  ipcMain.handle('tab:move', (_e, { id, index }) => {
    moveTab(id, index);
    return true;
  });
  ipcMain.handle('tab:pin', (_e, id) => {
    const t = tabs.get(id);
    if (!t) return false;
    t.pinned = !t.pinned;
    pushTab(id, {});
    persistSession(false);
    return t.pinned;
  });
  ipcMain.handle('tab:duplicate', (_e, id) => {
    const t = tabs.get(id);
    if (!t) return null;
    const ctx = ctxOf(t.win);
    const nt = newTab({ url: t.url || 'brauzer://newtab', win: t.win, index: ctx.tabIds.indexOf(id) + 1 });
    return nt ? nt.id : null;
  });
  ipcMain.handle('tab:mute', (_e, id) => {
    const t = tabs.get(id);
    if (!t) return false;
    t.muted = !t.muted;
    t.view.webContents.setAudioMuted(t.muted);
    pushTab(id, {});
    return t.muted;
  });
  ipcMain.handle('tab:closeOthers', (_e, id) => {
    const t = tabs.get(id);
    if (!t) return false;
    for (const other of ctxOf(t.win).tabIds.slice()) if (other !== id) closeTab(other, { noTrack: true });
    return true;
  });
  ipcMain.handle('tab:closeRight', (_e, id) => {
    const t = tabs.get(id);
    if (!t) return false;
    const ctx = ctxOf(t.win);
    for (const other of ctx.tabIds.slice(ctx.tabIds.indexOf(id) + 1)) closeTab(other, { noTrack: true });
    return true;
  });
  ipcMain.handle('tabs:restoreClosed', (e) => {
    restoreClosedTab(BrowserWindow.fromWebContents(e.sender) || mainWindow);
    return true;
  });

  ipcMain.handle('nav:back', (_e, id) => (goBack(id), true));
  ipcMain.handle('nav:forward', (_e, id) => (goForward(id), true));
  ipcMain.handle('nav:reload', (_e, { id, hard }) => (doReload(id, !!hard), true));
  ipcMain.handle('nav:stop', (_e, id) => {
    const t = tabs.get(id);
    if (t) t.view.webContents.stop();
    return true;
  });
  ipcMain.handle('nav:go', (e, { id, text, asNew }) => {
    const url = normalizeInput(text);
    if (!url) return false;
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    if (asNew) {
      const ctx = ctxOf(win);
      newTab({ url, activate: true, win, index: id ? ctx.tabIds.indexOf(id) + 1 : ctx.tabIds.length });
    } else {
      const t = tabs.get(id);
      if (!t) return false;
      loadInto(t, url);
      try {
        t.view.webContents.focus();
      } catch (_) {}
    }
    return url;
  });
  ipcMain.handle('nav:home', (_e, id) => {
    const t = tabs.get(id);
    if (t) loadInto(t, 'brauzer://home');
    return true;
  });

  ipcMain.handle('page:find', (_e, { id, query, forward }) => {
    const t = tabs.get(id);
    if (!t) return { matches: 0, activeMatchOrdinal: 0 };
    if (!query) {
      t.view.webContents.stopFindInPage('clearSelection');
      return { matches: 0, activeMatchOrdinal: 0 };
    }
    return t.view.webContents.findInPage(query, { forward: forward !== false, findNext: false });
  });
  ipcMain.handle('page:stopFind', (_e, { id, action }) => {
    const t = tabs.get(id);
    if (t) t.view.webContents.stopFindInPage(action || 'clearSelection');
    return true;
  });
  ipcMain.handle('page:zoom', (_e, { id, dir }) => (zoomTab(id, dir), true));
  ipcMain.handle('page:zoomGet', (_e, id) => (tabs.get(id) ? tabs.get(id).zoom : 1));
  ipcMain.handle('page:print', (_e, id) => (doPrint(id), true));
  ipcMain.handle('page:save', (_e, id) => (doSavePage(id), true));
  ipcMain.handle('page:devtools', (_e, id) => {
    const t = tabs.get(id);
    if (t) t.view.webContents.toggleDevTools();
    return true;
  });
  ipcMain.handle('page:source', (_e, id) => {
    const t = tabs.get(id);
    if (!t || !t.url) return false;
    newTab({ url: 'view-source:' + t.url, activate: true, win: t.win });
    return true;
  });
  ipcMain.handle('page:external', (_e, id) => {
    const t = tabs.get(id);
    if (!t || !t.url) return false;
    shell.openExternal(t.url);
    return true;
  });

  ipcMain.handle('page:bookmark', (_e, { url, title }) => {
    if (!url) return { added: false };
    const list = store.get('bookmarks');
    const existing = list.find((b) => b.url === url);
    if (existing) return { added: false, bookmark: existing };
    const bm = { id: 'bm-' + Date.now().toString(36), url, title: title || hostOf(url) || url, folder: 'Закладки', at: Date.now() };
    list.unshift(bm);
    store.set('bookmarks', list);
    store.save();
    return { added: true, bookmark: bm };
  });
  ipcMain.handle('page:bookmarkRemove', (_e, url) => {
    store.set('bookmarks', store.get('bookmarks').filter((b) => b.url !== url));
    store.save();
    return store.get('bookmarks');
  });
  ipcMain.handle('bookmarks:save', (_e, list) => {
    store.set('bookmarks', list || []);
    store.save();
    return true;
  });

  ipcMain.handle('history:remove', (_e, url) => {
    store.set('history', store.get('history').filter((h) => h.url !== url));
    return store.get('history');
  });
  ipcMain.handle('history:clear', () => {
    store.set('history', []);
    store.save();
    for (const ctx of contexts.values()) send('history:cleared', {}, ctx.win);
    return true;
  });
  ipcMain.handle('data:clear', (_e, what) => clearBrowsingData(what || {}));

  ipcMain.handle('settings:save', (_e, patch) => {
    applySettings(patch || {});
    return settings();
  });
  ipcMain.handle('settings:reset', () => {
    store.set('settings', DEFAULTS.settings);
    applySettings(DEFAULTS.settings);
    return settings();
  });

  ipcMain.handle('downloads:list', () => Array.from(downloads.values()).map(publicDownload));
  ipcMain.handle('downloads:clear', () => {
    for (const rec of downloads.values()) if (rec.state !== 'progressing') downloads.delete(rec.id);
    const list = Array.from(downloads.values());
    for (const ctx of contexts.values()) send('downloads:cleared', {}, ctx.win);
    return list.map(publicDownload);
  });
  ipcMain.handle('downloads:open', (_e, id) => {
    const rec = downloads.get(id);
    if (rec && rec.savePath) shell.openPath(rec.savePath);
    return true;
  });
  ipcMain.handle('downloads:show', (_e, id) => {
    const rec = downloads.get(id);
    if (rec && rec.savePath) shell.showItemInFolder(rec.savePath);
    return true;
  });
  ipcMain.handle('downloads:cancel', (_e, id) => {
    const rec = downloads.get(id);
    if (rec && rec.item && rec.state === 'progressing') {
      rec.item.cancel();
      return true;
    }
    return false;
  });
  ipcMain.handle('downloads:chooseDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return !res.canceled && res.filePaths.length ? res.filePaths[0] : '';
  });
  ipcMain.handle('downloads:defaultDir', () => app.getPath('downloads'));

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return true;
  });
  ipcMain.handle('shell:showItem', (_e, p) => {
    if (p) shell.showItemInFolder(p);
    return true;
  });

  ipcMain.handle('ui:layout', (e, rect) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const ctx = ctxOf(win);
    ctx.layout = rect || ctx.layout;
    applyLayouts();
    return true;
  });
  ipcMain.handle('ui:overlay', (e, open) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    ctxOf(win).overlay = !!open;
    applyLayouts();
    return true;
  });
  ipcMain.handle('ui:newWindow', () => (newWindow(), true));
  ipcMain.handle('ui:newtab', (e, opts) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    newTab(Object.assign({ win }, opts || {}, { activate: true }));
    return true;
  });
  ipcMain.handle('ui:window', (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    if (!win) return { maximized: false, fullscreen: false };
    const ctx = ctxOf(win);
    switch (action) {
      case 'minimize':
        win.minimize();
        break;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;
      case 'close':
        win.close();
        break;
      case 'fullscreen':
        win.setFullScreen(!win.isFullScreen());
        break;
      case 'chromeToggle':
        ctx.chromeHidden = !ctx.chromeHidden;
        send('chrome:toggled', { hidden: ctx.chromeHidden }, win);
        applyLayouts();
        break;
      default:
        break;
    }
    return { maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
  });
  ipcMain.handle('window:state', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    return { maximized: win ? win.isMaximized() : false, fullscreen: win ? win.isFullScreen() : false };
  });
  ipcMain.handle('session:save', () => (persistSession(true), true));
}

/* ------------------------------------------------------------------- boot */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.dima.brauzer');
    initStore();
    registerProtocol();
    initSession(session.defaultSession);
    initDownloads();
    registerIpc();

    const win = createWindow();
    const restore = store.get('sessionTabs');
    if (settings().restoreSession && Array.isArray(restore) && restore.length) {
      restore.slice(0, 20).forEach((it, i) => {
        newTab({ url: it.url, pinned: it.pinned, activate: i === 0, win, index: i });
      });
    } else {
      newTab({ url: 'brauzer://newtab', activate: true, win });
    }

    nativeTheme.themeSource = settings().theme === 'light' ? 'light' : settings().theme === 'dark' ? 'dark' : 'system';
    buildAppMenu();
    applyLayouts();
  });

  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      win.once('ready-to-show', () => newTab({ activate: true, win, url: 'brauzer://newtab' }));
    }
  });

  app.on('before-quit', () => {
    quitting = true;
    persistSession(true);
    if (settings().clearOnExit) {
      session.defaultSession.clearStorageData().catch(() => {});
      session.defaultSession.clearCache().catch(() => {});
    }
    store.save();
  });
}