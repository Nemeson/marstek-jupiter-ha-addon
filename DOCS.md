# DOCS.md — Marstek Jupiter C+ Add-on

Detaillierte technische Dokumentation für Entwickler und fortgeschrittene Benutzer.

---

## Inhaltsverzeichnis

1. [Architekturübersicht](#architekturübersicht)
2. [MQTT Protokoll](#mqtt-protokoll)
3. [Verschlüsselung](#verschlüsselung)
4. [Home Assistant Discovery](#home-assistant-discovery)
5. [Command API](#command-api)
6. [Cloud Bridge](#cloud-bridge)
7. [Health & Monitoring](#health--monitoring)
8. [Fehlerbehebung](#fehlerbehebung)
9. [Erweiterte Konfiguration](#erweiterte-konfiguration)

---

## Architekturübersicht

```
┌─────────────────┐      ┌──────────────────────────────┐      ┌─────────────────┐
│  Hame/Marstek   │      │  Marstek Jupiter C+ Add-on   │      │  Home Assistant  │
│   Cloud MQTT    │◀────▶│  (Node.js / TypeScript)    │◀────▶│   MQTT Broker    │
│                 │      │                              │      │  (Mosquitto)     │
└─────────────────┘      │  • MQTT Client               │      └─────────────────┘
                         │  • Parser / Commands           │
                         │  • Encryption                │
                         │  • Cloud Bridge (optional)   │
                         │  • Health Server             │
                         └──────────────────────────────┘
                                        │
                                        ▼
                              HTTP /health:8099
                              (HA Supervisor Watchdog)
```

### Komponenten

| Modul | Zweck |
|-------|-------|
| `mqttClient.ts` | Verbindung zum lokalen MQTT Broker, Discovery-Publish, Command-Handler |
| `commands.ts` | Command Builder für das Jupiter C+ Protokoll (`cd=...`) |
| `parser.ts` | Comma-separated `key=value` Payload Parser |
| `encryption.ts` | AES-128-CBC Topic-Verschlüsselung für hame-2025 Broker |
| `cloudBridge.ts` | Optionale Bidirektionale Cloud-MQTT Bridge |
| `hameApi.ts` | Hame Cloud REST API Client (Login, Device Discovery) |
| `health.ts` | HTTP Health-Check Server für HA Supervisor |
| `config.ts` | Env-Var Konfiguration mit Bashio Integration |

---

## MQTT Protokoll

### Topics (Legacy vs. Neu)

| Generation | Topic Muster |
|-----------|-------------|
| hame-2024 (legacy) | `hame_energy/${deviceType}/device/${deviceId}/ctrl` |
| hame-2025 (verschlüsselt) | `marstek_energy/${deviceType}/device/${encryptedId}/ctrl` |

Das Add-on subscribiert auf **beide** Topics und sendet Commands ebenfalls auf beide — das Gerät antwortet auf dem Topic, das es versteht.

### Payload Format

```
cel_c=95,cel_p=2800,grd_o=1200,grd_d=-500,pv1_p=1500,wor_m=1,ful_d=0,dod=50
```

- Comma-separated `key=value` Paare
- Kein festes Schema — unbekannte Keys werden als generische Sensoren angelegt
- Cell-Level Data: alle Keys mit Präfix `cel_` werden als Zellspannungen/SOC extrahiert

---

## Verschlüsselung

### AES-128-CBC (hame-2025)

- **Algorithmus**: AES-128-CBC
- **IV**: Zero-IV (16 Null-Bytes)
- **Key**: `!@#$%^&*()_+{}[]` (hardcoded für hame-2025)
- **Encoding**: Base64 URL-safe (`+` → `-`, `/` → `_`, `=` entfernt)

```typescript
// Beispiel
const deviceId = 'YOUR_MAC_ADDRESS_HEX';
const encryptedId = encryptDeviceId(deviceId, '!@#$%^&*()_+{}[]');
// → z. B. "d4x9K2mPqR..."
```

Das verschlüsselte Topic ist rückwärts-kompatibel: ältere Firmware (hame-2024) ignoriert verschlüsselte Topics einfach.

---

## Home Assistant Discovery

### Discovery Topics

Das Add-on publiziert Discovery-Nachrichten auf Standard HA MQTT Discovery Topics:

```
homeassistant/sensor/${deviceType}_${deviceId}/${objectId}/config
homeassistant/switch/${deviceType}_${deviceId}/surplus_feed_in/config
homeassistant/select/${deviceType}_${deviceId}/working_mode/config
homeassistant/number/${deviceType}_${deviceId}/depth_of_discharge/config
```

### Discovery Payload (Beispiel)

```json
{
  "name": "SOC",
  "state_topic": "marstek_jupiter/HMM-1/device/YOUR_MAC_ADDRESS_HEX/soc",
  "availability_topic": "marstek_jupiter/HMM-1/availability/YOUR_MAC_ADDRESS_HEX",
  "unique_id": "HMM-1_YOUR_MAC_ADDRESS_HEX_soc",
  "device": {
    "identifiers": ["HMM-1_YOUR_MAC_ADDRESS_HEX"],
    "name": "Marstek Jupiter HMM-1",
    "manufacturer": "Marstek",
    "model": "HMM-1"
  },
  "unit_of_measurement": "%",
  "device_class": "battery",
  "value_template": "{{ value_json.value }}"
}
```

### State Format

Alle Sensor-States werden als JSON publiziert:

```json
{ "value": 95, "unit": "%" }
```

Dies erlaubt `value_template: "{{ value_json.value }}"` in der Discovery-Konfiguration.

---

## Command API

### Commands (cd=…)

| Command | Beschreibung | Beispiel |
|---------|-------------|----------|
| `cd=1` | Refresh runtime info | `cd=1` |
| `cd=2,md=1` | Working mode automatic | `cd=2,md=1` |
| `cd=2,md=2` | Working mode manual | `cd=2,md=2` |
| `cd=13,full_d=1` | Surplus feed-in ON | `cd=13,full_d=1` |
| `cd=13,full_d=0` | Surplus feed-in OFF | `cd=13,full_d=0` |
| `cd=56,dod=50` | Discharge depth 50% | `cd=56,dod=50` |
| `cd=3,th=8,tm=30,eh=16,em=0,vv=2000,as=1` | Time period 08:30–16:00, 2000W, enabled | `cd=3,th=8,tm=30,eh=16,em=0,vv=2000,as=1` |
| `cd=14` | BMS info request | `cd=14` |
| `cd=4,yy=2025,mm=5,rr=3,hh=14,mn=30` | Sync time | `cd=4,yy=2025,mm=5,rr=3,hh=14,mn=30` |

### Command Retry

- **Max Retries**: 3
- **Backoff**: Exponentiell `min(1000*2^attempt, 10000)` ms
- **Deduplizierung**: Map-Key = Payload-String
- **Cleanup**: Retries werden bei Disconnect gelöscht

---

## Cloud Bridge

### Funktionsweise

Wenn `use_cloud_bridge: true`:

1. `HameApiClient` loggt sich bei `eu.hamedata.com` ein
2. Erhält MQTT Credentials (Token-basiert)
3. `CloudBridge` verbindet sich mit `mqtt.hamedata.com:1883`
4. **Bidirektionales Forwarding**:
   - Cloud → Local: Alle Geräte-Topics werden auf den lokalen Broker gepusht
   - Local → Cloud: Alle Control-Commands werden an die Cloud weitergeleitet

### Sicherheit

- Cloud Credentials werden **niemals** im lokalen MQTT publiziert
- Token-basierte Auth gegen Cloud Broker
- Add-on kann ohne Cloud Bridge betrieben werden (lokaler Mosquitto only)

---

## Health & Monitoring

### Health Endpoint

```
GET http://[ADDON_IP]:8099/health
```

**200 OK** (gesund):
```json
{ "status": "healthy", "mqtt": true, "timestamp": 1714742400000 }
```

**503 Service Unavailable** (nicht gesund):
```json
{ "status": "unhealthy", "mqtt": false, "timestamp": 1714742400000 }
```

### HA Supervisor Integration

Die `config.yaml` definiert `watchdog: http://[HOST]:8099/health` — der Supervisor startet das Add-on neu, wenn der Health-Check fehlschlägt.

### Availability Topic

```
marstek_jupiter/HMM-1/availability/YOUR_MAC_ADDRESS_HEX
```

- `online` wenn Gerät innerhalb von `3 × pollingInterval` gesehen
- `offline` sonst (retain: true)

---

## Fehlerbehebung

### Keine Entities in HA

1. Prüfe MQTT-Integration in HA (*Einstellungen → Geräte & Dienste → MQTT*)
2. Prüfe Add-on Logs auf Verbindungsfehler
3. Prüfe `broker_id` — bei älterer Firmware auf `hame-2024` stellen
4. Prüfe `device_id` — muss 12-stellige Hex sein

### Cloud Bridge Login fehlgeschlagen

1. Prüfe `cloud_username` und `cloud_password`
2. Setze `use_cloud_bridge: false` und nutze nur lokalen Mosquitto
3. Prüfe Netzwerk-Zugriff zu `eu.hamedata.com`

### Verbindung bricht ständig ab

1. Erhöhe `response_timeout` (Default: 30s)
2. Prüfe MQTT Broker URL (`mqtt_broker_url`)
3. Prüfe Netzwerk-Stabilität zwischen HA und Gerät

### Time-Period Commands funktionieren nicht

1. Prüfe, ob `timePeriodStartHour`, `timePeriodStartMinute`, `timePeriodEndHour`, `timePeriodEndMinute`, `timePeriodPower`, `timePeriodEnabled` im State vorhanden sind
2. Die Time-Period Command wird nur gesendet, wenn **alle** Werte bekannt sind
3. Prüfe Logs auf `Sending time-period command` Debug-Meldung

---

## Erweiterte Konfiguration

### Umgebungsvariablen

Alle `config.yaml` Optionen werden als Env-Vars exportiert (via `run.sh`):

| Env-Var | Beschreibung |
|---------|-------------|
| `MQTT_BROKER_URL` | Lokaler MQTT Broker |
| `MQTT_USERNAME` | MQTT Username |
| `MQTT_PASSWORD` | MQTT Password |
| `TOPIC_PREFIX` | HA Discovery Topic Präfix |
| `DEVICE_TYPE` | Gerätetyp |
| `DEVICE_ID` | Geräte-ID |
| `BROKER_ID` | Broker-Generation |
| `POLLING_INTERVAL` | Polling-Intervall (Sekunden) |
| `RESPONSE_TIMEOUT` | MQTT Response Timeout |
| `ENABLE_CELL_DATA` | Zell-Level Data aktivieren |
| `LOG_LEVEL` | Log-Level |
| `USE_CLOUD_BRIDGE` | Cloud Bridge aktivieren |
| `CLOUD_USERNAME` | Cloud Username |
| `CLOUD_PASSWORD` | Cloud Password |
| `CLOUD_BROKER_URL` | Cloud MQTT Broker URL |
| `HEALTH_PORT` | Health Server Port |

### Log-Level

| Level | Nutzung |
|-------|---------|
| `trace` | MQTT Payloads, Discovery Payloads |
| `debug` | Commands, State-Updates, Reconnects |
| `info` | Startup, Discovery publish, Polling start |
| `warn` | Reconnects, Timeouts, unerwartete Topics |
| `error` | Verbindungsfehler, Command-Fehler |

---

## Referenzen

- [Home Assistant Add-on Entwicklung](https://developers.home-assistant.io/docs/add-ons)
- [Home Assistant MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery)
- [tomquist/hm2mqtt](https://github.com/tomquist/hm2mqtt)
- [tomquist/hame-relay](https://github.com/tomquist/hame-relay)
