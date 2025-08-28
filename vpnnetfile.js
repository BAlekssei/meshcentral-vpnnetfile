'use strict';

/**
 * meshcentral-vpnnetfile — плагин MeshCentral
 * Сервер: HTTP-роуты
 * Клиент: вкладка "VPN .network" на карточке устройства (Web-UI хуки)
 *
 * Экспорт должен быть именованным: module.exports.vpnnetfile = function(parent) { ... }
 * Имя "vpnnetfile" = shortName из config.json.
 */

module.exports.vpnnetfile = function (parent) {
  const path = require('path');
  const fs = require('fs');

  const plugin = {};
  plugin.parent = parent;
  plugin.shortName = 'vpnnetfile';

  // ------------ настройки ------------
  const TARGET_FILE = '/etc/systemd/network/10-vpn_vpn.network';
  const ROUTE_BASE  = '/plugin/vpnnetfile';

  // ------------ адаптер удалённого запуска ------------
  // Привяжите к вашему Run Commands/ScriptTask и верните stdout (строкой).
  async function runOnAgent(nodeid, script) {
    throw new Error(
      'runOnAgent() не привязан к API MeshCentral. ' +
      'Подключите механизм удалённого запуска и верните stdout.'
    );
  }

  // ------------ простой JSON-парсер (вместо express.json) ------------
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1 * 1024 * 1024) { // 1MB
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }

  // ========== BACKEND: HTTP-эндпоинты ==========
  // В новых и старых версиях webserver Express доступен как webserver.app
  plugin.hook_setupHttpHandlers = function (webserver /*, express */) {
    const app = (webserver && webserver.app) ? webserver.app : webserver;
    if (!app || typeof app.get !== 'function') {
      console.log('[vpnnetfile] Express app not found (webserver.app)');
      return;
    }

    // Страница UI (грузится во вкладке через iframe)
    app.get(`${ROUTE_BASE}`, (req, res) => {
      const nodeid = (req.query && (req.query.nodeid || req.query.id)) || '';
      res.type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>VPN .network</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:12px;background:#0b1117;color:#e6edf3}
  h2{margin:0 0 8px}
  #info{opacity:.85;margin-bottom:10px}
  button{padding:6px 12px;border:1px solid #28425e;border-radius:8px;background:#0e2238;color:#d6e3f2;cursor:pointer}
  button:hover{filter:brightness(1.1)}
  pre{margin-top:10px;background:#0e1621;border:1px solid #233041;border-radius:8px;padding:10px;min-height:140px;max-height:58vh;overflow:auto;white-space:pre-wrap}
</style>
</head><body>
  <h2>VPN .network — просмотр</h2>
  <div id="info">Устройство: <code>${nodeid || '(nodeid не передан)'}</code></div>
  <button id="btnRead">Показать содержимое файла</button>
  <pre id="out">(нажмите «Показать содержимое файла»)</pre>
<script>
(function(){
  var nodeid = ${JSON.stringify(nodeid)};
  var out = document.getElementById('out');
  function read(){
    if(!nodeid){ out.textContent='Нет nodeid'; return; }
    out.textContent='Загрузка...';
    fetch('${ROUTE_BASE}/read?nodeid=' + encodeURIComponent(nodeid))
      .then(r => r.ok ? r.text() : r.text().then(t => Promise.reject(new Error(t))))
      .then(txt => { out.textContent = txt || '[пусто]'; })
      .catch(e => { out.textContent = 'Ошибка: ' + e.message; });
  }
  document.getElementById('btnRead').addEventListener('click', read);
})();
</script>
</body></html>`);
    });

    // Просмотр файла (пока можно вернуть заглушку, если runOnAgent не привязан)
    app.get(`${ROUTE_BASE}/read`, async (req, res) => {
      try {
        const nodeid = String(((req.query && (req.query.nodeid || req.query.id)) || '')).trim();
        if (!nodeid) return res.status(400).type('text/plain').send('nodeid обязателен');

        const showScript = `#!/usr/bin/env bash
set -euo pipefail
FILE="${TARGET_FILE}"
if [ ! -e "$FILE" ]; then
  echo "Файл не найден: $FILE"
  exit 2
fi
echo "== stat =="
stat "$FILE" || true
echo
echo "== содержимое =="
cat -n "$FILE"
`;
        const out = await runOnAgent(nodeid, showScript);
        res.type('text/plain').send(out);
      } catch (e) {
        res.status(/Invalid JSON|Payload too large/.test(String(e)) ? 400 : 501)
           .type('text/plain').send(String(e && e.message || e));
      }
    });

    // Применение (пока не используем — только просмотр)
    app.post(`${ROUTE_BASE}/apply`, async (req, res) => {
      try {
        const body = await readJson(req);
        const nodeid = body && body.nodeid;
        const content = body && body.content;
        if (!nodeid || typeof content !== 'string') {
          return res.status(400).type('text/plain').send('nodeid и content обязательны');
        }
        return res.status(501).type('text/plain').send('[vpnnetfile] Запись пока отключена (сначала проверим просмотр)');
      } catch (e) {
        res.status(400).type('text/plain').send(String(e && e.message || e));
      }
    });

    // Статика для css, если понадобиться внешний файл
    app.get(`${ROUTE_BASE}/style.css`, (req, res) => {
      const cssPath = path.join(__dirname, 'public', 'style.css');
      try {
        if (fs.existsSync(cssPath)) {
          res.type('text/css').send(fs.readFileSync(cssPath, 'utf8'));
        } else {
          res.status(404).send('not found');
        }
      } catch {
        res.status(500).send('error');
      }
    });

    console.log('[vpnnetfile] HTTP handlers registered');
  };

  // ========== WEB UI: вкладка и наполнение ==========
  // 1) регистрируем вкладку объектом (надёжнее, чем функцией)
  plugin.registerPluginTab = { tabId: plugin.shortName, tabTitle: 'VPN .network' };

  // 2) когда устройство выбрано — вставляем iframe с нашим UI
  plugin.onDeviceRefreshEnd = function () {
    try {
      // лог в браузере для быстрой проверки
      try { console.log('[vpnnetfile] ui loaded'); } catch (_){}

      // пытаемся получить контейнер вкладки
      var container =
        document.getElementById(plugin.shortName) ||
        document.getElementById('p_' + plugin.shortName) ||
        document.querySelector('#' + plugin.shortName + ', #p_' + plugin.shortName);
      if (!container) return; // UI ещё не создал div — просто выходим, вызов повторится

      // определяем nodeid
      var nodeid = null;
      try {
        if (typeof currentNode !== 'undefined' && currentNode && currentNode._id) nodeid = currentNode._id;
      } catch(_){}
      if (!nodeid) {
        try {
          var u = new URL(location.href);
          nodeid = u.searchParams.get('id') || nodeid;
        } catch(_){}
      }

      // создаём/обновляем iframe
      var url = `${ROUTE_BASE}?` + (nodeid ? ('nodeid=' + encodeURIComponent(nodeid)) : '');
      if (!container.__vpn_iframe) {
        var iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100vh - 210px)';
        iframe.style.border = '0';
        container.appendChild(iframe);
        container.__vpn_iframe = iframe;
      } else {
        container.__vpn_iframe.src = url;
      }
    } catch (e) {
      try { console.log('[vpnnetfile] onDeviceRefreshEnd error', e); } catch(_){}
    }
  };

  // Экспортируем Web-UI функции в браузер (важно!)
  plugin.exports = ['registerPluginTab', 'onDeviceRefreshEnd'];

  return plugin;
};
