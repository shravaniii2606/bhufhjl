import os
from datetime import datetime, timedelta, timezone
import pandas as pd
import requests

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
OUT_DIR = "data"
CHUNK_DAYS = 3


def get_json(url, params):
    """Call the API and return a list of records."""
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def daterange_chunks(start, end, days):
    """Split [start, end) into pieces of `days` days."""
    cur = start
    while cur < end:
        nxt = min(cur + timedelta(days=days), end)
        yield cur, nxt
        cur = nxt


def fetch_actuals():
    """Real wind generation for January 2026."""
    rows = []
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 2, 1, tzinfo=timezone.utc)
    for a, b in daterange_chunks(start, end, CHUNK_DAYS):
        params = {
            "settlementDateFrom": a.strftime("%Y-%m-%d"),
            "settlementDateTo": (b - timedelta(days=1)).strftime("%Y-%m-%d"),
            "fuelType": "WIND",
            "format": "json",
        }
        data = get_json(f"{BASE}/FUELHH/stream", params)
        print(f"actuals {params['settlementDateFrom']} -> {len(data)} rows")
        rows.extend(data)

    df = pd.DataFrame(rows)
    df = df[df["fuelType"] == "WIND"]
    df = df[["startTime", "generation"]].drop_duplicates("startTime")
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    return df.sort_values("startTime")


def fetch_forecasts():
    """
    All wind forecasts published from mid-Dec 2025 to end of Jan 2026.
    (We start early because forecasts for early January were published in December.)
    """
    rows = []
    start = datetime(2025, 12, 15, tzinfo=timezone.utc)
    end = datetime(2026, 2, 1, tzinfo=timezone.utc)
    for a, b in daterange_chunks(start, end, CHUNK_DAYS):
        params = {
            "publishDateTimeFrom": a.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": b.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "json",
        }
        data = get_json(f"{BASE}/WINDFOR/stream", params)
        print(f"forecasts {params['publishDateTimeFrom']} -> {len(data)} rows")
        rows.extend(data)

    df = pd.DataFrame(rows)
    df = df[["startTime", "publishTime", "generation"]]
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    
    df = df[(df["startTime"] >= "2026-01-01") & (df["startTime"] < "2026-02-01")]
    return df.drop_duplicates(["startTime", "publishTime"]).sort_values(
        ["startTime", "publishTime"]
    )


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)

    actuals = fetch_actuals()
    actuals.to_csv(f"{OUT_DIR}/actuals.csv", index=False)
    print("\nACTUALS:", actuals.shape)
    print(actuals.head())

    forecasts = fetch_forecasts()
    forecasts.to_csv(f"{OUT_DIR}/forecasts.csv", index=False)
    print("\nFORECASTS:", forecasts.shape)
    print(forecasts.head())