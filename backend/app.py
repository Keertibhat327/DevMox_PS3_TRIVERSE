"""
AquaVision Backend — FastAPI + Google Earth Engine
Production water quality monitoring using Sentinel-2 satellite imagery.
"""

import os
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import ee
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aquawatch")

# ─── GEE Authentication ───────────────────────────────────────────────────────
def initialize_gee():
    key_json  = os.getenv("GEE_SERVICE_ACCOUNT_KEY")
    project   = os.getenv("GEE_PROJECT_ID", "")
    if key_json:
        try:
            key_data    = json.loads(key_json)
            credentials = ee.ServiceAccountCredentials(
                email    = key_data["client_email"],
                key_data = json.dumps(key_data),
            )
            ee.Initialize(credentials=credentials, project=project)
            logger.info("GEE initialized via service account.")
        except Exception as exc:
            logger.error("GEE service account init failed: %s", exc)
            raise RuntimeError(f"GEE init failed: {exc}") from exc
    else:
        try:
            ee.Initialize(project=project)
            logger.info("GEE initialized via application-default credentials.")
        except Exception as exc:
            logger.error("GEE default init failed: %s", exc)
            raise RuntimeError(f"GEE init failed: {exc}") from exc

initialize_gee()

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "AquaVision API",
    description = "Satellite water quality monitoring via Sentinel-2 / Google Earth Engine.",
    version     = "2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─── Constants ────────────────────────────────────────────────────────────────
SENTINEL2       = "COPERNICUS/S2_SR_HARMONIZED"
MAX_CLOUD       = 20          # % cloud cover threshold
BUFFER_M        = 5000        # default AOI radius in metres
MIN_PIXELS      = 50          # minimum valid pixels for confidence

# Weighted scoring model weights (must sum to 1.0)
W_NDTI = 0.45   # turbidity — strongest pollution signal
W_FAI  = 0.35   # algal bloom
W_NDWI = 0.20   # water clarity (inverted — lower NDWI = worse)

# Normalisation ranges (empirically derived from Sentinel-2 literature)
NDTI_MIN, NDTI_MAX = -0.20,  0.40
FAI_MIN,  FAI_MAX  = -0.05,  0.05
NDWI_MIN, NDWI_MAX =  0.00,  0.80

# ─── Helpers ─────────────────────────────────────────────────────────────────

def build_aoi(lat: float, lng: float, buffer_m: int = BUFFER_M) -> ee.Geometry:
    return ee.Geometry.Point([lng, lat]).buffer(buffer_m)


def mask_clouds(image: ee.Image) -> ee.Image:
    qa   = image.select("QA60")
    mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
    return image.updateMask(mask).divide(10000)


def compute_ndwi(image: ee.Image) -> ee.Image:
    """NDWI = (Green − NIR) / (Green + NIR)  [McFeeters 1996]"""
    return image.normalizedDifference(["B3", "B8"]).rename("NDWI")


def compute_ndti(image: ee.Image) -> ee.Image:
    """NDTI = (Red − Green) / (Red + Green)  — turbidity proxy"""
    return image.normalizedDifference(["B4", "B3"]).rename("NDTI")


def compute_fai(image: ee.Image) -> ee.Image:
    """FAI = NIR − [Red + (SWIR1−Red) × (λNIR−λRed)/(λSWIR1−λRed)]"""
    nir   = image.select("B8")
    red   = image.select("B4")
    swir1 = image.select("B11")
    fai   = nir.subtract(
        red.add(swir1.subtract(red).multiply((832.8 - 664.6) / (1613.7 - 664.6)))
    ).rename("FAI")
    return fai


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _norm(v: float, lo: float, hi: float) -> float:
    """Normalise v to [0, 1] within [lo, hi]."""
    if hi == lo:
        return 0.0
    return _clamp((v - lo) / (hi - lo), 0.0, 1.0)


