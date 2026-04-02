CREATE TABLE IF NOT EXISTS filaments (
  id          SERIAL PRIMARY KEY,
  brand       TEXT NOT NULL,
  type        TEXT NOT NULL,
  color_name  TEXT,
  color_hex   TEXT,
  diameter    REAL NOT NULL DEFAULT 1.75,
  quantity    INTEGER NOT NULL DEFAULT 1,
  image_path  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_profiles (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  brand                TEXT NOT NULL,
  type                 TEXT NOT NULL,
  nozzle_size          REAL NOT NULL,
  nozzle_material      TEXT NOT NULL DEFAULT 'brass',
  printer_model        TEXT,
  nozzle_temp          INTEGER,
  bed_temp             INTEGER,
  fan_speed            INTEGER,
  flow_ratio           REAL NOT NULL DEFAULT 1.0,
  pressure_advance     REAL,
  max_volumetric_speed REAL,
  image_path           TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
