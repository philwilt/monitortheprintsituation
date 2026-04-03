import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import tls from "tls";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { Client as FtpClient } from "basic-ftp";
import {
  initDb, startPrintJob, finishPrintJob, startAlert, resolveAlert, getActiveAlerts,
  getFilaments, createFilament, updateFilament, deleteFilament,
  getProfiles, createProfile, updateProfile, deleteProfile,
  getGalleryItems, createGalleryItem, updateGalleryItem, deleteGalleryItem, linkPrintJobToGallery,
  getPrintLog, getStats,
} from "./db.js";

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
const activeJobs = new Map();      // printerId → { jobId, gcodeState }

// ---- Database ----
// alertStartedAt map: printerId → ms timestamp (in-memory mirror of DB)
const alertStartedAtMap = new Map();
initDb(PRINTERS).then(async () => {
  const alerts = await getActiveAlerts();
  for (const { printer_id, started_at } of alerts) {
    alertStartedAtMap.set(printer_id, new Date(started_at).getTime());
  }
});

// Extract active filament type+color from merged printer data (mirrors frontend logic)
function getActiveFilamentInfo(data) {
  const trayNow = data.ams?.tray_now;
  if (data.ams?.ams && trayNow != null && !isNaN(parseInt(trayNow, 10)) && parseInt(trayNow, 10) < 254) {
    const idx = parseInt(trayNow, 10);
    // Strategy 1: direct tray ID match, skip empty trays
    for (const unit of data.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (tray.id === trayNow && tray.tray_type) {
          return { type: tray.tray_type, color: tray.tray_color?.slice(0, 6) };
        }
      }
    }
    // Strategy 2: global counter across all units
    let counter = 0;
    for (const unit of data.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (counter++ === idx && tray.tray_type) {
          return { type: tray.tray_type, color: tray.tray_color?.slice(0, 6) };
        }
      }
    }
    // Strategy 3: unit id matches tray_now (AMS HT)
    for (const unit of data.ams.ams) {
      if (unit.id === trayNow && unit.tray) {
        const tray = unit.tray.find((t) => t.tray_type);
        if (tray) return { type: tray.tray_type, color: tray.tray_color?.slice(0, 6) };
      }
    }
  }
  if (data.vir_slot?.length) {
    const s = data.vir_slot.find((v) => v.tray_type) ?? data.vir_slot[0];
    if (s.tray_type) return { type: s.tray_type, color: s.tray_color?.slice(0, 6) };
  }
  return null;
}

// ---- FTP helpers ----
async function ftpConnect(printer) {
  const client = new FtpClient();
  client.ftp.verbose = false;
  await client.access({
    host: printer.ip,
    port: 990,
    user: "bblp",
    password: printer.accessCode,
    secure: "implicit",
    secureOptions: { rejectUnauthorized: false },
  });
  return client;
}

async function ftpListDir(printer, dirPath) {
  const client = await ftpConnect(printer);
  try {
    const list = await client.list(dirPath);
    return list.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
      modifiedAt: f.modifiedAt?.toISOString() ?? null,
    }));
  } finally {
    client.close();
  }
}

// ---- HTTP API server (Express, port 3002) ----
const UPLOADS_DIR = path.join(process.cwd(), "server/uploads");
const upload = multer({ dest: UPLOADS_DIR });

const app = express();
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// FTP download
app.get("/ftp/download", async (req, res) => {
  const { printer: printerId, path: filePath } = req.query;
  if (!printerId || !filePath) return res.status(400).send("Missing params");
  const printer = PRINTERS.find((p) => p.id === printerId);
  if (!printer) return res.status(404).send("Printer not found");
  const client = new FtpClient();
  try {
    await client.access({ host: printer.ip, port: 990, user: "bblp", password: printer.accessCode, secure: "implicit", secureOptions: { rejectUnauthorized: false } });
    const filename = String(filePath).split("/").filter(Boolean).pop() || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    await client.downloadTo(res, String(filePath));
  } catch (err) {
    if (!res.headersSent) res.status(502).send(err.message);
  } finally {
    client.close();
  }
});

// Filaments
app.get("/api/filaments", async (_req, res) => {
  try { res.json(await getFilaments()); } catch (e) { res.status(500).send(e.message); }
});
app.post("/api/filaments", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body, image_path: req.file ? req.file.filename : null };
    res.json(await createFilament(data));
  } catch (e) { res.status(500).send(e.message); }
});
app.put("/api/filaments/:id", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image_path = req.file.filename;
    res.json(await updateFilament(req.params.id, data));
  } catch (e) { res.status(500).send(e.message); }
});
app.delete("/api/filaments/:id", async (req, res) => {
  try { await deleteFilament(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).send(e.message); }
});