def compute_pollution_score(ndwi: float, ndti: float, fai: float) -> dict:
    """
    Weighted, explainable pollution score (0–100).

    Model:
        score = W_NDTI × norm(NDTI)          # turbidity contribution
              + W_FAI  × norm(FAI)           # algal bloom contribution
              + W_NDWI × (1 − norm(NDWI))   # clarity penalty (inverted)

    All three components are normalised to [0,1] before weighting.
    """
    n_ndti = _norm(ndti, NDTI_MIN, NDTI_MAX)
    n_fai  = _norm(fai,  FAI_MIN,  FAI_MAX)
    n_ndwi = _norm(ndwi, NDWI_MIN, NDWI_MAX)

    raw_score = (
        W_NDTI * n_ndti +
        W_FAI  * n_fai  +
        W_NDWI * (1.0 - n_ndwi)
    )
    score = round(_clamp(raw_score * 100, 0, 100), 1)

    # Classification
    if score >= 60:
        label, color = "Polluted", "#e74c3c"
    elif score >= 30:
        label, color = "Moderate", "#f39c12"
    else:
        label, color = "Safe",     "#27ae60"

    # Explainability — which factor contributed most
    contributions = {
        "Turbidity (NDTI)":    round(W_NDTI * n_ndti * 100, 1),
        "Algal Activity (FAI)": round(W_FAI  * n_fai  * 100, 1),
        "Water Clarity (NDWI)": round(W_NDWI * (1 - n_ndwi) * 100, 1),
    }
    dominant = max(contributions, key=contributions.get)

    factors = []
    if n_ndti > 0.5:
        factors.append("High turbidity detected (NDTI)")
    elif n_ndti > 0.25:
        factors.append("Moderate turbidity (NDTI)")
    if n_fai > 0.6:
        factors.append("Algal bloom detected (FAI)")
    elif n_fai > 0.3:
        factors.append("Possible algal activity (FAI)")
    if n_ndwi < 0.3:
        factors.append("Low water clarity (NDWI)")

    return {
        "label":         label,
        "score":         score,
        "color":         color,
        "factors":       factors,
        "contributions": contributions,
        "dominant":      dominant,
        "weights":       {"ndti": W_NDTI, "fai": W_FAI, "ndwi": W_NDWI},
    }


def compute_confidence(images_used: int, cloud_pct: float, pixel_count: int) -> dict:
    """
    Confidence level based on data quality signals.

    High   → ≥5 images, <10% cloud, ≥500 valid pixels
    Medium → 2–4 images or 10–30% cloud or 50–499 pixels
    Low    → <2 images or >30% cloud or <50 pixels
    """
    score = 100

    # Image count penalty
    if images_used < 2:
        score -= 40
    elif images_used < 5:
        score -= 20

    # Cloud cover penalty
    if cloud_pct > 30:
        score -= 30
    elif cloud_pct > 10:
        score -= 15

    # Pixel count penalty
    if pixel_count < MIN_PIXELS:
        score -= 30
    elif pixel_count < 200:
        score -= 15

    score = max(0, score)

    if score >= 70:
        level, reason = "High",   "Clear signal — sufficient imagery and low cloud cover"
    elif score >= 40:
        level, reason = "Medium", "Moderate variation — limited imagery or partial cloud cover"
    else:
        level, reason = "Low",    "Noisy data — few images or high cloud cover"

    return {"level": level, "score": score, "reason": reason}


def infer_water_appearance(ndwi: float, ndti: float, fai: float) -> dict:
    """
    Infer water appearance based on spectral reflectance patterns.
    
    This is NOT direct visual observation but spectral inference:
    - Greenish → High FAI (algal pigments absorb red, reflect green)
    - Brownish → High NDTI (suspended sediment scatters all wavelengths)
    - Clear → High NDWI, low NDTI/FAI (clean water absorbs NIR)
    """
    # Normalize indices for decision logic
    n_ndti = _norm(ndti, NDTI_MIN, NDTI_MAX)
    n_fai = _norm(fai, FAI_MIN, FAI_MAX)
    n_ndwi = _norm(ndwi, NDWI_MIN, NDWI_MAX)
    
    # Decision tree based on spectral signatures
    if n_fai > 0.6:  # Strong algal signal
        appearance = "Greenish"
        description = "High algal pigment concentration detected via spectral analysis"
        indicator = "Possible algal bloom or eutrophication"
    elif n_ndti > 0.6:  # Strong turbidity signal
        appearance = "Brownish/Murky"
        description = "High suspended sediment detected via spectral reflectance"
        indicator = "Likely sediment load from erosion or runoff"
    elif n_ndti > 0.4 and n_fai > 0.3:  # Mixed signal
        appearance = "Greenish-Brown"
        description = "Mixed signal: both algae and sediment present"
        indicator = "Combined organic and inorganic pollution"
    elif n_ndwi > 0.6 and n_ndti < 0.2 and n_fai < 0.2:  # Clean water
        appearance = "Clear/Blue"
        description = "Low turbidity and algae, high water clarity"
        indicator = "Healthy water body characteristics"
    elif n_ndwi < 0.3:  # Very low water signal
        appearance = "Opaque/Turbid"
        description = "Very low water clarity, high light scattering"
        indicator = "Severe turbidity or contamination"
    else:  # Moderate conditions
        appearance = "Slightly Turbid"
        description = "Moderate clarity with some suspended matter"
        indicator = "Normal seasonal variation or minor pollution"
    
    return {
        "appearance": appearance,
        "description": description,
        "indicator": indicator,
        "note": "Based on spectral reflectance analysis, not direct visual observation"
    }


