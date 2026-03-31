import { useState, memo } from "react";
import type { PrinterInfo } from "../hooks/usePrinterData";
import { decodeHMS } from "../utils/hms";

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
      return "Needs your attention";
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

function tempColor(temp: number, type: "nozzle" | "bed" | "chamber"): string {
  if (type === "nozzle") {
    if (temp < 40)  return "var(--text-dim)";
    if (temp < 80)  return "#5a7ea8";  // cool blue
    if (temp < 130) return "#4a9890";  // teal
    if (temp < 170) return "#8fa84a";  // yellow-green
    if (temp < 200) return "#b8a03a";  // yellow-amber
    if (temp < 230) return "#b8923a";  // amber
    if (temp < 260) return "#c0663a";  // orange
    return "#c04a4a";                  // red
  }
  if (type === "bed") {
    if (temp < 25)  return "var(--text-dim)";
    if (temp < 45)  return "#5a7ea8";  // cool blue
    if (temp < 60)  return "#b8a03a";  // amber
    if (temp < 80)  return "#c0663a";  // orange
    return "#c04a4a";                  // red
  }
  // chamber
  if (temp < 25)  return "var(--text-dim)";
  if (temp < 35)  return "#b8a03a";    // amber
  if (temp < 45)  return "#c0663a";    // orange
  return "#c04a4a";                    // red
}

