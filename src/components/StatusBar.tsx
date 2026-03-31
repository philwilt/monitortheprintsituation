import type { PrinterInfo } from "../hooks/usePrinterData";

interface Props {
  printers: Map<string, PrinterInfo>;
  connected: boolean;
}

type SystemMood = "nominal" | "degraded" | "critical";

function getSystemMood(printers: Map<string, PrinterInfo>): SystemMood {
  if (printers.size === 0) return "nominal";
  let hasError = false;
  let hasPaused = false;
  let hasOffline = false;
  for (const p of printers.values()) {
    if (p.status !== "connected") { hasOffline = true; continue; }
    const state = p.data?.gcode_state;
    if (state === "FAILED") hasError = true;
    if (state === "PAUSE") hasPaused = true;
  }
  if (hasError || hasPaused) return "critical";
  if (hasOffline) return "degraded";
  return "nominal";
}

function getSystemLabel(printers: Map<string, PrinterInfo>, mood: SystemMood): string {
  if (mood === "nominal") return "All systems nominal";
  if (mood === "degraded") return "Signal degraded";
  // critical — find what's wrong
  for (const p of printers.values()) {
    if (p.data?.gcode_state === "FAILED") return "Print failure — intervention required";
    if (p.data?.gcode_state === "PAUSE") return `${p.name} — waiting for operator`;
  }
  return "Attention required";
}

export function StatusBar({ printers, connected }: Props) {
  const mood = getSystemMood(printers);
  const label = getSystemLabel(printers, mood);

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
              style={{ color: mood === "critical" ? "#f05050" : "var(--amber)" }}
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
