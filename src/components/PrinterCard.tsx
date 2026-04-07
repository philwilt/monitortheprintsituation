import { memo, useState, useEffect, useCallback } from "react";
import type { PrinterInfo } from "../hooks/usePrinterData";
import type { GalleryItem } from "../hooks/useGallery";
import { decodeHMS, wikiBase } from "../utils/hms";

function useElapsedTime(startedAt: number | null | undefined): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  if (secs < 60) return "< 1m";
  const mins = Math.floor(secs / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  printer: PrinterInfo;
  cameraFrame?: string;
  isLive?: boolean;
  onToggleLive?: () => void;
  galleryItem?: GalleryItem | null;
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
      return "Something went wrong";
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

// Returns the { unitId, trayId } that is actually active, using the same
// 3-strategy resolution as getActiveFilament so HT slots win over empty
// regular slots with the same tray id.
function getActiveTrayRef(
  printer: PrinterInfo
): { unitId: string; trayId: string } | null {
  const d = printer.data;
  if (!d) return null;
  const trayNow = d.ams?.tray_now;
  const globalIdx = trayNow != null ? parseInt(trayNow, 10) : NaN;

  if (d.ams?.ams && d.ams.ams.length > 0 && !isNaN(globalIdx) && globalIdx < 254) {
    // Strategy 1: direct tray ID match — skip empty trays
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (tray.id === trayNow && tray.tray_type) {
          return { unitId: unit.id, trayId: tray.id };
        }
      }
    }
    // Strategy 2: counter-based global index
    let counter = 0;
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (counter === globalIdx && tray.tray_type) {
          return { unitId: unit.id, trayId: tray.id };
        }
        counter++;
      }
    }
    // Strategy 3: tray_now matches the unit's own id (AMS HT quirk)
    for (const unit of d.ams.ams) {
      if (unit.id === trayNow && unit.tray) {
        const tray = unit.tray.find((t) => t.tray_type);
        if (tray) return { unitId: unit.id, trayId: tray.id };
      }
    }
  }
  return null;
}

