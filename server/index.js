import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import tls from "tls";
import fs from "fs";
import path from "path";
import os from "os";

// ---- Paths ----
const HOME = process.env.HOME || os.homedir();
const IS_MAC = process.platform === "darwin";

const BAMBU_APP_SUPPORT = IS_MAC
  ? path.join(HOME, "Library/Application Support/BambuStudio")
  : path.join(HOME, ".config/BambuStudio");

const BAMBU_SOURCE = path.join(BAMBU_APP_SUPPORT, "cameratools/bambu_source");
const FFMPEG = path.join(BAMBU_APP_SUPPORT, "cameratools/ffmpeg");
const PLUGINS_DIR = path.join(BAMBU_APP_SUPPORT, "plugins");
const URL_TXT = path.join(BAMBU_APP_SUPPORT, "cameratools/url.txt");
const SDP_FILE = path.join(BAMBU_APP_SUPPORT, "cameratools/ffmpeg.sdp");
const TUTK_URLS_FILE = path.join(process.cwd(), "server/tutk_urls.json");
const PRINTERS_FILE = path.join(process.cwd(), "server/printers.json");

// ---- Printer config ----
let PRINTERS;
try {
  PRINTERS = JSON.parse(fs.readFileSync(PRINTERS_FILE, "utf8"));
} catch {
  console.error(
    "ERROR: server/printers.json not found.\n" +
    "Copy server/printers.example.json → server/printers.json and fill in your printer details."
  );
  process.exit(1);
}

// ---- TUTK URL cache (serial → url) ----
let tutkUrls = {};
try {
  tutkUrls = JSON.parse(fs.readFileSync(TUTK_URLS_FILE, "utf8"));
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
      console.log(`TUTK URL refreshed: ${printer.name}`);
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

// ---- Camera frame helpers ----
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const MAX_BUF = 4 * 1024 * 1024; // 4MB safety cap

// Send a frame to all connected clients, skipping any that are backed up
function broadcastFrame(printerId, frame) {
  const msg = JSON.stringify({
    type: "camera_frame",
    printer: printerId,
    frame: frame.toString("base64"),
  });
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.bufferedAmount < 512 * 1024) {
      client.send(msg);
    }
  }
}

// Parse complete JPEG frames out of a rolling buffer.
// Returns the unconsumed remainder as a fresh allocation (releases old buffer).
function parseJpegFrames(buf, onFrame) {
  if (buf.length > MAX_BUF) return Buffer.alloc(0); // safety: drop if too large

  while (true) {
    const start = buf.indexOf(JPEG_SOI);
    if (start === -1) return Buffer.alloc(0);
    if (start > 0) buf = buf.subarray(start);

    const end = buf.indexOf(JPEG_EOI, 2);
    if (end === -1) break;

    // Copy frame to a fresh buffer so the old allocation can be GC'd
    onFrame(Buffer.from(buf.subarray(0, end + 2)));
    buf = buf.subarray(end + 2);
  }

  // Compact remainder into a fresh allocation to release the original chunk
  return Buffer.from(buf);
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
    console.error(`MQTT error ${printer.name}: ${err.message}`);
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
    console.log(`No TUTK URL for ${printer.name} — open its camera in BambuStudio to register it`);
    return;
  }

  const existing = cameraProcesses.get(printerId);
  if (existing) {
    existing.kill();
    cameraProcesses.delete(printerId);
  }

  const libPathVar = IS_MAC ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";
  const bambuProc = spawn(BAMBU_SOURCE, [tutkUrl], {
    env: { ...process.env, [libPathVar]: PLUGINS_DIR },
  });

  const ffmpegProc = spawn(
    FFMPEG,
    [
      "-f", "h264",
      "-i", "pipe:",
      "-f", "mjpeg",
      "-q:v", "1",
      "-vf", "fps=30",
      "pipe:1",
    ],
    { env: process.env }
  );

  bambuProc.stdout.pipe(ffmpegProc.stdin);
  bambuProc.stderr.on("data", () => {});
  ffmpegProc.stderr.on("data", () => {});
  ffmpegProc.stdin.on("error", () => {}); // suppress EPIPE when bambu_source dies

  let buf = Buffer.alloc(0);
  let firstFrame = true;
  ffmpegProc.stdout.on("data", (chunk) => {
    buf = parseJpegFrames(Buffer.concat([buf, chunk]), (frame) => {
      if (firstFrame) {
        console.log(`Camera live: ${printer.name} (TUTK)`);
        firstFrame = false;
      }
      broadcastFrame(printerId, frame);
    });
  });

  bambuProc.on("exit", (code) => {
    cameraProcesses.delete(printerId);
    if (firstFrame) console.log(`Camera failed: ${printer.name} (TUTK exited ${code}) — TUTK URL may be expired, open camera in BambuStudio`);
    setTimeout(() => startCameraStream(printerId), 5000);
  });

  ffmpegProc.on("exit", () => {
    bambuProc.kill();
  });

  cameraProcesses.set(printerId, { kill: () => { bambuProc.kill(); ffmpegProc.kill(); } });
}

