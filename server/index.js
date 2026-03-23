import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// ---- Paths ----
const BAMBU_APP_SUPPORT = path.join(
  process.env.HOME,
  "Library/Application Support/BambuStudio"
);
const BAMBU_SOURCE = path.join(BAMBU_APP_SUPPORT, "cameratools/bambu_source");
const FFMPEG = path.join(BAMBU_APP_SUPPORT, "cameratools/ffmpeg");
const PLUGINS_DIR = path.join(BAMBU_APP_SUPPORT, "plugins");
const URL_TXT = path.join(BAMBU_APP_SUPPORT, "cameratools/url.txt");
const TUTK_URLS_FILE = path.join(
  process.cwd(),
  "server/tutk_urls.json"
);

// ---- Printer config ----
const PRINTERS = [
  {
    id: "tinie",
    name: "tinie",
    ip: "192.168.1.100",
    serial: "PRINTER1SERIAL",
    model: "N7",
    accessCode: process.env.TINIE_ACCESS_CODE || "XXXXXXXX",
  },
  {
    id: "trixie",
    name: "trixie",
    ip: "192.168.1.101",
    serial: "PRINTER2SERIAL",
    model: "O1C2",
    accessCode: process.env.TRIXIE_ACCESS_CODE || "YYYYYYYY",
  },
];

// ---- TUTK URL cache (serial → url) ----
let tutkUrls = {};
try {
  tutkUrls = JSON.parse(fs.readFileSync(TUTK_URLS_FILE, "utf8"));
  console.log("Loaded TUTK URLs:", Object.keys(tutkUrls));
} catch {
  // No cache yet
}

function saveTutkUrls() {
  fs.writeFileSync(TUTK_URLS_FILE, JSON.stringify(tutkUrls, null, 2));
}

// Watch BambuStudio's url.txt for new TUTK credentials
fs.watchFile(URL_TXT, { interval: 1000 }, () => {
  try {
    const url = fs.readFileSync(URL_TXT, "utf8").trim();
    const match = url.match(/device=([A-Z0-9]+)/);
    if (!match) return;
    const serial = match[1];
    const printer = PRINTERS.find((p) => p.serial === serial);
    if (!printer) return;
    if (tutkUrls[serial] !== url) {
      tutkUrls[serial] = url;
      saveTutkUrls();
      console.log(`Updated TUTK URL for ${printer.name} (${serial})`);
      // Restart that printer's camera stream
      restartCameraStream(printer.id);
    }
  } catch {
    // ignore
  }
});

// ---- State ----
const printerStates = new Map();
const cameraProcesses = new Map(); // printerId → {proc, ws}

// ---- WebSocket server ----
const wss = new WebSocketServer({ port: 3001 });

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// ---- MQTT ----
for (const printer of PRINTERS) {
  if (!printer.accessCode) {
    printerStates.set(printer.id, {
      ...printer,
      status: "no_access_code",
      data: null,
    });
    continue;
  }

  const client = mqtt.connect(`mqtts://${printer.ip}:8883`, {
    username: "bblp",
    password: printer.accessCode,
    rejectUnauthorized: false,
    clientId: `thesituation_${printer.id}`,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log(`MQTT connected: ${printer.name}`);
    const topic = `device/${printer.serial}/report`;
    client.subscribe(topic, () => {
      client.publish(
        `device/${printer.serial}/request`,
        JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } })
      );
    });
    printerStates.set(printer.id, {
      ...printer,
      accessCode: undefined,
      status: "connected",
      data: null,
    });
    broadcast({
      type: "printer_status",
      printer: printer.id,
      state: printerStates.get(printer.id),
    });
  });

  client.on("message", (_topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (!payload.print) return;
      const existing = printerStates.get(printer.id) || {};
      const merged = {
        ...existing,
        status: "connected",
        data: { ...(existing.data || {}), ...payload.print },
        lastUpdate: Date.now(),
      };
      printerStates.set(printer.id, merged);
      broadcast({
        type: "printer_data",
        printer: printer.id,
        data: payload.print,
        timestamp: Date.now(),
      });
    } catch {
      // ignore
    }
  });

  client.on("error", (err) => {
    console.error(`MQTT error ${printer.name}:`, err.message);
    printerStates.set(printer.id, {
      ...printer,
      accessCode: undefined,
      status: "error",
      error: err.message,
      data: null,
    });
    broadcast({
      type: "printer_status",
      printer: printer.id,
      state: printerStates.get(printer.id),
    });
  });
}

