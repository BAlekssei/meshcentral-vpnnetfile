# meshcentral-vpnnetfile


Плагин добавляет вкладку **VPN .network** на карточке устройства и даёт:
- **Показать** содержимое `/etc/systemd/network/10-vpn_vpn.network`.
- **Применить** новое содержимое файла (с бэкапом и перезапуском `systemd-networkd`).


## Установка (локальная)
1. Скопируйте каталог `meshcentral-vpnnetfile` в `meshcentral-data/plugins/meshcentral-vpnnetfile`.
2. Убедитесь, что в `config.json` сервера включены плагины:
```json
{ "plugins": { "enabled": true } }