# Marstek Jupiter C+ Home Assistant Add-on

Maßgeschneiderte Home Assistant Integration für den Marstek Jupiter C+ Energiespeicher.

## Funktionen

- **Automatische Geräte-Erkennung** via MQTT Discovery
- **Echtzeit-Monitoring**: SOC, PV-Leistung, Batteriestatus, Netzdaten
- **Steuerung**: Lademodus, Entladetiefe, Einspeisung, Zeitpläne
- **Cloud-Bridge**: Direkte Anbindung an Hame/Marstek Cloud MQTT
- **Health Endpoint**: Integrierte Überwachung für Home Assistant Watchdog

## Schnelle Installation

1. Dieses Repository als Custom Repository in Home Assistant hinzufügen
2. Add-on installieren
3. Konfiguration anpassen (MQTT Broker, Geräte-ID)
4. Starten

## Konfiguration

```yaml
mqtt_broker_url: mqtt://homeassistant:1883
mqtt_username: ""
mqtt_password: ""
topic_prefix: marstek_jupiter
device_type: HMM-1
device_id: "001a2b3c4d5e"
polling_interval: 60
response_timeout: 30
enable_cell_data: true
log_level: info
```

## Architektur

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Hame/Marstek   │────▶│   Add-on     │────▶│  Home Assistant │
│   Cloud MQTT    │     │  (MQTT+HA    │     │   MQTT Entities │
│                 │◀────│  Discovery)  │◀────│     + Cards     │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

## Danksagung

Basierend auf der hervorragenden Arbeit von [tomquist/hm2mqtt](https://github.com/tomquist/hm2mqtt) und [tomquist/hame-relay](https://github.com/tomquist/hame-relay).
