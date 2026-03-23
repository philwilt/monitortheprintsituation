import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import tls from "tls";

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

// Store latest state for each printer
const printerStates = new Map();

// WebSocket server for frontend
const wss = new WebSocketServer({ port: 3001 });

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// Connect to each printer's MQTT broker
for (const printer of PRINTERS) {
  if (!printer.accessCode) {
    console.warn(
      `No access code for ${printer.name} — set ${printer.id.toUpperCase()}_ACCESS_CODE env var`
    );
    printerStates.set(printer.id, {
      ...printer,
      status: "no_access_code",
      data: null,
    });
    broadcast({
      type: "printer_status",
      printer: printer.id,
      state: printerStates.get(printer.id),
    });
    continue;
  }

  const mqttUrl = `mqtts://${printer.ip}:8883`;
  console.log(`Connecting MQTT to ${printer.name} at ${mqttUrl}...`);

  const client = mqtt.connect(mqttUrl, {
    username: "bblp",
    password: printer.accessCode,
    rejectUnauthorized: false,
    clientId: `thesituation_${printer.id}`,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log(`MQTT connected to ${printer.name}`);
    const topic = `device/${printer.serial}/report`;
    client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Subscribe error for ${printer.name}:`, err);
        return;
      }
      console.log(`Subscribed to ${topic}`);

      // Request full status push
      client.publish(
        `device/${printer.serial}/request`,
        JSON.stringify({
          pushing: { sequence_id: "0", command: "pushall" },
        })
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
      // Non-JSON message, ignore
    }
  });

  client.on("error", (err) => {
    console.error(`MQTT error for ${printer.name}:`, err.message);
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

  client.on("close", () => {
    console.log(`MQTT disconnected from ${printer.name}`);
  });
}

// Camera stream proxy — connects to printer's port 6000 TLS stream
// and forwards JPEG frames over WebSocket
function startCameraProxy(printer, ws) {
  if (!printer.accessCode) return null;

  const socket = tls.connect(
    6000,
    printer.ip,
    { rejectUnauthorized: false },
    () => {
      console.log(`Camera TLS connected to ${printer.name}`);
      // Send auth: username\0password\0
      const authBuf = Buffer.from(`bblp\0${printer.accessCode}\0`);
      socket.write(authBuf);
    }
  );

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Parse frames — each frame has a 16-byte header:
    // bytes 0-3: magic (0x40, 0x49, 0x50, 0x43 = "@IPC")
    // bytes 4-7: reserved
    // bytes 8-11: data length (little-endian uint32)
    // bytes 12-15: reserved
    while (buffer.length >= 16) {
      // Check for @IPC magic
      if (
        buffer[0] !== 0x40 ||
        buffer[1] !== 0x49 ||
        buffer[2] !== 0x50 ||
        buffer[3] !== 0x43
      ) {
        // Try to find next magic marker
        const idx = buffer.indexOf(Buffer.from([0x40, 0x49, 0x50, 0x43]), 1);
        if (idx === -1) {
          buffer = Buffer.alloc(0);
          break;
        }
        buffer = buffer.subarray(idx);
        continue;
      }

      const dataLen = buffer.readUInt32LE(8);
      const totalLen = 16 + dataLen;

      if (buffer.length < totalLen) break;

      const jpegData = buffer.subarray(16, totalLen);
      buffer = buffer.subarray(totalLen);

      if (ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "camera_frame",
            printer: printer.id,
            frame: jpegData.toString("base64"),
          })
        );
      }
    }
  });

  socket.on("error", (err) => {
    console.error(`Camera error for ${printer.name}:`, err.message);
  });

  return socket;
}

// Handle WebSocket connections from frontend
wss.on("connection", (ws) => {
  console.log("Frontend client connected");

  // Send current state for all printers
  for (const [id, state] of printerStates) {
    ws.send(JSON.stringify({ type: "printer_status", printer: id, state }));
  }

  // Start camera streams for connected printers
  const cameraSockets = [];
  for (const printer of PRINTERS) {
    if (printer.accessCode) {
      const cam = startCameraProxy(printer, ws);
      if (cam) cameraSockets.push(cam);
    }
  }

  ws.on("close", () => {
    console.log("Frontend client disconnected");
    for (const cam of cameraSockets) {
      cam.destroy();
    }
  });
});

console.log("The Situation server running on ws://localhost:3001");
console.log(`Monitoring ${PRINTERS.length} printers`);
