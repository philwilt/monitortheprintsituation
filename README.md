```
  _____ _            ____  _ _               _   _
 |_   _| |__   ___  / ___|(_) |_ _   _  __ _| |_(_) ___  _ __
   | | | '_ \ / _ \ \___ \| | __| | | |/ _` | __| |/ _ \| '_ \
   | | | | | |  __/  ___) | | |_| |_| | (_| | |_| | (_) | | | |
   |_| |_| |_|\___| |____/|_|\__|\__,_|\__,_|\__|_|\___/|_| |_|
```

> "Monitoring the situation."

---

## What is this

A real-time 3D printer fleet monitoring dashboard. It watches your Bambu Lab printers so you don't have to. Well, you still have to. But now you have a dashboard while you do it.

```
        .--.
       |o_o |     <- you, watching the dashboard
       |:_/ |        watching the printers
      //   \ \       watching the filament
     (|     | )      watching the temps
    /'\_   _/`\      everything is fine
    \___)=(___/      probably
```

## The Vibe

This is a mission control interface. Not a toy. Not a "fun colorful maker dashboard." This is where you sit in a dark room at 2am staring at nozzle temperatures and whispering "hold steady" to a machine that cannot hear you.

```
    ┌─────────────────────────────────────────┐
    │  STATUS: nominal                    [■] │
    │─────────────────────────────────────────│
    │  ┌──────────┐ ┌──────────┐              │
    │  │ tinie    │ │ trixie   │              │
    │  │ ████░░ 67%│ │ ██░░░░ 33%│              │
    │  │ 210°C    │ │ 215°C    │              │
    │  │ nominal  │ │ nominal  │              │
    │  └──────────┘ └──────────┘              │
    │                                         │
    │  "everything is under observation"      │
    └─────────────────────────────────────────┘
```

## Features

- **Real-time MQTT** — connects directly to your printers' local MQTT brokers. No cloud. No Bambu accounts. Just raw, unfiltered printer telemetry.
- **Live camera feeds** — streams JPEG frames from the printer's TLS camera port. You can watch your benchy being born.
- **Heartbeat animations** — a gentle pulsing dot for each printer that's actively printing. It's like a vital signs monitor but for plastic extrusion.
- **Deadpan status messages** — "Holding steady." "Not ideal." "We're watching it." No exclamation points. Never.
- **Anomaly detection** — flags temperature deviations with the calmness of someone who has seen things.
- **System mood** — the entire background subtly shifts color based on fleet health. You won't notice it. That's the point.
- **Hover-to-expand** — cards reveal fan speeds, AMS filament trays, and other details on hover. Minimal by default.
- **Scanline overlay** — because we are monitoring a situation and situations require scanlines.

## Architecture

```
  ┌─────────────┐     MQTT/TLS      ┌──────────────┐
  │ Bambu Lab   │◄──────────────────►│   Node.js    │
  │ Printers    │    port 8883       │   Server     │
  │             │                    │              │
  │  (tinie)    │◄── Camera TLS ────►│  - MQTT sub  │
  │  (trixie)   │    port 6000       │  - Camera    │
  └─────────────┘                    │    proxy     │
                                     └──────┬───────┘
                                            │ WebSocket
                                            │ port 3001
                                     ┌──────▼───────┐
                                     │    React     │
                                     │   Frontend   │
                                     │              │
                                     │  "the        │
                                     │   situation" │
                                     └──────────────┘
```

**Server** (`server/index.js`):
- Connects to each printer via MQTT over TLS
- Subscribes to telemetry reports (temps, progress, AMS, state)
- Proxies camera feeds (TLS port 6000 → JPEG frame parsing → base64 over WS)
- Broadcasts everything to the frontend via WebSocket

**Frontend** (`src/`):
- React + TypeScript + Vite
- Custom WebSocket hook for real-time data
- No state management library because we are not animals
- CSS that looks like it was designed by someone who has opinions about monitor calibration

## Setup

```bash
# Install dependencies
npm install

# Configure your printer access codes
cp server/.env.example server/.env
# Edit server/.env with your printer access codes
# (Settings > Wi-Fi > Access Code on the printer LCD)

# Run everything
npm run dev
```

```
    ( ^_^)  ← you after it works
   _/   \_
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TINIE_ACCESS_CODE` | Access code for the printer named tinie |
| `TRIXIE_ACCESS_CODE` | Access code for the printer named trixie |

Get these from each printer's touchscreen: **Settings > Wi-Fi > Access Code**

## Adding More Printers

Edit the `PRINTERS` array in `server/index.js`. Each printer needs:
- `id` — unique identifier
- `name` — display name
- `ip` — local IP address
- `serial` — printer serial number (on the label, or in the printer's network settings)
- `model` — model identifier
- `accessCode` — LAN access code

The dashboard auto-scales. Add 2 printers or 200. The grid will figure it out.

```
  printer: *exists*

  the situation:
         ___
        /   \
       | o o |
       |  >  |    "I'm watching you"
        \___/
```

## Tech Stack

- **React 19** — because we live in the future
- **TypeScript** — because we have trust issues
- **Vite** — because life is short
- **Node.js + Express** — the backend
- **MQTT.js** — talking to printers
- **WebSocket** — talking to the frontend
- **CSS** — hand-written, no Tailwind, we suffer with dignity

## The Microcopy

The dashboard speaks in a calm, understated tone. Here is the official mood chart:

```
  Printer State    │  What We Say
  ─────────────────┼──────────────────────
  Printing (>90%)  │  "Almost there"
  Printing (>50%)  │  "Holding steady"
  Printing (>10%)  │  "On track"
  Printing (<10%)  │  "Just getting started"
  Idle             │  "Awaiting orders"
  Paused           │  "We're watching it"
  Error            │  "Not ideal"
  Finished         │  "Job done"
  Preparing        │  "Getting ready"
  Offline          │  "Signal lost"
```

No exclamation points were harmed in the making of this software.

## Screenshots

You'll have to run it yourself. Trust the process.

```
         ,_---~~~~~----._
  _,,_,*^____      _____``*g*\"*,
 / __/ /'     ^.  /      \ ^@q   f
[  @f | @))    |  | @))   l  0 _/
 \`/   \~____ / __ \_____/    \
  |           _l__l_           I
  }          [______]           I
  ]            | | |            |
  ]             ~ ~             |
  |                            |
   |                           |

   this is fine dot jpg
```

## License

Do whatever you want with it. Monitor responsibly.

---

```
  _____
 /     \
| () () |    "the situation is under control"
|   ^   |    "probably"
|  \_/  |
 \_____/
```
