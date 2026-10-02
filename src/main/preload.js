'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();

function on(channel, cb) {
  const wrapped = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, wrapped);
  listeners.set(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  getState: () => ipcRenderer.invoke('state:get'),
  appInfo: () => ipcRenderer.invoke('app:info'),

  tab: {
    new: (opts) => ipcRenderer.invoke('tab:new', opts || {}),
    close: (id) => ipcRenderer.invoke('tab:close', id),
    activate: (id) => ipcRenderer.invoke('tab:activate', id),
    move: (id, index) => ipcRenderer.invoke('tab:move', { id, index }),
    pin: (id) => ipcRenderer.invoke('tab:pin', id),
    duplicate: (id) => ipcRenderer.invoke('tab:duplicate', id),
    mute: (id) => ipcRenderer.invoke('tab:mute', id),
    closeOthers: (id) => ipcRenderer.invoke('tab:closeOthers', id),
    closeRight: (id) => ipcRenderer.invoke('tab:closeRight', id),
    restoreClosed: () => ipcRenderer.invoke('tabs:restoreClosed'),
  },

  nav: {
    back: (id) => ipcRenderer.invoke('nav:back', id),
    forward: (id) => ipcRenderer.invoke('nav:forward', id),
    reload: (id, hard) => ipcRenderer.invoke('nav:reload', { id, hard }),
    stop: (id) => ipcRenderer.invoke('nav:stop', id),
    go: (id, text, asNew) => ipcRenderer.invoke('nav:go', { id, text, newTab: asNew }),
    home: (id) => ipcRenderer.invoke('nav:home', id),
  },

  page: {
    find: (id, query, forward) => ipcRenderer.invoke('page:find', { id, query, forward }),
    stopFind: (id, action) => ipcRenderer.invoke('page:stopFind', { id, action }),
    zoom: (id, dir) => ipcRenderer.invoke('page:zoom', { id, dir }),
    zoomGet: (id) => ipcRenderer.invoke('page:zoomGet', id),
    print: (id) => ipcRenderer.invoke('page:print', id),
    save: (id) => ipcRenderer.invoke('page:save', id),
    devtools: (id) => ipcRenderer.invoke('page:devtools', id),
    source: (id) => ipcRenderer.invoke('page:source', id),
    copyText: (id) => ipcRenderer.invoke('page:copyText', id),
    external: (id) => ipcRenderer.invoke('page:external', id),
    bookmark: (url, title) => ipcRenderer.invoke('page:bookmark', { url, title }),
    bookmarkRemove: (url) => ipcRenderer.invoke('page:bookmarkRemove', url),
  },

  history: {
    remove: (url) => ipcRenderer.invoke('history:remove', url),
    clear: () => ipcRenderer.invoke('history:clear'),
  },

  bookmarks: {
    save: (list) => ipcRenderer.invoke('bookmarks:save', list),
  },

  data: {
    clear: (what) => ipcRenderer.invoke('data:clear', what || {}),
  },

  settings: {
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    clear: () => ipcRenderer.invoke('downloads:clear'),
    open: (id) => ipcRenderer.invoke('downloads:open', id),
    show: (id) => ipcRenderer.invoke('downloads:show', id),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    chooseDir: () => ipcRenderer.invoke('downloads:chooseDir'),
    defaultDir: () => ipcRenderer.invoke('downloads:defaultDir'),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  },

  ui: {
    layout: (rect) => ipcRenderer.invoke('ui:layout', rect),
    overlay: (open) => ipcRenderer.invoke('ui:overlay', open),
    newWindow: () => ipcRenderer.invoke('ui:newWindow'),
    newtab: (opts) => ipcRenderer.invoke('ui:newtab', opts || {}),
    window: (action) => ipcRenderer.invoke('ui:window', action),
    windowState: () => ipcRenderer.invoke('window:state'),
    saveSession: () => ipcRenderer.invoke('session:save'),
  },

  on: {
    tabUpdate: (cb) => on('tab:update', cb),
    tabRemoved: (cb) => on('tab:removed', cb),
    tabActivated: (cb) => on('tab:activated', cb),
    tabsOrder: (cb) => on('tabs:order', cb),
    navState: (cb) => on('nav:state', cb),
    downloadNew: (cb) => on('download:new', cb),
    downloadUpdate: (cb) => on('download:update', cb),
    downloadsCleared: (cb) => on('downloads:cleared', cb),
    uiCommand: (cb) => on('ui:command', cb),
    uiOverlay: (cb) => on('ui:overlay', cb),
    uiNewtab: (cb) => on('ui:newtab', cb),
    findResult: (cb) => on('find:result', cb),
    findCommand: (cb) => on('find:command', cb),
    pageContextMenu: (cb) => on('page:contextmenu', cb),
    themeChanged: (cb) => on('theme:changed', cb),
    chromeToggled: (cb) => on('chrome:toggled', cb),
    winState: (cb) => on('win:state', cb),
    toast: (cb) => on('toast', cb),
    historyCleared: (cb) => on('history:cleared', cb),
    zoomChanged: (cb) => on('zoom:changed', cb),
  },
};

contextBridge.exposeInMainWorld('bz', api);