// Calibration profiles
app.get("/api/profiles", async (_req, res) => {
  try { res.json(await getProfiles()); } catch (e) { res.status(500).send(e.message); }
});
app.post("/api/profiles", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body, image_path: req.file ? req.file.filename : null };
    res.json(await createProfile(data));
  } catch (e) { res.status(500).send(e.message); }
});
app.put("/api/profiles/:id", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image_path = req.file.filename;
    res.json(await updateProfile(req.params.id, data));
  } catch (e) { res.status(500).send(e.message); }
});
app.delete("/api/profiles/:id", async (req, res) => {
  try { await deleteProfile(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).send(e.message); }
});

// 3MF parser
app.post("/api/parse-3mf", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const zip = new AdmZip(req.file.path);

    // Bambu 3MF configs are JSON. Values are per-filament arrays — index 0 = primary filament.
    function parseJsonEntry(name) {
      const e = zip.getEntry(name);
      return e ? JSON.parse(e.getData().toString("utf8")) : null;
    }

    const proj = parseJsonEntry("Metadata/project_settings.config");
    if (!proj) throw new Error("Not a Bambu 3MF — missing project_settings.config");

    // Filament-specific overrides live in filament_settings_1.config (slot 1)
    const fil = parseJsonEntry("Metadata/filament_settings_1.config");

    // First element of an array field, or the scalar itself
    function first(obj, key) {
      const v = obj?.[key];
      if (v == null) return null;
      const s = Array.isArray(v) ? v[0] : v;
      return s ?? null;
    }

    function firstNum(obj, key) {
      const s = first(obj, key);
      if (s == null) return null;
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    }

    // Sum all values in an array field (for total weight across all filament slots)
    function sumArr(obj, key) {
      const v = obj?.[key];
      if (v == null) return null;
      const arr = Array.isArray(v) ? v : [v];
      const total = arr.reduce((acc, s) => {
        const n = parseFloat(s);
        return isNaN(n) ? acc : acc + n;
      }, 0);
      return total > 0 ? total : null;
    }

    // Brand: filament_settings_1 vendor takes priority (it's the user's custom profile)
    const brand = first(fil, "filament_vendor") || first(proj, "filament_vendor");

    // Save plate thumbnail as a gallery-usable image
    let thumbnail_filename = null;
    const thumbEntry = zip.getEntry("Metadata/plate_1.png") || zip.getEntry("Metadata/plate_1_small.png");
    if (thumbEntry) {
      thumbnail_filename = `thumb_${randomUUID()}.png`;
      fs.writeFileSync(path.join(UPLOADS_DIR, thumbnail_filename), thumbEntry.getData());
    }

    // Normalize compatible printer names: strip " X.Xmm nozzle" suffix
    function normalizePrinter(s) {
      return s.replace(/\s+\d+\.\d+\s*(?:nozzle|mm nozzle)?$/i, "").trim();
    }
    const compatRaw = proj.upward_compatible_machine ?? proj.print_compatible_printers ?? [];
    const compatible_printers = [...new Set(
      (Array.isArray(compatRaw) ? compatRaw : [compatRaw])
        .map(normalizePrinter)
        .filter(Boolean)
    )];

    const filament_colours = Array.isArray(proj.filament_colour)
      ? proj.filament_colour.filter(Boolean)
      : [];

    const result = {
      // calibration profile fields
      brand,
      type:                 first(proj, "filament_type"),
      nozzle_size:          firstNum(proj, "nozzle_diameter"),
      nozzle_temp:          firstNum(proj, "nozzle_temperature"),
      bed_temp:             firstNum(fil, "hot_plate_temp") ?? firstNum(proj, "hot_plate_temp"),
      fan_max_speed:        firstNum(proj, "fan_max_speed"),
      fan_min_speed:        firstNum(proj, "fan_min_speed"),
      flow_ratio:           firstNum(proj, "filament_flow_ratio"),
      pressure_advance:     firstNum(proj, "pressure_advance"),
      max_volumetric_speed: firstNum(proj, "filament_max_volumetric_speed"),
      nozzle_material:      first(proj, "nozzle_type"),
      bed_type:             proj.curr_bed_type ?? null,
      layer_height:         firstNum(proj, "layer_height"),
      filament_density:     firstNum(proj, "filament_density"),
      print_settings_id:    proj.print_settings_id ?? null,
      profile_name:         first(fil, "filament_settings_id") || first(proj, "filament_settings_id"),
      color_hex:            first(proj, "filament_colour") || first(proj, "filament_color"),
      // gallery fields
      infill_density:       proj.sparse_infill_density ?? null,
      infill_pattern:       proj.sparse_infill_pattern ?? null,
      wall_count:           proj.wall_loops != null ? parseInt(proj.wall_loops, 10) : null,
      support_enabled:      proj.enable_support === "1",
      filament_colours,
      estimated_weight_g:   sumArr(proj, "filament_used_g"),
      cost_per_kg:          firstNum(proj, "filament_cost"),
      compatible_printers,
      thumbnail_filename,
    };

    for (const k of Object.keys(result)) {
      if (result[k] == null) delete result[k];
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// Gallery items
app.get("/api/gallery", async (_req, res) => {
  try { res.json(await getGalleryItems()); } catch (e) { res.status(500).send(e.message); }
});
app.post("/api/gallery", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body, image_path: req.file ? req.file.filename : req.body.image_path || null };
    if (data.filament_colours && typeof data.filament_colours === "string") data.filament_colours = JSON.parse(data.filament_colours);
    if (data.compatible_printers && typeof data.compatible_printers === "string") data.compatible_printers = JSON.parse(data.compatible_printers);
    data.support_enabled = data.support_enabled === "true" || data.support_enabled === true;
    res.json(await createGalleryItem(data));
  } catch (e) { res.status(500).send(e.message); }
});
app.put("/api/gallery/:id", upload.single("image"), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) data.image_path = req.file.filename;
    if (data.filament_colours && typeof data.filament_colours === "string") data.filament_colours = JSON.parse(data.filament_colours);
    if (data.compatible_printers && typeof data.compatible_printers === "string") data.compatible_printers = JSON.parse(data.compatible_printers);
    data.support_enabled = data.support_enabled === "true" || data.support_enabled === true;
    res.json(await updateGalleryItem(req.params.id, data));
  } catch (e) { res.status(500).send(e.message); }
});
app.delete("/api/gallery/:id", async (req, res) => {
  try { await deleteGalleryItem(req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).send(e.message); }
});

