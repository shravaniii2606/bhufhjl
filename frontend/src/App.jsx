import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getHorizon, getMetrics, getSeries } from "./api";

const COLORS = { actual: "#12355b", forecast: "#d4501f", band: "#d4501f" };

const num = (n) =>
  Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });

const tickFmt = (ms) =>
  new Date(ms).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function App() {
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-01-31");
  const [cutoff, setCutoff] = useState(9);
  const [series, setSeries] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [horizon, setHorizon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const badRange = start > end;

  useEffect(() => {
    getHorizon().then(setHorizon).catch(() => {});
  }, []);

  useEffect(() => {
    if (badRange) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([getSeries(start, end, cutoff), getMetrics(start, end, cutoff)])
      .then(([s, m]) => {
        if (cancelled) return;
        setSeries(s);
        setMetrics(m);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [start, end, cutoff, badRange]);

  const chartData = useMemo(() => {
    const p90 = metrics?.P90_abs_error ?? 0;
    return series.map((r) => ({
      t: new Date(r.startTime).getTime(),
      actual: r.actual,
      forecast: r.forecast,
      band: [Math.max(0, r.forecast - p90), r.forecast + p90],
    }));
  }, [series, metrics]);

  const cutoffLabel = `${String(cutoff).padStart(2, "0")}:00`;

  return (
    <main className="page">
      <header className="top">
        <div className="top-copy">
          <span className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            UK energy intelligence
          </span>
          <h1>What we expected<br />vs what arrived.</h1>
          <p className="sub">
            A clearer view of forecast confidence for day-ahead wind buying.
          </p>
        </div>
        <div className="top-meta" aria-label="Dataset details">
          <span className="meta-label">Data window</span>
          <strong>January 2026</strong>
          <span>Elexon national wind · UK time</span>
        </div>
      </header>

      <section className="controls-card" aria-label="Choose what to analyse">
        <div className="controls-heading">
          <div>
            <span className="section-kicker">Refine the view</span>
            <h2>Choose your analysis window</h2>
          </div>
          <p>Compare the forecast you had at decision time with actual output.</p>
        </div>

        <div className="controls-grid">
          <label className="control-field">
            <span className="control-label">From</span>
            <span className="control-caption">Start of delivery window</span>
            <span className="input-shell">
              <span className="field-icon calendar-icon" aria-hidden="true" />
              <input
                type="date"
                value={start}
                min="2026-01-01"
                max="2026-01-31"
                onChange={(e) => setStart(e.target.value)}
              />
            </span>
          </label>

          <span className="range-divider" aria-hidden="true">→</span>

          <label className="control-field">
            <span className="control-label">To</span>
            <span className="control-caption">End of delivery window</span>
            <span className="input-shell">
              <span className="field-icon calendar-icon" aria-hidden="true" />
              <input
                type="date"
                value={end}
                min="2026-01-01"
                max="2026-01-31"
                onChange={(e) => setEnd(e.target.value)}
              />
            </span>
          </label>

          <label className="control-field time-field">
            <span className="control-label">Decision cutoff</span>
            <span className="control-caption">UK time · day before delivery</span>
            <span className="input-shell select-shell">
              <span className="field-icon clock-icon" aria-hidden="true" />
              <select
                value={cutoff}
                onChange={(e) => setCutoff(Number(e.target.value))}
              >
                {[6, 7, 8, 9, 10, 11, 12].map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>
      </section>

      {badRange && (
        <p className="notice" role="alert">
          The start date is after the end date. Pick a start date on or before
          the end date.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          Could not load data: {error}. Check that the backend is running and
          the API address is correct.
        </p>
      )}

      {metrics && !badRange && (
        <section className="brief" aria-live="polite">
          <span className="section-kicker">Decision brief</span>
          <p>
            Using the latest forecast available at {cutoffLabel} the day before,
            wind output was off by{" "}
            <strong>{num(metrics.MAE)} MW</strong> on average. Nine times in
            ten the miss was under <strong>{num(metrics.P90_abs_error)} MW</strong>.
          </p>
          <p className="brief-action">
            {Math.abs(metrics.bias) < 0.1 * metrics.MAE
              ? `No consistent lean: forecasts were ${metrics.bias >= 0 ? "high" : "low"} by only ${num(Math.abs(metrics.bias))} MW on average. Keep a reserve of about the 9-in-10 miss when buying.`
              : metrics.bias >= 0
                ? `Forecasts ran high by ${num(metrics.bias)} MW on average, so there is a risk of a shortfall. Keep a reserve of at least the 9-in-10 miss when buying.`
                : `Forecasts ran low by ${num(Math.abs(metrics.bias))} MW on average: wind tended to beat the forecast, so buying to the forecast alone would over-buy.`}
          </p>
        </section>
      )}

      {metrics && !badRange && (
        <dl className="stats">
          <Stat
            label="Typical miss"
            term="MAE"
            value={`${num(metrics.MAE)} MW`}
            note="Average gap between forecast and actual."
          />
          <Stat
            label="Big-miss measure"
            term="RMSE"
            value={`${num(metrics.RMSE)} MW`}
            note="Like the average, but big misses count more."
          />
          <Stat
            label="Average lean"
            term="Bias"
            value={`${metrics.bias >= 0 ? "+" : "−"}${num(Math.abs(metrics.bias))} MW`}
            note="Plus means forecasts were too high."
          />
          <Stat
            label="Miss as share of actual"
            term="MAPE"
            value={`${metrics["MAPE_%"].toFixed(1)}%`}
            note="Average gap relative to real output."
          />
          <Stat
            label="9 in 10 misses are under"
            term="P90"
            value={`${num(metrics.P90_abs_error)} MW`}
            note="A safe size for a buffer."
          />
        </dl>
      )}

      <section className="panel" aria-busy={loading}>
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Forecast performance</span>
            <h2>Actual vs the forecast you had at decision time</h2>
          </div>
          <span className="panel-chip">MW · UK time</span>
        </div>
        <p className="panel-note">
          Orange band: forecast plus or minus the 9-in-10 miss. All times UK.
        </p>
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid stroke="#dfe4e2" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={tickFmt}
                minTickGap={60}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={num}
                tick={{ fontSize: 12 }}
                width={64}
                label={{
                  value: "MW",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 12,
                }}
              />
              <Tooltip
                labelFormatter={tickFmt}
                formatter={(v, name) =>
                  Array.isArray(v)
                    ? [`${num(v[0])} to ${num(v[1])} MW`, name]
                    : [`${num(v)} MW`, name]
                }
              />
              <Legend />
              <Area
                dataKey="band"
                name="Forecast range"
                stroke="none"
                fill={COLORS.band}
                fillOpacity={0.14}
                isAnimationActive={false}
              />
              <Line
                dataKey="forecast"
                name="Forecast"
                stroke={COLORS.forecast}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="actual"
                name="Actual"
                stroke={COLORS.actual}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Planning horizon</span>
            <h2>The earlier the forecast, the bigger the miss</h2>
          </div>
          <span className="panel-chip">Average miss</span>
        </div>
        <p className="panel-note">
          Average miss by how far ahead each forecast was made, across all
          forecasts in January.
        </p>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={horizon}
              margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            >
              <CartesianGrid stroke="#dfe4e2" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={num}
                tick={{ fontSize: 12 }}
                width={64}
                label={{
                  value: "Average miss (MW)",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 12,
                }}
              />
              <Tooltip formatter={(v) => [`${num(v)} MW`, "Average miss"]} />
              <Bar
                dataKey="MAE"
                fill={COLORS.actual}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <footer className="foot">
        Data: Elexon BMRS (FUELHH actuals, WINDFOR forecasts), national wind,
        January 2026. Misses are forecast minus actual.
      </footer>
    </main>
  );
}

function Stat({ label, term, value, note }) {
  return (
    <div className="stat">
      <dt>
        {label} <span className="term">({term})</span>
      </dt>
      <dd className="val">{value}</dd>
      <dd className="note">{note}</dd>
    </div>
  );
}
