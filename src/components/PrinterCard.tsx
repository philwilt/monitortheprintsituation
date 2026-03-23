import type { PrinterInfo } from "../hooks/usePrinterData";

interface Props {
  printer: PrinterInfo;
  cameraFrame?: string;
}

function formatTime(minutes?: number): string {
  if (minutes == null) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type CardState =
  | "printing"
  | "idle"
  | "paused"
  | "error"
  | "finished"
  | "preparing"
  | "offline";

function getCardState(printer: PrinterInfo): CardState {
  if (printer.status !== "connected") return "offline";
  const s = printer.data?.gcode_state;
  switch (s) {
    case "RUNNING":
      return "printing";
    case "PAUSE":
      return "paused";
    case "FAILED":
      return "error";
    case "FINISH":
      return "finished";
    case "PREPARE":
      return "preparing";
    default:
      return "idle";
  }
}

function stateLabel(state: CardState): string {
  switch (state) {
    case "printing":
      return "Printing";
    case "idle":
      return "Standing by";
    case "paused":
      return "Paused";
    case "error":
      return "Error";
    case "finished":
      return "Complete";
    case "preparing":
      return "Preparing";
    case "offline":
      return "Offline";
  }
}

function situationLine(state: CardState, printer: PrinterInfo): string {
  switch (state) {
    case "printing": {
      const pct = printer.data?.mc_percent || 0;
      if (pct > 90) return "Almost there";
      if (pct > 50) return "Holding steady";
      if (pct > 10) return "On track";
      return "Just getting started";
    }
    case "idle":
      return "Awaiting orders";
    case "paused":
      return "We're watching it";
    case "error":
      return "Not ideal";
    case "finished":
      return "Job done";
    case "preparing":
      return "Getting ready";
    case "offline":
      return printer.status === "no_access_code"
        ? "No credentials"
        : "Signal lost";
  }
}

function speedLabel(lvl?: number): string {
  switch (lvl) {
    case 1:
      return "Silent";
    case 2:
      return "Standard";
    case 3:
      return "Sport";
    case 4:
      return "Ludicrous";
    default:
      return "--";
  }
}

function getActiveFilament(
  printer: PrinterInfo
): { color: string; type: string } | null {
  const d = printer.data;
  if (!d?.ams?.ams || d.ams.tray_now == null) return null;
  for (const unit of d.ams.ams) {
    if (!unit.tray) continue;
    for (const tray of unit.tray) {
      if (tray.id === d.ams.tray_now) {
        return {
          color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
          type: tray.tray_type || "Unknown",
        };
      }
    }
  }
  return null;
}

function detectAnomaly(printer: PrinterInfo): string | null {
  const d = printer.data;
  if (!d) return null;

  if (
    d.nozzle_temper != null &&
    d.nozzle_target_temper != null &&
    d.nozzle_target_temper > 0
  ) {
    const diff = Math.abs(d.nozzle_temper - d.nozzle_target_temper);
    if (diff > 15 && d.gcode_state === "RUNNING") {
      return "Nozzle temp deviation";
    }
  }

  if (
    d.bed_temper != null &&
    d.bed_target_temper != null &&
    d.bed_target_temper > 0
  ) {
    const diff = Math.abs(d.bed_temper - d.bed_target_temper);
    if (diff > 10 && d.gcode_state === "RUNNING") {
      return "Bed temp irregular";
    }
  }

  return null;
}

export function PrinterCard({ printer, cameraFrame }: Props) {
  const d = printer.data;
  const cardState = getCardState(printer);
  const anomaly = printer.status === "connected" ? detectAnomaly(printer) : null;
  const activeFilament = printer.status === "connected" ? getActiveFilament(printer) : null;

  const cardClass = [
    "printer-card",
    cardState === "printing" && "state-printing",
    cardState === "error" && "state-error",
    cardState === "paused" && "state-paused",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClass}>
      {/* Header */}
      <div className="card-header">
        <div className="card-identity">
          <div className={`heartbeat-container ${cardState}`}>
            <div className="heartbeat-dot" />
            <div className="heartbeat-ring" />
          </div>
          <span className="card-name">{printer.name}</span>
          <span className="card-model">{printer.model}</span>
        </div>
        <div className="card-status-area">
          <span className={`state-tag ${cardState}`}>
            {stateLabel(cardState)}
          </span>
        </div>
      </div>

      {/* Situation line */}
      <div className="situation-line">
        <span className="situation-icon">&#x25C6;</span>
        {situationLine(cardState, printer)}
      </div>

      {/* Anomaly */}
      {anomaly && (
        <div className="anomaly-indicator">
          <span className="anomaly-dot" />
          {anomaly}
        </div>
      )}

      {/* Offline state */}
      {cardState === "offline" && (
        <div className="card-offline">
          <p className="card-offline-message">
            {printer.status === "no_access_code"
              ? "Access code not configured"
              : printer.error || "Connection lost"}
          </p>
        </div>
      )}

      {/* Connected content */}
      {printer.status === "connected" && d && (
        <>
          {/* Task info + active filament */}
          {(d.subtask_name || activeFilament) && (
            <div className="task-row">
              <span className="task-name">
                {d.subtask_name || "No active task"}
              </span>
              <div className="task-row-right">
                {activeFilament && (
                  <span className="active-filament">
                    <span
                      className="filament-swatch"
                      style={{ background: activeFilament.color }}
                    />
                    <span className="filament-type">
                      {activeFilament.type}
                    </span>
                  </span>
                )}
                {d.gcode_state === "RUNNING" && d.mc_remaining_time != null && (
                  <span className="task-time">
                    {formatTime(d.mc_remaining_time)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {d.gcode_state === "RUNNING" && (
            <div className="progress-section">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${d.mc_percent || 0}%` }}
                />
              </div>
              <div className="progress-meta">
                <span className="progress-pct">
                  {d.mc_percent || 0}
                  <span className="progress-pct-unit">%</span>
                </span>
                <div className="progress-detail">
                  <span className="progress-remaining">
                    {formatTime(d.mc_remaining_time)}
                  </span>
                  {d.layer_num != null && d.total_layer_num != null && (
                    <div className="progress-layers">
                      layer {d.layer_num} / {d.total_layer_num}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Temperatures */}
          <div className="temps-row">
            <TempCell
              label="Nozzle"
              current={d.nozzle_temper}
              target={d.nozzle_target_temper}
            />
            <TempCell
              label="Bed"
              current={d.bed_temper}
              target={d.bed_target_temper}
            />
            {d.chamber_temper != null && (
              <TempCell label="Chamber" current={d.chamber_temper} />
            )}
          </div>

          {/* Expandable details */}
          <div className="card-details">
            <div className="details-row">
              <div className="detail-cell">
                <span className="detail-label">Speed</span>
                <span className="detail-value">{speedLabel(d.spd_lvl)}</span>
              </div>
              <div className="detail-cell">
                <span className="detail-label">Part Fan</span>
                <span className="detail-value">
                  {d.cooling_fan_speed || "--"}%
                </span>
              </div>
              <div className="detail-cell">
                <span className="detail-label">Aux Fan</span>
                <span className="detail-value">
                  {d.big_fan1_speed || "--"}%
                </span>
              </div>
            </div>

            {/* AMS */}
            {d.ams?.ams && d.ams.ams.length > 0 && (
              <div className="ams-section">
                <div className="ams-header">AMS</div>
                <div className="ams-trays">
                  {d.ams.ams.flatMap(
                    (unit) =>
                      unit.tray?.map((tray) => {
                        const color = `#${tray.tray_color?.slice(0, 6) || "444"}`;
                        const isActive = d.ams?.tray_now === tray.id;
                        return (
                          <div
                            key={`${unit.id}-${tray.id}`}
                            className={`ams-tray${isActive ? " active" : ""}`}
                            style={{
                              borderColor: isActive
                                ? color
                                : "var(--border-subtle)",
                            }}
                          >
                            <div
                              className="tray-swatch"
                              style={{ background: color }}
                            />
                            <span>{tray.tray_type}</span>
                          </div>
                        );
                      }) || []
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Camera */}
      <div className="camera-section">
        {cameraFrame ? (
          <>
            <img src={cameraFrame} alt={`${printer.name} feed`} />
            <span className="camera-overlay">{printer.name} — live</span>
          </>
        ) : (
          <div className="camera-placeholder">no feed</div>
        )}
      </div>
    </div>
  );
}

function TempCell({
  label,
  current,
  target,
}: {
  label: string;
  current?: number;
  target?: number;
}) {
  return (
    <div className="temp-cell">
      <span className="temp-label">{label}</span>
      <span className="temp-value">
        {current != null ? current.toFixed(1) : "--"}
        <span className="temp-unit">°C</span>
      </span>
      {target != null && target > 0 && (
        <span className="temp-target">→ {target}°C</span>
      )}
    </div>
  );
}
