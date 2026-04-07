/**
 * One-time Alexa authentication setup.
 * Run: node server/alexa-auth.js
 *
 * This opens a local proxy on port 3003 that handles the Amazon OAuth flow.
 * Visit http://localhost:3003 in your browser, log in to Amazon, and this
 * script will save the session to server/alexa-data.json.
 *
 * You only need to run this once. The session persists across restarts.
 */

import AlexaRemote from "alexa-remote2";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "server/alexa-data.json");
const CONFIG_FILE = path.join(process.cwd(), "server/alexa.json");
const PORT = 3003;

let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
} catch {
  // Use defaults
}

console.log("Alexa Auth Setup");
console.log("================");
console.log(`Open this URL in your browser: http://localhost:${config.proxyPort || PORT}`);
console.log("Log in to Amazon, then wait for confirmation here.\n");

const alexa = new AlexaRemote();
alexa.init(
  {
    amazonPage: config.amazonPage || "amazon.com",
    alexaServiceHost: config.alexaServiceHost || "alexa.amazon.com",
    acceptLanguage: config.acceptLanguage || "en-US",
    proxyOnly: true,
    proxyPort: config.proxyPort || PORT,
    proxyOwnIp: "localhost",
  },
  (err, data) => {
    if (err) {
      console.error("Auth failed:", err.message);
      process.exit(1);
    }
    if (data) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log("Auth complete! Session saved to server/alexa-data.json");
      console.log("You can now restart the server and Alexa notifications will be active.");
    }
    process.exit(0);
  }
);
