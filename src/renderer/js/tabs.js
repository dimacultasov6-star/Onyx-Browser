'use strict';

(function () {
  const S = BZ.state;
  const api = window.bz;
  const tabsEl = () => BZ.$('#tabs');

  function tabById(id) {
    return S.tabs.find((t) => t.id === id) || null;
  }
  BZ.tabById = tabById;
  BZ.activeTab = function () {
    return tabById(S.activeId);
  };

  function makeFavicon(tab) {
    const box = BZ.el('span', { class: 'tab-fav' });
    const url = tab.url || '';
    if (url && /^https?:/i.test(url) && tab.favicon) {
      const img = BZ.el('img', { src: tab.favicon });
      img.addEventListener('error', () => {
        box.innerHTML = '';
        box.appendChild(BZ.letterBadge(BZ.host(url)));
      });
      box.appendChild(img);
    } else {
      box.appendChild(BZ.letterBadge(BZ.host(url) || url || '?'));
    }
    return box;
  }

  function buildTab(tab, index, total) {
    const node = BZ.el('div', { class: 'tab', 'data-id': tab.id, draggable: 'true', title: tab.url || tab.title || '' });
    node.appendChild(makeFavicon(tab));

    const title = BZ.el('div', { class: 'tab-title', text: tab.loading && !tab.title ? 'Загрузка…' : tab.title || 'Новая вкладка' });
    node.appendChild(title);

    if (tab.audible) {
      node.appendChild(BZ.icon(tab.muted ? BZ.ICONS.muted : BZ.ICONS.sound, 12));
    } else if (tab.loading) {
      node.appendChild(BZ.el('span', { class: 'tab-spin' }));
    }

    const x = BZ.el('button', { class: 'tab-x', title: 'Закрыть вкладку (Ctrl+W)' });
    x.innerHTML = '<svg viewBox="0 0 12 12" width="9" height="9"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      api.tab.close(tab.id);
    });
    node.appendChild(x);

    node.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        api.tab.close(tab.id);
        return;
      }
      if (e.button === 0 && e.target !== x) api.tab.activate(tab.id);
    });
    node.addEventListener('dblclick', () => api.tab.duplicate(tab.id));
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      api.tab.activate(tab.id);
      tabMenu(e.clientX, e.clientY, tab, index, total);
    });

    node.addEventListener('dragstart', (e) => {
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', String(tab.id));
      } catch (_) {}
    });
    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      BZ.$$('.tab').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    });
    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = node.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      BZ.$$('.tab').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      node.classList.add(after ? 'drop-after' : 'drop-before');
    });
    node.addEventListener('dragleave', () => node.classList.remove('drop-before', 'drop-after'));
    node.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = Number(e.dataTransfer.getData('text/plain'));
      node.classList.remove('drop-before', 'drop-after');
      if (!draggedId || draggedId === tab.id) return;
      const r = node.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      let target = S.order.indexOf(tab.id);
      if (after) target += 1;
      if (S.order.indexOf(draggedId) < target) target -= 1;
      api.tab.move(draggedId, target);
    });

    if (tab.pinned) node.classList.add('pinned');
    if (tab.id === S.activeId) node.classList.add('active');
    if (tab.crashed) title.textContent = 'Вкладка аварийно завершена';
    return node;
  }

  function render() {
    const box = tabsEl();
    box.innerHTML = '';
    S.order.forEach((id, i) => {
      const tab = tabById(id);
      if (!tab) return;
      const node = buildTab(tab, i, S.order.length);
      if (tab.pinned && i > 0) {
        // keep a separator between pinned and normal tabs
        node.style.marginLeft = '6px';
      }
      box.appendChild(node);
    });
    BZ.renderBookmarksBar();
    BZ.syncToolbar();
  }
  BZ.renderTabs = render;

  function tabMenu(x, y, tab, index, total) {
    BZ.contextMenu(x, y, [
      { label: 'Обновить', icon: BZ.ICONS.globe, action: () => api.nav.reload(tab.id) },
      { label: 'Дублировать', icon: BZ.ICONS.copy, action: () => api.tab.duplicate(tab.id) },
      '-',
      { label: tab.pinned ? 'Открепить' : 'Закрепить', icon: BZ.ICONS.pin, action: () => api.tab.pin(tab.id) },
      { label: tab.muted ? 'Включить звук' : 'Выключить звук', icon: tab.muted ? BZ.ICONS.muted : BZ.ICONS.sound, action: () => api.tab.mute(tab.id) },
      '-',
      { label: 'Копировать адрес', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(tab.url || '') },
      { label: 'Сохранить страницу…', icon: BZ.ICONS.save, action: () => api.page.save(tab.id) },
      { label: 'Печать…', icon: BZ.ICONS.print, action: () => api.page.print(tab.id) },
      { label: 'Исходный код', icon: BZ.ICONS.code, action: () => api.page.source(tab.id) },
      { label: 'Открыть в системном браузере', icon: BZ.ICONS.ext, action: () => api.shell.openExternal(tab.url) },
      '-',
      { label: 'Закрыть вкладку', icon: BZ.ICONS.trash, action: () => api.tab.close(tab.id) },
      { label: 'Закрыть другие (' + (total - 1) + ')', disabled: total < 2, action: () => api.tab.closeOthers(tab.id) },
      { label: 'Закрыть справа (' + (total - index - 1) + ')', disabled: total - index - 1 < 1, action: () => api.tab.closeRight(tab.id) },
      '-',
      { label: 'Восстановить закрытую', icon: BZ.ICONS.clock, action: () => api.tab.restoreClosed() },
    ]);
  }
  BZ.tabMenu = tabMenu;

  api.on.tabsOrder((order) => {
    S.order = order;
    render();
    BZ.layout();
  });

  api.on.tabUpdate((p) => {
    const tab = tabById(p.id);
    if (!tab) return;
    Object.assign(tab, p.state || {});
    if (p.order) S.order = p.order;
    if (typeof p.active === 'boolean' && p.id === S.activeId) tab.active = p.active;
    const box = tabsEl();
    const node = box.querySelector('.tab[data-id="' + p.id + '"]');
    if (node) {
      const fresh = buildTab(tab, S.order.indexOf(p.id), S.order.length);
      node.replaceWith(fresh);
    } else {
      render();
    }
    if (p.id === S.activeId) {
      BZ.syncToolbar();
      BZ.address.update();
    }
    BZ.setTitle();
  });

  api.on.tabRemoved((p) => {
    S.order = S.order.filter((id) => id !== p.id);
    S.tabs = S.tabs.filter((t) => t.id !== p.id);
    render();
    BZ.layout();
  });

  api.on.tabActivated((p) => {
    S.activeId = p.id;
    BZ.$$('.tab').forEach((n) => n.classList.toggle('active', Number(n.getAttribute('data-id')) === p.id));
    BZ.syncToolbar();
    BZ.address.update();
  });

  api.on.navState(() => BZ.syncToolbar());

  BZ.loadState = async function () {
    const st = await api.getState();
    S.settings = st.settings;
    S.bookmarks = st.bookmarks || [];
    S.history = st.history || [];
    S.closedTabs = st.closedTabs || [];
    S.downloads = st.downloads || [];
    S.version = st.version;
    S.platform = st.platform;
    S.downloadDir = st.downloadDir;
    S.order = st.tabs.map((t) => t.id);
    S.tabs = st.tabs;
    S.activeId = st.activeId;
    BZ.applyTheme();
    render();
    BZ.panels.renderDownloads();
    return st;
  };
})();