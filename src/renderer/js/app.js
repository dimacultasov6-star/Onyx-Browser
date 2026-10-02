'use strict';

(function () {
  const api = window.bz;
  const S = BZ.state;

  /* ------------------------------------------------------- theme */
  BZ.applyTheme = function (theme, accent) {
    const app = BZ.$('#app');
    const t = theme || S.settings.theme || 'dark';
    const a = accent || S.settings.accent || '#3d7bfd';
    app.classList.remove('theme-dark', 'theme-light');
    const isLight = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
    app.classList.add(isLight ? 'theme-light' : 'theme-dark');
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-soft', a + '2e');
    document.documentElement.style.background = isLight ? '#eef1f6' : '#0f1116';
  };

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => BZ.applyTheme());

  /* ------------------------------------------------------- layout */
  const layoutDebounced = BZ.debounce(function () {
    const area = BZ.$('#webarea');
    const r = area.getBoundingClientRect();
    api.ui.layout({ x: r.left, y: r.top, width: r.width, height: r.height });
  }, 16);

  BZ.layout = layoutDebounced;

  /* ------------------------------------------------------- toolbar */
  BZ.syncToolbar = function () {
    const tab = BZ.activeTab();
    const back = BZ.$('#btnBack');
    const fwd = BZ.$('#btnForward');
    const reload = BZ.$('#btnReload');
    const home = BZ.$('#btnHome');
    home.style.display = S.settings.homepageButton === false ? 'none' : '';
    if (!tab) {
      back.disabled = true;
      fwd.disabled = true;
      return;
    }
    back.disabled = !tab.canGoBack;
    fwd.disabled = !tab.canGoForward;
    reload.title = tab.loading ? 'Остановить (Esc)' : 'Обновить (F5)';
    reload.innerHTML = tab.loading
      ? '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    reload.classList.toggle('active', !!tab.loading);
  };

  BZ.setTitle = function () {
    const tab = BZ.activeTab();
    const name = tab && tab.title ? tab.title + ' — ' : '';
    document.title = name + 'БРАУЗЕР';
    const hint = BZ.$('#tbSearchHint');
    hint.textContent = '';
  };

  BZ.$('#btnBack').addEventListener('click', () => api.nav.back(S.activeId));
  BZ.$('#btnForward').addEventListener('click', () => api.nav.forward(S.activeId));
  BZ.$('#btnReload').addEventListener('click', () => {
    const tab = BZ.activeTab();
    if (!tab) return;
    if (tab.loading) api.nav.stop(tab.id);
    else api.nav.reload(tab.id);
  });
  BZ.$('#btnHome').addEventListener('click', () => api.nav.home(S.activeId));
  BZ.$('#btnNewTab').addEventListener('click', () => api.tab.new({}));
  BZ.$('#btnHistory').addEventListener('click', () => BZ.overlays.open('history'));
  BZ.$('#btnBookmarksPanel').addEventListener('click', () => BZ.overlays.open('bookmarks'));
  BZ.$('#btnDownloads').addEventListener('click', () => BZ.openDownloads());

  BZ.$('#btnStar').addEventListener('click', async () => {
    const tab = BZ.activeTab();
    if (!tab || !tab.url) return;
    if (S.bookmarks.some((b) => b.url === tab.url)) {
      await BZ.removeBookmark(tab.url);
      BZ.toast('Закладка удалена');
    } else {
      const r = await api.page.bookmark(tab.url, tab.title);
      if (r.added) {
        S.bookmarks.unshift(r.bookmark);
        BZ.renderBookmarksBar();
        BZ.toast('Закладка добавлена');
      }
    }
    BZ.address.update();
  });

  /* ------------------------------------------------------- zoom menu */
  BZ.$('#btnZoom').addEventListener('click', () => {
    BZ.hideMenus();
    const tab = BZ.activeTab();
    const cur = Math.round((tab ? tab.zoom : 1) * 100);
    const m = BZ.menu(
      BZ.$('#btnZoom'),
      [
        { label: 'Увеличить (Ctrl++)', icon: BZ.ICONS.zoomIn, action: () => api.page.zoom(S.activeId, 'in') },
        { label: 'Уменьшить (Ctrl+-)', icon: BZ.ICONS.zoomOut, action: () => api.page.zoom(S.activeId, 'out') },
        '-',
        { label: 'Восстановить 100%', action: () => api.page.zoom(S.activeId, 'reset') },
        '-',
        { title: 'Масштаб: ' + cur + '%' },
        ...[50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200].map((z) => ({
          label: z + '%',
          kbd: z === cur ? '•' : '',
          action: () => {
            api.page.zoom(S.activeId, 'reset');
            for (let i = 0; i < Math.abs(z - 100) / 10; i++) {
              setTimeout(() => api.page.zoom(S.activeId, z > 100 ? 'in' : 'out'), i * 30);
            }
          },
        })),
      ],
      { align: 'right' }
    );
    m.classList.remove('hidden');
  });

  /* ------------------------------------------------------- page menu */
  BZ.$('#btnPageMenu').addEventListener('click', () => {
    const tab = BZ.activeTab();
    if (!tab) return;
    const m = BZ.menu(
      BZ.$('#btnPageMenu'),
      [
        { label: 'Новая вкладка', icon: BZ.ICONS.plus, kbd: 'Ctrl+T', action: () => api.tab.new({}) },
        { label: 'Новое окно', icon: BZ.ICONS.ext, kbd: 'Ctrl+N', action: () => api.ui.newWindow() },
        { label: 'Дублировать вкладку', icon: BZ.ICONS.copy, action: () => api.tab.duplicate(tab.id) },
        '-',
        {
          label: S.bookmarks.some((b) => b.url === tab.url) ? 'Убрать из закладок' : 'Добавить в закладки',
          icon: BZ.ICONS.star,
          kbd: 'Ctrl+D',
          action: () => BZ.$('#btnStar').click(),
        },
        { label: 'Сохранить страницу…', icon: BZ.ICONS.save, kbd: 'Ctrl+S', action: () => api.page.save(tab.id) },
        { label: 'Печать…', icon: BZ.ICONS.print, kbd: 'Ctrl+P', action: () => api.page.print(tab.id) },
        '-',
        { label: 'Копировать адрес', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(tab.url || '') },
        { label: 'Исходный код', icon: BZ.ICONS.code, action: () => api.page.source(tab.id) },
        { label: 'Открыть в системном браузере', icon: BZ.ICONS.ext, action: () => api.page.external(tab.id) },
        '-',
        { label: 'Инструменты разработчика', icon: BZ.ICONS.code, kbd: 'F12', action: () => api.page.devtools(tab.id) },
        { label: 'Очистить данные', icon: BZ.ICONS.trash, kbd: 'Ctrl+Shift+Del', action: () => BZ.overlays.open('clearData') },
      ],
      { align: 'right' }
    );
    m.classList.remove('hidden');
  });

  /* ------------------------------------------------------- main menu */
  BZ.$('#btnMenu').addEventListener('click', () => {
    const m = BZ.menu(
      BZ.$('#btnMenu'),
      [
        { label: 'Новая вкладка', icon: BZ.ICONS.plus, kbd: 'Ctrl+T', action: () => api.tab.new({}) },
        { label: 'Новое окно', icon: BZ.ICONS.ext, kbd: 'Ctrl+N', action: () => api.ui.newWindow() },
        { label: 'Восстановить закрытую вкладку', icon: BZ.ICONS.clock, kbd: 'Ctrl+Shift+T', action: () => api.tab.restoreClosed() },
        '-',
        { label: 'Закладки', icon: BZ.ICONS.star, kbd: 'Ctrl+Shift+O', action: () => BZ.overlays.open('bookmarks') },
        { label: 'История', icon: BZ.ICONS.clock, kbd: 'Ctrl+H', action: () => BZ.overlays.open('history') },
        { label: 'Загрузки', icon: BZ.ICONS.doc, kbd: 'Ctrl+J', action: () => BZ.openDownloads() },
        '-',
        { label: 'Панель закладок', kbd: 'Ctrl+Shift+B', action: () => api.settings.save({ showBookmarksBar: !S.settings.showBookmarksBar }).then((s) => { S.settings = s; BZ.renderBookmarksBar(); }) },
        { label: 'Скрыть панель', icon: BZ.ICONS.eye, kbd: 'F10', action: () => api.ui.window('chromeToggle') },
        { label: 'Полный экран', kbd: 'F11', action: () => api.ui.window('fullscreen') },
        '-',
        { label: 'Настройки', icon: BZ.ICONS.code, kbd: 'Ctrl+,', action: () => BZ.overlays.open('settings') },
        { label: 'Очистить данные', icon: BZ.ICONS.trash, kbd: 'Ctrl+Shift+Del', action: () => BZ.overlays.open('clearData') },
        { label: 'О браузере', action: () => BZ.overlays.open('about') },
      ],
      { align: 'right' }
    );
    m.classList.remove('hidden');
  });

  /* ------------------------------------------------------- tabs popup */
  BZ.$('#btnTabsMenu').addEventListener('click', () => {
    BZ.hideMenus();
    const box = BZ.$('#tablistPopup');
    box.innerHTML = '';
    box.appendChild(BZ.el('div', { class: 'title', text: 'Вкладки (' + S.order.length + ')' }));
    S.order.forEach((id, i) => {
      const tab = BZ.tabById(id);
      if (!tab) return;
      const row = BZ.el('div', { class: 'mi' });
      row.appendChild(BZ.el('span', { text: String(i + 1), style: { color: 'var(--fg-3)', minWidth: '16px' } }));
      row.appendChild(BZ.el('span', { text: tab.title || tab.url || 'Новая вкладка', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }));
      if (id === S.activeId) row.appendChild(BZ.el('span', { class: 'kbd', text: '✓' }));
      row.addEventListener('click', () => {
        BZ.hideMenus();
        api.tab.activate(id);
      });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
    const r = BZ.$('#btnTabsMenu').getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    box.style.left = Math.min(r.right - w, window.innerWidth - w - 6) + 'px';
    box.style.top = Math.max(6, r.bottom - h - 8) + 'px';
  });

  /* ------------------------------------------------------- window controls */
  BZ.$('#btnMin').addEventListener('click', () => api.ui.window('minimize'));
  BZ.$('#btnMax').addEventListener('click', async () => {
    const st = await api.ui.window('maximize');
    updateMaxIcon(st.maximized);
  });
  BZ.$('#btnClose').addEventListener('click', () => api.ui.window('close'));

  function updateMaxIcon(maximized) {
    BZ.$('#btnMax').innerHTML = maximized
      ? '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 4h6v6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
      : '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
    BZ.$('#btnMax').title = maximized ? 'Восстановить' : 'Развернуть';
  }

  api.on.winState((st) => updateMaxIcon(st.maximized));

  /* ------------------------------------------------------- main events */
  api.on.uiCommand(async (p) => {
    if (!p) return;
    switch (p.command) {
      case 'focusAddress':
        BZ.address.focus(p.selectAll !== false, !!p.search);
        break;
      case 'openFind':
        BZ.find.toggle();
        break;
      case 'bookmarkCurrent':
        BZ.$('#btnStar').click();
        break;
      default:
        break;
    }
  });

  api.on.findCommand((p) => {
    if (!p) return;
    if (BZ.$('#findbar').classList.contains('hidden')) BZ.find.open();
    if (p.next) BZ.find.next();
    else BZ.find.prev();
  });

  api.on.chromeToggled((p) => {
    BZ.$('#app').classList.toggle('chrome-hidden', !!p.hidden);
    BZ.layout();
  });

  api.on.themeChanged((p) => BZ.applyTheme(p.theme, p.accent));

  api.on.zoomChanged(() => BZ.syncToolbar());

  api.on.uiNewtab((p) => api.tab.new({ url: p && p.url }));

  api.on.toast((p) => BZ.toast(p.text));

  /* ------------------------------------------------------- renderer keyboard */
  document.addEventListener('keydown', (e) => {
    const c = e.ctrlKey || e.metaKey;
    const inField = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);

    if (e.key === 'Escape') {
      if (!BZ.$('#overlay').classList.contains('hidden')) {
        BZ.overlays.close();
        return;
      }
      if (!BZ.$('#downloads').classList.contains('hidden')) {
        BZ.$('#dlClose').click();
        return;
      }
      BZ.hideMenus();
    }

    if (c && e.key === 'Enter' && inField) {
      e.preventDefault();
      const v = document.activeElement.value;
      if (document.activeElement.id === 'url') api.nav.go(S.activeId, v, true);
      else if (document.activeElement.id === 'findInput') BZ.find.next();
    }
    if (c && !e.shiftKey && e.key === 'Tab') {
      // handled in main via before-input-event
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.popup,.ctxmenu,[data-menu-anchor]')) BZ.hideMenus();
  });

  window.addEventListener('resize', () => BZ.layout());
  window.addEventListener('blur', () => BZ.hideMenus());

  /* ------------------------------------------------------- boot */
  (async function boot() {
    try {
      BZ.apiInfo = await api.appInfo();
    } catch (_) {}
    await BZ.loadState();
    updateMaxIcon(false);
    BZ.address.update();
    BZ.setTitle();
    if (window.ResizeObserver) new ResizeObserver(() => BZ.layout()).observe(BZ.$('#webarea'));
    BZ.layout();
    setTimeout(() => BZ.layout(), 120);
    setTimeout(() => BZ.layout(), 600);
  })();
})();