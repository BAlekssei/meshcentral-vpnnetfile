'use strict';

/**
 * meshcentral-vpnnetfile — плагин для MeshCentral
 * UI-вкладка + эндпоинты:
 *   GET  /plugin/vpnnetfile/show?nodeid=...    — показать содержимое файла
 *   POST /plugin/vpnnetfile/apply              — записать новый контент (с бэкапом) и перезапустить networkd
 *
 * Экспорт должен быть ИМЕННЫМ и совпадать с config.json.shortName: "vpnnetfile".
 */

module.exports.vpnnetfile = function (parent) {
  const path = require('path');
  const fs = require('fs');

  const plugin = {};
  plugin.parent = parent;
  plugin.shortName = 'vpnnetfile';

  // ===== Настройки =====
  const TARGET_FILE = '/etc/systemd/network/10-vpn_vpn.network';
  const ROUTE_BASE  = '/plugin/vpnnetfile';

  // ===== Адаптер запуска команд на агенте =====
  async function runOnAgent(nodeid, script, opts = {}) {
    // TODO: привяжите к вашему способу удалённого запуска (Run Commands / ScriptTask).
    // Верните stdout (строкой).
    throw new Error(
      'runOnAgent() не привязан к API MeshCentral. ' +
      'Свяжите с механизмом «Run Commands»/ScriptTask и верните stdout.'
    );
  }

  // ===== Вспомогательное: простой JSON-парсер без express.json =====
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        // простая защита от слишком больших тел (1 МБ)
        if (data.length > 1 * 1024 * 1024) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          const obj = data ? JSON.parse(data) : {};
          resolve(obj);
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  // ===== Вкладка на карточке устройства =====
  plugin.registerPluginTab = () => ({
    tabId: plugin.shortName,
    tabTitle: 'VPN .network'
  });

  // ===== HTTP-маршруты =====
  // ВАЖНО: MeshCentral передаёт webserver, Express-приложение лежит в webserver.app
  plugin.hook_setupHttpHandlers = function (webserver /*, _maybeExpress */) {
    const app = (webserver && webserver.app) ? webserver.app : webserver;
    if (!app || typeof app.get !== 'function') {
      throw new Error('Не удалось получить Express-приложение (webserver.app).');
    }

    // UI
    app.get(`${ROUTE_BASE}/ui`, (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'ui.html'));
    });

    // CSS
    app.get(`${ROUTE_BASE}/style.css`, (req, res) => {
      res.type('text/css').send(
        fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8')
      );
    });

    // Просмотр файла
    app.get(`${ROUTE_BASE}/show`, async (req, res) => {
      try {
        const nodeid = String((req.query && req.query.nodeid) || '').trim();
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
        res.status(500).type('text/plain').send(String(e && e.stack || e));
      }
    });

    // Применение изменений (без express.json)
    app.post(`${ROUTE_BASE}/apply`, async (req, res) => {
      try {
        const body = await readJson(req);
        const nodeid = body && body.nodeid;
        const content = body && body.content;

        if (!nodeid || typeof content !== 'string') {
          return res.status(400).type('text/plain').send('nodeid и content обязательны');
        }
        if (!content.trim()) {
          return res.status(400).type('text/plain').send('Пустое содержимое — нечего применять.');
        }

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
        if (e && /Invalid JSON|Payload too large/.test(String(e))) {
          return res.status(400).type('text/plain').send(String(e.message || e));
        }
        res.status(500).type('text/plain').send(String(e && e.stack || e));
      }
    });
  };

  // Экспорт для UI (чтобы вкладка отобразилась в интерфейсе)
  plugin.exports = ['registerPluginTab'];

  return plugin;
};
