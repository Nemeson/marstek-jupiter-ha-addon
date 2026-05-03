# CONTRIBUTING.md — Marstek Jupiter C+ Add-on

Danke für dein Interesse, zu diesem Projekt beizutragen!

---

## Entwicklungsumgebung

### Voraussetzungen

- Node.js 20+
- npm oder pnpm
- TypeScript
- Docker (optional, für Image-Build)

### Setup

```bash
git clone https://github.com/Nemeson/marstek-jupiter-ha-addon.git
cd marstek-jupiter-ha-addon
npm install
```

### Build

```bash
# TypeScript kompilieren
npx tsc

# Oder mit Watch-Mode
npx tsc --watch
```

### Lint / Format

```bash
# (Optional) ESLint einrichten
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npx eslint src/
```

---

## Projektstruktur

```
marstek-jupiter-ha-addon/
├── src/
│   ├── index.ts           # Entry Point
│   ├── config.ts          # Konfiguration (Env-Vars)
│   ├── mqttClient.ts      # MQTT Client + Discovery
│   ├── commands.ts        # Jupiter C+ Command Builder
│   ├── parser.ts          # Payload Parser
│   ├── encryption.ts      # AES-128-CBC Verschlüsselung
│   ├── cloudBridge.ts     # Cloud-MQTT Bridge
│   ├── hameApi.ts         # Hame Cloud REST API
│   └── health.ts          # Health HTTP Server
├── dist/                  # Kompiliertes JavaScript
├── config.yaml            # HA Add-on Manifest
├── Dockerfile             # Multi-Stage Docker Build
├── run.sh                 # Bashio Entry Script
├── package.json           # Node.js Dependencies
├── tsconfig.json          # TypeScript Config
├── README.md              # Benutzer-Dokumentation
├── DOCS.md                # Technische Dokumentation
└── ROADMAP.md             # Projekt-Roadmap
```

---

## Coding Standards

### TypeScript

- **Striktes Typing**: Kein `any`, keine `@ts-ignore`
- **Null Safety**: Optional chaining (`?.`) und Nullish coalescing (`??`)
- **Async/Await**: Keine `.then()`-Chains, kein `new Promise()` ohne Notwendigkeit
- **Error Handling**: Alle `await` in `try/catch`, keine leeren catch-Blocks

### MQTT

- **QoS 1** für alle Commands und Discovery-Payloads
- **Retain: true** für Discovery und Availability
- **Retain: false** für State-Updates
- **Reconnection**: `reconnectPeriod: 5000`, `connectTimeout: 30000`

### Commands

- Commands werden auf **beide** Topics (legacy + encrypted) gesendet
- Retry-Logik: max 3 Versuche, exponentielles Backoff
- Deduplizierung via Payload-String Map-Key

### Discovery

- Alle Entities müssen `availability_topic` haben
- `unique_id` Format: `${deviceType}_${deviceId}_${objectId}`
- `device` Block mit `identifiers`, `name`, `manufacturer`, `model`

---

## Commit-Konventionen

Wir nutzen [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

| Type | Nutzung |
|------|---------|
| `feat` | Neue Features |
| `fix` | Bugfixes |
| `docs` | Dokumentation |
| `ci` | CI/CD Änderungen |
| `refactor` | Code-Refactoring |
| `test` | Tests |
| `chore` | Maintenance |

### Beispiele

```
feat: add time-period select entity for working mode
fix: handle undefined cell data gracefully
docs: update troubleshooting section
ci: optimize GitHub Actions build time
```

---

## Pull Request Prozess

1. **Fork** das Repository
2. Erstelle einen **Feature-Branch**: `git checkout -b feat/my-feature`
3. Committe mit Conventional Commits
4. Pushe zum Fork: `git push origin feat/my-feature`
5. Erstelle einen **Pull Request** mit:
   - Klare Beschreibung der Änderung
   - Verlinkung zu relevanten Issues
   - Test-Ergebnisse (TypeScript Build, Docker Build)

### PR Checkliste

- [ ] TypeScript Build erfolgreich (`npx tsc --noEmit`)
- [ ] Keine `any`-Typen oder `@ts-ignore`
- [ ] Discovery-Payloads validiert (JSON Format)
- [ ] Commands auf beiden Topics gesendet
- [ ] Dokumentation aktualisiert (README.md, DOCS.md)
- [ ] ROADMAP.md aktualisiert falls Epic abgeschlossen

---

## Testing

### Lokale Tests

```bash
# TypeScript Build
npx tsc --noEmit

# Node.js Smoke Test (nur wenn MQTT Broker verfügbar)
# Kopiere .env.example → .env und passe an
# node dist/index.js
```

### Docker Build Test

```bash
# Multi-Stage Build
docker build -t marstek-jupiter:test .

# Health-Check testen
docker run -p 8099:8099 -e HEALTH_PORT=8099 marstek-jupiter:test
# curl http://localhost:8099/health
```

---

## Issue Reporting

### Bug Reports

Bitte folgende Informationen angeben:

1. **Add-on Version** (siehe Supervisor Logs)
2. **Home Assistant Version**
3. **Gerätetyp und Firmware** (falls bekannt)
4. **Log-Auszug** (Supervisor → Add-on → Logs)
5. **Reproduktionsschritte**
6. **Erwartetes vs. tatsächliches Verhalten**

### Feature Requests

1. Beschreibe das Problem, das gelöst werden soll
2. Beschreibe die gewünschte Lösung
3. Beschreibe Alternativen, die du in Betracht gezogen hast
4. Verlinke relevante Protokoll-Dokumentation oder Reverse-Engineering

---

## Reverse-Engineering

Wenn du neue Protokoll-Features reverse-engineerst:

1. Dokumentiere die Payload-Struktur in `DOCS.md`
2. Füge Parser-Unterstützung in `parser.ts` hinzu
3. Erstelle Command Builder in `commands.ts`
4. Update `mqttClient.ts` Discovery und Handler
5. Füge Test-Cases hinzu (wenn Test-Framework verfügbar)

### Nützliche Tools

- `mosquitto_sub -h mqtt.hamedata.com -t '#'` (Cloud Bridge on)
- `tcpdump` / `Wireshark` für MQTT-Paket-Analyse
- Home Assistant Developer Tools → States für Discovery-Validierung

---

## Code of Conduct

- Respektiere alle Mitwirkenden
- Konstruktives Feedback, keine persönlichen Angriffe
- Fokus auf technische Lösungen
- Dokumentiere Entscheidungen (warum, nicht nur was)

---

## Lizenz

Durch Beiträge zu diesem Projekt stimmst du zu, dass deine Beiträge unter der MIT-Lizenz veröffentlicht werden.