def infer_pollution_sources(ndwi: float, ndti: float, fai: float, score: float) -> dict:
    """
    Contextual inference of POSSIBLE pollution sources based on spectral signatures.
    
    CRITICAL: Uses probabilistic language only. Does NOT name entities or assign blame.
    This is environmental intelligence, not accusation.
    """
    sources = []
    confidence_level = "Low"
    
    # Normalize for decision logic
    n_ndti = _norm(ndti, NDTI_MIN, NDTI_MAX)
    n_fai = _norm(fai, FAI_MIN, FAI_MAX)
    n_ndwi = _norm(ndwi, NDWI_MIN, NDWI_MAX)
    
    # High turbidity patterns
    if n_ndti > 0.5:
        if n_ndti > 0.7:
            sources.append({
                "source": "Agricultural runoff",
                "likelihood": "High",
                "reasoning": "Elevated turbidity consistent with soil erosion and sediment transport from agricultural areas",
                "indicators": ["High NDTI", "Suspended sediment signature"]
            })
            sources.append({
                "source": "Construction site runoff",
                "likelihood": "Moderate",
                "reasoning": "Turbidity pattern matches disturbed soil and exposed earth typical of construction activities",
                "indicators": ["Sediment load", "Erosion signature"]
            })
            confidence_level = "Moderate"
        else:
            sources.append({
                "source": "Natural erosion or seasonal runoff",
                "likelihood": "Moderate",
                "reasoning": "Moderate turbidity may indicate natural sediment transport during rainfall events",
                "indicators": ["Moderate NDTI", "Seasonal variation"]
            })
    
    # High algal activity patterns
    if n_fai > 0.5:
        if n_fai > 0.7:
            sources.append({
                "source": "Nutrient pollution (eutrophication)",
                "likelihood": "High",
                "reasoning": "Strong algal bloom signature indicates excess nutrients, typically from fertilizers or sewage",
                "indicators": ["High FAI", "Algal pigment signature", "Possible nitrogen/phosphorus enrichment"]
            })
            sources.append({
                "source": "Urban wastewater discharge",
                "likelihood": "Moderate",
                "reasoning": "Algal growth pattern consistent with nutrient-rich wastewater inputs",
                "indicators": ["Eutrophication", "Organic loading"]
            })
            confidence_level = "Moderate" if confidence_level != "High" else "High"
        else:
            sources.append({
                "source": "Agricultural fertilizer runoff",
                "likelihood": "Moderate",
                "reasoning": "Moderate algal activity suggests nutrient enrichment from agricultural sources",
                "indicators": ["Moderate FAI", "Nutrient signature"]
            })
    
    # Combined high turbidity + algae
    if n_ndti > 0.4 and n_fai > 0.4:
        sources.append({
            "source": "Mixed urban and agricultural pollution",
            "likelihood": "Moderate",
            "reasoning": "Combined sediment and nutrient signals suggest multiple pollution pathways",
            "indicators": ["High NDTI + FAI", "Complex pollution signature"]
        })
        confidence_level = "Moderate"
    
    # Low water clarity patterns
    if n_ndwi < 0.3:
        if score > 60:  # Severe pollution
            sources.append({
                "source": "Industrial discharge or severe contamination",
                "likelihood": "Possible",
                "reasoning": "Very low water clarity combined with high pollution score may indicate industrial effluent or severe contamination event",
                "indicators": ["Very low NDWI", "High pollution score", "Severe opacity"]
            })
            confidence_level = "High"
    
    # If no strong signals, provide general assessment
    if not sources:
        if score > 30:
            sources.append({
                "source": "Background pollution or natural variation",
                "likelihood": "Likely",
                "reasoning": "Moderate pollution levels without strong specific signatures suggest diffuse sources or natural processes",
                "indicators": ["Mixed signals", "No dominant pattern"]
            })
        else:
            sources.append({
                "source": "No significant pollution detected",
                "likelihood": "High",
                "reasoning": "All spectral indicators within normal ranges for healthy water bodies",
                "indicators": ["Normal NDWI/NDTI/FAI", "Clean water signature"]
            })
            confidence_level = "High"
    
    return {
        "possible_sources": sources,
        "confidence": confidence_level,
        "disclaimer": "These are probabilistic inferences based on spectral patterns, not confirmed identifications. Ground validation and water sampling required for definitive source attribution.",
        "methodology": "Analysis combines spectral indices with established environmental science literature on pollution signatures"
    }


