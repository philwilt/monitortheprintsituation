-- Expand calibration_profiles with additional tuning fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='calibration_profiles' AND column_name='fan_speed'
  ) THEN
    ALTER TABLE calibration_profiles RENAME COLUMN fan_speed TO fan_max_speed;
  END IF;
END $$;

ALTER TABLE calibration_profiles ADD COLUMN IF NOT EXISTS fan_min_speed        INTEGER;
ALTER TABLE calibration_profiles ADD COLUMN IF NOT EXISTS bed_type             TEXT;
ALTER TABLE calibration_profiles ADD COLUMN IF NOT EXISTS layer_height         REAL;
ALTER TABLE calibration_profiles ADD COLUMN IF NOT EXISTS filament_density     REAL;
ALTER TABLE calibration_profiles ADD COLUMN IF NOT EXISTS print_settings_id   TEXT;

-- Gallery items (designs / plates that can be printed)
CREATE TABLE IF NOT EXISTS gallery_items (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  -- slice parameters
  layer_height         REAL,
  infill_density       TEXT,
  infill_pattern       TEXT,
  wall_count           INTEGER,
  support_enabled      BOOLEAN DEFAULT false,
  -- filament
  filament_type        TEXT,
  filament_brand       TEXT,
  filament_colours     JSONB,
  estimated_weight_g   REAL,
  cost_per_kg          REAL,
  -- compatibility
  compatible_printers  JSONB,
  -- matching
  source_filename      TEXT,
  -- display
  image_path           TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link print jobs to gallery items for history + cost tracking
ALTER TABLE print_jobs ADD COLUMN IF NOT EXISTS gallery_item_id INTEGER REFERENCES gallery_items(id) ON DELETE SET NULL;
