# Marstek Jupiter C+ — Home Assistant Add-on

[![HA Add-on](https://img.shields.io/badge/Home%20Assistant-Add--on-blue?style=flat-square&logo=home-assistant)](https://www.home-assistant.io/addons/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

Maßgeschneiderte Home Assistant Integration für den **Marstek Jupiter C+** Energiespeicher (HMM-1 / HMN-1 / JPLS-1).  
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
device_type: HMM-1
device_id: "YOUR_MAC_ADDRESS_HEX"
broker_id: hame-2025
polling_interval: 60
response_timeout: 30
enable_cell_data: true
log_level: info
use_cloud_bridge: false
cloud_username: ""
cloud_password: ""
health_port: 8099
```

### Mit Cloud-Bridge (Hame Cloud)

```yaml
mqtt_broker_url: mqtt://core-mosquitto:1883
mqtt_username: ""
mqtt_password: ""
topic_prefix: marstek_jupiter
device_type: HMM-1
device_id: "YOUR_MAC_ADDRESS_HEX"
broker_id: hame-2025
polling_interval: 60
response_timeout: 30
enable_cell_data: true
log_level: info
use_cloud_bridge: true
cloud_username: "YOUR_EMAIL"
cloud_password: "jh7jwx8W7&XLAI2VA^"
health_port: 8099
```

### Optionen

| Option | Beschreibung | Default |
|--------|-------------|---------|
| `mqtt_broker_url` | MQTT Broker URL | `mqtt://core-mosquitto:1883` |
| `mqtt_username` | MQTT Username (optional) | — |
| `mqtt_password` | MQTT Password (optional) | — |
| `topic_prefix` | Präfix für HA-Discovery-Topics | `marstek_jupiter` |
| `device_type` | Gerätetyp: `HMM-1`, `HMN-1`, `JPLS-1` | `HMM-1` |
| `device_id` | Geräte-ID (12-stellige MAC/Hex) | — |
| `broker_id` | Broker-Generation: `hame-2024` oder `hame-2025` | `hame-2025` |
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
| `sensor.wifi_signal` | WLAN-Signalstärke | dBm |
| `sensor.depth_of_discharge` | Entladetiefe | % |
| `sensor.grid_import` / `grid_export` | Netzbezug / -einspeisung | W |

### Schalter & Eingaben (auto-discovered)

| Entity | Typ | Beschreibung |
|--------|-----|-------------|
| `switch.surplus_feed_in` | Switch | Überschusseinspeisung an/aus |
| `select.working_mode` | Select | `automatic` oder `manual` |
| `number.depth_of_discharge` | Number | Entladetiefe 30–88 % (Schritt 1) |

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
