// helloworld.js
module.exports = function (parent) {
  const plugin = {};
  plugin._parent = parent;

  // Создаём вкладку плагина в разделе "Plugins" на странице устройства
  // По доке: registerPluginTab -> верни { tabId, tabTitle }, div с таким ID создастся автоматически.
  plugin.registerPluginTab = function () {
    return { tabId: 'helloworldTab', tabTitle: 'Плагины' };
  };

  // Когда выбран девайс и страница перерисована — наполним нашу вкладку
  // По доке: onDeviceRefreshEnd вызывается при выборе устройства в Web UI.
  plugin.onDeviceRefreshEnd = function () {
    const el = (typeof document !== 'undefined') && document.getElementById('helloworldTab');
    if (el && !el._helloInit) {
      el._helloInit = true;
      el.innerHTML = '<div style="padding:12px;font-size:14px;">hello world</div>';
    }
  };

  // Экспортировать ничего не требуется — используем только хуки Web UI
  plugin.exports = [];

  return plugin;
};