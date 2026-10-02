'use strict';

(function () {
  const api = window.bz;
  const S = BZ.state;
  const input = () => BZ.$('#url');
  let items = [];
  let sel = -1;
  let lastQuery = '';

  function displayUrl(tab) {
    const url = (tab.loading && tab.pendingUrl) || tab.url || '';
    if (!url) return '';
    if (/^brauzer:/i.test(url)) return 'Новая вкладка';
    if (isLocal(url)) {
      return decodeURIComponent(url.replace(/^brauzer:\/\/page\?/, '').replace(/\/$/, '')) || 'Новая вкладка';
    }
    try {
      const u = new URL(url);
      let s = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname + u.search);
      return decodeURIComponent(s);
    } catch (_) {
      return url;
    }
  }

  function isLocal(url) {
    return !/^https?:/i.test(url);
  }

  function score(item, q) {
    const t = (item.title || '').toLowerCase();
    const u = (item.url || '').toLowerCase();
    if (!q) return 0;
    if (t.startsWith(q)) return 100;
    if (u.startsWith(q)) return 90;
    if (t.includes(q)) return 70;
    if (u.includes(q)) return 50;
    const idx = u.indexOf(q);
    if (idx >= 0 && u[idx - 1] === '.') return 80;
    return 0;
  }

  function collect(query) {
    const q = query.trim().toLowerCase();
    const out = [];
    const push = (url, title, kind) => {
      if (out.some((x) => x.url === url)) return;
      out.push({ url, title: title || BZ.host(url), kind: kind || 'page' });
    };

    const hist = S.history.slice(0, 400).map((h) => ({ url: h.url, title: h.title, visitedAt: h.visitedAt, kind: h.url.split('/')[2] || '' }));
    const bmks = S.bookmarks.map((b) => ({ url: b.url, title: b.title, kind: 'закладка', folder: b.folder }));

    const pool = bmks.concat(hist.filter((h) => !bmks.some((b) => b.url === h.url)));
    const filtered = q ? pool.filter((x) => score(x, q) > 0).sort((a, b) => score(b, q) - score(a, q)) : pool.slice(0, 6);

    filtered.slice(0, 9).forEach((x) => push(x.url, x.title, x.kind));

    if (q) {
      const engines = {
        google: 'Google',
        duckduckgo: 'DuckDuckGo',
        yandex: 'Яндекс',
        bing: 'Bing',
        brave: 'Brave',
        mailru: 'Mail.ru',
      };
      const name = engines[S.settings.searchEngine] || 'DuckDuckGo';
      const tpl = {
        google: 'https://www.google.com/search?q=%s',
        duckduckgo: 'https://duckduckgo.com/?q=%s',
        yandex: 'https://yandex.ru/search/?text=%s',
        bing: 'https://www.bing.com/search?q=%s',
        brave: 'https://search.brave.com/search?q=%s',
        mailru: 'https://go.mail.ru/search?q=%s',
      }[S.settings.searchEngine] || 'https://duckduckgo.com/?q=%s';
      out.unshift({ url: tpl.replace('%s', encodeURIComponent(query)), title: 'Поиск: ' + query, kind: name, search: true });
    } else {
      out.unshift({ url: S.settings.homepage, title: 'Домашняя страница', kind: 'домой' });
    }
    return out.slice(0, 10);
  }

  function render() {
    const box = BZ.$('#suggest');
    box.innerHTML = '';
    if (!items.length) {
      box.classList.add('hidden');
      return;
    }
    items.forEach((it, i) => {
      const row = BZ.el('div', { class: 'sg-item' + (i === sel ? ' sel' : '') });
      const ico = BZ.el('span', { class: 'sg-ico' });
      ico.appendChild(BZ.icon(it.search ? BZ.ICONS.search : BZ.ICONS.clock, 13));
      row.appendChild(ico);
      const main = BZ.el('div', { class: 'sg-main' });
      main.appendChild(BZ.el('div', { class: 'sg-title', text: it.title }));
      main.appendChild(BZ.el('div', { class: 'sg-url', text: it.url }));
      row.appendChild(main);
      if (it.kind) row.appendChild(BZ.el('span', { class: 'sg-badge', text: it.kind }));
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        go(it.url);
      });
      row.addEventListener('mouseenter', () => {
        sel = i;
        highlight();
      });
      box.appendChild(row);
    });
    box.classList.remove('hidden');
  }

  function highlight() {
    BZ.$$('.sg-item').forEach((n, i) => n.classList.toggle('sel', i === sel));
    const cur = BZ.$('.sg-item.sel');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
  }

  function go(url) {
    hide();
    input().blur();
    api.nav.go(S.activeId, url, false);
  }

  function hide() {
    BZ.$('#suggest').classList.add('hidden');
    sel = -1;
  }

  function update() {
    const tab = BZ.activeTab();
    const el = input();
    if (!tab) return;
    if (document.activeElement !== el) {
      el.value = displayUrl(tab);
      lastQuery = el.value;
    }
    const secure = BZ.$('#secureIcon');
    const url = (tab.loading && tab.pendingUrl) || tab.url || '';
    if (/^https:/i.test(url)) {
      secure.classList.remove('insecure');
      secure.title = 'Соединение защищено (HTTPS)';
    } else if (/^http:/i.test(url)) {
      secure.classList.add('insecure');
      secure.title = 'Незащищённое соединение';
    } else {
      secure.classList.add('insecure');
      secure.title = 'Локальная страница';
    }
    const star = BZ.$('#btnStar');
    const isBm = S.bookmarks.some((b) => b.url === url);
    star.classList.toggle('on', isBm);
  }

  const refresh = BZ.debounce(function () {
    const q = input().value;
    if (q === lastQuery) return;
    lastQuery = q;
    items = collect(q);
    sel = 0;
    render();
  }, 90);

  input().addEventListener('focus', () => {
    input().select();
    items = collect(input().value);
    sel = 0;
    render();
  });
  input().addEventListener('input', refresh);
  input().addEventListener('blur', () => setTimeout(hide, 120));
  input().addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(items.length - 1, sel + 1);
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel >= 0 && items[sel]) go(items[sel].url);
      else {
        hide();
        api.nav.go(S.activeId, input().value, false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!BZ.$('#suggest').classList.contains('hidden')) hide();
      else {
        update();
        input().blur();
      }
    }
  });

  BZ.address = {
    update,
    focus(selectAll, search) {
      const el = input();
      el.focus();
      if (search) el.value = '';
      if (selectAll) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    },
    go,
  };
})();