function fanColor(speed?: string): string {
  const pct = parseInt(speed || "0", 10);
  if (pct === 0)  return "var(--text-dim)";
  if (pct < 20)   return "#5a7ea8";  // cool blue
  if (pct < 40)   return "#4a9890";  // teal
  if (pct < 60)   return "#8fa84a";  // yellow-green
  if (pct < 80)   return "#b8923a";  // amber
  return "#c04a4a";                  // red
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
  if (!d) return null;
  const trayNow = d.ams?.tray_now;
  const globalIdx = trayNow != null ? parseInt(trayNow, 10) : NaN;

  if (d.ams?.ams && d.ams.ams.length > 0 && !isNaN(globalIdx) && globalIdx < 254) {
    // Strategy 1: direct tray ID match (firmware sends global IDs on tray.id)
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (tray.id === trayNow) {
          return {
            color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
            type: tray.tray_type || "Unknown",
          };
        }
      }
    }
    // Strategy 2: counter-based — tray_now is a global index, tray IDs are per-unit ("0"-"3")
    let counter = 0;
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (counter === globalIdx) {
          return {
            color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
            type: tray.tray_type || "Unknown",
          };
        }
        counter++;
      }
    }
    // Strategy 3: AMS HT / non-sequential units — tray_now matches the unit's own id
    // (e.g. AMS HT reports unit id="128", tray_now="128")
    for (const unit of d.ams.ams) {
      if (unit.id === trayNow && unit.tray && unit.tray.length > 0) {
        const tray = unit.tray[0];
        return {
          color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
          type: tray.tray_type || "Unknown",
        };
      }
    }
  }

  // tray_now >= 254 = external/vir_slot; also try matching by vir_slot id
  if (d.vir_slot && d.vir_slot.length > 0) {
    if (trayNow != null) {
      const match = d.vir_slot.find((s) => s.id === trayNow);
      if (match && match.tray_type) {
        return {
          color: `#${match.tray_color?.slice(0, 6) || "888"}`,
          type: match.tray_type,
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

export const PrinterCard = memo(function PrinterCard({ printer, cameraFrame }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const d = printer.data;
  const cardState = getCardState(printer);
  const anomaly =
    printer.status === "connected" ? detectAnomaly(printer) : null;
  const activeFilament =
    printer.status === "connected" ? getActiveFilament(printer) : null;

  const cardClass = [
    "printer-card",
    cardState === "printing" && "state-printing",
    cardState === "error" && "state-error",
    cardState === "paused" && "state-paused",
  ]
    .filter(Boolean)
    .join(" ");

  const isConnected = printer.status === "connected" && d;

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
          {isConnected && (
            <button
              className={`sidebar-toggle${sidebarOpen ? " open" : ""}`}
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Hide details" : "Show details"}
            >
              {!sidebarOpen && (
                <span className="sidebar-toggle-peek">
                  {activeFilament && (
                    <>
                      <span
                        className="peek-swatch"
                        style={{ background: activeFilament.color }}
                      />
                      <span className="peek-text">{activeFilament.type}</span>
                      <span className="peek-divider">·</span>
                    </>
                  )}
                  <span className="peek-text">{speedLabel(d.spd_lvl)}</span>
                  {d.wifi_signal && (
                    <>
                      <span className="peek-divider">·</span>
                      <span className="peek-text">{d.wifi_signal}</span>
                    </>
                  )}
                  <span className="peek-chevron">&#x203A;</span>
                </span>
              )}
              {sidebarOpen && <span>&#x203A;</span>}
            </button>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="card-columns">
        {/* Left: main content */}
        <div className="card-main">
          {/* Situation line */}
          <div className={`situation-line${cardState === "paused" ? " situation-urgent" : ""}`}>
            <span className="situation-icon">&#x25C6;</span>
            <span className="situation-text">{situationLine(cardState, printer)}</span>
            {isConnected && (
              <span className="situation-temps">
                {d.nozzle_temper != null && (
                  <span className="situation-temp" style={{ color: tempColor(d.nozzle_temper, "nozzle") }}>
                    <span className="situation-temp-label">nozzle</span>
                    {d.nozzle_temper.toFixed(0)}°
                  </span>
                )}
                {d.bed_temper != null && (
                  <span className="situation-temp" style={{ color: tempColor(d.bed_temper, "bed") }}>
                    <span className="situation-temp-label">bed</span>
                    {d.bed_temper.toFixed(0)}°
                  </span>
                )}
                {d.cooling_fan_speed != null && (
                  <span className="situation-temp" style={{ color: fanColor(d.cooling_fan_speed) }}>
                    <span className="situation-temp-label">part</span>
                    {d.cooling_fan_speed}%
                  </span>
                )}
                {d.big_fan1_speed != null && (
                  <span className="situation-temp" style={{ color: fanColor(d.big_fan1_speed) }}>
                    <span className="situation-temp-label">aux</span>
                    {d.big_fan1_speed}%
                  </span>
                )}
              </span>
            )}
          </div>

          {/* HMS alerts — only known codes are shown */}
          {isConnected && d.hms && d.hms.length > 0 && (() => {
            const alerts = d.hms.map((h) => decodeHMS(h.attr, h.code)).filter(Boolean);
            if (alerts.length === 0) return null;
            return (
              <div className="hms-alerts">
                {alerts.map((alert) => (
                  <div key={alert!.key} className={`hms-alert ${alert!.severity}`}>
                    <span className="hms-alert-dot" />
                    {alert!.message}
                    <a
                      className="hms-alert-link"
                      href={alert!.wikiUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {alert!.key} ↗
                    </a>
                  </div>
                ))}
              </div>
            );
          })()}

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

          {isConnected && (
            <>
              {/* Task info */}
              {d.subtask_name && (
                <div className="task-row">
                  <span className="task-name">{d.subtask_name}</span>
                  {d.gcode_state === "RUNNING" &&
                    d.mc_remaining_time != null && (
                      <span className="task-time">
                        {formatTime(d.mc_remaining_time)} remaining
                        {d.layer_num != null && d.total_layer_num != null && (
                          <>{" · "}layer {d.layer_num}/{d.total_layer_num}</>
                        )}
                        {" · "}
                        done {(() => {
                          const finish = new Date(Date.now() + d.mc_remaining_time * 60000);
                          const todayMid = new Date().setHours(0, 0, 0, 0);
                          const finishMid = new Date(finish).setHours(0, 0, 0, 0);
                          const daysAhead = Math.floor((finishMid - todayMid) / 86400000);
                          const time = finish.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                          if (daysAhead === 0) return time;
                          if (daysAhead === 1) return `tomorrow ${time}`;
                          return `${finish.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
                        })()}
                      </span>
                    )}
                </div>
              )}

              {/* Progress */}
              {d.gcode_state === "RUNNING" && (
                <div className="progress-section">
                  <div className="progress-bar-row">
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${d.mc_percent || 0}%` }}
                      />
                    </div>
                    <span className="progress-pct">
                      {d.mc_percent || 0}
                      <span className="progress-pct-unit">%</span>
                    </span>
                  </div>
                </div>
              )}
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

        {/* Right sidebar: temps, filament, fans, AMS — collapsed by default */}
        {isConnected && sidebarOpen && (
          <div className="card-sidebar">
            {/* Temperatures */}
            <div className="sidebar-block">
              <div className="sidebar-label">Nozzle</div>
              <div className="sidebar-value" style={d.nozzle_temper != null ? { color: tempColor(d.nozzle_temper, "nozzle") } : undefined}>
                {d.nozzle_temper != null ? `${d.nozzle_temper.toFixed(0)}°C` : "--"}
              </div>
              {d.nozzle_target_temper != null && d.nozzle_target_temper > 0 && (
                <div className="sidebar-target">→ {d.nozzle_target_temper}°C</div>
              )}
            </div>

            <div className="sidebar-block">
              <div className="sidebar-label">Bed</div>
              <div className="sidebar-value" style={d.bed_temper != null ? { color: tempColor(d.bed_temper, "bed") } : undefined}>
                {d.bed_temper != null ? `${d.bed_temper.toFixed(0)}°C` : "--"}
              </div>
              {d.bed_target_temper != null && d.bed_target_temper > 0 && (
                <div className="sidebar-target">→ {d.bed_target_temper}°C</div>
              )}
            </div>

            {d.chamber_temper != null && (
              <div className="sidebar-block">
                <div className="sidebar-label">Chamber</div>
                <div className="sidebar-value" style={{ color: tempColor(d.chamber_temper, "chamber") }}>
                  {d.chamber_temper.toFixed(0)}°C
                </div>
              </div>
            )}

            {/* Active filament */}
            {activeFilament && (
              <div className="sidebar-block">
                <div className="sidebar-label">Filament</div>
                <div className="sidebar-filament">
                  <span
                    className="sidebar-filament-swatch"
                    style={{ background: activeFilament.color }}
                  />
                  <span className="sidebar-filament-type">
                    {activeFilament.type}
                  </span>
                </div>
              </div>
            )}

            {/* Speed + Fans */}
            <div className="sidebar-block">
              <div className="sidebar-label">Speed</div>
              <div className="sidebar-value">
                {speedLabel(d.spd_lvl)}
                {d.spd_mag != null && (
                  <span className="sidebar-mag"> {d.spd_mag}%</span>
                )}
              </div>
            </div>

            <div className="sidebar-block">
              <div className="sidebar-label">Part Fan</div>
              <div className="sidebar-value" style={{ color: fanColor(d.cooling_fan_speed) }}>
                {d.cooling_fan_speed || "--"}%
              </div>
            </div>

            <div className="sidebar-block">
              <div className="sidebar-label">Aux Fan</div>
              <div className="sidebar-value" style={{ color: fanColor(d.big_fan1_speed) }}>
                {d.big_fan1_speed || "--"}%
              </div>
            </div>

            {/* Chamber light */}
            {d.lights_report && d.lights_report.length > 0 && (() => {
              const light = d.lights_report.find((l) => l.node === "chamber_light");
              if (!light) return null;
              const on = light.mode === "on";
              return (
                <div className="sidebar-block">
                  <div className="sidebar-label">Chamber Light</div>
                  <div className={`sidebar-light${on ? " on" : ""}`}>
                    <span className="sidebar-light-dot" />
                    {on ? "On" : "Off"}
                  </div>
                </div>
              );
            })()}

            {/* AI Detection */}
            {d.xcam && (d.xcam.first_layer_inspector != null || d.xcam.spaghetti_detector != null) && (
              <div className="sidebar-block">
                <div className="sidebar-label">AI Detection</div>
                <div className="sidebar-xcam">
                  {d.xcam.first_layer_inspector != null && (
                    <div className={`xcam-flag${d.xcam.first_layer_inspector ? " active" : ""}`}>
                      <span className="xcam-dot" />
                      First Layer
                    </div>
                  )}
                  {d.xcam.spaghetti_detector != null && (
                    <div className={`xcam-flag${d.xcam.spaghetti_detector ? " active" : ""}`}>
                      <span className="xcam-dot" />
                      Spaghetti
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AMS (full) */}
            {d.ams?.ams && d.ams.ams.length > 0 && (
              <div className="sidebar-block sidebar-ams">
                <div className="sidebar-label">
                  AMS
                  {d.ams.ams.map((unit) => unit.humidity).filter(Boolean).length > 0 && (
                    <span className="ams-humidity">
                      {d.ams.ams.map((unit, i) =>
                        unit.humidity ? (
                          <span key={i}>{unit.humidity}%RH</span>
                        ) : null
                      )}
                    </span>
                  )}
                </div>
                <div className="sidebar-trays">
                  {d.ams.ams.flatMap(
                    (unit) =>
                      unit.tray?.map((tray) => {
                        const color = `#${tray.tray_color?.slice(0, 6) || "444"}`;
                        const isActive = d.ams?.tray_now === tray.id;
                        return (
                          <div
                            key={`${unit.id}-${tray.id}`}
                            className={`sidebar-tray${isActive ? " active" : ""}`}
                          >
                            <span
                              className="tray-swatch"
                              style={{
                                background: color,
                                boxShadow: isActive
                                  ? `0 0 6px ${color}40`
                                  : "none",
                              }}
                            />
                            <span className="sidebar-tray-type">
                              {tray.tray_type}
                            </span>
                          </div>
                        );
                      }) || []
                  )}
                </div>
              </div>
            )}

            {/* AMS Lite / external spool */}
            {d.vir_slot && d.vir_slot.length > 0 && (
              <div className="sidebar-block sidebar-ams">
                <div className="sidebar-label">External</div>
                <div className="sidebar-trays">
                  {d.vir_slot.map((slot) => {
                    const color = `#${slot.tray_color?.slice(0, 6) || "444"}`;
                    return (
                      <div key={slot.id} className="sidebar-tray active">
                        <span
                          className="tray-swatch"
                          style={{
                            background: color,
                            boxShadow: `0 0 6px ${color}40`,
                          }}
                        />
                        <span className="sidebar-tray-type">
                          {slot.tray_type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

