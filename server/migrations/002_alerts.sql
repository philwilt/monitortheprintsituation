CREATE TABLE IF NOT EXISTS printer_alerts (
  printer_id  TEXT PRIMARY KEY REFERENCES printers(id),
  alert_type  TEXT NOT NULL, -- PAUSE | FAILED | HMS
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
