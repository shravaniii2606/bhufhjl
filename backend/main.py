from functools import lru_cache
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from analysis import (
    build_comparison,
    compute_metrics,
    error_by_horizon,
    load_data,
)

app = FastAPI(title="Wind Forecast Analysis API")

# allow the React site (different address) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

ACTUALS, FORECASTS = load_data("data")  # read CSVs once at startup


@lru_cache(maxsize=32)
def comparison_for(cutoff_hour: int) -> pd.DataFrame:
    """Cache the result so repeated requests are instant."""
    return build_comparison(ACTUALS, FORECASTS, cutoff_hour)


def filtered(cutoff_hour: int, start: str | None, end: str | None) -> pd.DataFrame:
    df = comparison_for(cutoff_hour)
    if start:
        df = df[df["startTime"] >= pd.Timestamp(start, tz="UTC")]
    if end:  # end date is inclusive
        df = df[df["startTime"] < pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)]
    if df.empty:
        raise HTTPException(404, "No data for this range")
    return df


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/series")
def series(
    start: str | None = None,
    end: str | None = None,
    cutoff_hour: int = Query(9, ge=0, le=23),
):
    """Actual vs the forecast the buyer would have had at decision time."""
    df = filtered(cutoff_hour, start, end)
    return [
        {
            "startTime": r.startTime.isoformat(),
            "actual": r.actual,
            "forecast": r.forecast,
            "error": r.error,
            "publishTime": r.publishTime.isoformat(),
            "horizon_h": round(r.horizon_h, 1),
        }
        for r in df.itertuples()
    ]


@app.get("/api/metrics")
def metrics(
    start: str | None = None,
    end: str | None = None,
    cutoff_hour: int = Query(9, ge=0, le=23),
):
    """MAE, RMSE, bias, MAPE, P50/P90 error."""
    return compute_metrics(filtered(cutoff_hour, start, end))


@app.get("/api/error-by-horizon")
def horizon():
    """Average error for forecasts made 0-6h, 6-12h, ... ahead."""
    return error_by_horizon(ACTUALS, FORECASTS).to_dict(orient="records")