import AlexaRemote from "alexa-remote2";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "server/alexa.json");
const DATA_FILE = path.join(process.cwd(), "server/alexa-data.json");

// Per-printer cooldown: don't repeat the same event within 2 minutes
const COOLDOWN_MS = 2 * 60 * 1000;
const cooldowns = new Map(); // `${printerId}:${eventType}` → timestamp

let alexa = null;
let config = null;
let deviceSerial = null;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Alexa: failed to save auth data:", e.message);
  }
}

export function initAlexa() {
  config = loadConfig();
  if (!config?.enabled) return;

  const savedData = loadData();

  alexa = new AlexaRemote();
  alexa.init(
    {
      ...savedData,
      amazonPage: config.amazonPage || "amazon.com",
      alexaServiceHost: config.alexaServiceHost || "alexa.amazon.com",
      acceptLanguage: config.acceptLanguage || "en-US",
      proxyOnly: true,
      proxyPort: config.proxyPort || 3003,
      proxyOwnIp: "localhost",
      logger: false,
      formerRegistrationData: savedData,
    },
    (err, data) => {
      if (err) {
        console.error("Alexa: init failed —", err.message);
        if (err.message?.includes("login") || err.message?.includes("proxy")) {
          console.error("Alexa: run `node server/alexa-auth.js` to authenticate");
        }
        alexa = null;
        return;
      }
      if (data) saveData(data);
      console.log("Alexa: authenticated");

      alexa.getDevices((err2, devData) => {
        if (err2 || !devData?.devices) {
          console.error("Alexa: failed to list devices:", err2?.message);
          return;
        }
        const device = devData.devices.find((d) =>
          d.accountName.toLowerCase().includes(config.deviceName.toLowerCase())
        );
        if (device) {
          deviceSerial = device.serialNumber;
          console.log(`Alexa: device ready — ${device.accountName}`);
        } else {
          const names = devData.devices.map((d) => d.accountName).join(", ");
          console.warn(`Alexa: device "${config.deviceName}" not found. Available: ${names}`);
        }
      });
    }
  );
}

export function notify(printerId, message, eventType) {
  if (!alexa || !config?.enabled) return;
  if (!config.notifyOn?.[eventType]) return;

  const key = `${printerId}:${eventType}`;
  const now = Date.now();
  const last = cooldowns.get(key);
  if (last && now - last < COOLDOWN_MS) return;
  cooldowns.set(key, now);

  if (!deviceSerial) {
    console.warn("Alexa: device not ready, skipping notify");
    return;
  }

  alexa.sendSequenceCommand(deviceSerial, "speak", message, (err) => {
    if (err) console.error("Alexa: notify failed —", err.message);
    else console.log(`Alexa: "${message}"`);
  });
}
