import type { PrinterInfo } from "../hooks/usePrinterData";

interface Props {
  printers: Map<string, PrinterInfo>;
  connected: boolean;
}

type SystemMood = "nominal" | "degraded" | "critical";

function getSystemMood(printers: Map<string, PrinterInfo>): SystemMood {
  if (printers.size === 0) return "nominal";
  let hasError = false;
  let hasWarning = false;
  for (const p of printers.values()) {
    if (p.status !== "connected") {
      hasWarning = true;
      continue;
    }
    const state = p.data?.gcode_state;
    if (state === "FAILED") hasError = true;
    if (state === "PAUSE") hasWarning = true;
  }
  if (hasError) return "critical";
  if (hasWarning) return "degraded";
  return "nominal";
}

function getSystemLabel(mood: SystemMood): string {
  switch (mood) {
    case "nominal":
      return "All systems nominal";
    case "degraded":
      return "Slight irregularity detected";
    case "critical":
      return "Attention required";
  }
}

export function StatusBar({ printers, connected }: Props) {
  const mood = getSystemMood(printers);
  const label = getSystemLabel(mood);

  const total = printers.size;
  let active = 0;
  let anomalies = 0;
  for (const p of printers.values()) {
    if (p.data?.gcode_state === "RUNNING") active++;
    if (
      p.data?.gcode_state === "FAILED" ||
      p.data?.gcode_state === "PAUSE" ||
      p.status !== "connected"
    ) {
      anomalies++;
    }
  }

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-bar-brand">
          <span className="status-bar-title">The Situation</span>
        </div>
        <div className="status-bar-divider" />
        <div className="system-state">
          <span className={`system-state-indicator ${mood}`} />
          <span className="system-state-label">{label}</span>
        </div>
      </div>

      <div className="status-bar-right">
        <div className="status-bar-metric">
          <span>printers</span>
          <span className="status-bar-metric-value">{total}</span>
        </div>
        <div className="status-bar-metric">
          <span>active</span>
          <span className="status-bar-metric-value">{active}</span>
        </div>
        {anomalies > 0 && (
          <div className="status-bar-metric">
            <span>anomalies</span>
            <span
              className="status-bar-metric-value"
              style={{ color: "var(--amber)" }}
            >
              {anomalies}
            </span>
          </div>
        )}
        <div
          className={`connection-indicator ${connected ? "connected" : "disconnected"}`}
        >
          {connected ? "live" : "reconnecting"}
        </div>
      </div>
    </div>
  );
}

export { getSystemMood };
export type { SystemMood };