// ---- RTP camera stream (BambuStudio Go Live, X1-series) ----
const rtpBackoff = new Map();

function startRTPCameraStream(printerId) {
  const printer = PRINTERS.find((p) => p.id === printerId);
  if (!printer) return;

  const existing = cameraProcesses.get(printerId);
  if (existing) {
    existing.kill();
    cameraProcesses.delete(printerId);
  }

  const ffmpegProc = spawn(FFMPEG, [
    "-protocol_whitelist", "file,udp,rtp",
    "-i", SDP_FILE,
    "-f", "mjpeg",
    "-q:v", "1",
    "-vf", "fps=30",
    "pipe:1",
  ], { env: process.env });

  ffmpegProc.stderr.on("data", () => {});

  let buf = Buffer.alloc(0);
  let firstFrame = true;
  ffmpegProc.stdout.on("data", (chunk) => {
    buf = parseJpegFrames(Buffer.concat([buf, chunk]), (frame) => {
      if (firstFrame) {
        console.log(`Camera live: ${printer.name} (RTP)`);
        rtpBackoff.delete(printerId);
        firstFrame = false;
      }
      broadcastFrame(printerId, frame);
    });
  });

  ffmpegProc.on("exit", () => {
    cameraProcesses.delete(printerId);
    const delay = Math.min(rtpBackoff.get(printerId) || 5000, 60000);
    rtpBackoff.set(printerId, delay * 2);
    setTimeout(() => startRTPCameraStream(printerId), delay);
  });

  cameraProcesses.set(printerId, { kill: () => ffmpegProc.kill() });
}

// ---- TLS camera stream (port 6000, older Bambu models) ----
const tlsBackoff = new Map();

function startTLSCameraStream(printerId) {
  const printer = PRINTERS.find((p) => p.id === printerId);
  if (!printer) return;

  const existing = cameraProcesses.get(printerId);
  if (existing) {
    existing.kill();
    cameraProcesses.delete(printerId);
  }

  const socket = tls.connect(6000, printer.ip, { rejectUnauthorized: false }, () => {
    const header = Buffer.from([0x00, 0x00, 0x00, 0x40, 0xb8, 0xce, 0x5f, 0x45, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const user = Buffer.alloc(32);
    Buffer.from("bblp").copy(user);
    const pass = Buffer.alloc(32);
    Buffer.from(printer.accessCode, "hex").copy(pass);
    socket.write(Buffer.concat([header, user, pass]));
  });

  let buf = Buffer.alloc(0);
  let framesFound = 0;
  const MAGIC = Buffer.from([0x40, 0x49, 0x50, 0x43]); // @IPC

  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX_BUF) { buf = Buffer.alloc(0); return; }

    while (buf.length >= 16) {
      if (!buf.subarray(0, 4).equals(MAGIC)) {
        const idx = buf.indexOf(MAGIC, 1);
        if (idx === -1) { buf = Buffer.alloc(0); break; }
        buf = buf.subarray(idx);
        continue;
      }
      const dataLen = buf.readUInt32LE(8);
      if (buf.length < 16 + dataLen) break;

      // Copy frame and compact remainder to release the old allocation
      const frame = Buffer.from(buf.subarray(16, 16 + dataLen));
      buf = Buffer.from(buf.subarray(16 + dataLen));
      framesFound++;
      if (framesFound === 1) {
        console.log(`Camera live: ${printer.name} (TLS)`);
        tlsBackoff.delete(printerId);
      }
      broadcastFrame(printerId, frame);
    }
  });

  socket.on("error", (err) => {
    console.error(`Camera error ${printer.name}: ${err.message}`);
  });

  socket.on("close", () => {
    cameraProcesses.delete(printerId);
    const delay = Math.min(tlsBackoff.get(printerId) || 5000, 300000);
    tlsBackoff.set(printerId, delay * 2);
    setTimeout(() => startTLSCameraStream(printerId), delay);
  });

  cameraProcesses.set(printerId, { kill: () => socket.destroy() });
}

function restartCameraStream(printerId) {
  const existing = cameraProcesses.get(printerId);
  if (existing) existing.kill();
  setTimeout(() => startCameraStream(printerId), 500);
}

// Start camera streams
for (const printer of PRINTERS) {
  if (printer.cameraMode === "rtp") {
    startRTPCameraStream(printer.id);
  } else if (tutkUrls[printer.serial]) {
    startCameraStream(printer.id);
  } else {
    startTLSCameraStream(printer.id);
  }
}

// ---- WebSocket connection handler ----
wss.on("connection", (ws) => {
  for (const [id, state] of printerStates) {
    ws.send(JSON.stringify({ type: "printer_status", printer: id, state }));
  }
});

console.log(`The Situation — ${PRINTERS.map((p) => p.name).join(", ")} — ws://localhost:3001`);
