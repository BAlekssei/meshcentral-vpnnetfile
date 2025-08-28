'use strict';

/**
 * MeshCentral plugin: vpnnetfile
 * Версия: 0.4.0
 * - Кнопка в панели «Действия» (после Run). Резервный ярлык — вверху справа.
 * - Все эндпоинты требуют авторизации (req.session.userid || req.user).
 * - Страница /plugin/vpnnetfile/view сама открывает Control-сессию и читает файл
 *   через встроенную консоль MeshAgent командой: type "<path>" 131072
 */

module.exports.vpnnetfile = function init(parent) {
  const PLUGIN    = 'vpnnetfile';
  const ROUTE     = '/plugin/vpnnetfile';
  const NETFILE   = '/etc/systemd/network/10-vpn_vpn.network';
  const VERSION   = '0.4.0';

  const p = { parent, shortName: PLUGIN, version: VERSION };
  const log = (...a) => { try { parent.debug('[vpnnetfile]', ...a); } catch { console.log('[vpnnetfile]', ...a); } };

  // ───────────────────────────────
  // BACKEND: защищённые HTTP-роуты
  // ───────────────────────────────
  p.hook_setupHttpHandlers = function (app /*, webserver, db */) {
    const expressApp =
      (app && typeof app.get === 'function') ? app :
      (app && app.app && typeof app.app.get === 'function') ? app.app :
      (p.parent && p.parent.webserver && p.parent.webserver.app && typeof p.parent.webserver.app.get === 'function') ? p.parent.webserver.app :
      null;

    if (!expressApp) { log('hook_setupHttpHandlers: express app not found, routes not registered.'); return; }

    function requireLogin(req, res, next) {
      const authed = !!(req && ((req.session && (req.session.userid || req.session.user)) || req.user));
      if (authed) return next();
      const wantsHtml = String(req.headers.accept || '').includes('text/html');
      return wantsHtml ? res.redirect('/') : res.status(401).type('text/plain').send('Unauthorized');
    }

    // Health (под auth)
    expressApp.get(`${ROUTE}/health`, requireLogin, (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, plugin: PLUGIN, version: VERSION });
    });

    // Просмотр и ЧТЕНИЕ файла через Control + Agent Console
    expressApp.get(`${ROUTE}/view`, requireLogin, (req, res) => {
      const nodeid = (req.query && req.query.nodeid) ? String(req.query.nodeid) : '';
      const esc = (s)=>String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.end(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>VPN .network — просмотр</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- политика максимально строгая, но разрешаем self и wss для control -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' wss:;">
<style>
  body{background:#0b1220;color:#e6edf3;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0}
  .wrap{max-width:1100px;margin:24px auto;padding:0 16px}
  .muted{opacity:.8}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .btn{padding:8px 12px;border:0;border-radius:8px;background:#2a66ff;color:#fff;cursor:pointer}
  .btn:hover{filter:brightness(1.05)}
  .btn[disabled]{opacity:.5;cursor:not-allowed}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  .log{margin-top:12px;padding:12px;border:1px solid #223;border-radius:8px;background:#0d1529;white-space:pre-wrap;overflow-wrap:anywhere}
  pre#out{margin-top:12px;padding:12px;border:1px solid #223;border-radius:8px;background:#0b1326;white-space:pre;overflow:auto;max-height:65vh}
  .ok{color:#22c55e}.err{color:#ef4444}
</style>
</head>
<body>
<div class="wrap">
  <h1>VPN .network — просмотр</h1>
  <div class="muted mono">Устройство: <code id="devNode">${esc(nodeid) || '—'}</code></div>

  <div class="row" style="margin-top:12px;">
    <button id="btnRead" class="btn">Показать содержимое файла</button>
    <button id="btnAgain" class="btn" style="display:none;">Обновить</button>
    <span id="status" class="muted"></span>
  </div>

  <div id="log" class="log mono" hidden></div>
  <pre id="out" class="mono" aria-live="polite">Файл: ${NETFILE}</pre>
</div>

<!-- ВАЖНО: API MeshCentral для Control -->
<script src="/meshcentral-min.js"></script>
<script>
(function(){
  const nodeid = ${JSON.stringify(nodeid)};
  const NETFILE = ${JSON.stringify(NETFILE)};
  const MAXLEN = 131072; // 128 KiB

  const btnRead = document.getElementById('btnRead');
  const btnAgain = document.getElementById('btnAgain');
  const outEl = document.getElementById('out');
  const logEl = document.getElementById('log');
  const statusEl = document.getElementById('status');

  if (!nodeid || !nodeid.startsWith('node//')) {
    outEl.textContent = 'Ошибка: некорректный nodeid.';
    btnRead.disabled = true;
    return;
  }

  let ctrl = null;
  let consId = null;
  let buffer = '';
  let reading = false;

  function setStatus(t, cls){ statusEl.className = 'muted ' + (cls||''); statusEl.textContent = t||''; }
  function addLog(t){ logEl.hidden = false; logEl.textContent += (logEl.textContent ? '\\n' : '') + t; }

  function ensureControl(){
    return new Promise((resolve,reject)=>{
      if (ctrl && ctrl.state === 3) return resolve();
      try { ctrl = MeshServerCreateControl(); } catch(e){ return reject(e); }
      ctrl.onStateChanged = function(s){ if (s === 3) resolve(); };
      ctrl.onMessage = function(msg){
        if (!msg) return;
        // данные консоли нашего id
        if (msg.action === 'console' && msg.id === consId) {
          if (msg.value && typeof msg.value === 'string') {
            buffer += msg.value;
            outEl.textContent = buffer;
          }
          if (msg.open === false || msg.closed === true) {
            setStatus('сессия закрыта','');
            reading = false;
            btnAgain.style.display = '';
          }
        }
      };
      try { ctrl.connect(); } catch(e){ reject(e); }
    });
  }

  async function openConsole(){
    await ensureControl();
    consId = 'vpnnetfile-' + Math.random().toString(36).slice(2);
    // opentype:1 — консоль MeshAgent (то же, что стандартная вкладка Console)
    ctrl.send({ action:'console', nodeid: nodeid, id: consId, opentype: 1 });
  }

  function closeConsole(){
    try { if (ctrl && consId) ctrl.send({ action:'console', id: consId, close:true }); } catch(e){}
  }

  async function readFile(){
    if (reading) return;
    reading = true; buffer = ''; outEl.textContent = '';
    setStatus('подключение…','');

    try{
      await openConsole();
      setStatus('чтение…','ok');
      // ВАЖНО: команда консоли агента
      const cmd = 'type "' + NETFILE + '" ' + MAXLEN + '\\n';
      ctrl.send({ action:'console', id: consId, value: cmd });

      // Если долго пусто — подсказка про права
      setTimeout(()=>{ if (!buffer) addLog('Пусто? Возможно, недостаточно прав у MeshAgent для чтения файла.'); }, 2000);

      setTimeout(()=>{ if (buffer) btnAgain.style.display = ''; }, 1200);
    }catch(e){
      setStatus('ошибка','err');
      outEl.textContent = 'Не удалось прочитать файл: ' + (e && e.message ? e.message : e);
      reading = false;
      closeConsole();
    }
  }

  btnRead.addEventListener('click', readFile);
  btnAgain.addEventListener('click', ()=>{ btnAgain.style.display='none'; readFile(); });
  window.addEventListener('beforeunload', closeConsole);
})();
</script>
</body>
</html>`);
    });

    // На всякий случай: старый /read больше не используем
    expressApp.get(`${ROUTE}/read`, requireLogin, (req, res) => {
      res.status(410).type('text/plain').send('This endpoint is deprecated. Open /plugin/vpnnetfile/view and click "Показать содержимое файла".');
    });

    log('HTTP routes registered at', ROUTE);
  };

  // ───────────────────────────────
  // WEB UI: кнопка «VPN .network» повыше
  // ───────────────────────────────
  p.onWebUIStartupEnd = function () { try { console.log('[vpnnetfile] webui ready'); } catch {} };

  p.onDeviceRefreshEnd = function () {
    try {
      // Узнаём nodeid
      var nodeid = null;
      try { if (typeof currentNode !== 'undefined' && currentNode && currentNode._id) nodeid = currentNode._id; } catch(_){}
      if (!nodeid) { try { var qs = new URLSearchParams(location.search); nodeid = qs.get('gotonode') || qs.get('nodeid') || qs.get('id') || ''; } catch(_) {} }
      var href = '/plugin/vpnnetfile/view' + (nodeid ? ('?nodeid=' + encodeURIComponent(nodeid)) : '');

      // 1) Вставляем СРАЗУ ПОСЛЕ «Run»
      var runBtn = document.querySelector('#MainMenuSpan input[value="Run"], #MainMenuSpan input[value="RUN"], #MainMenuSpan input[value="run"]');
      if (runBtn) {
        var exist = document.getElementById('vpnnetfile-action-btn');
        if (!exist) {
          var btn = document.createElement('input');
          btn.type = 'button'; btn.id = 'vpnnetfile-action-btn';
          btn.value = 'VPN .network'; btn.className = 'dialog-button';
          btn.style.marginLeft = '6px';
          btn.onclick = function(){ window.open(href, '_blank', 'noopener'); };
          runBtn.insertAdjacentElement('afterend', btn);
        } else {
          exist.onclick = function(){ window.open(href, '_blank', 'noopener'); };
        }
        // убрать резервный ярлык, если был
        var topfab = document.getElementById('vpnnetfile_topfab');
        if (topfab && topfab.parentNode) topfab.parentNode.removeChild(topfab);
        return;
      }

      // 2) Резерв: компактный ярлык в ПРАВОМ ВЕРХНЕМ углу
      var fab = document.getElementById('vpnnetfile_topfab');
      if (!fab) {
        fab = document.createElement('a');
        fab.id = 'vpnnetfile_topfab';
        fab.textContent = 'VPN .network';
        fab.target = '_blank'; fab.rel = 'noopener';
        fab.style.position = 'fixed'; fab.style.top = '92px'; fab.style.right = '18px'; fab.style.zIndex = 2147483000;
        fab.style.background = '#2563eb'; fab.style.color = '#fff';
        fab.style.padding = '10px 14px'; fab.style.borderRadius = '10px';
        fab.style.font = '14px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial';
        fab.style.boxShadow = '0 6px 18px rgba(0,0,0,.35)'; fab.style.textDecoration = 'none'; fab.style.opacity = '.92';
        fab.onmouseenter = function(){ fab.style.opacity = '1'; }; fab.onmouseleave = function(){ fab.style.opacity = '.92'; };
        document.body.appendChild(fab);
      }
      fab.href = href;

    } catch (e) {
      try { console.error('[vpnnetfile] onDeviceRefreshEnd error', e); } catch {}
    }
  };

  // В фронтенд экспортируем только нужные хуки
  p.exports = ['onWebUIStartupEnd', 'onDeviceRefreshEnd'];

  log('plugin loaded');
  return p;
};
