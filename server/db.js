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
    for (const file of ["001_init.sql", "002_alerts.sql", "003_inventory.sql"]) {
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
  await Promise.all(printers.map((p) =>
    pool.query(
      `INSERT INTO printers (id, name, ip, serial, model, camera_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET name=$2, ip=$3, serial=$4, model=$5, camera_mode=$6`,
      [p.id, p.name, p.ip, p.serial, p.model || null, p.cameraMode || null]
    )
  ));
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

// ---- Filaments ----

export async function getFilaments() {
  if (!available) return [];
  const result = await pool.query(`SELECT * FROM filaments ORDER BY brand, type, color_name`);
  return result.rows;
}

export async function createFilament({ brand, type, color_name, color_hex, diameter, quantity, image_path, notes }) {
  const result = await pool.query(
    `INSERT INTO filaments (brand, type, color_name, color_hex, diameter, quantity, image_path, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [brand, type, color_name || null, color_hex || null, diameter || 1.75, quantity ?? 1, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function updateFilament(id, { brand, type, color_name, color_hex, diameter, quantity, image_path, notes }) {
  const result = await pool.query(
    `UPDATE filaments SET brand=$2, type=$3, color_name=$4, color_hex=$5, diameter=$6, quantity=$7, image_path=$8, notes=$9
     WHERE id=$1 RETURNING *`,
    [id, brand, type, color_name || null, color_hex || null, diameter || 1.75, quantity ?? 1, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function deleteFilament(id) {
  await pool.query(`DELETE FROM filaments WHERE id=$1`, [id]);
}

// ---- Calibration Profiles ----

export async function getProfiles() {
  if (!available) return [];
  const result = await pool.query(`SELECT * FROM calibration_profiles ORDER BY brand, type, nozzle_size`);
  return result.rows;
}

export async function createProfile({ name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp, fan_speed, flow_ratio, pressure_advance, max_volumetric_speed, image_path, notes }) {
  const result = await pool.query(
    `INSERT INTO calibration_profiles
       (name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp, fan_speed, flow_ratio, pressure_advance, max_volumetric_speed, image_path, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [name, brand, type, nozzle_size, nozzle_material || "brass", printer_model || null,
     nozzle_temp || null, bed_temp || null, fan_speed || null, flow_ratio ?? 1.0,
     pressure_advance || null, max_volumetric_speed || null, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function updateProfile(id, { name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp, fan_speed, flow_ratio, pressure_advance, max_volumetric_speed, image_path, notes }) {
  const result = await pool.query(
    `UPDATE calibration_profiles SET
       name=$2, brand=$3, type=$4, nozzle_size=$5, nozzle_material=$6, printer_model=$7,
       nozzle_temp=$8, bed_temp=$9, fan_speed=$10, flow_ratio=$11, pressure_advance=$12,
       max_volumetric_speed=$13, image_path=$14, notes=$15
     WHERE id=$1 RETURNING *`,
    [id, name, brand, type, nozzle_size, nozzle_material || "brass", printer_model || null,
     nozzle_temp || null, bed_temp || null, fan_speed || null, flow_ratio ?? 1.0,
     pressure_advance || null, max_volumetric_speed || null, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function deleteProfile(id) {
  await pool.query(`DELETE FROM calibration_profiles WHERE id=$1`, [id]);
}

export default pool;