def date_range(days_back: int = 60):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(days=days_back)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "AquaVision API", "version": "2.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": utc_now_iso()}


@app.get("/analyze")
def analyze(
    lat:       float = Query(..., description="Latitude"),
    lng:       float = Query(..., description="Longitude"),
    buffer:    int   = Query(BUFFER_M, description="AOI radius in metres"),
    days_back: int   = Query(60,       description="Days of imagery to search"),
):
    """
    Analyse water quality at a point using Sentinel-2 median composite.
    Returns weighted pollution score, confidence level, and GEE tile URLs.
    """
    try:
        aoi        = build_aoi(lat, lng, buffer)
        start, end = date_range(days_back)

        col = (
            ee.ImageCollection(SENTINEL2)
            .filterBounds(aoi)
            .filterDate(start, end)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD))
            .map(mask_clouds)
        )

        n_images = col.size().getInfo()
        if n_images == 0:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No cloud-free Sentinel-2 images found for this location "
                    f"in the last {days_back} days. Try increasing days_back."
                ),
            )

        composite = col.median().clip(aoi)

        ndwi_img = compute_ndwi(composite)
        ndti_img = compute_ndti(composite)
        fai_img  = compute_fai(composite)

        # Mean cloud cover of the collection
        mean_cloud = col.aggregate_mean("CLOUDY_PIXEL_PERCENTAGE").getInfo() or 0

        # Reduce to mean values + pixel count
        stats = (
            ndwi_img.addBands(ndti_img).addBands(fai_img)
            .addBands(composite.select("B3").rename("pixel_count"))
            .reduceRegion(
                reducer   = ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=False),
                geometry  = aoi,
                scale     = 20,
                maxPixels = 1e9,
            )
            .getInfo()
        )

        ndwi_val  = stats.get("NDWI_mean",        stats.get("NDWI",  0)) or 0
        ndti_val  = stats.get("NDTI_mean",        stats.get("NDTI",  0)) or 0
        fai_val   = stats.get("FAI_mean",         stats.get("FAI",   0)) or 0
        pix_count = int(stats.get("pixel_count_count", stats.get("B3_count", 200)) or 200)

        classification = compute_pollution_score(ndwi_val, ndti_val, fai_val)
        confidence     = compute_confidence(n_images, mean_cloud, pix_count)
        water_appearance = infer_water_appearance(ndwi_val, ndti_val, fai_val)
        pollution_sources = infer_pollution_sources(ndwi_val, ndti_val, fai_val, classification["score"])

        # Data reliability metrics
        data_reliability = {
            "cloud_cover_pct": round(mean_cloud, 1),
            "images_used": n_images,
            "valid_pixels": pix_count,
            "confidence_level": confidence["level"],
            "confidence_score": confidence["score"],
            "reliability_note": (
                f"Analysis based on {n_images} Sentinel-2 images with {round(mean_cloud,1)}% average cloud cover. "
                f"Confidence: {confidence['level']} ({confidence['score']}/100)."
            )
        }

        # GEE tile URLs
        rgb_map = composite.getMapId({
            "bands": ["B4", "B3", "B2"], "min": 0.0, "max": 0.3, "gamma": 1.4,
        })
        ndwi_map = ndwi_img.getMapId({
            "bands": ["NDWI"], "min": -0.5, "max": 0.8,
            "palette": ["#8B4513", "#F5DEB3", "#87CEEB", "#1E90FF", "#00008B"],
        })
        pollution_map = ndti_img.getMapId({
            "bands": ["NDTI"], "min": -0.2, "max": 0.3,
            "palette": ["#27ae60", "#f39c12", "#e74c3c"],
        })

        bounds = aoi.bounds().getInfo()["coordinates"][0]
        bbox   = {
            "west":  bounds[0][0], "south": bounds[0][1],
            "east":  bounds[2][0], "north": bounds[2][1],
        }

        return {
            "location":       {"lat": round(lat, 5), "lng": round(lng, 5)},
            "aoi_buffer_m":   buffer,
            "date_range":     {"start": start, "end": end},
            "images_used":    n_images,
            "cloud_cover_pct": round(mean_cloud, 1),
            "indices": {
                "ndwi": round(ndwi_val, 4),
                "ndti": round(ndti_val, 4),
                "fai":  round(fai_val,  6),
            },
            "classification": classification,
            "confidence":     confidence,
            "water_appearance": water_appearance,
            "pollution_sources": pollution_sources,
            "data_reliability": data_reliability,
            "tile_urls": {
                "rgb":       rgb_map["tile_fetcher"].url_format,
                "ndwi":      ndwi_map["tile_fetcher"].url_format,
                "pollution": pollution_map["tile_fetcher"].url_format,
            },
            "bbox":      bbox,
            "timestamp": utc_now_iso(),
            "disclaimer": "This system provides indicative analysis based on satellite-derived environmental indicators. It does not identify or confirm specific pollutants or responsible entities. Ground validation is recommended for regulatory or health decisions."
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /analyze: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/timeseries")
def timeseries(
    lat:    float = Query(..., description="Latitude"),
    lng:    float = Query(..., description="Longitude"),
    buffer: int   = Query(BUFFER_M, description="AOI radius in metres"),
    months: int   = Query(12,       description="Months of history"),
):
    """Monthly NDWI / NDTI / FAI time-series with trend detection."""
    try:
        aoi        = build_aoi(lat, lng, buffer)
        end_dt     = datetime.now(timezone.utc)
        start_dt   = end_dt - timedelta(days=months * 30)

        col = (
            ee.ImageCollection(SENTINEL2)
            .filterBounds(aoi)
            .filterDate(start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d"))
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD))
            .map(mask_clouds)
        )

        if col.size().getInfo() == 0:
            raise HTTPException(status_code=404, detail="No cloud-free images found.")

        results = []
        current = start_dt.replace(day=1)

        while current <= end_dt:
            nxt = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
            m_col = col.filterDate(
                current.strftime("%Y-%m-%d"), nxt.strftime("%Y-%m-%d")
            )
            m_count = m_col.size().getInfo()

            if m_count > 0:
                comp  = m_col.median().clip(aoi)
                stats = (
                    compute_ndwi(comp).addBands(compute_ndti(comp)).addBands(compute_fai(comp))
                    .reduceRegion(
                        reducer=ee.Reducer.mean(), geometry=aoi, scale=20, maxPixels=1e9
                    )
                    .getInfo()
                )
                ndwi_v = stats.get("NDWI") or 0
                ndti_v = stats.get("NDTI") or 0
                fai_v  = stats.get("FAI")  or 0

                cls = compute_pollution_score(ndwi_v, ndti_v, fai_v)
                results.append({
                    "month":          current.strftime("%Y-%m"),
                    "ndwi":           round(ndwi_v, 4),
                    "ndti":           round(ndti_v, 4),
                    "fai":            round(fai_v,  6),
                    "score":          cls["score"],
                    "classification": cls["label"],
                    "images":         m_count,
                })
            current = nxt

        if not results:
            raise HTTPException(status_code=404, detail="No valid data points found.")

        # Linear trend on pollution score
        scores = [r["score"] for r in results]
        trend  = "stable"
        if len(scores) >= 3:
            x     = np.arange(len(scores), dtype=float)
            slope = np.polyfit(x, scores, 1)[0]
            if slope > 1.5:
                trend = "degrading"
            elif slope < -1.5:
                trend = "improving"

        return {
            "location":    {"lat": round(lat, 5), "lng": round(lng, 5)},
            "months":      months,
            "data_points": len(results),
            "trend":       trend,
            "series":      results,
            "timestamp":   utc_now_iso(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /timeseries: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/compare")
def compare(
    lat1:      float = Query(..., description="Latitude of Location A"),
    lng1:      float = Query(..., description="Longitude of Location A"),
    lat2:      float = Query(..., description="Latitude of Location B"),
    lng2:      float = Query(..., description="Longitude of Location B"),
    buffer:    int   = Query(BUFFER_M, description="AOI radius in metres"),
    days_back: int   = Query(60,       description="Days of imagery to search"),
):
    """
    Side-by-side water quality comparison of two locations.
    Returns metrics, scores, confidence, and rule-based insights.
    """
    try:
        def _analyse_point(lat, lng):
            aoi        = build_aoi(lat, lng, buffer)
            start, end = date_range(days_back)
            col = (
                ee.ImageCollection(SENTINEL2)
                .filterBounds(aoi)
                .filterDate(start, end)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", MAX_CLOUD))
                .map(mask_clouds)
            )
            n = col.size().getInfo()
            if n == 0:
                return None, "No cloud-free images found for this location."

            comp       = col.median().clip(aoi)
            mean_cloud = col.aggregate_mean("CLOUDY_PIXEL_PERCENTAGE").getInfo() or 0
            stats = (
                compute_ndwi(comp).addBands(compute_ndti(comp)).addBands(compute_fai(comp))
                .reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=aoi, scale=20, maxPixels=1e9
                )
                .getInfo()
            )
            ndwi_v = stats.get("NDWI") or 0
            ndti_v = stats.get("NDTI") or 0
            fai_v  = stats.get("FAI")  or 0
            cls    = compute_pollution_score(ndwi_v, ndti_v, fai_v)
            conf   = compute_confidence(n, mean_cloud, 200)
            return {
                "lat": round(lat, 5), "lng": round(lng, 5),
                "images_used": n,
                "cloud_cover_pct": round(mean_cloud, 1),
                "indices": {
                    "ndwi": round(ndwi_v, 4),
                    "ndti": round(ndti_v, 4),
                    "fai":  round(fai_v,  6),
                },
                "classification": cls,
                "confidence":     conf,
            }, None

        result_a, err_a = _analyse_point(lat1, lng1)
        result_b, err_b = _analyse_point(lat2, lng2)

        if err_a:
            raise HTTPException(status_code=404, detail=f"Location A: {err_a}")
        if err_b:
            raise HTTPException(status_code=404, detail=f"Location B: {err_b}")

        # Determine cleaner location
        score_a = result_a["classification"]["score"]
        score_b = result_b["classification"]["score"]
        winner  = "A" if score_a <= score_b else "B"

        # Rule-based insights
        insights = []
        diff = abs(score_a - score_b)

        if diff < 5:
            insights.append("Both locations show similar water quality levels.")
        elif winner == "A":
            insights.append(f"Location A has significantly cleaner water (score difference: {diff:.0f} points).")
        else:
            insights.append(f"Location B has significantly cleaner water (score difference: {diff:.0f} points).")

        ndti_a = result_a["indices"]["ndti"]
        ndti_b = result_b["indices"]["ndti"]
        if ndti_b > ndti_a + 0.05:
            insights.append("Location B shows higher turbidity — possible suspended sediment or runoff.")
        elif ndti_a > ndti_b + 0.05:
            insights.append("Location A shows higher turbidity — possible suspended sediment or runoff.")

        fai_a = result_a["indices"]["fai"]
        fai_b = result_b["indices"]["fai"]
        if fai_a > 0.01:
            insights.append("Location A shows signs of algal activity — monitor for bloom development.")
        if fai_b > 0.01:
            insights.append("Location B shows signs of algal activity — monitor for bloom development.")

        ndwi_a = result_a["indices"]["ndwi"]
        ndwi_b = result_b["indices"]["ndwi"]
        if ndwi_a < 0.2:
            insights.append("Location A has low water clarity — may indicate high sediment load.")
        if ndwi_b < 0.2:
            insights.append("Location B has low water clarity — may indicate high sediment load.")

        loser = "B" if winner == "A" else "A"
        insights.append(
            f"Location {loser} requires more urgent monitoring and potential ground validation."
        )

        return {
            "location_a":  result_a,
            "location_b":  result_b,
            "winner":      winner,
            "score_diff":  round(diff, 1),
            "insights":    insights,
            "date_range":  {"start": date_range(days_back)[0], "end": date_range(days_back)[1]},
            "timestamp":   utc_now_iso(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /compare: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/alerts")
def alerts(
    lat:    float = Query(..., description="Latitude"),
    lng:    float = Query(..., description="Longitude"),
    buffer: int   = Query(BUFFER_M, description="AOI radius in metres"),
):
    """Current alert level, severity, and recommended actions."""
    try:
        result = analyze(lat=lat, lng=lng, buffer=buffer)
        cls    = result["classification"]
        conf   = result["confidence"]
        idx    = result["indices"]
        level  = cls["label"]

        # Severity (combines pollution + confidence)
        if level == "Polluted" and conf["level"] == "High":
            severity = "Critical"
        elif level == "Polluted":
            severity = "High"
        elif level == "Moderate" and conf["level"] == "High":
            severity = "Medium"
        elif level == "Moderate":
            severity = "Low-Medium"
        else:
            severity = "None"

        # Triggered alerts
        triggered = []
        if idx["ndti"] > 0.1:
            triggered.append({
                "type":      "High Turbidity",
                "index":     "NDTI",
                "value":     round(idx["ndti"], 4),
                "threshold": 0.1,
                "severity":  "High",
                "detail":    f"NDTI of {round(idx['ndti'],4)} indicates significant suspended sediment or turbid water. Normal clean water is typically below 0.05.",
            })
        elif idx["ndti"] > 0.0:
            triggered.append({
                "type":      "Moderate Turbidity",
                "index":     "NDTI",
                "value":     round(idx["ndti"], 4),
                "threshold": 0.0,
                "severity":  "Medium",
                "detail":    f"NDTI of {round(idx['ndti'],4)} suggests moderate turbidity. Monitor for worsening trend.",
            })
        if idx["fai"] > 0.02:
            triggered.append({
                "type":      "Algal Bloom",
                "index":     "FAI",
                "value":     round(idx["fai"], 6),
                "threshold": 0.02,
                "severity":  "High",
                "detail":    f"FAI of {round(idx['fai'],6)} indicates floating algae or surface scum. Values above 0.02 suggest active bloom conditions.",
            })
        elif idx["fai"] > 0.005:
            triggered.append({
                "type":      "Possible Algal Activity",
                "index":     "FAI",
                "value":     round(idx["fai"], 6),
                "threshold": 0.005,
                "severity":  "Low",
                "detail":    f"FAI of {round(idx['fai'],6)} suggests early-stage algal activity. Watch for bloom development.",
            })
        if idx["ndwi"] < 0.1:
            triggered.append({
                "type":      "Very Low Water Clarity",
                "index":     "NDWI",
                "value":     round(idx["ndwi"], 4),
                "threshold": 0.1,
                "severity":  "Medium",
                "detail":    f"NDWI of {round(idx['ndwi'],4)} indicates very low water clarity. Healthy water bodies typically show NDWI above 0.3.",
            })
        elif idx["ndwi"] < 0.2:
            triggered.append({
                "type":      "Reduced Water Clarity",
                "index":     "NDWI",
                "value":     round(idx["ndwi"], 4),
                "threshold": 0.2,
                "severity":  "Low",
                "detail":    f"NDWI of {round(idx['ndwi'],4)} suggests reduced water clarity, possibly due to sediment or organic matter.",
            })

        # Data-driven recommendations based on actual index values
        recommendations = []
        if level == "Polluted":
            recommendations.append("⛔ Avoid all recreational water contact immediately.")
            recommendations.append("🚰 Do not use this water for drinking, cooking, or irrigation.")
            if idx["ndti"] > 0.1:
                recommendations.append(f"🌊 High turbidity (NDTI={round(idx['ndti'],3)}) — likely caused by runoff, erosion, or industrial discharge. Investigate upstream sources.")
            if idx["fai"] > 0.02:
                recommendations.append(f"🌿 Algal bloom detected (FAI={round(idx['fai'],5)}) — avoid skin contact; blooms can produce toxins harmful to humans and animals.")
            if idx["ndwi"] < 0.1:
                recommendations.append(f"💧 Very low water clarity (NDWI={round(idx['ndwi'],3)}) — high suspended solids detected. Water treatment required before any use.")
            recommendations.append("📢 Notify local environmental protection authority.")
            recommendations.append("🔬 Collect water samples for laboratory chemical analysis.")
            recommendations.append("📍 Mark area as restricted until ground validation confirms safety.")
        elif level == "Moderate":
            recommendations.append("⚠️ Exercise caution near this water body.")
            if idx["ndti"] > 0.0:
                recommendations.append(f"🌊 Moderate turbidity detected (NDTI={round(idx['ndti'],3)}) — monitor for worsening trend over next 2–4 weeks.")
            if idx["fai"] > 0.005:
                recommendations.append(f"🌿 Early algal activity (FAI={round(idx['fai'],5)}) — watch for bloom development, especially in warm weather.")
            recommendations.append("📊 Increase monitoring frequency to bi-weekly.")
            recommendations.append("🏊 Limit recreational activities, especially for children and vulnerable groups.")
            recommendations.append("📋 Document current conditions for trend comparison.")
        else:
            recommendations.append(f"✅ Water quality appears normal (Score: {cls['score']}/100).")
            recommendations.append(f"💧 NDWI of {round(idx['ndwi'],3)} indicates good water presence and clarity.")
            recommendations.append("📅 Continue routine monthly monitoring.")
            recommendations.append("📈 Track seasonal variations — quality may change during monsoon or dry seasons.")
            recommendations.append("🗂️ Archive this baseline reading for future comparison.")

        return {
            "location":        {"lat": round(lat, 5), "lng": round(lng, 5)},
            "alert_level":     level,
            "severity":        severity,
            "alert_color":     cls["color"],
            "pollution_score": cls["score"],
            "factors":         cls["factors"],
            "indices":         idx,
            "confidence":      conf,
            "triggered_alerts": triggered,
            "recommendations": recommendations,
            "timestamp":       utc_now_iso(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /alerts: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/watershed")
def watershed(
    lat:    float = Query(..., description="Latitude"),
    lng:    float = Query(..., description="Longitude"),
    buffer: int   = Query(15000, description="Upstream area radius in metres"),
):
    """
    Land use composition in the upstream catchment area using ESA WorldCover 2021.
    Returns land cover percentages, pollution potential score, and a visualisation tile.
    """
    try:
        aoi = build_aoi(lat, lng, buffer)

        # ESA WorldCover 2021 — 10 m global land cover
        worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().clip(aoi)

        class_areas = worldcover.reduceRegion(
            reducer   = ee.Reducer.frequencyHistogram(),
            geometry  = aoi,
            scale     = 100,
            maxPixels = 1e9,
        ).getInfo()

        class_names = {
            10: "Tree Cover", 20: "Shrubland",  30: "Grassland",
            40: "Cropland",   50: "Built-up",   60: "Bare/Sparse",
            70: "Snow/Ice",   80: "Water Bodies", 90: "Wetlands",
            95: "Mangroves", 100: "Moss/Lichen",
        }

        histogram = class_areas.get("Map", {}) or {}
        total     = sum(histogram.values()) if histogram else 1

        land_use = {}
        for code_str, count in histogram.items():
            code = int(float(code_str))
            name = class_names.get(code, f"Class {code}")
            land_use[name] = round((count / total) * 100, 1)

        land_use = dict(sorted(land_use.items(), key=lambda x: x[1], reverse=True))

        cropland_pct = land_use.get("Cropland",   0)
        builtup_pct  = land_use.get("Built-up",   0)
        tree_pct     = land_use.get("Tree Cover", 0)

        pollution_potential = min(100,
            cropland_pct * 0.6 + builtup_pct * 0.9 + max(0, 20 - tree_pct) * 0.5
        )
        risk_level = "High" if pollution_potential > 50 else "Moderate" if pollution_potential > 25 else "Low"

        risk_factors = []
        if cropland_pct > 30:
            risk_factors.append(
                f"High agricultural land ({cropland_pct:.0f}%) — fertilizer and pesticide runoff risk"
            )
        if builtup_pct > 20:
            risk_factors.append(
                f"Significant urban area ({builtup_pct:.0f}%) — stormwater and sewage runoff risk"
            )
        if tree_pct < 10:
            risk_factors.append("Low forest cover — reduced natural filtration capacity")
        if not risk_factors:
            risk_factors.append("Predominantly natural vegetation — good natural filtration capacity")

        lc_map = worldcover.getMapId({
            "min": 10, "max": 100,
            "palette": [
                "006400", "FFBB22", "FFFF4C", "F096FF", "FA0000",
                "B4B4B4", "F0F0F0", "0064C8", "0096A0", "00CF75", "FAE6A0",
            ],
        })

        return {
            "location":            {"lat": round(lat, 5), "lng": round(lng, 5)},
            "buffer_m":            buffer,
            "land_use":            land_use,
            "pollution_potential": round(pollution_potential, 1),
            "risk_level":          risk_level,
            "risk_factors":        risk_factors,
            "tile_url":            lc_map["tile_fetcher"].url_format,
            "source":              "ESA WorldCover 2021 (10 m resolution)",
            "timestamp":           utc_now_iso(),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in /watershed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
