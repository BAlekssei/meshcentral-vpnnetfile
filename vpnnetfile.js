// helloworld.js
module.exports = function (parent) {
  const plugin = {};
  plugin._parent = parent;

  // создаём вкладку плагина (куда можно выводить контент)
  // MeshCentral сам сделает DIV с таким ID и заголовком (официальный хук)
  plugin.registerPluginTab = function () {
    return { tabId: 'helloworldTab', tabTitle: 'Hello World' };
  };

  // вызывается при каждом выборе устройства в Web UI (официальный хук)
  plugin.onDeviceRefreshEnd = function () {
    const d = (typeof document !== 'undefined') ? document : null;
    if (!d) return;

    // 1) Мини-контент во вкладке плагина (однократно)
    const tab = d.getElementById('helloworldTab');
    if (tab && !tab._helloInit) {
      tab._helloInit = true;
      tab.innerHTML = '<div style="padding:12px;font-size:14px;">hello world</div>';
    }

    // 2) «Быстрая» кнопка в шапке устройства (рядом с Actions/Заметки)
    if (!d.getElementById('helloworldQuickBtn')) {
      // ищем любую существующую кнопку Actions/Действия как ориентир для стилей и места вставки
      let anchorBtn = Array.from(d.querySelectorAll('button, a')).find(e =>
        /^(Actions|Действия)$/i.test((e.textContent || '').trim())
      );
      if (!anchorBtn) {
        // запасные якоря — другие стандартные кнопки
        anchorBtn = Array.from(d.querySelectorAll('button, a')).find(e =>
          /^(Notes|Log Event|Message|Заметки|Журнал|Сообщение)$/i.test((e.textContent || '').trim())
        );
      }

      const btn = d.createElement('button');
      btn.id = 'helloworldQuickBtn';
      btn.type = 'button';
      // копируем класс для визуальной консистентности, иначе используем базовый
      btn.className = anchorBtn ? (anchorBtn.className || '') : '';
      btn.style.marginLeft = '6px';
      btn.textContent = 'Hello World';

      btn.onclick = function () {
        // лёгкий «тост» вместо alert
        let toast = d.getElementById('helloworldToast');
        if (!toast) {
          toast = d.createElement('div');
          toast.id = 'helloworldToast';
          toast.style.position = 'fixed';
          toast.style.right = '16px';
          toast.style.bottom = '16px';
          toast.style.padding = '10px 14px';
          toast.style.background = '#333';
          toast.style.color = '#fff';
          toast.style.borderRadius = '8px';
          toast.style.fontSize = '14px';
          toast.style.zIndex = 9999;
          d.body.appendChild(toast);
        }
        toast.textContent = 'hello world';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { try { toast.remove(); } catch (e) {} }, 3000);
      };

      if (anchorBtn && anchorBtn.parentElement) {
        anchorBtn.parentElement.insertBefore(btn, anchorBtn.nextSibling);
      } else {
        // если якорь не нашли — вставим в заголовок карточки устройства или как есть
        const titleBar = d.querySelector('#p20titlebar, .deviceTitleBar, .xdeviceHeader');
        (titleBar || d.body).appendChild(btn);
      }
    }
  };

  // экспортов не требуется
  plugin.exports = [];

  return plugin;
};
