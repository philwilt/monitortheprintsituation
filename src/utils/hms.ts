export interface HMSAlert {
  key: string;
  message: string;
  severity: "error" | "warning";
  wikiUrl: string;
  unknown?: boolean;
}

const HMS_MESSAGES: Record<string, { message: string; severity: "error" | "warning" }> = {
  // Filament / AMS
  "0700-2000-0002-0001": { message: "AMS filament runout", severity: "error" },
  "0700-2000-0002-0002": { message: "AMS slot empty", severity: "warning" },
  "0700-2000-0002-0003": { message: "Filament broken inside AMS", severity: "error" },
  "0700-2000-0002-0004": { message: "Filament broken in toolhead", severity: "error" },
  "0700-4500-0002-0003": { message: "Filament cutter jammed", severity: "error" },
  "0700-6000-0002-0001": { message: "AMS overloaded — filament tangled or spool stuck", severity: "error" },
  "0700-7000-0002-0001": { message: "Filament jam — failed to pull from extruder", severity: "error" },
  "0700-7000-0002-0004": { message: "Failed to retract filament to AMS", severity: "error" },
  "0700-7000-0002-0007": { message: "AMS filament runout", severity: "error" },
  "0700-7000-0002-0008": { message: "Failed to get AMS mapping", severity: "warning" },
  // Detection / inspection
  "0C00-0300-0003-0008": { message: "Spaghetti detected — check print", severity: "error" },
  "0C00-0300-0002-0001": { message: "First layer inspection failed", severity: "warning" },
  "0C00-0300-0002-0002": { message: "First layer lidar data abnormal", severity: "warning" },
  "0C00-0300-0002-0005": { message: "First layer inspection timed out", severity: "warning" },
  // Thermal / mechanical
  "0300-0200-0001-0007": { message: "Nozzle temperature abnormal — sensor may be faulty", severity: "error" },
  "0300-0300-0001-0001": { message: "Hotend fan too slow or stopped", severity: "error" },
  "0300-0D00-0001-0003": { message: "Build plate may not be seated correctly", severity: "warning" },
  "0300-1B00-0001-0005": { message: "Force sensor — unexpected continuous force detected", severity: "warning" },
  // System
  "0500-0300-0001-0002": { message: "Toolhead malfunction", severity: "error" },
  "0500-0100-0002-0001": { message: "Media pipeline malfunction", severity: "warning" },
};

export function wikiBase(model: string): string {
  const m = model.toUpperCase();
  if (m.startsWith("A1")) return "a1";
  if (m.startsWith("P1")) return "p1";
  return "x1"; // X1C, X1E, X1, and fallback
}

export function decodeHMS(attr: number, code: number, model = "x1"): HMSAlert {
  const a = attr.toString(16).padStart(8, "0").toUpperCase();
  const c = code.toString(16).padStart(8, "0").toUpperCase();
  const key = `${a.slice(0, 4)}-${a.slice(4)}-${c.slice(0, 4)}-${c.slice(4)}`;
  const known = HMS_MESSAGES[key];
  const wikiUrl = `https://wiki.bambulab.com/en/${wikiBase(model)}/troubleshooting/hmscode/HMS_${a}_${c}`;
  if (!known) {
    return { key, message: "Unknown error", severity: "warning", wikiUrl, unknown: true };
  }
  return { key, message: known.message, severity: known.severity, wikiUrl };
}
