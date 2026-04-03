import { useState, useEffect } from "react";

// ---- Types ----

interface DailyRow {
  day: string;
  total: number;
  finished: number;
  failed: number;
  cancelled: number;
  filament_g: number | null;
  cost: number | null;
}

interface PrinterRow {
  id: string;
  name: string;
  model: string | null;
  total: number;
  finished: number;
  failed: number;
  filament_g: number | null;
  cost: number | null;
}

interface PeriodTotals {
  total: number;
  finished: number;
  failed: number;
  filament_g: number;
  cost: number;
}

interface StatsData {
  daily: DailyRow[];
  byPrinter: PrinterRow[];
  totals: {
    week: PeriodTotals;
    month: PeriodTotals;
    year: PeriodTotals;
    all: PeriodTotals;
  };
}

// ---- Helpers ----

function successRate(p: PeriodTotals | PrinterRow): number {
  if (p.total === 0) return 0;
  return Math.round((p.finished / p.total) * 100);
}

function fmtG(g: number | null): string {
  if (g == null || g === 0) return "—";
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${g}g`;
}

function fmtCost(c: number | null): string {
  if (c == null || c === 0) return "—";
  return `$${c.toFixed(2)}`;
}

// Fill in missing days in a 30-day window so the chart has no gaps
function fillDailyGaps(rows: DailyRow[], windowDays: number): DailyRow[] {
  const map = new Map(rows.map((r) => [r.day.slice(0, 10), r]));
  const result: DailyRow[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push(map.get(key) ?? { day: key, total: 0, finished: 0, failed: 0, cancelled: 0, filament_g: null, cost: null });
  }
  return result;
}

function shortDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 1);
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
}

// ---- SVG Bar Chart ----

interface BarChartProps {
  data: DailyRow[];
  mode: "prints" | "filament";
  windowDays: number;
}

function BarChart({ data, mode, windowDays }: BarChartProps) {
  const filled = fillDailyGaps(data, windowDays);
  const W = 600;
  const H = 80;
  const labelH = 16;
  const chartH = H - labelH;
  const n = filled.length;
  const gap = 2;
  const barW = Math.max(1, (W - gap * (n - 1)) / n);

  const values = filled.map((d) =>
    mode === "prints" ? d.total : (d.filament_g ?? 0)
  );
  const maxVal = Math.max(...values, 1);

  // Label every 7th day
  const labelIndices = new Set<number>();
  for (let i = n - 1; i >= 0; i -= 7) labelIndices.add(i);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="stat-chart-svg"
    >
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={0} x2={W}
          y1={chartH * (1 - f)} y2={chartH * (1 - f)}
          stroke="var(--border-subtle)"
          strokeWidth={0.5}
        />
      ))}

      {filled.map((d, i) => {
        const x = i * (barW + gap);
        const val = mode === "prints" ? d.total : (d.filament_g ?? 0);
        const finH = mode === "prints"
          ? (d.finished / maxVal) * chartH
          : (val / maxVal) * chartH;
        const failH = mode === "prints"
          ? (d.failed / maxVal) * chartH
          : 0;
        const isToday = i === n - 1;

        return (
          <g key={d.day}>
            {/* Finished / filament bar */}
            {finH > 0 && (
              <rect
                x={x} y={chartH - finH}
                width={barW} height={finH}
                fill={isToday ? "var(--green)" : "var(--green-muted)"}
                opacity={isToday ? 0.9 : 0.6}
              />
            )}
            {/* Failed bar stacked on top */}
            {failH > 0 && (
              <rect
                x={x} y={chartH - finH - failH}
                width={barW} height={failH}
                fill="var(--red-alert)"
                opacity={0.7}
              />
            )}
            {/* Empty bar placeholder */}
            {val === 0 && (
              <rect
                x={x} y={chartH - 1}
                width={barW} height={1}
                fill="var(--border-subtle)"
              />
            )}
            {/* Day label */}
            {labelIndices.has(i) && (
              <text
                x={x + barW / 2} y={H - 1}
                textAnchor="middle"
                className="stat-chart-label"
              >
                {windowDays <= 7 ? shortDay(d.day) : shortDate(d.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---- Sparkline ----

function Sparkline({ values, color = "var(--green)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const W = 80;
  const H = 24;
  const max = Math.max(...values, 1);
  const step = W / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${H - (v / max) * H}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stat-sparkline" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---- Period Card ----

function PeriodCard({ label, p, spark }: { label: string; p: PeriodTotals; spark?: number[] }) {
  const rate = successRate(p);
  const rateColor = rate >= 90 ? "var(--green)" : rate >= 70 ? "var(--amber)" : "var(--red-alert)";

  return (
    <div className="stat-period-card">
      <div className="stat-period-label">{label}</div>
      <div className="stat-period-main">
        <span className="stat-period-count">{p.total}</span>
        <span className="stat-period-unit">prints</span>
      </div>
      <div className="stat-period-detail">
        {p.total > 0 && (
          <span className="stat-rate" style={{ color: rateColor }}>{rate}% ok</span>
        )}
        {p.failed > 0 && (
          <span className="stat-failed">{p.failed} failed</span>
        )}
      </div>
      <div className="stat-period-extra">
        {p.filament_g > 0 && <span className="stat-extra-item">{fmtG(p.filament_g)}</span>}
        {p.cost > 0 && <span className="stat-extra-item stat-extra-cost">{fmtCost(p.cost)}</span>}
      </div>
      {spark && <Sparkline values={spark} color={rateColor} />}
    </div>
  );
}

// ---- Main Component ----

export function Stats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"prints" | "filament">("prints");
  const [windowDays, setWindowDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch("/api/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="stat-empty">Loading…</div>;
  if (!data) return <div className="stat-empty">No data — start some prints first.</div>;

  const { daily, byPrinter, totals } = data;
  const maxPrinterTotal = Math.max(...byPrinter.map((p) => p.total), 1);

  // Daily success rate sparkline (last 14 days)
  const last14 = fillDailyGaps(daily, 14);
  const spark = last14.map((d) => d.total > 0 ? Math.round((d.finished / d.total) * 100) : 0);

  return (
    <div className="stat-page">

      {/* Period summary row */}
      <div className="stat-period-row">
        <PeriodCard label="This Week"  p={totals.week}  spark={spark.slice(-7)} />
        <PeriodCard label="This Month" p={totals.month} spark={spark} />
        <PeriodCard label="This Year"  p={totals.year} />
        <PeriodCard label="All Time"   p={totals.all} />
      </div>

      {/* Chart section */}
      <div className="stat-section">
        <div className="stat-section-header">
          <span className="stat-section-title">
            {chartMode === "prints" ? "Print Volume" : "Filament Consumed"} — last {windowDays} days
          </span>
          <div className="stat-chart-controls">
            <button
              className={`stat-chart-btn${chartMode === "prints" ? " active" : ""}`}
              onClick={() => setChartMode("prints")}
            >
              Prints
            </button>
            <button
              className={`stat-chart-btn${chartMode === "filament" ? " active" : ""}`}
              onClick={() => setChartMode("filament")}
            >
              Filament
            </button>
            <select
              className="log-select"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            >
              <option value={7}>7d</option>
              <option value={14}>14d</option>
              <option value={30}>30d</option>
            </select>
          </div>
        </div>
        <div className="stat-chart-wrap">
          <BarChart data={daily} mode={chartMode} windowDays={windowDays} />
        </div>
        {chartMode === "prints" && (
          <div className="stat-chart-legend">
            <span className="stat-legend-item stat-legend-ok">finished</span>
            <span className="stat-legend-item stat-legend-fail">failed</span>
          </div>
        )}
      </div>

      {/* Per-printer breakdown */}
      {byPrinter.length > 0 && (
        <div className="stat-section">
          <div className="stat-section-header">
            <span className="stat-section-title">Per Printer — last 30 days</span>
          </div>
          <div className="stat-printer-table">
            {byPrinter.map((p) => {
              const rate = successRate(p);
              const rateColor = rate >= 90 ? "var(--green)" : rate >= 70 ? "var(--amber)" : "var(--red-alert)";
              const barPct = (p.total / maxPrinterTotal) * 100;
              return (
                <div key={p.id} className="stat-printer-row">
                  <div className="stat-printer-name">
                    <span className="stat-printer-label">{p.name}</span>
                    {p.model && <span className="stat-printer-model">{p.model}</span>}
                  </div>
                  <div className="stat-printer-bar-wrap">
                    <div className="stat-printer-bar-track">
                      <div
                        className="stat-printer-bar-fill"
                        style={{ width: `${barPct}%` }}
                      />
                      {p.failed > 0 && (
                        <div
                          className="stat-printer-bar-fail"
                          style={{ width: `${(p.failed / maxPrinterTotal) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="stat-printer-stats">
                    <span className="stat-printer-count">{p.total}</span>
                    <span className="stat-printer-rate" style={{ color: rateColor }}>{rate}%</span>
                    {p.filament_g != null && p.filament_g > 0 && (
                      <span className="stat-printer-g">{fmtG(p.filament_g)}</span>
                    )}
                    {p.cost != null && p.cost > 0 && (
                      <span className="stat-printer-cost">{fmtCost(p.cost)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All-time filament + cost callout */}
      {(totals.all.filament_g > 0 || totals.all.cost > 0) && (
        <div className="stat-section stat-callout-row">
          {totals.all.filament_g > 0 && (
            <div className="stat-callout">
              <div className="stat-callout-value">{fmtG(totals.all.filament_g)}</div>
              <div className="stat-callout-label">filament used all time</div>
            </div>
          )}
          {totals.all.cost > 0 && (
            <div className="stat-callout">
              <div className="stat-callout-value stat-callout-cost">{fmtCost(totals.all.cost)}</div>
              <div className="stat-callout-label">filament cost all time</div>
            </div>
          )}
          {totals.all.total > 0 && (
            <div className="stat-callout">
              <div className="stat-callout-value">{successRate(totals.all)}%</div>
              <div className="stat-callout-label">all-time success rate</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
