"""
AquaWatch Backend - FastAPI application for satellite water pollution detection.
Deployed on Render. Uses Google Earth Engine Python API for Sentinel-2 analysis.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import ee
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aquawatch")

# ─── GEE Authentication ─────────────────────────────────────────────────────
def initialize_gee():
    """
    Authenticate with Google Earth Engine using a service account JSON key
    stored in the GEE_SERVICE_ACCOUNT_KEY environment variable (JSON string).
    Falls back to application-default credentials for local dev.
    """
    key_json = os.getenv("GEE_SERVICE_ACCOUNT_KEY")
    project_id = os.getenv("GEE_PROJECT_ID", "")

    if key_json:
        try:
            key_data = json.loads(key_json)
            credentials = ee.ServiceAccountCredentials(
                email=key_data["client_email"],
                key_data=json.dumps(key_data),
            )
            ee.Initialize(credentials=credentials, project=project_id)
            logger.info("GEE initialized via service account.")
        except Exception as exc:
            logger.error("GEE service account init failed: %s", exc)
            raise RuntimeError(f"GEE init failed: {exc}") from exc
    else:
        # Local development: use `earthengine authenticate` credentials
        try:
            ee.Initialize(project=project_id)
            logger.info("GEE initialized via application-default credentials.")
        except Exception as exc:
            logger.error("GEE default init failed: %s", exc)
            raise RuntimeError(f"GEE init failed: {exc}") from exc


initialize_gee()

# ─── FastAPI App ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="AquaWatch API",
    description="Water pollution detection using Sentinel-2 satellite imagery via Google Earth Engine.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to your Vercel domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Constants ───────────────────────────────────────────────────────────────
SENTINEL2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_COVER_THRESHOLD = 20          # Max cloud cover % for image selection
DEFAULT_BUFFER_METERS = 5000        # AOI buffer radius in metres
NDWI_WATER_THRESHOLD = 0.0          # NDWI > 0 → water pixel
POLLUTION_THRESHOLDS = {
    "safe":      {"ndwi_min": 0.3,  "turbidity_max": 10},
    "moderate":  {"ndwi_min": 0.1,  "turbidity_max": 30},
    "polluted":  {"ndwi_min": -0.1, "turbidity_max": 100},
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def build_aoi(lat: float, lng: float, buffer_m: int = DEFAULT_BUFFER_METERS) -> ee.Geometry:
    """Return a circular AOI geometry around the given coordinates."""
    return ee.Geometry.Point([lng, lat]).buffer(buffer_m)


def mask_clouds_s2(image: ee.Image) -> ee.Image:
    """Mask clouds and cirrus in Sentinel-2 SR using the QA60 band."""
    qa = image.select("QA60")
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(
        qa.bitwiseAnd(cirrus_bit_mask).eq(0)
    )
    return image.updateMask(mask).divide(10000)


def compute_ndwi(image: ee.Image) -> ee.Image:
    """NDWI = (Green - NIR) / (Green + NIR)  — McFeeters 1996."""
    return image.normalizedDifference(["B3", "B8"]).rename("NDWI")


def compute_ndti(image: ee.Image) -> ee.Image:
    """
    NDTI (Normalised Difference Turbidity Index) = (Red - Green) / (Red + Green).
    Higher values indicate more turbid / potentially polluted water.
    """
    return image.normalizedDifference(["B4", "B3"]).rename("NDTI")


def compute_fai(image: ee.Image) -> ee.Image:
    """
    Floating Algae Index (FAI) proxy using NIR, Red, SWIR1.
    Positive FAI → algal bloom / surface scum.
    """
    nir   = image.select("B8")
    red   = image.select("B4")
    swir1 = image.select("B11")
    # Linear baseline between Red and SWIR1 at NIR wavelength
    fai = nir.subtract(
        red.add(swir1.subtract(red).multiply((832.8 - 664.6) / (1613.7 - 664.6)))
    ).rename("FAI")
    return fai


def classify_pollution(ndwi_val: float, ndti_val: float, fai_val: float) -> dict:
    """
    Rule-based pollution classification from index values.
    Returns classification label, score (0-100), and contributing factors.
    """
    score = 0
    factors = []

    # NDWI contribution (water presence / clarity)
    if ndwi_val < 0.1:
        score += 40
        factors.append("Low water clarity (NDWI)")
    elif ndwi_val < 0.3:
        score += 20
        factors.append("Moderate water clarity (NDWI)")

    # NDTI contribution (turbidity)
    if ndti_val > 0.1:
        score += 35
        factors.append("High turbidity (NDTI)")
    elif ndti_val > 0.0:
        score += 15
        factors.append("Moderate turbidity (NDTI)")

    # FAI contribution (algal blooms)
    if fai_val > 0.02:
        score += 25
        factors.append("Algal bloom detected (FAI)")
    elif fai_val > 0.005:
        score += 10
        factors.append("Possible algal activity (FAI)")

    if score >= 50:
        label = "Polluted"
        color = "#e74c3c"
    elif score >= 20:
        label = "Moderate"
        color = "#f39c12"
    else:
        label = "Safe"
        color = "#27ae60"

    return {
        "label": label,
        "score": min(score, 100),
        "color": color,
        "factors": factors,
    }


def get_date_range(days_back: int = 60):
    """Return ISO date strings for a rolling window ending today."""
    end   = datetime.utcnow()
    start = end - timedelta(days=days_back)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "AquaWatch API", "status": "running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/analyze")
def analyze(
    lat: float = Query(..., description="Latitude of the point of interest"),
    lng: float = Query(..., description="Longitude of the point of interest"),
    buffer: int = Query(DEFAULT_BUFFER_METERS, description="AOI buffer radius in metres"),
    days_back: int = Query(60, description="Days of imagery to look back"),
):
    """
    Analyse water quality at a given location using the most recent
    cloud-free Sentinel-2 composite within the specified window.

    Returns:
    - Pollution classification (Safe / Moderate / Polluted)
    - NDWI, NDTI, FAI mean values
    - Tile URL for map overlay
    - Bounding box of the AOI
    """
    try:
        aoi = build_aoi(lat, lng, buffer)
        start_date, end_date = get_date_range(days_back)

        collection = (
            ee.ImageCollection(SENTINEL2_COLLECTION)
            .filterBounds(aoi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_COVER_THRESHOLD))
            .map(mask_clouds_s2)
        )

        count = collection.size().getInfo()
        if count == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No cloud-free Sentinel-2 images found for this location in the last {days_back} days. "
                       "Try increasing days_back or choosing a different location.",
            )

        # Use median composite for robustness
        composite = collection.median().clip(aoi)

        ndwi_img = compute_ndwi(composite)
        ndti_img = compute_ndti(composite)
        fai_img  = compute_fai(composite)

        # Reduce to mean values over AOI
        stats = (
            ndwi_img.addBands(ndti_img).addBands(fai_img)
            .reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=aoi,
                scale=20,
                maxPixels=1e9,
            )
            .getInfo()
        )

        ndwi_val = stats.get("NDWI", 0) or 0
        ndti_val = stats.get("NDTI", 0) or 0
        fai_val  = stats.get("FAI",  0) or 0

        classification = classify_pollution(ndwi_val, ndti_val, fai_val)

        # ── Tile URLs for map overlay ──────────────────────────────────────
        # True-colour RGB
        rgb_params = {
            "bands": ["B4", "B3", "B2"],
            "min": 0.0,
            "max": 0.3,
            "gamma": 1.4,
        }
        rgb_map = composite.getMapId(rgb_params)

        # NDWI coloured layer
        ndwi_params = {
            "bands": ["NDWI"],
            "min": -0.5,
            "max": 0.8,
            "palette": ["#8B4513", "#F5DEB3", "#87CEEB", "#1E90FF", "#00008B"],
        }
        ndwi_map = ndwi_img.getMapId(ndwi_params)

        # Pollution overlay (NDTI-based)
        pollution_params = {
            "bands": ["NDTI"],
            "min": -0.2,
            "max": 0.3,
            "palette": ["#27ae60", "#f39c12", "#e74c3c"],
        }
        pollution_map = ndti_img.getMapId(pollution_params)

        # AOI bounding box for map centering
        bounds = aoi.bounds().getInfo()["coordinates"][0]
        bbox = {
            "west":  bounds[0][0],
            "south": bounds[0][1],
            "east":  bounds[2][0],
            "north": bounds[2][1],
        }

        return {
            "location": {"lat": lat, "lng": lng},
            "aoi_buffer_m": buffer,
            "date_range": {"start": start_date, "end": end_date},
            "images_used": count,
            "indices": {
                "ndwi": round(ndwi_val, 4),
                "ndti": round(ndti_val, 4),
                "fai":  round(fai_val,  6),
            },
            "classification": classification,
            "tile_urls": {
                "rgb":       rgb_map["tile_fetcher"].url_format,
                "ndwi":      ndwi_map["tile_fetcher"].url_format,
                "pollution": pollution_map["tile_fetcher"].url_format,
            },
            "bbox": bbox,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /analyze: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/timeseries")
def timeseries(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    buffer: int = Query(DEFAULT_BUFFER_METERS, description="AOI buffer radius in metres"),
    months: int = Query(12, description="Number of months of history to fetch"),
):
    """
    Return monthly NDWI, NDTI, and FAI time-series for the given location.
    Each data point is the median composite for that calendar month.
    """
    try:
        aoi = build_aoi(lat, lng, buffer)
        end_date   = datetime.utcnow()
        start_date = end_date - timedelta(days=months * 30)

        collection = (
            ee.ImageCollection(SENTINEL2_COLLECTION)
            .filterBounds(aoi)
            .filterDate(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_COVER_THRESHOLD))
            .map(mask_clouds_s2)
        )

        count = collection.size().getInfo()
        if count == 0:
            raise HTTPException(
                status_code=404,
                detail="No cloud-free images found for this location and time range.",
            )

        # Build monthly composites
        results = []
        current = start_date.replace(day=1)

        while current <= end_date:
            next_month = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
            month_str  = current.strftime("%Y-%m")

            monthly = (
                collection
                .filterDate(current.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d"))
                .median()
                .clip(aoi)
            )

            # Check if any images exist for this month
            month_count = (
                collection
                .filterDate(current.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d"))
                .size()
                .getInfo()
            )

            if month_count > 0:
                ndwi_img = compute_ndwi(monthly)
                ndti_img = compute_ndti(monthly)
                fai_img  = compute_fai(monthly)

                stats = (
                    ndwi_img.addBands(ndti_img).addBands(fai_img)
                    .reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=aoi,
                        scale=20,
                        maxPixels=1e9,
                    )
                    .getInfo()
                )

                ndwi_val = stats.get("NDWI", None)
                ndti_val = stats.get("NDTI", None)
                fai_val  = stats.get("FAI",  None)

                if ndwi_val is not None:
                    classification = classify_pollution(
                        ndwi_val or 0, ndti_val or 0, fai_val or 0
                    )
                    results.append({
                        "month":          month_str,
                        "ndwi":           round(ndwi_val, 4) if ndwi_val is not None else None,
                        "ndti":           round(ndti_val, 4) if ndti_val is not None else None,
                        "fai":            round(fai_val,  6) if fai_val  is not None else None,
                        "classification": classification["label"],
                        "score":          classification["score"],
                        "images":         month_count,
                    })

            current = next_month

        if not results:
            raise HTTPException(
                status_code=404,
                detail="Could not compute time-series. No valid water pixels found.",
            )

        # Trend: simple linear regression on NDWI
        ndwi_values = [r["ndwi"] for r in results if r["ndwi"] is not None]
        trend = "stable"
        if len(ndwi_values) >= 3:
            x = np.arange(len(ndwi_values), dtype=float)
            y = np.array(ndwi_values, dtype=float)
            slope = np.polyfit(x, y, 1)[0]
            if slope > 0.005:
                trend = "improving"
            elif slope < -0.005:
                trend = "degrading"

        return {
            "location":   {"lat": lat, "lng": lng},
            "months":     months,
            "data_points": len(results),
            "trend":      trend,
            "series":     results,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /timeseries: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/alerts")
def alerts(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    buffer: int = Query(DEFAULT_BUFFER_METERS, description="AOI buffer radius in metres"),
):
    """
    Check current pollution status and return alert level + recommended actions.
    """
    try:
        result = analyze(lat=lat, lng=lng, buffer=buffer)
        classification = result["classification"]
        indices        = result["indices"]

        alert_level = classification["label"]
        recommendations = []

        if alert_level == "Polluted":
            recommendations = [
                "⚠️ Avoid recreational water contact immediately.",
                "🚰 Do not use this water source for drinking or irrigation.",
                "📢 Notify local environmental authorities.",
                "🔬 Collect water samples for laboratory analysis.",
                "📍 Mark area as restricted until further assessment.",
            ]
        elif alert_level == "Moderate":
            recommendations = [
                "⚠️ Exercise caution near this water body.",
                "🔍 Monitor water quality over the next 2–4 weeks.",
                "📊 Increase sampling frequency.",
                "🏊 Limit recreational activities.",
            ]
        else:
            recommendations = [
                "✅ Water quality appears normal.",
                "📅 Continue routine monitoring.",
                "📈 Track seasonal variations.",
            ]

        return {
            "location":        {"lat": lat, "lng": lng},
            "alert_level":     alert_level,
            "alert_color":     classification["color"],
            "pollution_score": classification["score"],
            "factors":         classification["factors"],
            "indices":         indices,
            "recommendations": recommendations,
            "timestamp":       datetime.utcnow().isoformat(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /alerts: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
