# UK Wind Forecast vs Actual: day-ahead buying view

A web app for an energy-buying team. It answers two questions about UK national wind generation (Elexon data, January 2026):

1. **What was the latest wind forecast available when the day-ahead buying decision had to be made?**
2. **How accurate were those forecasts, in numbers?** (so the error can be built into buying decisions)

**Live app:** `<PASTE VERCEL URL>`
**API (backend):** `<PASTE RENDER URL>` (interactive docs at `/docs`)
**Demo video:** `<PASTE UNLISTED YOUTUBE URL>`

> Note: the backend runs on a free tier and sleeps when idle. The first request after a pause can take up to a minute. Open the API's `/api/health` once to wake it, then reload the app.

## AI tools disclosure

I used AI tools (Claude by Anthropic) to assist with planning, code generation and review. I tested the logic and checked the results against the real data myself.

## How it works

Data (Elexon BMRS, national level only):
- **Actuals:** `FUELHH`, `fuelType = WIND`
- **Forecasts:** `WINDFOR`, with `startTime` (target time) and `publishTime` (when the forecast was made)

Core rule, in `backend/analysis.py`:

> For each target half-hour, use the forecast with the **latest `publishTime` that is at or before the decision cutoff**: the previous UK day at a chosen hour (default **09:00 UK time**).

Forecasts published after the cutoff are ignored, because the buyer would not have had them.

Then the app joins the chosen forecast with the actual value and computes:
- **Error** = forecast − actual (positive means the forecast was too high)
- **MAE**, **RMSE**, **bias**, **MAPE**, **P50 / P90 absolute error**
- **Error by forecast horizon** (horizon = `startTime − publishTime`), using all forecasts

### Assumptions
- The cutoff is **09:00 UK time on the day before delivery**. It is configurable in the UI (06:00 to 12:00).
- Forecasts are hourly while actuals are half-hourly, so only timestamps present in both datasets are compared (744 points for January).
- Scope is January 2026 delivery times. Forecasts published from mid-December 2025 are fetched so early-January targets have forecasts.
- Times are shown in UK time. Matching is done in UTC.
- No other data is used.

### Example finding (cutoff 09:00, January 2026)
- Typical miss (MAE) about 2,100 MW; 9 in 10 misses are under about 4,300 MW (P90).
- Forecasts ran high: the median forecast was about 16% above actual.
- Error grows with forecast horizon.

## Files and directories

```
.
├── README.md
├── docker-compose.yml        # runs backend + frontend together
├── backend/
│   ├── main.py               # FastAPI app: /api/series, /api/metrics, /api/error-by-horizon, /api/health
│   ├── analysis.py           # cutoff logic, error and metric calculations
│   ├── fetch_data.py         # downloads actuals + forecasts from Elexon into data/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── data/
│       ├── actuals.csv       # cached WIND actuals (Jan 2026)
│       └── forecasts.csv     # cached WINDFOR forecasts
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── Dockerfile
    ├── .env.example          # VITE_API_URL
    └── src/
        ├── main.jsx
        ├── App.jsx           # page: controls, decision brief, stats, charts
        ├── api.js            # calls to the backend
        └── styles.css
```

The data is cached in `backend/data/` so the deployed app does not depend on Elexon being reachable.

## API

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /api/series` | `start`, `end` (YYYY-MM-DD), `cutoff_hour` | actual, chosen forecast, error, publish time, horizon per timestamp |
| `GET /api/metrics` | `start`, `end`, `cutoff_hour` | MAE, RMSE, bias, MAPE, P50, P90 |
| `GET /api/error-by-horizon` | none | average absolute error per horizon bucket |
| `GET /api/health` | none | `{"status": "ok"}` |

## How to start the application

### Option 1: Docker (recommended)
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs

### Option 2: run locally without Docker
Backend (Python 3.12):
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```
Frontend (Node 20+), in a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the address Vite prints (usually http://localhost:5173). The frontend calls `http://localhost:8000` by default; change it with `VITE_API_URL` (see `frontend/.env.example`).

### Refreshing the data (optional)
```bash
cd backend
python -m pip install requests pandas
python fetch_data.py
```
This overwrites the CSVs in `backend/data/`.

## Deployment
- **Backend:** Docker web service on Render, root directory `backend`.
- **Frontend:** Vercel, root directory `frontend`, environment variable `VITE_API_URL` set to the backend URL.

## Possible next steps
- Tests for the cutoff logic with edge cases (clock changes, missing forecasts)
- Confirm with the data owner that forecast and actual series cover the same wind fleet
- Compare multiple cutoff times side by side
- Scheduled data refresh instead of cached CSVs