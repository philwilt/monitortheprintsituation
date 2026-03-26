# The Situation

A local dashboard for monitoring Bambu Lab 3D printers. Shows live status, temperatures, progress, filament, and camera feeds for a fleet of printers.

## Architecture

Two processes, run together with `npm run dev`:

- **Frontend** — React + TypeScript + Vite, served at `http://localhost:5173`
- **Backend** — Node.js server at `ws://localhost:3001` (WebSocket)

The frontend is a pure WebSocket consumer — it receives pushed updates and renders them. All printer communication happens in the server.

### Server (`server/index.js`)

Connects to each printer via:
- **MQTT over TLS** (port 8883) — real-time telemetry (temperatures, progress, gcode state, AMS, fans, etc.)
- **Camera** — three modes, selected per printer:
  - `tutk` (default) — uses BambuStudio's `bambu_source` + `ffmpeg` binaries; requires opening the camera in BambuStudio at least once to cache a TUTK URL in `server/tutk_urls.json`
  - `rtp` — reads `ffmpeg.sdp` written by BambuStudio "Go Live"; for X1-series
  - `tls` — direct TLS connection to port 6000; fallback for older models without TUTK support

BambuStudio binaries live at `~/Library/Application Support/BambuStudio/cameratools/` (macOS) or `~/.config/BambuStudio/cameratools/` (Linux).

### Frontend (`src/`)

- `hooks/usePrinterData.ts` — WebSocket client, reconnects every 3s on disconnect
- `components/PrinterCard.tsx` — per-printer card with state, temps, progress, filament, AMS, camera
- `components/StatusBar.tsx` — top bar with fleet-wide mood (`nominal` / `degraded` / `critical`)
- `components/HeroBanner.tsx` — decorative header

## Setup

1. Copy `server/printers.example.json` → `server/printers.json` and fill in printer details
2. `npm install`
3. `npm run dev`

### `server/printers.json` fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Unique identifier used internally |
| `name` | yes | Display name |
| `ip` | yes | Local network IP |
| `serial` | yes | Printer serial number |
| `model` | yes | Display string (e.g. `X1C`, `P1S`) |
| `accessCode` | yes | 8-character code from printer's network settings |
| `cameraMode` | no | Set to `"rtp"` for X1-series; omit for auto (TUTK → TLS fallback) |

## Commands

```bash
npm run dev          # start both frontend and server
npm run dev:frontend # vite only
npm run dev:server   # server only
npm run build        # production build
npm run lint         # eslint
```

## WebSocket message types

The server broadcasts three message types to all connected frontend clients:

- `printer_status` — full `PrinterInfo` snapshot (on connect and on MQTT connect/error)
- `printer_data` — partial `PrinterData` patch from MQTT message
- `camera_frame` — base64-encoded JPEG frame

## Notes

- `server/printers.json` and `server/tutk_urls.json` are gitignored (contain credentials/cached tokens)
- The Vite dev server is configured with `host: true` so it's accessible on the local network
- The WebSocket server (`ws://localhost:3001`) only binds to localhost — if you need it accessible on the network, change the `WebSocketServer` port binding in `server/index.js`
