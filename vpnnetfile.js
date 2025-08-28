// vpnnetfile.js
// Плагин MeshCentral: вкладка "VPN .network" + серверные роуты
// Размещать в: meshcentral-data/plugins/vpnnetfile/vpnnetfile.js

module.exports.vpnnetfile = function (parent) {
  const plugin = {};
  plugin.shortName = 'vpnnetfile';
  plugin.title = 'VPN .network';
  plugin.parent = parent;

  const ROUTE_BASE = '/plugin/vpnnetfile';
  const bodyParser = require('body-parser');

  // -------------------------
  // Back-End: HTTP handlers
  // -------------------------
  plugin.hook_setupHttpHandlers = function (app /* webserver */, _server) {
    // В разных версиях webserver передаётся по-разному — берём Express-приложение надёжно.
    const expressApp =
      (app && app.app && typeof app.app.get === 'function' && app.app) ||
      (app && typeof app.get === 'function' && app) ||
      (_server && _server.app && typeof _server.app.get === 'function' && _server.app);

    if (!expressApp) {
      console.log('[vpnnetfile] Не удалось получить express app');
      return;
    }

    // Страница UI плагина (в iframe на вкладке)
    expressApp.get(ROUTE_BASE, function (req, res) {
      const nodeid = req.query.nodeid || req.query.id || '';
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>VPN .network</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;padding:12px;}
  h2{margin:0 0 8px 0}
  #info{margin:0 0 12px 0;color:#555}
  button{padding:6px 10px;border:1px solid #999;border-radius:6px;background:#f5f5f5;cursor:pointer}
  pre{margin-top:12px;background:#0b0b0b;color:#9ef59e;padding:12px;border-radius:8px;overflow:auto;max-height:64vh}
</style>
</head>
<body>
  <h2>VPN .network — просмотр</h2>
  <div id="info">Устройство: <code>${nodeid || '(nodeid не передан)'}</code></div>
  <button id="btnRead">Показать содержимое файла</button>
  <pre id="out">(нажмите «Показать содержимое файла»)</pre>

  <script>
  (function(){
    var nodeid = ${JSON.stringify(nodeid)};
    function read(){
      fetch('${ROUTE_BASE}/read?nodeid=' + encodeURIComponent(nodeid))
        .then(r => r.ok ? r.text() : r.text().then(t => Promise.reject(new Error(t))))
        .then(txt => { document.getElementById('out').textContent = txt || '[пусто]'; })
        .catch(e => { document.getElementById('out').textContent = 'Ошибка: ' + e.message; });
    }
    document.getElementById('btnRead').addEventListener('click', read);
  })();
  </script>
</body></html>`);
    });

    // Заглушка чтения файла (само чтение через агент допишем следующим шагом)
    expressApp.get(ROUTE_BASE + '/read', function (req, res) {
      const nodeid = req.query.nodeid || req.query.id;
      if (!nodeid) return res.status(400).send('nodeid is required');
      // Здесь будет обращение к агенту и возврат содержимого файла.
      // Пока вернём заглушку, чтобы было видно, что UI/маршруты работают.
      return res
        .status(501)
        .send('[vpnnetfile] Чтение через агент пока не реализовано в этой сборке (UI и вкладка работают)');
    });

    // Пример обработчика /apply (на будущее, когда будем писать файл)
    expressApp.post(
      ROUTE_BASE + '/apply',
      bodyParser.json({ limit: '1mb' }),
      function (req, res) {
        // const { nodeid, content } = req.body || {};
        return res
          .status(501)
          .send('[vpnnetfile] Запись файла будет добавлена после проверки чтения');
      }
    );

    console.log('[vpnnetfile] HTTP handlers зарегистрированы');
  };

  // --------------------------------
  // Web UI: вкладка и наполнение
  // --------------------------------
  // Эта функция исполняется в БРАУЗЕРЕ. Она просто сообщает UI,
  // что нужна вкладка с указанным ID и заголовком.
  plugin.registerPluginTab = function () {
    return { tabId: 'vpnnetfile', tabTitle: 'VPN .network' };
  };

  // Когда пользователь открывает карточку устройства — наполняем DIV вкладки iframe-ом
  plugin.onDeviceRefreshEnd = function () {
    try {
      var tabId = 'vpnnetfile';
      var container =
        document.getElementById(tabId) ||
        document.getElementById('p_' + tabId) ||
        document.querySelector('#' + CSS.escape(tabId));
      if (!container) return;

      // пытаемся получить id выбранного узла из глобалов MeshCentral
      var nodeid = null;
      try {
        if (typeof currentNode !== 'undefined' && currentNode && currentNode._id) nodeid = currentNode._id;
        else if (typeof meshserver !== 'undefined' && meshserver && meshserver.currentNode && meshserver.currentNode._id) nodeid = meshserver.currentNode._id;
      } catch (_) {}

      var url = '/plugin/vpnnetfile' + (nodeid ? ('?nodeid=' + encodeURIComponent(nodeid)) : '');
      if (!container.__vpnnetfile_iframe) {
        var iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100vh - 210px)';
        iframe.style.border = '0';
        container.appendChild(iframe);
        container.__vpnnetfile_iframe = iframe;
      } else {
        container.__vpnnetfile_iframe.src = url;
      }
    } catch (e) {
      try { console.log('[vpnnetfile] onDeviceRefreshEnd error', e); } catch(_) {}
    }
  };

  // Обязательно указать, какие функции экспортируются в Web-UI
  plugin.exports = ['registerPluginTab', 'onDeviceRefreshEnd'];

  return plugin;
};
