'use strict';

(function () {
  const api = window.bz;
  const S = BZ.state;
  const overlay = () => BZ.$('#overlay');
  let current = null;

  const VIEWS = {};

  function open(which) {
    current = which;
    overlay().classList.remove('hidden');
    const view = VIEWS[which];
    if (view) view();
    api.ui.overlay(true);
  }

  function close() {
    current = null;
    overlay().classList.add('hidden');
    BZ.$('#modalBody').innerHTML = '';
    BZ.$('#modalFoot').innerHTML = '';
    api.ui.overlay(false);
  }

  function setHead(title, sub) {
    BZ.$('#modalTitle').textContent = title;
    const body = BZ.$('#modalBody');
    body.innerHTML = '';
    if (sub) body.appendChild(BZ.el('div', { class: 'hint', text: sub, style: { marginBottom: '10px', color: 'var(--fg-3)', fontSize: '11px' } }));
    return body;
  }

  function setFoot(children) {
    const foot = BZ.$('#modalFoot');
    foot.innerHTML = '';
    (children || []).forEach((c) => foot.appendChild(c));
  }

  BZ.$('#modalClose').addEventListener('click', close);
  overlay().addEventListener('mousedown', (e) => {
    if (e.target === overlay()) close();
  });

  /* ------------------------------------------------------- history */
  let historyFilter = '';
  VIEWS.history = function () {
    const body = setHead('История', S.history.length + ' записей');
    const search = BZ.el('input', { class: 'lsearch', placeholder: 'Поиск в истории…', value: historyFilter });
    const list = BZ.el('div');
    body.appendChild(search);
    body.appendChild(list);

    const draw = () => {
      list.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      const rows = S.history.filter((h) => !q || h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)).slice(0, 400);
      if (!rows.length) {
        list.appendChild(BZ.el('div', { class: 'empty', text: q ? 'Ничего не найдено' : 'История пуста' }));
        return;
      }
      let lastDay = '';
      rows.forEach((h) => {
        const day = new Date(h.visitedAt).toDateString();
        if (day !== lastDay) {
          lastDay = day;
          list.appendChild(
            BZ.el('div', {
              text: day === new Date().toDateString() ? 'Сегодня' : new Date(h.visitedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
              style: { padding: '10px 8px 4px', fontSize: '11px', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.5px' },
            })
          );
        }
        const row = BZ.el('div', { class: 'row' });
        row.appendChild(BZ.faviconFor(h.url, 'big'));
        const main = BZ.el('div', { class: 'row-main' });
        main.appendChild(BZ.el('div', { class: 'row-t', text: h.title || h.url }));
        main.appendChild(BZ.el('div', { class: 'row-s', text: h.url }));
        row.appendChild(main);
        row.appendChild(BZ.el('div', { class: 'row-time', text: BZ.fmtTime(h.visitedAt) }));
        row.addEventListener('click', (e) => {
          if (e.ctrlKey) api.tab.new({ url: h.url, background: true });
          else api.nav.go(S.activeId, h.url, false);
          close();
        });
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          BZ.contextMenu(e.clientX, e.clientY, [
            { label: 'Открыть', icon: BZ.ICONS.ext, action: () => { api.nav.go(S.activeId, h.url, false); close(); } },
            { label: 'Открыть в новой вкладке', icon: BZ.ICONS.plus, action: () => api.tab.new({ url: h.url }) },
            { label: 'Копировать адрес', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(h.url) },
            '-',
            {
              label: 'Удалить из истории',
              icon: BZ.ICONS.trash,
              action: async () => {
                S.history = await api.history.remove(h.url);
                draw();
              },
            },
          ]);
        });
        list.appendChild(row);
      });
    };

    search.addEventListener('input', draw);
    draw();
    setFoot([
      BZ.el('button', { class: 'btn ghost', text: 'Очистить историю', onclick: async () => {
          if (!confirm('Удалить всю историю просмотров?')) return;
          await api.history.clear();
          S.history = [];
          close();
          BZ.toast('История очищена');
        } }),
      BZ.el('button', { class: 'btn', text: 'Закрыть', onclick: close }),
    ]);
  };

  api.on.historyCleared(() => {
    S.history = [];
  });

  /* ------------------------------------------------------- bookmarks */
  let bmFilter = '';
  VIEWS.bookmarks = function () {
    const body = setHead('Закладки');
    const search = BZ.el('input', { class: 'lsearch', placeholder: 'Поиск по закладкам…', value: bmFilter });
    const addRow = BZ.el('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } });
    const urlIn = BZ.el('input', { class: 'lsearch', placeholder: 'https://…', style: { marginBottom: '0' } });
    const titleIn = BZ.el('input', { class: 'lsearch', placeholder: 'Название', style: { marginBottom: '0', maxWidth: '200px' } });
    addRow.appendChild(urlIn);
    addRow.appendChild(titleIn);
    addRow.appendChild(
      BZ.el('button', {
        class: 'btn',
        text: 'Добавить',
        onclick: async () => {
          const u = urlIn.value.trim();
          if (!u) return;
          const r = await api.page.bookmark(u, titleIn.value.trim() || undefined);
          if (r.added) {
            S.bookmarks.unshift(r.bookmark);
            BZ.toast('Закладка добавлена');
          }
          urlIn.value = '';
          titleIn.value = '';
          BZ.renderBookmarksBar();
          draw();
        },
      })
    );
    const list = BZ.el('div');
    body.appendChild(search);
    body.appendChild(addRow);
    body.appendChild(list);

    const draw = () => {
      list.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      const rows = S.bookmarks.filter((b) => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
      if (!rows.length) {
        list.appendChild(BZ.el('div', { class: 'empty', text: 'Закладок нет' }));
        return;
      }
      rows.forEach((b) => {
        const row = BZ.el('div', { class: 'row' });
        row.appendChild(BZ.faviconFor(b.url, 'big'));
        const main = BZ.el('div', { class: 'row-main' });
        main.appendChild(BZ.el('div', { class: 'row-t', text: b.title }));
        main.appendChild(BZ.el('div', { class: 'row-s', text: b.folder ? b.folder + ' · ' + b.url : b.url }));
        row.appendChild(main);
        row.appendChild(
          BZ.el('button', {
            class: 'btn ghost sm',
            text: 'Изм.',
            onclick: (e) => {
              e.stopPropagation();
              BZ.overlays.editBookmark(b);
            },
          })
        );
        row.addEventListener('click', (e) => {
          if (e.ctrlKey) api.tab.new({ url: b.url, background: true });
          else api.nav.go(S.activeId, b.url, false);
          close();
        });
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          BZ.contextMenu(e.clientX, e.clientY, [
            { label: 'Открыть', icon: BZ.ICONS.ext, action: () => { api.nav.go(S.activeId, b.url, false); close(); } },
            { label: 'Открыть в новой вкладке', icon: BZ.ICONS.plus, action: () => api.tab.new({ url: b.url }) },
            { label: 'Копировать адрес', icon: BZ.ICONS.copy, action: () => navigator.clipboard.writeText(b.url) },
            '-',
            { label: 'Изменить', icon: BZ.ICONS.doc, action: () => BZ.overlays.editBookmark(b) },
            {
              label: 'Удалить',
              icon: BZ.ICONS.trash,
              action: async () => {
                await BZ.removeBookmark(b.url);
                draw();
              },
            },
          ]);
        });
        list.appendChild(row);
      });
    };

    search.addEventListener('input', draw);
    draw();
    setFoot([BZ.el('button', { class: 'btn', text: 'Закрыть', onclick: close })]);
  };

  function editBookmark(b) {
    const body = setHead('Изменить закладку');
    const title = BZ.el('input', { class: 'lsearch', value: b.title, style: { marginBottom: '10px' } });
    const url = BZ.el('input', { class: 'lsearch', value: b.url, style: { marginBottom: '10px' } });
    const folder = BZ.el('input', { class: 'lsearch', value: b.folder || 'Закладки', style: { marginBottom: '10px' } });
    body.appendChild(BZ.el('label', { text: 'Название', style: { fontSize: '11px', color: 'var(--fg-3)' } }));
    body.appendChild(title);
    body.appendChild(BZ.el('label', { text: 'Адрес', style: { fontSize: '11px', color: 'var(--fg-3)' } }));
    body.appendChild(url);
    body.appendChild(BZ.el('label', { text: 'Папка', style: { fontSize: '11px', color: 'var(--fg-3)' } }));
    body.appendChild(folder);
    setFoot([
      BZ.el('button', { class: 'btn ghost', text: 'Отмена', onclick: close }),
      BZ.el('button', {
        class: 'btn',
        text: 'Сохранить',
        onclick: async () => {
          b.title = title.value.trim() || b.title;
          b.url = url.value.trim() || b.url;
          b.folder = folder.value.trim() || 'Закладки';
          await api.bookmarks.save(S.bookmarks);
          BZ.renderBookmarksBar();
          BZ.address.update();
          close();
          BZ.toast('Закладка обновлена');
        },
      }),
    ]);
  }

  /* ------------------------------------------------------- settings */
  const ACCENTS = ['#3d7bfd', '#7c5cff', '#00a884', '#e5484d', '#f5a524', '#e93d82', '#12b5cb', '#8b9bb4'];
  let settingsTab = 'general';

  VIEWS.settings = function () {
    const body = setHead('Настройки');
    const grid = BZ.el('div', { class: 'settings-grid' });
    const nav = BZ.el('div', { class: 'set-nav' });
    const page = BZ.el('div');
    grid.appendChild(nav);
    grid.appendChild(page);
    body.appendChild(grid);

    const tabs = [
      { id: 'general', label: 'Основное' },
      { id: 'search', label: 'Поиск и страницы' },
      { id: 'privacy', label: 'Приватность' },
      { id: 'downloads', label: 'Загрузки' },
      { id: 'about', label: 'О браузере' },
    ];
    tabs.forEach((t) => {
      const b = BZ.el('button', {
        text: t.label,
        class: t.id === settingsTab ? 'on' : '',
        onclick: () => {
          settingsTab = t.id;
          BZ.$$('.set-nav button').forEach((n) => n.classList.remove('on'));
          b.classList.add('on');
          draw();
        },
      });
      nav.appendChild(b);
    });

    const save = (patch) => api.settings.save(patch);

    function draw() {
      page.innerHTML = '';
      const s = S.settings;
      if (settingsTab === 'general') {
        page.appendChild(
          BZ.selectField('Тема оформления', s.theme, [
            { value: 'dark', label: 'Тёмная' },
            { value: 'light', label: 'Светлая' },
            { value: 'system', label: 'Как в системе' },
          ], (v) => save({ theme: v }).then(BZ.applyTheme))
        );
        const acc = BZ.el('div', { class: 'field' });
        acc.appendChild(BZ.el('label', { text: 'Акцентный цвет' }));
        const row = BZ.el('div', { class: 'swatches' });
        ACCENTS.forEach((c) => {
          const sw = BZ.el('div', { class: 'swatch' + (String(s.accent).toLowerCase() === c ? ' on' : ''), title: c });
          sw.style.background = c;
          sw.addEventListener('click', () => save({ accent: c }).then(BZ.applyTheme));
          row.appendChild(sw);
        });
        acc.appendChild(row);
        page.appendChild(acc);
        page.appendChild(
          BZ.textField('Масштаб страниц по умолчанию (%)', Math.round((Number(s.defaultZoom) || 1) * 100), 'Применится к новым страницам и текущим вкладкам', (v) => {
            const z = Math.min(5, Math.max(0.25, (Number(v) || 100) / 100));
            save({ defaultZoom: z });
          })
        );
        page.appendChild(BZ.switchField('Показывать панель закладок', 'Горячая клавиша Ctrl+Shift+B', s.showBookmarksBar !== false, (v) => save({ showBookmarksBar: v }).then(BZ.renderBookmarksBar)));
        page.appendChild(
          BZ.switchField('Кнопка «Домой» на панели', null, s.homepageButton !== false, (v) => {
            save({ homepageButton: v }).then(BZ.syncToolbar);
          })
        );
        page.appendChild(BZ.switchField('Спрашивать при закрытии нескольких вкладок', null, s.confirmMultipleTabs !== false, (v) => save({ confirmMultipleTabs: v })));
      } else if (settingsTab === 'search') {
        page.appendChild(
          BZ.selectField('Поиск по умолчанию', s.searchEngine, [
            { value: 'duckduckgo', label: 'DuckDuckGo' },
            { value: 'google', label: 'Google' },
            { value: 'yandex', label: 'Яндекс' },
            { value: 'bing', label: 'Bing' },
            { value: 'brave', label: 'Brave Search' },
            { value: 'mailru', label: 'Mail.ru' },
          ], (v) => save({ searchEngine: v }))
        );
        page.appendChild(BZ.textField('Домашняя страница', s.homepage, 'Открывается по Ctrl+Home и кнопке «Домой»', (v) => save({ homepage: v.trim() })));
        page.appendChild(
          BZ.selectField('Поведение новой вкладки', s.newTab, [
            { value: 'home', label: 'Открывать домашнюю страницу' },
            { value: 'blank', label: 'Пустая страница' },
          ], (v) => save({ newTab: v }))
        );
      } else if (settingsTab === 'privacy') {
        page.appendChild(BZ.switchField('Восстанавливать вкладки при запуске', 'Сессия сохраняется автоматически', s.restoreSession !== false, (v) => save({ restoreSession: v })));
        page.appendChild(BZ.switchField('Очищать кэш и куки при выходе', 'Полная очистка данных при закрытии браузера', s.clearOnExit === true, (v) => save({ clearOnExit: v })));
        page.appendChild(BZ.switchField('Блокировать всплывающие окна', 'Открывать ссылки из window.open в фоне', s.blockThirdPartyPopups === true, (v) => save({ blockThirdPartyPopups: v })));
        page.appendChild(
          BZ.el('div', { class: 'field' }, [
            BZ.el('label', { text: 'Данные' }),
            BZ.el('button', {
              class: 'btn ghost',
              text: 'Очистить кэш, куки и историю…',
              onclick: () => VIEWS.clearData(),
            }),
          ])
        );
      } else if (settingsTab === 'downloads') {
        page.appendChild(
          BZ.switchField('Спрашивать место сохранения', 'Показывать диалог выбора папки перед загрузкой', s.askDownloadLocation === true, (v) => save({ askDownloadLocation: v }))
        );
        page.appendChild(BZ.switchField('Открывать папку после загрузки', null, true, () => {}));
        const dirField = BZ.el('div', { class: 'field' });
        dirField.appendChild(BZ.el('label', { text: 'Папка загрузок' }));
        const row = BZ.el('div', { style: { display: 'flex', gap: '8px' } });
        const cur = BZ.el('input', { type: 'text', value: S.downloadDir || '', readonly: true, style: { flex: '1' } });
        row.appendChild(cur);
        row.appendChild(
          BZ.el('button', {
            class: 'btn ghost',
            text: 'Выбрать…',
            onclick: async () => {
              const dir = await api.downloads.chooseDir();
              if (dir) {
                await save({ downloadDir: dir });
                S.downloadDir = dir;
                cur.value = dir;
              }
            },
          })
        );
        dirField.appendChild(row);
        dirField.appendChild(BZ.el('div', { class: 'hint', text: 'По умолчанию: ' + (S.downloadDir || '') }));
        page.appendChild(dirField);
        page.appendChild(
          BZ.el('div', { class: 'field' }, [
            BZ.el('button', {
              class: 'btn ghost',
              text: 'Открыть папку загрузок',
              onclick: () => api.shell.showItem((S.downloadDir || '') + '\\'),
            }),
          ])
        );
      } else {
        const about = BZ.el('div');
        const info = BZ.apiInfo || {};
        about.appendChild(BZ.el('div', { class: 'row-t', style: { fontSize: '18px', marginBottom: '2px' }, text: 'БРАУЗЕР ' + S.version }));
        about.appendChild(
          BZ.el('div', { class: 'row-s', style: { marginBottom: '14px' }, text: 'Движок Chromium ' + (info.chrome || '?') + ' · Electron ' + (info.electron || '?') + ' · Node ' + (info.node || '?') })
        );
        about.appendChild(
          BZ.el('div', { class: 'row-s', style: { marginBottom: '14px', userSelect: 'text' }, text: 'Профиль: ' + (info.userData || '') })
        );
        about.appendChild(
          BZ.el('button', {
            class: 'btn ghost',
            text: 'Сбросить настройки по умолчанию',
            onclick: async () => {
              if (!confirm('Сбросить все настройки браузера?')) return;
              await api.settings.reset();
              S.settings = await api.settings.save({});
              BZ.applyTheme();
              BZ.renderBookmarksBar();
              BZ.toast('Настройки сброшены');
              close();
            },
          })
        );
        page.appendChild(about);
      }
    }
    draw();
    setFoot([BZ.el('button', { class: 'btn', text: 'Готово', onclick: close })]);
  };

  /* ------------------------------------------------------- clear data */
  VIEWS.clearData = function () {
    const body = setHead('Очистка данных');
    const items = {};
    const add = (key, label, sub) => {
      items[key] = true;
      body.appendChild(BZ.switchField(label, sub, true, (v) => (items[key] = v)));
    };
    add('history', 'История просмотров');
    add('cookies', 'Куки и данные сайтов (входы, настройки)');
    const info = BZ.el('div', { class: 'hint', text: 'Кэш и временные файлы удаляются всегда.' });
    body.appendChild(info);
    setFoot([
      BZ.el('button', { class: 'btn ghost', text: 'Отмена', onclick: close }),
      BZ.el('button', {
        class: 'btn danger',
        text: 'Очистить',
        onclick: async () => {
          await api.data.clear(items);
          if (items.history) S.history = [];
          close();
          BZ.toast('Данные очищены');
        },
      }),
    ]);
  };

  /* ------------------------------------------------------- about */
  VIEWS.about = function () {
    const body = setHead('О браузере');
    const info = BZ.apiInfo || {};
    const hero = BZ.el('div', { style: { textAlign: 'center', padding: '10px 0 18px' } });
    hero.appendChild(BZ.el('div', { style: { fontSize: '26px', fontWeight: '700' }, text: 'БРАУЗЕР' }));
    hero.appendChild(BZ.el('div', { class: 'row-s', text: 'Версия ' + S.version }));
    body.appendChild(hero);

    const table = [
      ['Движок', 'Chromium ' + (info.chrome || '?')],
      ['Electron', info.electron || '?'],
      ['Node.js', info.node || '?'],
      ['Платформа', info.platform || S.platform],
      ['Профиль', info.userData || ''],
      ['Вкладок открыто', String(S.tabs.length)],
      ['Закладок', String(S.bookmarks.length)],
      ['Записей в истории', String(S.history.length)],
    ];
    table.forEach((t) => {
      const row = BZ.el('div', { class: 'row' });
      row.appendChild(BZ.el('div', { class: 'row-main' }, [BZ.el('div', { class: 'row-t', text: t[0] })]));
      row.appendChild(BZ.el('div', { class: 'row-s', text: t[1], style: { maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis' } }));
      body.appendChild(row);
    });

    const keys = BZ.el('div', { style: { marginTop: '18px' } });
    keys.appendChild(BZ.el('div', { class: 'title', text: 'Горячие клавиши', style: { fontSize: '11px', color: 'var(--fg-3)', textTransform: 'uppercase', marginBottom: '6px' } }));
    const list = [
      ['Ctrl+T', 'Новая вкладка'],
      ['Ctrl+W', 'Закрыть вкладку'],
      ['Ctrl+Shift+T', 'Восстановить закрытую'],
      ['Ctrl+L', 'Адресная строка'],
      ['Ctrl+F', 'Поиск на странице'],
      ['Ctrl+H / Ctrl+J', 'История / загрузки'],
      ['Ctrl+D', 'Добавить закладку'],
      ['Alt+← / Alt+→', 'Назад / вперёд'],
      ['Ctrl+Tab', 'Следующая вкладка'],
      ['Ctrl+1…9', 'Перейти к вкладке'],
      ['F11 / F10', 'Полный экран / скрыть панель'],
      ['Ctrl+Shift+Delete', 'Очистить данные'],
    ];
    list.forEach((k) => {
      const row = BZ.el('div', { class: 'row' });
      row.appendChild(BZ.el('div', { class: 'kbd row-main', text: k[0] }));
      row.appendChild(BZ.el('div', { class: 'row-t', text: k[1] }));
      keys.appendChild(row);
    });
    body.appendChild(keys);
    setFoot([BZ.el('button', { class: 'btn', text: 'Закрыть', onclick: close })]);
  };

  /* ------------------------------------------------------- bookmark current page */
  BZ.overlays = {
    open,
    close,
    editBookmark,
    savePage(tabId) {
      const tab = BZ.tabById(tabId || S.activeId);
      if (!tab || !tab.url) return;
      api.page.save(tab.id);
    },
  };

  api.on.uiOverlay((p) => {
    if (!p || !p.open) {
      close();
      return;
    }
    if (p.open === 'downloads') {
      BZ.openDownloads();
      return;
    }
    open(p.open);
  });
})();