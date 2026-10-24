"""
Core logic of the project.

Step 1: for each target half-hour, pick the latest forecast published
        BEFORE the day-ahead cutoff (previous day, e.g. 09:00 UK time).
Step 2: join with actual wind generation.
Step 3: compute errors and summary numbers.

Run on your CSVs:
    python analysis.py
"""
import pandas as pd

CUTOFF_HOUR = 9  # decision time on the day before delivery (UK time) - configurable


def load_data(data_dir="data"):
    actuals = pd.read_csv(f"{data_dir}/actuals.csv", parse_dates=["startTime"])
    forecasts = pd.read_csv(
        f"{data_dir}/forecasts.csv", parse_dates=["startTime", "publishTime"]
    )
    # make sure everything is timezone-aware UTC
    actuals["startTime"] = pd.to_datetime(actuals["startTime"], utc=True)
    forecasts["startTime"] = pd.to_datetime(forecasts["startTime"], utc=True)
    forecasts["publishTime"] = pd.to_datetime(forecasts["publishTime"], utc=True)
    return actuals, forecasts


def pick_forecast_at_cutoff(forecasts, cutoff_hour=CUTOFF_HOUR):
    """
    For each startTime, keep the forecast with the latest publishTime
    that is <= cutoff (previous UK day at cutoff_hour:00).
    """
    df = forecasts.copy()

    # delivery day in UK local time (handles winter/summer time properly)
    local_start = df["startTime"].dt.tz_convert("Europe/London")
    delivery_day = local_start.dt.normalize()  # midnight UK time of that day

    # cutoff = previous day at cutoff_hour, UK time
    cutoff_local = (
        delivery_day - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour)
    )
    df["cutoff"] = cutoff_local.dt.tz_convert("UTC")

    # only forecasts that existed at decision time
    df = df[df["publishTime"] <= df["cutoff"]]

    # latest one per target time
    df = df.sort_values(["startTime", "publishTime"])
    df = df.groupby("startTime", as_index=False).last()

    # how far ahead was it made?
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    return df.rename(columns={"generation": "forecast"})


def build_comparison(actuals, forecasts, cutoff_hour=CUTOFF_HOUR):
    """Table with startTime, forecast, actual, error, horizon."""
    picked = pick_forecast_at_cutoff(forecasts, cutoff_hour)
    act = actuals.rename(columns={"generation": "actual"})[["startTime", "actual"]]
    df = picked.merge(act, on="startTime", how="inner")
    df["error"] = df["forecast"] - df["actual"]  # + = over-predicted
    df["abs_error"] = df["error"].abs()
    return df


def compute_metrics(df):
    """Summary numbers the buyer cares about."""
    nonzero = df[df["actual"] > 0]
    return {
        "n_points": int(len(df)),
        "MAE": float(df["abs_error"].mean()),
        "RMSE": float((df["error"] ** 2).mean() ** 0.5),
        "bias": float(df["error"].mean()),
        "MAPE_%": float((nonzero["abs_error"] / nonzero["actual"]).mean() * 100),
        "P50_abs_error": float(df["abs_error"].quantile(0.5)),
        "P90_abs_error": float(df["abs_error"].quantile(0.9)),
    }


if __name__ == "__main__":
    actuals, forecasts = load_data()
    comp = build_comparison(actuals, forecasts)
    print(comp.head(10).to_string())
    print()
    for k, v in compute_metrics(comp).items():
        print(f"{k}: {v:.1f}" if isinstance(v, float) else f"{k}: {v}")


HORIZON_BINS = [0, 6, 12, 24, 36, 48, 72, 168, 10_000]
HORIZON_LABELS = ["0-6h", "6-12h", "12-24h", "24-36h", "36-48h", "48-72h", "3-7d", "7d+"]


def error_by_horizon(actuals, forecasts):
    """
    Uses ALL forecasts (not just the cutoff one): how does error grow
    the further ahead the forecast was made?
    """
    act = actuals.rename(columns={"generation": "actual"})[["startTime", "actual"]]
    df = forecasts.rename(columns={"generation": "forecast"}).merge(
        act, on="startTime", how="inner"
    )
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    df = df[df["horizon_h"] >= 0]
    df["abs_error"] = (df["forecast"] - df["actual"]).abs()
    df["bucket"] = pd.cut(
        df["horizon_h"], bins=HORIZON_BINS, labels=HORIZON_LABELS, right=False
    )
    out = (
        df.groupby("bucket", observed=True)["abs_error"]
        .agg(MAE="mean", n="count")
        .reset_index()
    )
    out["bucket"] = out["bucket"].astype(str)
    return out