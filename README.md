# 🛰️ AquaWatch — Satellite Water Pollution Monitor

A production-ready web application that detects water pollution using real Sentinel-2 satellite imagery via Google Earth Engine.

**Live Demo:**
- Frontend (Vercel): `https://aquawatch.vercel.app`
- Backend API (Render): `https://aquawatch-api.onrender.com`

---

## 📋 Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [GEE Setup](#gee-setup)
4. [Local Development](#local-development)
5. [Deploy to Render (Backend)](#deploy-to-render-backend)
6. [Deploy to Vercel (Frontend)](#deploy-to-vercel-frontend)
7. [API Reference](#api-reference)
8. [Methodology](#methodology)
9. [Project Structure](#project-structure)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗺️ Interactive Map | Click any location to select an AOI; Leaflet.js with dark CartoDB basemap |
| 🛰️ Sentinel-2 Imagery | Real 10 m resolution satellite data via Google Earth Engine |
| 💧 NDWI Layer | Normalised Difference Water Index overlay |
| 🌊 Pollution Overlay | NDTI-based turbidity heatmap |
| 📊 Time-Series Charts | Monthly NDWI, NDTI, FAI trends with Plotly.js |
| 🔔 Alert System | Safe / Moderate / Polluted classification with recommendations |
| 📍 Quick Locations | Pre-loaded famous water bodies (Yamuna, Thames, Hudson, Nile…) |
| 📱 Responsive | Works on desktop, tablet, and mobile |

---

## 🏗️ Architecture

```
Browser (Vercel)
    │
    │  REST API calls
    ▼
FastAPI Backend (Render)
    │
    │  earthengine-api
    ▼
Google Earth Engine
    │
    │  Sentinel-2 SR
    ▼
Copernicus / ESA Data
```

---

## 🔑 GEE Setup

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `aquawatch-gee`)
3. Note the **Project ID**

### Step 2 — Enable Earth Engine API

1. In your project, go to **APIs & Services → Library**
2. Search for **Earth Engine API** and enable it

### Step 3 — Register for Earth Engine

1. Go to [earthengine.google.com](https://earthengine.google.com)
2. Sign up with your Google account
3. Register your Cloud project for Earth Engine access

### Step 4 — Create a Service Account

1. Go to **IAM & Admin → Service Accounts**
2. Create a service account (e.g. `aquawatch-sa`)
3. Grant it the **Earth Engine Resource Viewer** role
4. Create a JSON key and download it

### Step 5 — Set Environment Variables

For **Render** deployment, set these environment variables:

```
GEE_SERVICE_ACCOUNT_KEY=<paste entire JSON key file content as a single line>
GEE_PROJECT_ID=your-gcp-project-id
```

For **local development**, run:
```bash
earthengine authenticate
```
Then set `GEE_PROJECT_ID` in a `.env` file.

---

## 💻 Local Development

### Backend

```bash
cd AquaWatch/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Authenticate with GEE (first time only)
earthengine authenticate

# Create .env file
echo "GEE_PROJECT_ID=your-project-id" > .env

# Run development server
uvicorn app:app --reload --port 8000
```

API will be available at `http://localhost:8000`

### Frontend

```bash
cd AquaWatch/frontend

# Edit app.js — change API_BASE_URL to local backend:
# const API_BASE_URL = "http://localhost:8000";

# Serve with any static server, e.g.:
npx serve .
# or
python -m http.server 3000
```

Open `http://localhost:3000`

---

## 🚀 Deploy to Render (Backend)

1. Push the `AquaWatch/` folder to a GitHub repository

2. Go to [render.com](https://render.com) → **New Web Service**

3. Connect your GitHub repo

4. Configure:
   - **Root Directory:** `AquaWatch/backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** *(auto-detected from Procfile)*

5. Add Environment Variables:
   ```
   GEE_SERVICE_ACCOUNT_KEY = { ... full JSON key ... }
   GEE_PROJECT_ID          = your-gcp-project-id
   ```

6. Click **Deploy**

7. Note your Render URL (e.g. `https://aquawatch-api.onrender.com`)

---

## 🌐 Deploy to Vercel (Frontend)

1. Edit `AquaWatch/frontend/app.js`:
   ```javascript
   const API_BASE_URL = "https://aquawatch-api.onrender.com"; // your Render URL
   ```

2. Go to [vercel.com](https://vercel.com) → **New Project**

3. Import your GitHub repo

4. Configure:
   - **Root Directory:** `AquaWatch/frontend`
   - **Framework Preset:** Other (static)
   - **Output Directory:** `.` (current directory)

5. Click **Deploy**

6. Your app is live at `https://aquawatch.vercel.app`

---

## 📡 API Reference

### `GET /analyze`

Analyse water quality at a point.

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `lat` | float | required | Latitude |
| `lng` | float | required | Longitude |
| `buffer` | int | 5000 | AOI radius in metres |
| `days_back` | int | 60 | Days of imagery to search |

**Response:**
```json
{
  "location": { "lat": 28.6139, "lng": 77.209 },
  "indices": { "ndwi": 0.312, "ndti": 0.045, "fai": 0.000123 },
  "classification": {
    "label": "Moderate",
    "score": 25,
    "color": "#f39c12",
    "factors": ["Moderate turbidity (NDTI)"]
  },
  "tile_urls": {
    "rgb": "https://earthengine.googleapis.com/...",
    "ndwi": "https://earthengine.googleapis.com/...",
    "pollution": "https://earthengine.googleapis.com/..."
  },
  "bbox": { "west": ..., "south": ..., "east": ..., "north": ... },
  "images_used": 8,
  "date_range": { "start": "2026-02-26", "end": "2026-04-27" }
}
```

### `GET /timeseries`

Monthly historical time-series.

**Parameters:** `lat`, `lng`, `buffer`, `months` (default 12)

### `GET /alerts`

Current alert level and recommendations.

**Parameters:** `lat`, `lng`, `buffer`

### `GET /health`

Health check — returns `{"status": "ok"}`.

---

## 🔬 Methodology

### Indices Used

| Index | Formula | Bands | Meaning |
|---|---|---|---|
| **NDWI** | (Green − NIR) / (Green + NIR) | B3, B8 | Water presence & clarity |
| **NDTI** | (Red − Green) / (Red + Green) | B4, B3 | Turbidity / suspended sediment |
| **FAI** | NIR − baseline(Red, SWIR1) | B8, B4, B11 | Floating algae / bloom detection |

### Classification Rules

| Condition | Score Added |
|---|---|
| NDWI < 0.1 | +40 |
| NDWI 0.1–0.3 | +20 |
| NDTI > 0.1 | +35 |
| NDTI 0–0.1 | +15 |
| FAI > 0.02 | +25 |
| FAI 0.005–0.02 | +10 |

**Final label:** Score ≥ 50 → Polluted · Score 20–49 → Moderate · Score < 20 → Safe

---

## 📁 Project Structure

```
AquaWatch/
├── frontend/
│   ├── index.html        # Single-page app shell
│   ├── styles.css        # Dark dashboard stylesheet
│   ├── app.js            # Leaflet map + API calls + Plotly charts
│   └── vercel.json       # SPA routing + security headers
│
├── backend/
│   ├── app.py            # FastAPI app — GEE analysis endpoints
│   ├── requirements.txt  # Pinned Python dependencies
│   └── Procfile          # Render/Gunicorn start command
│
└── README.md
```

---

## ⚠️ Disclaimer

AquaWatch provides indicative water quality assessments based on remote sensing indices. Results should be validated with in-situ measurements before making public health or regulatory decisions. Cloud cover, atmospheric conditions, and seasonal variation can affect accuracy.

---

*Built with ❤️ using Google Earth Engine, Sentinel-2, FastAPI, Leaflet.js, and Plotly.js*
