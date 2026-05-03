# Marstek Jupiter C+ — Home Assistant Add-on

[![HA Add-on](https://img.shields.io/badge/Home%20Assistant-Add--on-blue?style=flat-square&logo=home-assistant)](https://www.home-assistant.io/addons/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

Maßgeschneiderte Home Assistant Integration für den **Marstek Jupiter C+** Energiespeicher (HMM-1 / HMN-1 / JPLS_8H).  
Basiert auf Reverse-Engineering der Hame/Marstek Cloud-MQTT-Protokolle.

---

## Features

- **MQTT Auto-Discovery** — alle Sensoren & Schalter erscheinen automatisch in HA
- **Echtzeit-Monitoring** — SOC, PV-Leistung, Batteriestatus, Netzdaten, Zell-Level
- **Steuerung** — Lademodus, Entladetiefe (DOD), Überschusseinspeisung, Zeitpläne
- **Topic-Verschlüsselung** — AES-128-CBC für `marstek_energy` Broker-Topics (hame-2025)
- **Cloud-Bridge** — optionale direkte Anbindung an Hame Cloud MQTT
- **Health Endpoint** — HTTP `/health` auf Port 8099 für Home Assistant Watchdog

---

## Schnelle Installation

1. Dieses Repository als **Custom Add-on Repository** in Home Assistant hinzufügen
2. Add-on **"Marstek Jupiter C+"** im Add-on Store installieren
3. Konfiguration anpassen (mindestens `device_id`)
4. Starten — Geräte erscheinen automatisch unter *Einstellungen → Geräte & Dienste*

> **Voraussetzung:** Home Assistant MQTT-Integration (z. B. Mosquitto Add-on) muss eingerichtet sein.

---

## Konfiguration

### Empfohlene Konfiguration (lokaler Mosquitto)

```yaml
mqtt_broker_url: mqtt://core-mosquitto:1883
mqtt_username: ""
mqtt_password: ""
topic_prefix: marstek_jupiter
device_type: JPLS-8H
device_id: "YOUR_DEVICE_ID"
broker_id: hame-2025
cloud_broker_url: ""
cloud_username: ""
cloud_password: ""
polling_interval: 60
response_timeout: 30
enable_cell_data: true
log_level: info
use_cloud_bridge: false
health_port: 8099
```

### Mit Cloud-Bridge (Hame Cloud)

> **Wichtig:** Dein Hame Cloud Passwort muss rotiert werden, falls es bereits in einer früheren Version dieser README gestanden hat.

```yaml
mqtt_broker_url: mqtt://core-mosquitto:1883
mqtt_username: ""
mqtt_password: ""
topic_prefix: marstek_jupiter
device_type: JPLS-8H
device_id: "DEINE_DEVICE_ID"
broker_id: hame-2025
cloud_broker_url: "mqtts://<DISCOVER_BROKER>:8883"
cloud_username: "deine-email@example.com"
cloud_password: "DEIN_PASSWORT"
polling_interval: 60
response_timeout: 30
enable_cell_data: true
log_level: info
use_cloud_bridge: true
health_port: 8099
```

**Hinweis: Cloud Broker URL ermitteln**
Die Hame Cloud MQTT Broker URL ist nicht öffentlich dokumentiert und variiert je nach Region/Gerätegeneration (hame-2024 vs hame-2025). Um die korrekte URL zu erhalten:
1. Installiere das offizielle [tomquist/hame-relay](https://github.com/tomquist/hame-relay) Add-on in Home Assistant
2. Starte es mit deinen Hame Cloud Zugangsdaten
3. Prüfe die Logs — dort wird die tatsächliche Broker URL angezeigt (z. B. `mqtts://...:8883`)
4. Trage diese URL in `cloud_broker_url` ein

### Optionen

| Option | Beschreibung | Default |
|--------|-------------|---------|
| `mqtt_broker_url` | MQTT Broker URL | `mqtt://core-mosquitto:1883` |
| `mqtt_username` | MQTT Username (optional) | — |
| `mqtt_password` | MQTT Password (optional) | — |
| `topic_prefix` | Präfix für HA-Discovery-Topics | `marstek_jupiter` |
| `device_type` | Gerätetyp: `JPLS_8H`, `HMM-1`, `HMN-1` | `HMM-1` |
| `device_id` | Geräte-ID (12-stellige MAC/Hex) | — |
| `broker_id` | Broker-Generation: `hame-2024` oder `hame-2025` | `hame-2025` |
| `cloud_broker_url` | Cloud MQTT Broker URL (nur bei `use_cloud_bridge: true`) | — |
| `polling_interval` | Abfrageintervall (Sekunden, 10–3600) | `60` |
| `response_timeout` | MQTT-Antwort-Timeout (Sekunden, 5–300) | `30` |
| `enable_cell_data` | Zell-Level Sensoren aktivieren | `true` |
| `log_level` | Log-Level: `trace`, `debug`, `info`, `warning`, `error` | `info` |
| `use_cloud_bridge` | Hame Cloud-Bridge aktivieren | `false` |
| `cloud_username` | Hame Cloud Username (nur mit `use_cloud_bridge: true`) | — |
| `cloud_password` | Hame Cloud Password (nur mit `use_cloud_bridge: true`) | — |
| `health_port` | Port für HA-Supervisor Health-Check | `8099` |

---

## Home Assistant Entities

### Sensoren (auto-discovered)

| Entity | Beschreibung | Einheit |
|--------|-------------|---------|
| `sensor.soc` | State of Charge | % |
| `sensor.battery_energy` | Aktuelle Batterieenergie | kWh |
| `sensor.combined_power` | Gesamtleistung (PV + Batterie + Netz) | W |
| `sensor.pv1_power` … `pv4_power` | PV-String-Leistung | W |
| `sensor.daily_charging` | Tages-Ladung | kWh |
| `sensor.daily_discharging` | Tages-Entladung | kWh |
| `sensor.monthly_charging` | Monats-Ladung | kWh |
| `sensor.monthly_discharging` | Monats-Entladung | kWh |
| `sensor.yearly_charging` | Jahres-Ladung | kWh |
| `sensor.yearly_discharging` | Jahres-Entladung | kWh |
| `sensor.grid_import` / `grid_export` | Netzbezug / -einspeisung | W |
| `sensor.wifi_signal` | WLAN-Signalstärke | dBm |
| `sensor.wifi_name` | WLAN-Name (SSID) | — |
| `sensor.depth_of_discharge` | Entladetiefe (DOD) | % |
| `sensor.inverter_temp` | Wechselrichter-Temperatur | °C |
| `sensor.battery_temp` | Batterie-Temperatur | °C |
| `sensor.battery_status` | Batterie-Status | — |
| `sensor.working_status` | Betriebsstatus | — |
| `sensor.ct_status` | CT-Status | — |
| `sensor.ct_type` | CT-Typ | — |
| `sensor.phase_type` | Phasentyp | — |
| `sensor.recharge_mode` | Nachlademodus | — |
| `sensor.error_code` | Fehlercode | — |
| `sensor.alarm_code` | Alarmcode | — |
| `sensor.auto_switch_working_mode` | Auto-Modus-Umschaltung | — |
| `sensor.http_server_type` | HTTP-Server-Typ | — |
| `sensor.bms_version` | BMS Firmware-Version | — |
| `sensor.mppt_version` | MPPT Firmware-Version | — |
| `sensor.inverter_version` | Wechselrichter Firmware-Version | — |
| `sensor.ems_version` | EMS Firmware-Version | — |
| `sensor.device_version` | Geräte Firmware-Version | — |
| `sensor.cell_*` | Zell-Level Spannungen (optional) | V |

### Schalter, Eingaben & Buttons (auto-discovered)

| Entity | Typ | Beschreibung |
|--------|-----|-------------|
| `switch.surplus_feed_in` | Switch | Überschusseinspeisung an/aus |
| `select.working_mode` | Select | `automatic` oder `manual` |
| `number.depth_of_discharge` | Number | Entladetiefe 30–88 % (Schritt 1) |
| `button.refresh` | Button | Gerätedaten manuell abfragen |
| `button.factory_reset` | Button | Werksreset auslösen (⚠️ Vorsicht) |
| `button.sync_time` | Button | Geräte-Uhrzeit synchronisieren |
| `number.time_period_{0..4}_start_hour` | Number | Zeitfenster Start-Stunde (0–23) |
| `number.time_period_{0..4}_start_minute` | Number | Zeitfenster Start-Minute (0–59) |
| `number.time_period_{0..4}_end_hour` | Number | Zeitfenster End-Stunde (0–23) |
| `number.time_period_{0..4}_end_minute` | Number | Zeitfenster End-Minute (0–59) |
| `number.time_period_{0..4}_power` | Number | Zeitfenster Leistung in W (0–10000) |
| `switch.time_period_{0..4}_enabled` | Switch | Zeitfenster aktiv/inaktiv |
| `text.time_period_{0..4}_weekday` | Text | Zeitfenster Wochentage als Bitmaske (0–127) |

---

## Architektur

```
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────────┐
│  Hame/Marstek   │─────▶│   Marstek Jupiter   │─────▶│  Home Assistant │
│   Cloud MQTT    │      │   C+ Add-on         │      │   MQTT Broker   │
│                 │◀─────│  (Discovery + Ctrl) │◀─────│   (Mosquitto)   │
└─────────────────┘      └─────────────────────┘      └─────────────────┘
         ▲                       │
         │         Cloud-Bridge  │  Health: /health:8099
         │         (optional)    │  Watchdog: Supervisor
         └───────────────────────┘
```

---

## Protokoll-Details

- **Verschlüsselung:** AES-128-CBC, Zero-IV, Base64-URL-safe (nur `hame-2025`)
- **Topics (legacy):** `hame_energy/${deviceType}/device/${deviceId}/ctrl`
- **Topics (neu):** `marstek_energy/${deviceType}/device/${encryptedId}/ctrl`
- **Steuer-Commands:** `cd=1` (refresh), `cd=2,md=1/2` (mode), `cd=13,full_d=0/1` (feed-in), `cd=56,dod=X` (DOD)

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| Keine Entities in HA | Prüfe, ob MQTT-Integration in HA aktiviert ist. Add-on Logs auf Fehler prüfen. |
| Cloud-Bridge Login fehlgeschlagen | `use_cloud_bridge: false` setzen und nur lokalen Mosquitto nutzen. |
| Verbindung zum Broker bricht ab | `broker_id` auf `hame-2024` umstellen (ältere Firmware). |
| Health-Check fehlt | Stelle sicher, dass Port `8099` nicht blockiert ist. Watchdog-URL: `http://[HOST]:8099/health` |

---

## Danksagung

Basierend auf der hervorragenden Arbeit von [tomquist/hm2mqtt](https://github.com/tomquist/hm2mqtt) und [tomquist/hame-relay](https://github.com/tomquist/hame-relay).

---

## Lizenz

MIT © 2025
