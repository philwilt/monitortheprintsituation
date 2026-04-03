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
    for (const file of ["001_init.sql", "002_alerts.sql", "003_inventory.sql", "004_gallery.sql"]) {
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

export async function createProfile({ name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp, fan_max_speed, fan_min_speed, flow_ratio, pressure_advance, max_volumetric_speed, bed_type, layer_height, filament_density, print_settings_id, image_path, notes }) {
  const result = await pool.query(
    `INSERT INTO calibration_profiles
       (name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp,
        fan_max_speed, fan_min_speed, flow_ratio, pressure_advance, max_volumetric_speed,
        bed_type, layer_height, filament_density, print_settings_id, image_path, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [name, brand, type, nozzle_size, nozzle_material || "brass", printer_model || null,
     nozzle_temp || null, bed_temp || null, fan_max_speed || null, fan_min_speed || null,
     flow_ratio ?? 1.0, pressure_advance || null, max_volumetric_speed || null,
     bed_type || null, layer_height || null, filament_density || null, print_settings_id || null,
     image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function updateProfile(id, { name, brand, type, nozzle_size, nozzle_material, printer_model, nozzle_temp, bed_temp, fan_max_speed, fan_min_speed, flow_ratio, pressure_advance, max_volumetric_speed, bed_type, layer_height, filament_density, print_settings_id, image_path, notes }) {
  const result = await pool.query(
    `UPDATE calibration_profiles SET
       name=$2, brand=$3, type=$4, nozzle_size=$5, nozzle_material=$6, printer_model=$7,
       nozzle_temp=$8, bed_temp=$9, fan_max_speed=$10, fan_min_speed=$11, flow_ratio=$12,
       pressure_advance=$13, max_volumetric_speed=$14, bed_type=$15, layer_height=$16,
       filament_density=$17, print_settings_id=$18, image_path=$19, notes=$20
     WHERE id=$1 RETURNING *`,
    [id, name, brand, type, nozzle_size, nozzle_material || "brass", printer_model || null,
     nozzle_temp || null, bed_temp || null, fan_max_speed || null, fan_min_speed || null,
     flow_ratio ?? 1.0, pressure_advance || null, max_volumetric_speed || null,
     bed_type || null, layer_height || null, filament_density || null, print_settings_id || null,
     image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function deleteProfile(id) {
  await pool.query(`DELETE FROM calibration_profiles WHERE id=$1`, [id]);
}

// ---- Gallery Items ----

export async function getGalleryItems() {
  if (!available) return [];
  const result = await pool.query(`SELECT * FROM gallery_items ORDER BY created_at DESC`);
  return result.rows;
}

export async function createGalleryItem({ name, description, layer_height, infill_density, infill_pattern, wall_count, support_enabled, filament_type, filament_brand, filament_colours, estimated_weight_g, cost_per_kg, compatible_printers, source_filename, image_path, notes }) {
  const result = await pool.query(
    `INSERT INTO gallery_items
       (name, description, layer_height, infill_density, infill_pattern, wall_count, support_enabled,
        filament_type, filament_brand, filament_colours, estimated_weight_g, cost_per_kg,
        compatible_printers, source_filename, image_path, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [name, description || null, layer_height || null, infill_density || null, infill_pattern || null,
     wall_count || null, support_enabled || false, filament_type || null, filament_brand || null,
     filament_colours ? JSON.stringify(filament_colours) : null,
     estimated_weight_g || null, cost_per_kg || null,
     compatible_printers ? JSON.stringify(compatible_printers) : null,
     source_filename || null, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function updateGalleryItem(id, { name, description, layer_height, infill_density, infill_pattern, wall_count, support_enabled, filament_type, filament_brand, filament_colours, estimated_weight_g, cost_per_kg, compatible_printers, source_filename, image_path, notes }) {
  const result = await pool.query(
    `UPDATE gallery_items SET
       name=$2, description=$3, layer_height=$4, infill_density=$5, infill_pattern=$6,
       wall_count=$7, support_enabled=$8, filament_type=$9, filament_brand=$10,
       filament_colours=$11, estimated_weight_g=$12, cost_per_kg=$13,
       compatible_printers=$14, source_filename=$15, image_path=$16, notes=$17
     WHERE id=$1 RETURNING *`,
    [id, name, description || null, layer_height || null, infill_density || null, infill_pattern || null,
     wall_count || null, support_enabled || false, filament_type || null, filament_brand || null,
     filament_colours ? JSON.stringify(filament_colours) : null,
     estimated_weight_g || null, cost_per_kg || null,
     compatible_printers ? JSON.stringify(compatible_printers) : null,
     source_filename || null, image_path || null, notes || null]
  );
  return result.rows[0];
}

export async function deleteGalleryItem(id) {
  await pool.query(`DELETE FROM gallery_items WHERE id=$1`, [id]);
}

export async function linkPrintJobToGallery(printerId, subtaskName) {
  if (!available) return null;
  try {
    // Match source_filename (strip extension) to subtask_name
    const result = await pool.query(
      `SELECT id, estimated_weight_g, cost_per_kg FROM gallery_items
       WHERE LOWER(REGEXP_REPLACE(source_filename, '\\.[^.]+$', '')) = LOWER($1)
       LIMIT 1`,
      [subtaskName]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch {
    return null;
  }
}

// ---- Stats ----

export async function getStats() {
  if (!available) return null;

  const [daily, byPrinter, totals] = await Promise.all([
    // Daily breakdown — last 30 days
    pool.query(`
      SELECT
        (started_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*)                                                             AS total,
        COUNT(*) FILTER (WHERE status = 'finished')                         AS finished,
        COUNT(*) FILTER (WHERE status = 'failed')                           AS failed,
        COUNT(*) FILTER (WHERE status = 'cancelled')                        AS cancelled,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE status = 'finished')::numeric, 1) AS filament_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE status = 'finished')::numeric, 2) AS cost
      FROM print_jobs pj
      LEFT JOIN gallery_items gi ON gi.id = pj.gallery_item_id
      WHERE pj.started_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `),

    // Per-printer totals — last 30 days
    pool.query(`
      SELECT
        p.id, p.name, p.model,
        COUNT(*)                                                             AS total,
        COUNT(*) FILTER (WHERE pj.status = 'finished')                      AS finished,
        COUNT(*) FILTER (WHERE pj.status = 'failed')                        AS failed,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE pj.status = 'finished')::numeric, 1) AS filament_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE pj.status = 'finished')::numeric, 2) AS cost
      FROM print_jobs pj
      JOIN printers p ON p.id = pj.printer_id
      LEFT JOIN gallery_items gi ON gi.id = pj.gallery_item_id
      WHERE pj.started_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, p.name, p.model
      ORDER BY total DESC
    `),

    // Period totals (week / month / year / all-time)
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('week',  NOW()))    AS week_total,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('week',  NOW()) AND status='finished') AS week_finished,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('week',  NOW()) AND status='failed')   AS week_failed,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE pj.started_at >= DATE_TRUNC('week', NOW()) AND pj.status='finished')::numeric, 1) AS week_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE pj.started_at >= DATE_TRUNC('week', NOW()) AND pj.status='finished')::numeric, 2) AS week_cost,

        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('month', NOW()))    AS month_total,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('month', NOW()) AND status='finished') AS month_finished,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('month', NOW()) AND status='failed')   AS month_failed,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE pj.started_at >= DATE_TRUNC('month', NOW()) AND pj.status='finished')::numeric, 1) AS month_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE pj.started_at >= DATE_TRUNC('month', NOW()) AND pj.status='finished')::numeric, 2) AS month_cost,

        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('year',  NOW()))    AS year_total,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('year',  NOW()) AND status='finished') AS year_finished,
        COUNT(*) FILTER (WHERE started_at >= DATE_TRUNC('year',  NOW()) AND status='failed')   AS year_failed,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE pj.started_at >= DATE_TRUNC('year', NOW()) AND pj.status='finished')::numeric, 1) AS year_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE pj.started_at >= DATE_TRUNC('year', NOW()) AND pj.status='finished')::numeric, 2) AS year_cost,

        COUNT(*)                                                             AS all_total,
        COUNT(*) FILTER (WHERE status='finished')                           AS all_finished,
        COUNT(*) FILTER (WHERE status='failed')                             AS all_failed,
        ROUND(SUM(gi.estimated_weight_g) FILTER (WHERE pj.status='finished')::numeric, 1) AS all_g,
        ROUND(SUM(gi.estimated_weight_g * gi.cost_per_kg / 1000) FILTER (WHERE pj.status='finished')::numeric, 2) AS all_cost
      FROM print_jobs pj
      LEFT JOIN gallery_items gi ON gi.id = pj.gallery_item_id
    `),
  ]);

  const t = totals.rows[0];
  return {
    daily: daily.rows,
    byPrinter: byPrinter.rows,
    totals: {
      week:  { total: +t.week_total,  finished: +t.week_finished,  failed: +t.week_failed,  filament_g: +t.week_g  || 0, cost: +t.week_cost  || 0 },
      month: { total: +t.month_total, finished: +t.month_finished, failed: +t.month_failed, filament_g: +t.month_g || 0, cost: +t.month_cost || 0 },
      year:  { total: +t.year_total,  finished: +t.year_finished,  failed: +t.year_failed,  filament_g: +t.year_g  || 0, cost: +t.year_cost  || 0 },
      all:   { total: +t.all_total,   finished: +t.all_finished,   failed: +t.all_failed,   filament_g: +t.all_g   || 0, cost: +t.all_cost   || 0 },
    },
  };
}

// ---- Print Log ----

export async function getPrintLog(days = 7) {
  if (!available) return [];
  const result = await pool.query(
    `SELECT
       pj.id, pj.printer_id, pj.subtask_name, pj.gcode_file,
       pj.status, pj.filament_type, pj.filament_color,
       pj.total_layers, pj.started_at, pj.finished_at,
       p.name  AS printer_name,
       p.model AS printer_model,
       gi.estimated_weight_g,
       gi.cost_per_kg
     FROM print_jobs pj
     JOIN printers p ON p.id = pj.printer_id
     LEFT JOIN gallery_items gi ON gi.id = pj.gallery_item_id
     WHERE pj.started_at >= NOW() - ($1 || ' days')::INTERVAL
     ORDER BY pj.started_at DESC`,
    [days]
  );
  return result.rows;
}

export default pool;
