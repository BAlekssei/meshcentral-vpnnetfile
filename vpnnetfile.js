'use strict';

/**
 * meshcentral-vpnnetfile — плагин для MeshCentral
 * Вкладка на карточке устройства + два эндпоинта:
 *   GET  /plugin/vpnnetfile/show?nodeid=...    — показать содержимое файла
 *   POST /plugin/vpnnetfile/apply              — записать новый контент (с бэкапом) и перезапустить networkd
 *
 * ВАЖНО: Экспорт должен быть ИМЕННЫМ, совпадающим с config.json.shortName.
 * В нашем случае shortName = "vpnnetfile", значит:
 *   module.exports.vpnnetfile = function (parent) { ... }
 */

module.exports.vpnnetfile = function (parent) {
  const path = require('path');
  const fs = require('fs');

  const plugin = {};
  plugin.parent = parent;               // плагин-хост
  plugin.shortName = 'vpnnetfile';

  // ======== Настройки плагина (можно вынести в config позже) ========
  const TARGET_FILE = '/etc/systemd/network/10-vpn_vpn.network';
  const ROUTE_BASE  = '/plugin/vpnnetfile';

  // ======== Адаптер: запуск shell-скрипта на агенте ========
  /**
   * ВАЖНО: эту функцию нужно "подвязать" к вашему MeshCentral:
   * - повторить способ, как плагин ScriptTask запускает команды;
   * - или вызвать ваш существующий раннер.
   *
   * Ожидается, что функция вернёт stdout как строку.
   */
  async function runOnAgent(nodeid, script, opts = {}) {
    // --------- TODO: Реализуйте запуск на агенте под вашу версию MeshCentral ----------
    // Ниже — явная ошибка, чтобы было понятно, что адаптер не подключён.
    // Когда подключите, верните текстовый вывод команды (stdout).
    throw new Error(
      'runOnAgent() не привязан к API MeshCentral. ' +
      'Свяжите с механизмом «Run Commands»/ScriptTask и верните stdout.'
    );
  }

  // ======== Вкладка на карточке устройства ========
  plugin.registerPluginTab = () => ({
    tabId: plugin.shortName,
    tabTitle: 'VPN .network'
  });

  // ======== HTTP-маршруты плагина ========
  plugin.hook_setupHttpHandlers = function (app, express) {

    // UI (простая статическая страница)
    app.get(`${ROUTE_BASE}/ui`, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'ui.html'));
    });

    // Статический CSS
    app.get(`${ROUTE_BASE}/style.css`, (req, res) => {
      res.type('text/css').send(
        fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8')
      );
    });

    // Показ содержимого файла на удалённом узле
    app.get(`${ROUTE_BASE}/show`, async (req, res) => {
      try {
        const nodeid = (req.query.nodeid || '').trim();
        if (!nodeid) return res.status(400).type('text/plain').send('nodeid обязателен');

        // Скрипт только читает файл (и печатает чуть диагностической инфы)
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
        res.status(500).type('text/plain').send(String(e && e.stack || e));
      }
    });

    // Применение нового содержимого файла на удалённом узле
    app.post(`${ROUTE_BASE}/apply`, express.json({ limit: '1mb' }), async (req, res) => {
      try {
        const { nodeid, content } = req.body || {};
        if (!nodeid || typeof content !== 'string') {
          return res.status(400).type('text/plain').send('nodeid и content обязательны');
        }
        if (!content.trim()) {
          return res.status(400).type('text/plain').send('Пустое содержимое — нечего применять.');
        }

        // Скрипт делает бэкап и атомарно заменяет файл, затем пытается перезапустить networkd
        const applyScript = `#!/usr/bin/env bash
set -euo pipefail
FILE="${TARGET_FILE}"
TMP="$(mktemp)"
TS="$(date +%Y%m%d-%H%M%S)"
sudo mkdir -p "$(dirname "$FILE")"
if [ -f "$FILE" ]; then
  sudo cp -a "$FILE" "${FILE}.bak.${TS}"
fi
cat > "$TMP" <<'EOF'
${content}
EOF
sudo install -m 0644 -o root -g root "$TMP" "$FILE"
rm -f "$TMP"
if systemctl is-enabled --quiet systemd-networkd 2>/dev/null; then
  sudo networkctl reload || true
  sudo systemctl restart systemd-networkd
else
  echo "Внимание: systemd-networkd не включён (enable + start при необходимости)."
fi
echo "OK: ${TARGET_FILE} обновлён"
`;

        const out = await runOnAgent(String(nodeid).trim(), applyScript);
        res.type('text/plain').send(out);
      } catch (e) {
        res.status(500).type('text/plain').send(String(e && e.stack || e));
      }
    });
  };

  // Возвращаем объект плагина
  return plugin;
};
