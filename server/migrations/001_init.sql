CREATE TABLE IF NOT EXISTS printers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  ip          TEXT NOT NULL,
  serial      TEXT NOT NULL,
  model       TEXT,
  camera_mode TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id             SERIAL PRIMARY KEY,
  printer_id     TEXT NOT NULL REFERENCES printers(id),
  subtask_name   TEXT,
  gcode_file     TEXT,
  status         TEXT NOT NULL DEFAULT 'running', -- running | finished | failed | cancelled
  filament_type  TEXT,
  filament_color TEXT,
  total_layers   INTEGER,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ
);