// Stats
app.get("/api/stats", async (_req, res) => {
  try {
    const data = await getStats();
    if (!data) return res.json(null);
    res.json(data);
  } catch (e) { res.status(500).send(e.message); }
});

// Print log
app.get("/api/log", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || "7", 10), 90);
    res.json(await getPrintLog(days));
  } catch (e) { res.status(500).send(e.message); }
});

app.listen(3002, "127.0.0.1");

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
      const existingData = existing.data || {};
      // Deep-merge nested objects so tray_now and other sub-fields
      // aren't wiped by partial MQTT updates that omit them
      const mergedData = { ...existingData, ...payload.print };
      if (payload.print.ams && existingData.ams) {
        mergedData.ams = { ...existingData.ams, ...payload.print.ams };
      }
      const merged = {
        ...existing,
        status: "connected",
        data: mergedData,
        lastUpdate: Date.now(),
      };
      printerStates.set(printer.id, merged);
      broadcast({
        type: "printer_data",
        printer: printer.id,
        data: payload.print,
        timestamp: Date.now(),
      });

      // ---- Job + alert tracking ----
      const prevState = existingData.gcode_state;
      const currState = mergedData.gcode_state;
      if (currState && currState !== prevState) {
        const job = activeJobs.get(printer.id);
        if (currState === "RUNNING" && prevState !== "RUNNING") {
          startPrintJob(printer.id, mergedData.subtask_name, mergedData.gcode_file)
            .then(async (jobId) => {
              if (!jobId) return;
              const galleryMatch = await linkPrintJobToGallery(printer.id, mergedData.subtask_name);
              activeJobs.set(printer.id, { jobId, galleryItemId: galleryMatch?.id ?? null });
            });
        } else if ((currState === "FINISH" || currState === "FAILED") && job) {
          const filament = getActiveFilamentInfo(mergedData);
          finishPrintJob(
            job.jobId,
            currState === "FINISH" ? "finished" : "failed",
            mergedData.total_layer_num,
            filament?.type,
            filament?.color
          ).then(() => activeJobs.delete(printer.id));
        }

        // Alert lifecycle: PAUSE or FAILED → start; anything else → resolve
        if (currState === "PAUSE" || currState === "FAILED") {
          const now = Date.now();
          alertStartedAtMap.set(printer.id, now);
          startAlert(printer.id, currState);
          broadcast({ type: "printer_status", printer: printer.id, state: { ...merged, alertStartedAt: now } });
        } else {
          alertStartedAtMap.delete(printer.id);
          resolveAlert(printer.id);
          broadcast({ type: "printer_status", printer: printer.id, state: { ...merged, alertStartedAt: null } });
        }
      }
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
    const alertStartedAt = alertStartedAtMap.get(id) ?? null;
    ws.send(JSON.stringify({ type: "printer_status", printer: id, state: { ...state, alertStartedAt } }));
  }

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "ftp_list") {
      const printer = PRINTERS.find((p) => p.id === msg.printer);
      if (!printer) return;
      const dirPath = msg.path || "/";
      ws.send(JSON.stringify({ type: "ftp_loading", printer: msg.printer, path: dirPath }));
      try {
        const files = await ftpListDir(printer, dirPath);
        ws.send(JSON.stringify({ type: "ftp_listing", printer: msg.printer, path: dirPath, files }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "ftp_listing", printer: msg.printer, path: dirPath, files: [], error: err.message }));
      }
    }
  });
});

console.log(`The Situation — ${PRINTERS.map((p) => p.name).join(", ")} — ws://localhost:3001`);
