'use strict';

/**
 * MeshCentral plugin: vpnnetfile
 * Версия: 0.3.2
 * - Эндпоинты защищены (нужна активная сессия).
 * - Кнопка вставляется в панель «Действия» сразу после Run.
 * - Если панель не найдена — резервный ярлык в ПРАВОМ ВЕРХНЕМ углу (под синим баром).
 * - /read пока 501 — после утверждения UI подключу чтение с агента.
 */

module.exports.vpnnetfile = function init(parent) {
  const PLUGIN = 'vpnnetfile';
  const ROUTE_BASE = '/plugin/vpnnetfile';
  const NETFILE = '/etc/systemd/network/10-vpn_vpn.network';

  const p = { parent, shortName: PLUGIN, version: '0.3.2' };
  const log = (...a) => { try { parent.debug('[vpnnetfile]', ...a); } catch { console.log('[vpnnetfile]', ...a); } };

  // ─────────────── BACKEND: защищённые маршруты ───────────────
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

    expressApp.get(`${ROUTE_BASE}/health`, requireLogin, (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, plugin: PLUGIN, version: p.version });
    });

    expressApp.get(`${ROUTE_BASE}/view`, requireLogin, (req, res) => {
      const nodeid = (req.query && req.query.nodeid) ? String(req.query.nodeid) : '';
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.end(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>VPN .network — просмотр</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{background:#0b1220;color:#d7e1ff;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0}
  .wrap{max-width:1000px;margin:0 auto;padding:16px}
  .bar{display:flex;gap:10px;align-items:center;margin-bottom:12px}
  button{padding:8px 12px;border:0;border-radius:8px;cursor:pointer;background:#2a66ff;color:#fff}
  button:hover{filter:brightness(1.05)}
  pre{background:#0f172a;border:1px solid #223;padding:12px;border-radius:8px;overflow:auto;min-height:220px;white-space:pre-wrap}
  .muted{opacity:.8}
</style>
</head>
<body>
<div class="wrap">
  <h1>VPN .network — просмотр</h1>
  <div class="muted">Устройство: <code>${nodeid || '—'}</code></div>
  <div class="bar">
    <button id="btnShow">Показать содержимое файла</button>
    <a href="javascript:history.back()">← Вернуться</a>
  </div>
  <pre id="out">Нажмите «Показать содержимое файла».\n\nПуть: ${NETFILE}\n\n(Пока заглушка: backend вернёт 501)</pre>
</div>
<script>
document.getElementById('btnShow').addEventListener('click', async () => {
  const out = document.getElementById('out');
  out.textContent = 'Запрос...';
  try{
    const r = await fetch('/plugin/vpnnetfile/read?nodeid=' + encodeURIComponent('${nodeid}'), { credentials:'same-origin', cache:'no-store' });
    const txt = await r.text();
    out.textContent = txt;
  }catch(e){
    out.textContent = 'Ошибка запроса: ' + (e?.message || e);
  }
});
</script>
</body></html>`);
    });

    expressApp.get(`${ROUTE_BASE}/read`, requireLogin, (req, res) => {
      res.status(501).type('text/plain; charset=utf-8').set('Cache-Control','no-store')
         .end('501 Not Implemented\\n\\nЗаготовка чтения файла на агенте: ' +
              '${NETFILE}\\nnodeid=' + (req.query.nodeid||''));
    });

    log('HTTP routes registered at', ROUTE_BASE);
  };

  // ─────────────── WEB UI: кнопка выше ───────────────
  p.onWebUIStartupEnd = function () { try { console.log('[vpnnetfile] webui ready'); } catch {} };

  p.onDeviceRefreshEnd = function () {
    try {
      // nodeid
      var nodeid = null;
      try { if (typeof currentNode !== 'undefined' && currentNode && currentNode._id) nodeid = currentNode._id; } catch(_){}
      if (!nodeid) { try { var qs = new URLSearchParams(location.search); nodeid = qs.get('gotonode') || qs.get('nodeid') || qs.get('id') || ''; } catch(_) {} }
      var href = '/plugin/vpnnetfile/view' + (nodeid ? ('?nodeid=' + encodeURIComponent(nodeid)) : '');

      // 1) пробуем вставить СРАЗУ ПОСЛЕ «Run» в панели «Действия»
      var runBtn = document.querySelector('#MainMenuSpan input[value="Run"], #MainMenuSpan input[value="RUN"], #MainMenuSpan input[value="run"]');
      if (runBtn) {
        // удалим резервный ярлык, если был
        var fabTop = document.getElementById('vpnnetfile_topfab');
        if (fabTop && fabTop.parentNode) fabTop.parentNode.removeChild(fabTop);

        // не дублируем
        var exist = document.getElementById('vpnnetfile-action-btn');
        if (!exist) {
          var btn = document.createElement('input');
          btn.type = 'button';
          btn.id   = 'vpnnetfile-action-btn';
          btn.value = 'VPN .network';
          btn.className = 'dialog-button';
          btn.style.marginLeft = '6px';
          btn.onclick = function(){ window.open(href, '_blank', 'noopener'); };
          runBtn.insertAdjacentElement('afterend', btn);
        } else {
          exist.onclick = function(){ window.open(href, '_blank', 'noopener'); };
        }
        return; // успех — выше уже не надо
      }

      // 2) если кнопка Run не найдена, пытаемся в саму ячейку панели
      var actionsRow = document.querySelector('#MainMenuSpan table tr');
      var td = actionsRow ? (actionsRow.querySelector('td:last-child') || actionsRow.lastElementChild) : null;
      if (td) {
        var ex2 = document.getElementById('vpnnetfile-action-btn');
        if (!ex2) {
          var b2 = document.createElement('input');
          b2.type = 'button';
          b2.id   = 'vpnnetfile-action-btn';
          b2.value = 'VPN .network';
          b2.className = 'dialog-button';
          b2.style.marginLeft = '6px';
          b2.onclick = function(){ window.open(href, '_blank', 'noopener'); };
          td.appendChild(b2);
        } else {
          ex2.onclick = function(){ window.open(href, '_blank', 'noopener'); };
        }
        // и уберем резервный ярлык
        var fabTop2 = document.getElementById('vpnnetfile_topfab');
        if (fabTop2 && fabTop2.parentNode) fabTop2.parentNode.removeChild(fabTop2);
        return;
      }

      // 3) РЕЗЕРВ: компактный ярлык в правом ВЕРХНЕМ углу (под шапкой)
      var fab = document.getElementById('vpnnetfile_topfab');
      if (!fab) {
        fab = document.createElement('a');
        fab.id = 'vpnnetfile_topfab';
        fab.textContent = 'VPN .network';
        fab.target = '_blank'; fab.rel = 'noopener';
        fab.style.position = 'fixed';
        fab.style.top = '92px';            // выше!
        fab.style.right = '18px';
        fab.style.zIndex = 2147483000;
        fab.style.background = '#2563eb';
        fab.style.color = '#fff';
        fab.style.padding = '10px 14px';
        fab.style.borderRadius = '10px';
        fab.style.font = '14px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial';
        fab.style.boxShadow = '0 6px 18px rgba(0,0,0,.35)';
        fab.style.textDecoration = 'none';
        fab.style.opacity = '.92';
        fab.onmouseenter = function(){ fab.style.opacity = '1'; };
        fab.onmouseleave = function(){ fab.style.opacity = '.92'; };
        document.body.appendChild(fab);
      }
      fab.href = href;

    } catch (e) {
      try { console.error('[vpnnetfile] onDeviceRefreshEnd error', e); } catch {}
    }
  };

  p.exports = ['onWebUIStartupEnd', 'onDeviceRefreshEnd'];

  log('plugin loaded');
  return p;
};
