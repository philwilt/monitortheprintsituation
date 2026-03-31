import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME     || "thesituation",
  user:     process.env.DB_USER     || "situation",
  password: process.env.DB_PASSWORD || "situation",
});

let available = false;

export async function initDb(printers) {
  try {
    await pool.query("SELECT 1");
    for (const file of ["001_init.sql", "002_alerts.sql"]) {
      const sql = fs.readFileSync(path.join(process.cwd(), "server/migrations", file), "utf8");
      await pool.query(sql);
    }
    await seedPrinters(printers);
    available = true;
    console.log("Database ready");
  } catch (err) {
    console.warn(`Database unavailable — running without persistence (${err.message})`);
  }
}

async function seedPrinters(printers) {
  for (const p of printers) {
    await pool.query(
      `INSERT INTO printers (id, name, ip, serial, model, camera_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET name=$2, ip=$3, serial=$4, model=$5, camera_mode=$6`,
      [p.id, p.name, p.ip, p.serial, p.model || null, p.cameraMode || null]
    );
  }
}

export async function startPrintJob(printerId, subtaskName, gcodeFile) {
  if (!available) return null;
  try {
    const result = await pool.query(
      `INSERT INTO print_jobs (printer_id, subtask_name, gcode_file)
       VALUES ($1, $2, $3) RETURNING id`,
      [printerId, subtaskName || null, gcodeFile || null]
    );
    return result.rows[0].id;
  } catch (err) {
    console.error(`DB startPrintJob: ${err.message}`);
    return null;
  }
}

export async function finishPrintJob(jobId, status, totalLayers, filamentType, filamentColor) {
  if (!available || jobId == null) return;
  try {
    await pool.query(
      `UPDATE print_jobs
       SET status=$2, finished_at=NOW(), total_layers=$3, filament_type=$4, filament_color=$5
       WHERE id=$1`,
      [jobId, status, totalLayers || null, filamentType || null, filamentColor || null]
    );
  } catch (err) {
    console.error(`DB finishPrintJob: ${err.message}`);
  }
}

export async function startAlert(printerId, alertType) {
  if (!available) return;
  try {
    await pool.query(
      `INSERT INTO printer_alerts (printer_id, alert_type)
       VALUES ($1, $2)
       ON CONFLICT (printer_id) DO UPDATE
         SET alert_type=$2, started_at=NOW()`,
      [printerId, alertType]
    );
  } catch (err) {
    console.error(`DB startAlert: ${err.message}`);
  }
}

export async function resolveAlert(printerId) {
  if (!available) return;
  try {
    await pool.query(`DELETE FROM printer_alerts WHERE printer_id=$1`, [printerId]);
  } catch (err) {
    console.error(`DB resolveAlert: ${err.message}`);
  }
}

export async function getActiveAlerts() {
  if (!available) return [];
  try {
    const result = await pool.query(`SELECT printer_id, alert_type, started_at FROM printer_alerts`);
    return result.rows;
  } catch (err) {
    console.error(`DB getActiveAlerts: ${err.message}`);
    return [];
  }
}

export default pool;