// ---- Camera via bambu_source + ffmpeg ----
function startCameraStream(printerId) {
  const printer = PRINTERS.find((p) => p.id === printerId);
  if (!printer) return;

  const tutkUrl = tutkUrls[printer.serial];
  if (!tutkUrl) {
    console.log(
      `No TUTK URL for ${printer.name} — open its camera in BambuStudio to register it`
    );
    return;
  }

  // Kill any existing process
  const existing = cameraProcesses.get(printerId);
  if (existing) {
    existing.kill();
    cameraProcesses.delete(printerId);
  }

  console.log(`Starting camera stream for ${printer.name}...`);

  const bambuProc = spawn(BAMBU_SOURCE, [tutkUrl], {
    env: { ...process.env, DYLD_LIBRARY_PATH: PLUGINS_DIR },
  });

  const ffmpegProc = spawn(
    FFMPEG,
    [
      "-fflags", "nobuffer",
      "-flags", "low_delay",
      "-analyzeduration", "10",
      "-probesize", "3200",
      "-f", "h264",
      "-i", "pipe:",
      "-f", "mjpeg",
      "-q:v", "4",
      "-vf", "fps=5",
      "pipe:1",
    ],
    { env: process.env }
  );

  bambuProc.stdout.pipe(ffmpegProc.stdin);
  bambuProc.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[${printer.name} cam] ${msg}`);
  });
  ffmpegProc.stderr.on("data", () => {}); // suppress ffmpeg noise

  // Parse MJPEG frames from ffmpeg stdout
  let buf = Buffer.alloc(0);
  ffmpegProc.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    while (true) {
      // Find JPEG start marker (FF D8 FF)
      const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      if (start === -1) {
        buf = Buffer.alloc(0);
        break;
      }
      if (start > 0) buf = buf.subarray(start);

      // Find JPEG end marker (FF D9)
      const end = buf.indexOf(Buffer.from([0xff, 0xd9]), 2);
      if (end === -1) break;

      const frame = buf.subarray(0, end + 2);
      buf = buf.subarray(end + 2);

      const msg = JSON.stringify({
        type: "camera_frame",
        printer: printerId,
        frame: frame.toString("base64"),
      });

      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    }
  });

  bambuProc.on("exit", (code) => {
    console.log(`${printer.name} bambu_source exited (${code}), restarting...`);
    cameraProcesses.delete(printerId);
    setTimeout(() => startCameraStream(printerId), 5000);
  });

  ffmpegProc.on("exit", (code) => {
    console.log(`${printer.name} ffmpeg exited (${code})`);
    bambuProc.kill();
  });

  cameraProcesses.set(printerId, { kill: () => { bambuProc.kill(); ffmpegProc.kill(); } });
}

function restartCameraStream(printerId) {
  const existing = cameraProcesses.get(printerId);
  if (existing) existing.kill();
  setTimeout(() => startCameraStream(printerId), 500);
}

// Start camera streams for all printers that have TUTK URLs
for (const printer of PRINTERS) {
  if (tutkUrls[printer.serial]) {
    startCameraStream(printer.id);
  }
}

// ---- WebSocket connection handler ----
wss.on("connection", (ws) => {
  console.log("Frontend connected");
  for (const [id, state] of printerStates) {
    ws.send(JSON.stringify({ type: "printer_status", printer: id, state }));
  }

  // Check if any printers are missing TUTK URLs and notify
  for (const printer of PRINTERS) {
    if (!tutkUrls[printer.serial]) {
      ws.send(JSON.stringify({
        type: "camera_unavailable",
        printer: printer.id,
        reason: "Open this printer's camera in BambuStudio to enable the feed",
      }));
    }
  }

  ws.on("close", () => console.log("Frontend disconnected"));
});

console.log("The Situation server — ws://localhost:3001");
console.log(
  `TUTK URLs cached: ${Object.keys(tutkUrls).length}/${PRINTERS.length} printers`
);
console.log(
  `Missing: ${PRINTERS.filter((p) => !tutkUrls[p.serial]).map((p) => p.name).join(", ") || "none"}`
);