function getActiveFilament(
  printer: PrinterInfo
): { color: string; type: string } | null {
  const d = printer.data;
  if (!d) return null;
  const trayNow = d.ams?.tray_now;
  const globalIdx = trayNow != null ? parseInt(trayNow, 10) : NaN;

  if (d.ams?.ams && d.ams.ams.length > 0 && !isNaN(globalIdx) && globalIdx < 254) {
    // Strategy 1: direct tray ID match — skip empty trays so a loaded tray
    // with the same ID in another unit (e.g. AMS HT) wins over an empty slot
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (tray.id === trayNow && tray.tray_type) {
          return {
            color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
            type: tray.tray_type,
          };
        }
      }
    }
    // Strategy 2: counter-based — tray_now is a global index, tray IDs are per-unit ("0"-"3")
    let counter = 0;
    for (const unit of d.ams.ams) {
      if (!unit.tray) continue;
      for (const tray of unit.tray) {
        if (counter === globalIdx && tray.tray_type) {
          return {
            color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
            type: tray.tray_type,
          };
        }
        counter++;
      }
    }
    // Strategy 3: AMS HT / non-sequential units — tray_now matches the unit's own id
    // (e.g. AMS HT reports unit id="128", tray_now="128")
    for (const unit of d.ams.ams) {
      if (unit.id === trayNow && unit.tray) {
        const tray = unit.tray.find((t) => t.tray_type);
        if (tray) {
          return {
            color: `#${tray.tray_color?.slice(0, 6) || "888"}`,
            type: tray.tray_type,
          };
        }
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

export const PrinterCard = memo(function PrinterCard({ printer, cameraFrame, isLive, onToggleLive, galleryItem }: Props) {
  const d = printer.data;
  const cardState = getCardState(printer);
  const anomaly =
    printer.status === "connected" ? detectAnomaly(printer) : null;
  const activeFilament =
    printer.status === "connected" ? getActiveFilament(printer) : null;
  const elapsed = useElapsedTime(
    (cardState === "paused" || cardState === "error") ? printer.alertStartedAt : null
  );

  const activeTrayRef = printer.status === "connected" ? getActiveTrayRef(printer) : null;

  const [dismissedHms, setDismissedHms] = useState<Set<string>>(new Set());
  const [dismissedPrintError, setDismissedPrintError] = useState<number | null>(null);

  const dismissHms = useCallback((key: string) => {
    setDismissedHms((prev) => new Set([...prev, key]));
  }, []);

  const cardClass = [
    "printer-card",
    cardState === "printing" && "state-printing",
    cardState === "error" && "state-error",
    cardState === "paused" && "state-paused",
  ]
    .filter(Boolean)
    .join(" ");

  const isConnected = printer.status === "connected" && d;

  const pct = d?.mc_percent || 0;
  const isRunning = d?.gcode_state === "RUNNING";

  return (
    <div className={cardClass}>
      {/* Camera — top of card */}
      <div className="card-camera" onClick={onToggleLive}>
        {cameraFrame ? (
          <img src={cameraFrame} alt={`${printer.name} feed`} />
        ) : (
          <div className="camera-placeholder">{printer.name}</div>
        )}
        {isRunning && (
          <div className="card-camera-progress">
            <div className="card-camera-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
        {isRunning && (
          <div className="card-camera-pct">{pct}<span className="card-camera-pct-unit">%</span></div>
        )}
        <div className="card-camera-footer">
          <span className="card-camera-name">{printer.name}</span>
          <span className={`camera-live-badge${isLive ? " live" : ""}`}>
            <span className="live-toggle-dot" />
            {isLive ? "live" : "click for live"}
          </span>
        </div>
      </div>

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
            {elapsed && <span className="state-tag-elapsed"> · {elapsed}</span>}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="card-main">
        {/* Situation line */}
        <div className={`situation-line${cardState === "paused" || cardState === "error" ? " situation-urgent" : ""}`}>
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

        {/* HMS alerts — unknown codes are suppressed; known codes only */}
        {isConnected && d.hms && d.hms.length > 0 && (() => {
          const visible = d.hms
            .map((h) => decodeHMS(h.attr, h.code, printer.model))
            .filter((a) => !a.unknown && !dismissedHms.has(a.key));
          if (visible.length === 0) return null;
          return (
            <div className="hms-alerts">
              {visible.map((alert) => (
                <div key={alert.key} className={`hms-alert ${alert.severity}`}>
                  <span className="hms-alert-dot" />
                  {alert.message}
                  <a
                    className="hms-alert-link"
                    href={alert.wikiUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {alert.key} ↗
                  </a>
                  <button className="hms-alert-dismiss" onClick={() => dismissHms(alert.key)} aria-label="Dismiss">×</button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* print_error — non-zero means firmware reported a specific error code */}
        {isConnected && !!d.print_error && d.print_error !== dismissedPrintError && (
          <div className="hms-alerts">
            <div className="hms-alert error">
              <span className="hms-alert-dot" />
              Print error
              <a
                className="hms-alert-link"
                href={`https://wiki.bambulab.com/en/${wikiBase(printer.model)}/troubleshooting/print-error`}
                target="_blank"
                rel="noreferrer"
              >
                0x{d.print_error.toString(16).toUpperCase()} ↗
              </a>
              <button className="hms-alert-dismiss" onClick={() => setDismissedPrintError(d.print_error!)} aria-label="Dismiss">×</button>
            </div>
          </div>
        )}

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

            {/* Gallery slice info + cost */}
            {d.gcode_state === "RUNNING" && galleryItem && (() => {
                  const hasCost = galleryItem.estimated_weight_g != null && galleryItem.cost_per_kg != null;
                  const costSoFar = hasCost
                    ? ((d.mc_percent || 0) / 100) * galleryItem.estimated_weight_g! * galleryItem.cost_per_kg! / 1000
                    : null;
                  const hasSlice = galleryItem.layer_height || galleryItem.infill_density || galleryItem.wall_count || galleryItem.support_enabled;
                  return (
                    <div className="print-gallery-info">
                      {hasSlice && (
                        <div className="print-slice-row">
                          {galleryItem.layer_height && <span className="print-slice-tag">{galleryItem.layer_height}mm</span>}
                          {galleryItem.infill_density && <span className="print-slice-tag">{galleryItem.infill_density}{galleryItem.infill_pattern ? ` ${galleryItem.infill_pattern}` : ""}</span>}
                          {galleryItem.wall_count && <span className="print-slice-tag">{galleryItem.wall_count}w</span>}
                          {galleryItem.support_enabled && <span className="print-slice-tag print-slice-tag-support">supports</span>}
                        </div>
                      )}
                      {costSoFar != null && (
                        <span className="print-cost-so-far">
                          <span className="print-cost-label">cost so far</span>
                          ${costSoFar.toFixed(2)}
                          {hasCost && <span className="print-cost-total"> / ${((galleryItem.estimated_weight_g! * galleryItem.cost_per_kg!) / 1000).toFixed(2)}</span>}
                        </span>
                      )}
                    </div>
                  );
                })()}

            {/* Inline details row: filament, speed, wifi, chamber */}
            <div className="card-details">
              {activeFilament && (
                <span className="detail-item">
                  <span className="detail-swatch" style={{ background: activeFilament.color }} />
                  <span className="detail-value">{activeFilament.type}</span>
                </span>
              )}
              {d.spd_lvl != null && (
                <span className="detail-item">
                  <span className="detail-label">speed</span>
                  <span className="detail-value">
                    {speedLabel(d.spd_lvl)}
                    {d.spd_mag != null && <span className="detail-mag"> {d.spd_mag}%</span>}
                  </span>
                </span>
              )}
              {d.chamber_temper != null && (
                <span className="detail-item">
                  <span className="detail-label">chamber</span>
                  <span className="detail-value" style={{ color: tempColor(d.chamber_temper, "chamber") }}>
                    {d.chamber_temper.toFixed(0)}°
                  </span>
                </span>
              )}
              {d.wifi_signal && (
                <span className="detail-item">
                  <span className="detail-label">wifi</span>
                  <span className="detail-value">{d.wifi_signal}</span>
                </span>
              )}
            </div>

            {/* AMS tray swatches — one cluster per unit with per-unit humidity */}
            {d.ams?.ams && d.ams.ams.length > 0 && (
              <div className="card-ams">
                {d.ams.ams.map((unit) => {
                  const trays = unit.tray ?? [];
                  if (trays.length === 0 && !unit.humidity) return null;
                  return (
                    <span key={unit.id} className="ams-unit">
                      <span className="ams-unit-label">
                        {parseInt(unit.id, 10) >= 128 ? "HT" : `AMS ${parseInt(unit.id, 10) + 1}`}
                      </span>
                      {trays.map((tray) => {
                        const isEmpty = !tray.tray_type;
                        const color = isEmpty ? undefined : `#${tray.tray_color?.slice(0, 6) || "444"}`;
                        const isActive = activeTrayRef?.unitId === unit.id && activeTrayRef?.trayId === tray.id;
                        return (
                          <span
                            key={`${unit.id}-${tray.id}`}
                            className={`ams-dot${isActive ? " active" : ""}${isEmpty ? " empty" : ""}`}
                            title={isEmpty ? "empty" : tray.tray_type}
                            style={color ? {
                              background: color,
                              boxShadow: isActive ? `0 0 6px ${color}80` : "none",
                            } : undefined}
                          />
                        );
                      })}
                      {unit.humidity && (
                        <span className="ams-unit-humidity">{unit.humidity}%RH</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}

            {/* External spool */}
            {d.vir_slot && d.vir_slot.length > 0 && (
              <div className="card-ams">
                {d.vir_slot.filter((s) => s.tray_type && s.tray_uuid && !/^0+$/.test(s.tray_uuid)).map((slot) => {
                  const color = `#${slot.tray_color?.slice(0, 6) || "444"}`;
                  return (
                    <span
                      key={slot.id}
                      className="ams-dot active"
                      title={slot.tray_type}
                      style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
});

