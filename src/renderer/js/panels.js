'use strict';

(function () {
  const api = window.bz;
  const S = BZ.state;

  /* ------------------------------------------------- bookmarks bar */
  function renderBookmarksBar() {
    const bar = BZ.$('#bookmarksbar');
    bar.innerHTML = '';
    const show = S.settings.showBookmarksBar !== false;
    bar.classList.toggle('hidden', !show);
    if (!show) return;

    const groups = {};
    S.bookmarks.forEach((b) => {
      const f = b.folder || 'Закладки';
      if (!groups[f]) groups[f] = [];
      groups[f].push(b);
    });
    Object.keys(groups).forEach((folder) => {
      if (folder !== 'Закладки') {
        bar.appendChild(
          BZ.el('button', {
            class: 'bm-chip',
            onclick: (e) => {
              BZ.contextMenu(
                e.clientX,
                e.clientY,
                groups[folder].map((b) => ({ label: b.title, icon: BZ.ICONS.star, action: () => api.tab.new({ url: b.url }) }))
              );
            },
          }, [BZ.icon(BZ.ICONS.folder, 13), BZ.el('span', { text: folder })])
        );
      }
      groups[folder].forEach((b) => {
        const chip = BZ.el('button', { class: 'bm-chip', title: b.url });
        const ico = BZ.el('span', { class: 'bmi' });
        if (/^https?:/i.test(b.url)) {
          const img = BZ.el('img', { src: new URL(b.url).origin + '/favicon.ico', style: { width: '13px', height: '13px' } });
          img.addEventListener('error', () => {
            ico.innerHTML = '';
            ico.appendChild(BZ.icon(BZ.ICONS.globe, 13));
          });
          ico.appendChild(img);
        } else {
          ico.appendChild(BZ.icon(BZ.ICONS.globe, 13));
        }
        chip.appendChild(ico);
        chip.appendChild(BZ.el('span', { text: b.title }));
        chip.addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey) api.tab.new({ url: b.url, background: true });
          else api.nav.go(S.activeId, b.url, false);
        });
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          BZ.contextMenu(e.clientX, e.clientY, [
            { label: 'Открыть в новой вкладке', icon: BZ.ICONS.plus, action: () => api.tab.new({ url: b.url }) },
            { label: 'Открыть в новом окне', icon: BZ.ICONS.ext, action: () => api.ui.newWindow() },
            '-',
            { label: 'Изменить', icon: BZ.ICONS.doc, action: () => BZ.overlays.editBookmark(b) },
            { label: 'Удалить', icon: BZ.ICONS.trash, action: () => removeBookmark(b.url) },
          ]);
        });
        bar.appendChild(chip);
      });
    });
  }
  BZ.renderBookmarksBar = renderBookmarksBar;

  async function removeBookmark(url) {
    await api.page.bookmarkRemove(url);
    S.bookmarks = S.bookmarks.filter((b) => b.url !== url);
    renderBookmarksBar();
    BZ.address.update();
  }
  BZ.removeBookmark = removeBookmark;

  /* ------------------------------------------------- downloads */
  function dlStateText(rec) {
    if (rec.state === 'completed') return BZ.fmtBytes(rec.totalBytes || rec.receivedBytes);
    if (rec.state === 'cancelled') return 'Отменено';
    if (rec.state === 'interrupted') return 'Прервано';
    const pct = rec.totalBytes ? Math.round((rec.receivedBytes / rec.totalBytes) * 100) : 0;
    return BZ.fmtBytes(rec.receivedBytes) + (rec.totalBytes ? ' из ' + BZ.fmtBytes(rec.totalBytes) + ' (' + pct + '%)' : '');
  }

  function renderDownloads() {
    const list = BZ.$('#dlList');
    const badge = BZ.$('#dlBadge');
    const active = S.downloads.filter((d) => d.state === 'progressing' || d.state === 'paused').length;
    badge.textContent = String(active);
    badge.classList.toggle('hidden', active === 0);

    list.innerHTML = '';
    if (!S.downloads.length) {
      list.appendChild(BZ.el('div', { class: 'empty', text: 'Загрузок пока нет' }));
      return;
    }
    S.downloads.slice().reverse().forEach((rec) => {
      const row = BZ.el('div', { class: 'dl' });
      const ico = BZ.el('div', { class: 'dl-ico' });
      ico.appendChild(BZ.icon(rec.state === 'completed' ? BZ.ICONS.check : BZ.ICONS.doc, 15));
      row.appendChild(ico);

      const info = BZ.el('div', { class: 'dl-info' });
      info.appendChild(BZ.el('div', { class: 'dl-name', text: rec.filename || 'файл' }));
      info.appendChild(BZ.el('div', { class: 'dl-sub', text: dlStateText(rec) }));
      if (rec.state === 'progressing' && rec.totalBytes) {
        const bar = BZ.el('div', { class: 'dl-bar' });
        const fill = BZ.el('i');
        fill.style.width = Math.round((rec.receivedBytes / rec.totalBytes) * 100) + '%';
        bar.appendChild(fill);
        info.appendChild(bar);
      }
      row.appendChild(info);

      const acts = BZ.el('div', { class: 'dl-actions' });
      if (rec.state === 'completed') {
        acts.appendChild(BZ.el('button', { class: 'btn ghost sm', text: 'Открыть', onclick: () => api.downloads.open(rec.id) }));
        acts.appendChild(
          BZ.el('button', {
            class: 'icon-btn small',
            title: 'Показать в папке',
            onclick: () => api.downloads.show(rec.id),
          }, [BZ.icon(BZ.ICONS.folder, 14)])
        );
      } else if (rec.state === 'progressing') {
        acts.appendChild(
          BZ.el('button', {
            class: 'btn ghost sm',
            text: 'Отмена',
            onclick: () => api.downloads.cancel(rec.id),
          })
        );
      }
      row.appendChild(acts);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        BZ.contextMenu(e.clientX, e.clientY, [
          { label: 'Открыть', icon: BZ.ICONS.ext, disabled: rec.state !== 'completed', action: () => api.downloads.open(rec.id) },
          { label: 'Показать в папке', icon: BZ.ICONS.folder, action: () => api.downloads.show(rec.id) },
          { label: 'Копировать ссылку', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(rec.url) },
        ]);
      });
      list.appendChild(row);
    });
  }
  BZ.panels = { renderDownloads };

  api.on.downloadNew((rec) => {
    S.downloads.push(rec);
    renderDownloads();
    openPanel(true);
    BZ.toast('Начата загрузка: ' + (rec.filename || ''));
  });
  api.on.downloadUpdate((rec) => {
    const i = S.downloads.findIndex((d) => d.id === rec.id);
    if (i < 0) S.downloads.push(rec);
    else S.downloads[i] = rec;
    renderDownloads();
    if (rec.state === 'completed') BZ.toast('Загрузка завершена: ' + (rec.filename || ''));
  });
  api.on.downloadsCleared(async () => {
    S.downloads = await api.downloads.list();
    renderDownloads();
  });

  BZ.$('#dlClear').addEventListener('click', async () => {
    S.downloads = await api.downloads.clear();
    renderDownloads();
  });
  BZ.$('#dlClose').addEventListener('click', () => openPanel(false));

  let panelOpen = false;
  function openPanel(open) {
    panelOpen = open !== undefined ? open : !panelOpen;
    BZ.$('#downloads').classList.toggle('hidden', !panelOpen);
    BZ.$('#btnDownloads').classList.toggle('active', panelOpen);
    api.ui.overlay(panelOpen);
  }
  BZ.openDownloads = () => openPanel(true);

  /* ------------------------------------------------- find in page */
  let findTimer = null;
  const findInput = () => BZ.$('#findInput');

  function runFind(forward) {
    const q = findInput().value;
    const tab = BZ.activeTab();
    if (!tab) return;
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      const r = await api.page.find(tab.id, q, forward);
      const count = BZ.$('#findCount');
      if (!q) {
        count.textContent = '0/0';
        return;
      }
      if (!r || !r.matches) {
        count.textContent = 'нет';
        return;
      }
      const active = r.activeMatchOrdinal || 0;
      count.textContent = active + '/' + r.matches;
    }, forward ? 0 : 140);
  }

  BZ.find = {
    open() {
      BZ.$('#findbar').classList.remove('hidden');
      BZ.$('#btnFind').classList.add('active');
      const el = findInput();
      el.focus();
      el.select();
      runFind(true);
      BZ.layout();
    },
    close() {
      BZ.$('#findbar').classList.add('hidden');
      BZ.$('#btnFind').classList.remove('active');
      const tab = BZ.activeTab();
      if (tab) api.page.stopFind(tab.id, 'clearSelection');
      BZ.$('#findCount').textContent = '0/0';
      BZ.layout();
    },
    next() {
      runFind(true);
    },
    prev() {
      runFind(false);
    },
    toggle() {
      if (BZ.$('#findbar').classList.contains('hidden')) BZ.find.open();
      else BZ.find.close();
    },
  };

  findInput().addEventListener('input', () => runFind(true));
  findInput().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runFind(!e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      BZ.find.close();
    }
  });
  BZ.$('#findNext').addEventListener('click', () => runFind(true));
  BZ.$('#findPrev').addEventListener('click', () => runFind(false));
  BZ.$('#findClose').addEventListener('click', () => BZ.find.close());
  BZ.$('#findCase').addEventListener('change', () => runFind(true));
  BZ.$('#btnFind').addEventListener('click', () => BZ.find.toggle());

  /* ------------------------------------------------- page context menu */
  api.on.pageContextMenu((p) => {
    const items = [];
    if (p.selectionText) {
      items.push({
        label: 'Искать в Google: "' + p.selectionText.slice(0, 40) + (p.selectionText.length > 40 ? '…' : '') + '"',
        icon: BZ.ICONS.search,
        action: () => api.tab.new({ url: 'https://www.google.com/search?q=' + encodeURIComponent(p.selectionText) }),
      });
      items.push({ label: 'Копировать', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(p.selectionText) });
      items.push('-');
    }
    if (p.linkURL) {
      items.push({ label: 'Открыть в новой вкладке', icon: BZ.ICONS.plus, action: () => api.tab.new({ url: p.linkURL }) });
      items.push({ label: 'Открыть в фоне', icon: BZ.ICONS.globe, action: () => api.tab.new({ url: p.linkURL, background: true }) });
      items.push({ label: 'Копировать адрес ссылки', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(p.linkURL) });
      items.push({
        label: 'Закладка для ссылки',
        icon: BZ.ICONS.star,
        action: async () => {
          const r = await api.page.bookmark(p.linkURL, p.linkURL);
          if (r.added) {
            S.bookmarks.unshift(r.bookmark);
            renderBookmarksBar();
            BZ.toast('Закладка добавлена');
          }
        },
      });
      items.push('-');
    }
    if (p.srcURL) {
      items.push({ label: 'Сохранить картинку…', icon: BZ.ICONS.save, action: () => api.tab.new({ url: p.srcURL }) });
      items.push('-');
    }
    items.push({ label: 'Назад', icon: BZ.ICONS.globe, kbd: 'Alt+←', action: () => api.nav.back(S.activeId) });
    items.push({ label: 'Вперёд', icon: BZ.ICONS.globe, kbd: 'Alt+→', action: () => api.nav.forward(S.activeId) });
    items.push({ label: 'Обновить', icon: BZ.ICONS.globe, kbd: 'F5', action: () => api.nav.reload(S.activeId) });
    items.push({ label: 'Сохранить страницу…', icon: BZ.ICONS.save, kbd: 'Ctrl+S', action: () => api.overlays.savePage(S.activeId) });
    items.push({ label: 'Печать…', icon: BZ.ICONS.print, kbd: 'Ctrl+P', action: () => api.page.print(S.activeId) });
    items.push({ label: 'Исходный код страницы', icon: BZ.ICONS.code, action: () => api.page.source(S.activeId) });
    items.push('-');
    items.push({ label: 'Копировать адрес страницы', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(p.pageURL || '') });
    items.push({ label: 'Открыть в системном браузере', icon: BZ.ICONS.ext, action: () => api.shell.openExternal(p.pageURL) });
    BZ.contextMenu(p.x, p.y, items);
  });
})();