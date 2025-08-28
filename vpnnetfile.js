// meshcentral-vpnnetfile — минимальный плагин: вкладка на устройстве + два эндпоинта
// /plugin/vpnnetfile/show — показать содержимое файла
// /plugin/vpnnetfile/apply — применить новый контент (с бэкапом + рестарт networkd)


module.exports = function (parent) {
const plugin = {};
plugin.parent = parent; // MeshCentral plugin host
plugin.shortName = 'vpnnetfile';


// ===============
// ВСПОМОГАТЕЛЬНОЕ: адаптер под вашу версию MeshCentral для запуска shell на агенте
// Замените содержимое runOnAgent на фактический вызов «Run Commands»/exec.
// Ожидается, что вернёт текстовый stdout удалённой команды или бросит ошибку.
async function runOnAgent(nodeid, script, opts = {}) {
// TODO: ***** ВАЖНО *****
// Ниже — два безопасных варианта интеграции. Выберите один и реализуйте вместо throw:
//
// (A) Использовать внутренний API, как это делает плагин ScriptTask:
// - Найдите в исходниках MeshCentral методы отправки команд агенту из сервера
// (обычно доступны через parent.parent.*). В новых версиях смотрите как
// плагин ScriptTask вызывает выполнение скрипта на узле.
//
// (B) Использовать уже настроенный на сервере «Run Commands» как сервис:
// - Если у вас есть helper/обёртка (например, task runner), вызовите её здесь.
//
// Возврат должен быть строкой вывода.
throw new Error('runOnAgent() не привязан к API MeshCentral: свяжите с вашим "Run Commands". См. README.');
}


// Вкладка на странице устройства (отображается как отдельная панель)
plugin.registerPluginTab = () => ({ tabId: plugin.shortName, tabTitle: 'VPN .network' });


// Роуты
plugin.hook_setupHttpHandlers = function (app, express) {
// Статика UI
app.get('/plugin/vpnnetfile/ui', (req, res) => {
res.sendFile(require('path').join(__dirname, 'public', 'ui.html'));
});
app.get('/plugin/vpnnetfile/style.css', (req, res) => {
res.type('text/css').send(require('fs').readFileSync(require('path').join(__dirname, 'public', 'style.css'), 'utf8'));
});


// Показ содержимого файла
app.get('/plugin/vpnnetfile/show', async (req, res) => {
try {
const nodeid = req.query.nodeid;
if (!nodeid) return res.status(400).send('nodeid обязателен');


const showScript = `#!/usr/bin/env bash\nset -euo pipefail\nFILE="/etc/systemd/network/10-vpn_vpn.network"\nif [ ! -e \"$FILE\" ]; then\n echo \"Файл не найден: $FILE\"; exit 2;\nfi\necho \"== stat ==\"\nstat \"$FILE\" || true\necho\necho \"== содержимое ==\"\ncat -n \"$FILE\"\n`;


const out = await runOnAgent(nodeid, showScript);
res.type('text/plain').send(out);
} catch (e) {
res.status(500).type('text/plain').send(String(e && e.stack || e));
}
});


// Применение изменений файла
app.post('/plugin/vpnnetfile/apply', express.json({ limit: '1mb' }), async (req, res) => {
try {
const { nodeid, content } = req.body || {};
if (!nodeid || typeof content !== 'string') return res.status(400).send('nodeid и content обязательны');


const applyScript = `#!/usr/bin/env bash\nset -euo pipefail\nFILE=\"/etc/systemd/network/10-vpn_vpn.network\"\nTMP=\"$(mktemp)\"; TS=\"$(date +%Y%m%d-%H%M%S)\"\nsudo mkdir -p /etc/systemd/network\n[ -f \"$FILE\" ] && sudo cp -a \"$FILE\" \"${FILE}.bak.${TS}\" || true\ncat > \"$TMP\" <<'EOF'\n${content}\nEOF\nsudo install -m 0644 -o root -g root \"$TMP\" \"$FILE\"; rm -f \"$TMP\"\nif systemctl is-enabled --quiet systemd-networkd 2>/dev/null; then\n sudo networkctl reload || true\n sudo systemctl restart systemd-networkd\nfi\necho \"OK: $FILE обновлён\"\n`;


const out = await runOnAgent(nodeid, applyScript);
res.type('text/plain').send(out);
} catch (e) {
res.status(500).type('text/plain').send(String(e && e.stack || e));
}
});
};


// Экспорт: чтобы вкладка появилась в UI
plugin.exports = ['registerPluginTab'];
return plugin;
};