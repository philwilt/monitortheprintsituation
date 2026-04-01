import type { PrinterInfo } from "../hooks/usePrinterData";

interface Props {
  printers: Map<string, PrinterInfo>;
  connected: boolean;
}

type SystemMood = "nominal" | "degraded" | "critical";
type SystemStatus = { mood: SystemMood; label: string };

function getSystemStatus(printers: Map<string, PrinterInfo>): SystemStatus {
  if (printers.size === 0) return { mood: "nominal", label: "All systems nominal" };
  let hasOffline = false;
  for (const p of printers.values()) {
    if (p.status !== "connected") { hasOffline = true; continue; }
    const state = p.data?.gcode_state;
    if (state === "FAILED") return { mood: "critical", label: "Print failure — intervention required" };
    if (state === "PAUSE") return { mood: "critical", label: `${p.name} — waiting for operator` };
  }
  if (hasOffline) return { mood: "degraded", label: "Signal degraded" };
  return { mood: "nominal", label: "All systems nominal" };
}

function getSystemMood(printers: Map<string, PrinterInfo>): SystemMood {
  return getSystemStatus(printers).mood;
}

export function StatusBar({ printers, connected }: Props) {
  const { mood, label } = getSystemStatus(printers);

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
