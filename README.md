# Marstek Jupiter C+ Home Assistant Add-on

Maßgeschneiderte Home Assistant Integration für den **Marstek Jupiter C+** Energiespeicher.

## Funktionen

- **Automatische Geräte-Erkennung** via MQTT Discovery
- **Echtzeit-Monitoring**: SOC, PV-Leistung, Batteriestatus, Netzdaten
- **Steuerung**: Lademodus, Entladetiefe (DOD), Einspeisung, Zeitpläne
- **Cloud-Bridge**: Optionale direkte Anbindung an Hame/Marstek Cloud MQTT
- **Health Endpoint**: Integrierte Überwachung auf Port 8099 für Home Assistant Watchdog
- **Topic-Verschlüsselung**: Automatische AES-128-CBC Verschlüsselung für `marstek_energy` Broker

## Schnelle Installation

1. Dieses Repository als Custom Repository in Home Assistant hinzufügen
2. Add-on installieren
3. Konfiguration anpassen (MQTT Broker, Geräte-ID)
4. Starten

## Konfiguration

### Grundkonfiguration (lokaler Mosquitto)

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

### Mit Cloud-Bridge

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

### Konfigurationsoptionen

| Option | Beschreibung | Default |
|--------|-------------|---------|
| `mqtt_broker_url` | MQTT Broker URL | `mqtt://core-mosquitto:1883` |
| `mqtt_username` | MQTT Username (optional) | - |
| `mqtt_password` | MQTT Password (optional) | - |
| `topic_prefix` | Präfix für HA-Topics | `marstek_jupiter` |
| `device_type` | Gerätetyp (z.B. HMM-1) | `HMM-1` |
| `device_id` | Geräte-ID (MAC-Adresse) | - |
| `broker_id` | Broker-Generation (`hame-2024` oder `hame-2025`) | `hame-2025` |
| `polling_interval` | Abfrageintervall in Sekunden | `60` |
| `response_timeout` | Antwort-Timeout in Sekunden | `30` |
| `enable_cell_data` | Zell-Level Daten abfragen | `false` |
| `log_level` | Log-Level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |
| `use_cloud_bridge` | Cloud-Bridge aktivieren | `false` |
| `cloud_username` | Hame Cloud Username | - |
| `cloud_password` | Hame Cloud Password | - |
| `health_port` | Port für Health-Check HTTP-Server | `8099` |

## Home Assistant Entities

### Sensoren
- **SOC** - State of Charge (%)
- **Battery Energy** - Aktuelle Batterieenergie (kWh)
- **Combined Power** - Gesamtleistung (W)
- **PV1-PV4 Power** - PV-Eingänge (W)
- **Daily Charging/Discharging** - Tagesstatistik (kWh)
- **WiFi Signal** - Signalstärke (dBm)
- **Depth of Discharge** - Entladetiefe (%)

### Steuerung
- **Surplus Feed-In** (Switch) - Überschusseinspeisung an/aus
- **Working Mode** (Select) - `automatic` oder `manual`
- **Depth of Discharge** (Number) - Entladetiefe 30-88%

## Architektur

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Hame/Marstek   │────▶│   Add-on     │────▶│  Home Assistant │
│   Cloud MQTT    │     │  (MQTT+HA    │     │   MQTT Entities │
│                 │◀────│  Discovery)  │◀────│     + Cards     │
└─────────────────┘     └──────────────┘     └─────────────────┘
         ▲                                              ▲
         │         Cloud-Bridge (optional)             │
         └──────────────────────────────────────────────┘
```

## Danksagung

Basierend auf der hervorragenden Arbeit von [tomquist/hm2mqtt](https://github.com/tomquist/hm2mqtt) und [tomquist/hame-relay](https://github.com/tomquist/hame-relay).

## Lizenz

MIT
