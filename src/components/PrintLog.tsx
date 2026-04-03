import { useState, useEffect, useCallback } from "react";

interface LogEntry {
  id: number;
  printer_id: string;
  printer_name: string;
  printer_model: string | null;
  subtask_name: string | null;
  gcode_file: string | null;
  status: string;
  filament_type: string | null;
  filament_color: string | null;
  total_layers: number | null;
  started_at: string;
  finished_at: string | null;
  estimated_weight_g: number | null;
  cost_per_kg: number | null;
}

function duration(start: string, end: string | null): string {
  if (!end) return "running";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "--";
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function printCost(entry: LogEntry): number | null {
  if (entry.estimated_weight_g == null || entry.cost_per_kg == null) return null;
  return (entry.estimated_weight_g * entry.cost_per_kg) / 1000;
}

function statusClass(status: string): string {
  switch (status) {
    case "finished":  return "log-status-ok";
    case "failed":    return "log-status-fail";
    case "cancelled": return "log-status-cancel";
    case "running":   return "log-status-running";
    default:          return "log-status-dim";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "finished":  return "Done";
    case "failed":    return "Failed";
    case "cancelled": return "Cancelled";
    case "running":   return "Running";
    default:          return status;
  }
}

interface DayGroup {
  key: string;
  label: string;
  entries: LogEntry[];
}

function groupByDay(entries: LogEntry[]): DayGroup[] {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const k = dayKey(e.started_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return Array.from(map.entries()).map(([key, es]) => ({
    key,
    label: fmtDay(es[0].started_at),
    entries: es,
  }));
}

function DaySummary({ entries }: { entries: LogEntry[] }) {
  const finished = entries.filter((e) => e.status === "finished").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const totalCost = entries.reduce<number>((acc, e) => {
    const c = printCost(e);
    return c != null ? acc + c : acc;
  }, 0);
  return (
    <div className="log-day-summary">
      <span className="log-day-stat">{entries.length} print{entries.length !== 1 ? "s" : ""}</span>
      {finished > 0 && <span className="log-day-stat log-stat-ok">{finished} ok</span>}
      {failed > 0 && <span className="log-day-stat log-stat-fail">{failed} failed</span>}
      {totalCost > 0 && <span className="log-day-stat log-stat-cost">${totalCost.toFixed(2)}</span>}
    </div>
  );
}

export function PrintLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/log?days=${days}`);
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const groups = groupByDay(entries);

  // Unique printers for filter
  const printerIds = [...new Set(entries.map((e) => e.printer_id))];
  const [filterPrinter, setFilterPrinter] = useState<string>("all");
  const printerName = (id: string) => entries.find((e) => e.printer_id === id)?.printer_name ?? id;

  const visible = filterPrinter === "all"
    ? groups
    : groups.map((g) => ({ ...g, entries: g.entries.filter((e) => e.printer_id === filterPrinter) }))
             .filter((g) => g.entries.length > 0);

  return (
    <div className="log-container">
      <div className="log-toolbar">
        <div className="log-filter-group">
          <span className="log-filter-label">Printer</span>
          <select className="log-select" value={filterPrinter} onChange={(e) => setFilterPrinter(e.target.value)}>
            <option value="all">All</option>
            {printerIds.map((id) => (
              <option key={id} value={id}>{printerName(id)}</option>
            ))}
          </select>
        </div>
        <div className="log-filter-group">
          <span className="log-filter-label">Window</span>
          <select className="log-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
        <button className="inv-btn inv-btn-ghost" onClick={load} disabled={loading} style={{ marginLeft: "auto" }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && entries.length === 0 ? (
        <div className="log-empty">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="log-empty">No print jobs in the last {days} days.</div>
      ) : (
        <div className="log-groups">
          {visible.map((group) => (
            <div key={group.key} className="log-day-group">
              <div className="log-day-header">
                <span className="log-day-label">{group.label}</span>
                <DaySummary entries={group.entries} />
              </div>
              <div className="log-entries">
                {group.entries.map((entry) => {
                  const c = printCost(entry);
                  const filColor = entry.filament_color
                    ? `#${entry.filament_color.slice(0, 6)}`
                    : null;
                  return (
                    <div key={entry.id} className={`log-entry log-entry-${entry.status}`}>
                      <div className="log-entry-left">
                        <span className={`log-status-dot ${statusClass(entry.status)}`} title={entry.status} />
                        <div className="log-entry-main">
                          <div className="log-entry-name">
                            {entry.subtask_name || entry.gcode_file || "—"}
                          </div>
                          <div className="log-entry-meta">
                            <span className="log-meta-printer">{entry.printer_name}</span>
                            {entry.printer_model && (
                              <span className="log-meta-model">{entry.printer_model}</span>
                            )}
                            <span className="log-meta-time">{fmtTime(entry.started_at)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="log-entry-right">
                        {filColor && (
                          <span className="log-filament">
                            <span className="log-filament-dot" style={{ background: filColor }} />
                            {entry.filament_type && <span className="log-filament-type">{entry.filament_type}</span>}
                          </span>
                        )}
                        {entry.total_layers != null && (
                          <span className="log-stat">{entry.total_layers} layers</span>
                        )}
                        {entry.estimated_weight_g != null && (
                          <span className="log-stat">{entry.estimated_weight_g}g</span>
                        )}
                        {c != null && (
                          <span className="log-stat log-stat-cost">${c.toFixed(2)}</span>
                        )}
                        <span className="log-duration">{duration(entry.started_at, entry.finished_at)}</span>
                        <span className={`log-status-badge ${statusClass(entry.status)}`}>
                          {statusLabel(entry.status)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
