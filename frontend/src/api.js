// All calls to the Python backend live here.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}${qs ? "?" + qs : ""}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getSeries = (start, end, cutoff) =>
  get("/api/series", { start, end, cutoff_hour: cutoff });

export const getMetrics = (start, end, cutoff) =>
  get("/api/metrics", { start, end, cutoff_hour: cutoff });

export const getHorizon = () => get("/api/error-by-horizon");