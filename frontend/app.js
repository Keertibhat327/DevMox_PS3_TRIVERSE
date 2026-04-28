/**
 * AquaWatch — Frontend Application
 * Satellite water pollution detection dashboard.
 * Deployed on Vercel. Calls AquaWatch FastAPI backend on Render.
 *
 * DEMO MODE: When the backend is unreachable, the app automatically falls back
 * to realistic simulated data so the full UI can be explored locally.
 */

"use strict";

// ─── Configuration ────────────────────────────────────────────────────────────
// Replace with your Render backend URL after deployment.
// During local development, set to http://localhost:8000
const API_BASE_URL =
  window.AQUAWATCH_API_URL ||
  "https://aquawatch-api.onrender.com"; // ← update after Render deploy

// ─── Demo / Mock Data ─────────────────────────────────────────────────────────
// Used automatically when the backend is offline.

function generateDemoAnalysis(lat, lng) {
  // Deterministic-ish variation based on coordinates
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1;
  const ndwi = parseFloat((0.1 + seed * 0.6).toFixed(4));
  const ndti = parseFloat((seed * 0.25 - 0.05).toFixed(4));
  const fai  = parseFloat((seed * 0.03 - 0.005).toFixed(6));

  let label, score, color, factors;
  if (seed > 0.65) {
    label = "Polluted"; score = 55 + Math.round(seed * 30); color = "#e74c3c";
    factors = ["High turbidity (NDTI)", "Algal bloom detected (FAI)", "Low water clarity (NDWI)"];
  } else if (seed > 0.35) {
    label = "Moderate"; score = 20 + Math.round(seed * 25); color = "#f39c12";
    factors = ["Moderate turbidity (NDTI)", "Possible algal activity (FAI)"];
  } else {
    label = "Safe"; score = Math.round(seed * 18); color = "#27ae60";
    factors = [];
  }

  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - 60);
  const fmt = (d) => d.toISOString().slice(0, 10);

  return {
    location: { lat, lng },
    aoi_buffer_m: 5000,
    date_range: { start: fmt(start), end: fmt(today) },
    images_used: 5 + Math.round(seed * 10),
    indices: { ndwi, ndti, fai },
    classification: { label, score, color, factors },
    tile_urls: { rgb: null, ndwi: null, pollution: null },
    bbox: { west: lng - 0.05, south: lat - 0.05, east: lng + 0.05, north: lat + 0.05 },
    _demo: true,
  };
}

function generateDemoTimeseries(lat, lng, months) {
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1;
  const series = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthSeed = (seed + i * 0.07) % 1;
    const ndwi = parseFloat((0.1 + monthSeed * 0.6).toFixed(4));
    const ndti = parseFloat((monthSeed * 0.25 - 0.05).toFixed(4));
    const fai  = parseFloat((monthSeed * 0.03 - 0.005).toFixed(6));
    let classification, score;
    if (monthSeed > 0.65) { classification = "Polluted"; score = 55 + Math.round(monthSeed * 30); }
    else if (monthSeed > 0.35) { classification = "Moderate"; score = 20 + Math.round(monthSeed * 25); }
    else { classification = "Safe"; score = Math.round(monthSeed * 18); }
    series.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      ndwi, ndti, fai, classification, score, images: 3 + Math.round(monthSeed * 8),
    });
  }

  const ndwiVals = series.map((s) => s.ndwi);
  const slope = ndwiVals[ndwiVals.length - 1] - ndwiVals[0];
  const trend = slope > 0.05 ? "improving" : slope < -0.05 ? "degrading" : "stable";

  return { location: { lat, lng }, months, data_points: series.length, trend, series, _demo: true };
}

function generateDemoAlerts(lat, lng) {
  const analysis = generateDemoAnalysis(lat, lng);
  const { label, score, color, factors } = analysis.classification;
  let recommendations;
  if (label === "Polluted") {
    recommendations = [
      "⚠️ Avoid recreational water contact immediately.",
      "🚰 Do not use this water source for drinking or irrigation.",
      "📢 Notify local environmental authorities.",
      "🔬 Collect water samples for laboratory analysis.",
      "📍 Mark area as restricted until further assessment.",
    ];
  } else if (label === "Moderate") {
    recommendations = [
      "⚠️ Exercise caution near this water body.",
      "🔍 Monitor water quality over the next 2–4 weeks.",
      "📊 Increase sampling frequency.",
      "🏊 Limit recreational activities.",
    ];
  } else {
    recommendations = [
      "✅ Water quality appears normal.",
      "📅 Continue routine monitoring.",
      "📈 Track seasonal variations.",
    ];
  }
  return {
    location: { lat, lng },
    alert_level: label,
    alert_color: color,
    pollution_score: score,
    factors,
    indices: analysis.indices,
    recommendations,
    timestamp: new Date().toISOString(),
    _demo: true,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  selectedLat: null,
  selectedLng: null,
  marker: null,
  layers: {
    rgb: null,
    ndwi: null,
    pollution: null,
  },
  lastAnalysis: null,
  lastTimeseries: null,
  lastAlerts: null,
};

// ─── DOM References ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  // Header
  apiStatusDot:  $("api-status-dot"),
  apiStatusText: $("api-status-text"),
  alertBadge:    $("alert-badge"),

  // Map tab
  inputLat:      $("input-lat"),
  inputLng:      $("input-lng"),
  btnAnalyze:    $("btn-analyze"),
  mapLoading:    $("map-loading"),
  resultCard:    $("result-card"),
  resultLabel:   $("result-label"),
  resultScore:   $("result-score"),
  valNdwi:       $("val-ndwi"),
  valNdti:       $("val-ndti"),
  valFai:        $("val-fai"),
  resultFactors: $("result-factors"),
  resultImages:  $("result-images"),
  resultDates:   $("result-dates"),

  // Layer toggles
  layerRgb:       $("layer-rgb"),
  layerNdwi:      $("layer-ndwi"),
  layerPollution: $("layer-pollution"),

  // Analysis tab
  monthsSelect:      $("months-select"),
  btnTimeseries:     $("btn-timeseries"),
  analysisLoading:   $("analysis-loading"),
  analysisContent:   $("analysis-content"),
  analysisEmpty:     $("analysis-empty"),
  tsTrend:           $("ts-trend"),
  tsPoints:          $("ts-points"),
  tsAvgNdwi:         $("ts-avg-ndwi"),
  tsLatestStatus:    $("ts-latest-status"),

  // Alerts tab
  btnCheckAlerts:    $("btn-check-alerts"),
  alertsLoading:     $("alerts-loading"),
  alertBanner:       $("alert-banner"),
  alertsContent:     $("alerts-content"),
  alertsEmpty:       $("alerts-empty"),
  alertStatusDisplay:$("alert-status-display"),
  alertFactorsList:  $("alert-factors-list"),
  alertRecommendations: $("alert-recommendations"),
  alertNdwi:         $("alert-ndwi"),
  alertNdti:         $("alert-ndti"),
  alertFai:          $("alert-fai"),
  alertScoreVal:     $("alert-score-val"),
  alertTimestamp:    $("alert-timestamp"),

  // About
  apiBaseDisplay:    $("api-base-display"),

  // Toast
  toastContainer:    $("toast-container"),
};

// ─── Map Initialisation ───────────────────────────────────────────────────────
const map = L.map("map", {
  center: [20, 0],
  zoom: 3,
  zoomControl: true,
  attributionControl: true,
});

// Base layers — user can switch between them
const baseLayers = {
  "🛰️ Satellite": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      maxZoom: 19,
    }
  ),
  "🗺️ Street Map": L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }
  ),
  "🌊 Ocean": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri",
      maxZoom: 13,
    }
  ),
};

// Start with satellite (most useful for water body detection)
baseLayers["🛰️ Satellite"].addTo(map);

// Layer control (top-right)
L.control.layers(baseLayers, {}, { position: "topright", collapsed: false }).addTo(map);

// ─── Tab Navigation ───────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    // Update buttons
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    // Update panels
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById(`tab-${target}`).classList.add("active");

    // Invalidate map size when switching to map tab
    if (target === "map") {
      setTimeout(() => map.invalidateSize(), 100);
    }
  });
});

// ─── Map Click Handler ────────────────────────────────────────────────────────
map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  setSelectedLocation(lat, lng);
});

function setSelectedLocation(lat, lng) {
  state.selectedLat = lat;
  state.selectedLng = lng;

  dom.inputLat.value = lat.toFixed(5);
  dom.inputLng.value = lng.toFixed(5);

  // Update or create marker — bright yellow with white ring for visibility on satellite
  if (state.marker) {
    state.marker.setLatLng([lat, lng]);
  } else {
    state.marker = L.circleMarker([lat, lng], {
      radius: 10,
      color: "#ffffff",
      fillColor: "#facc15",
      fillOpacity: 0.95,
      weight: 3,
    }).addTo(map);
  }

  state.marker.bindPopup(
    `<div style="font-size:13px;line-height:1.6;min-width:140px">
      <strong style="color:#facc15">📍 Selected Location</strong><br>
      <span style="color:#94a3b8">Lat:</span> ${lat.toFixed(5)}<br>
      <span style="color:#94a3b8">Lng:</span> ${lng.toFixed(5)}<br>
      <span style="font-size:11px;color:#64748b">Click Analyze to inspect</span>
    </div>`
  ).openPopup();
}

// ─── Quick Location Buttons ───────────────────────────────────────────────────
document.querySelectorAll(".quick-loc-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    setSelectedLocation(lat, lng);
    map.setView([lat, lng], 11);
  });
});

// ─── Layer Toggle Handlers ────────────────────────────────────────────────────
// These overlays are always available (no backend needed).
// GEE tile layers (from real analysis) are added on top when available.

const overlayLayers = {
  // OpenSeaMap — nautical/water feature overlay
  waterFeatures: L.tileLayer(
    "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
    {
      attribution: '&copy; <a href="http://www.openseamap.org">OpenSeaMap</a>',
      opacity: 0.7,
      maxZoom: 18,
    }
  ),
  // NDWI simulation: blue-tinted water highlight using Stamen watercolor (water bodies stand out)
  ndwiOverlay: L.tileLayer(
    "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
    {
      attribution: '&copy; <a href="https://stamen.com">Stamen Design</a> / <a href="https://stadiamaps.com">Stadia Maps</a>',
      opacity: 0.45,
      maxZoom: 16,
    }
  ),
  // Pollution heatmap placeholder: semi-transparent red grid (replaced by GEE layer when backend is live)
  pollutionOverlay: null, // built dynamically
};

// Track which overlays are currently on the map
const overlayState = { rgb: true, ndwi: false, pollution: false };

function syncOverlays() {
  // RGB / True Colour — controls the basemap opacity (satellite vs muted)
  const satelliteLayer = baseLayers["🛰️ Satellite"];
  if (satelliteLayer && map.hasLayer(satelliteLayer)) {
    satelliteLayer.setOpacity(overlayState.rgb ? 1.0 : 0.35);
  }

  // NDWI — watercolor overlay
  if (overlayState.ndwi) {
    if (!map.hasLayer(overlayLayers.ndwiOverlay)) map.addLayer(overlayLayers.ndwiOverlay);
  } else {
    if (map.hasLayer(overlayLayers.ndwiOverlay)) map.removeLayer(overlayLayers.ndwiOverlay);
  }

  // Pollution — GEE tile layer if available, else a canvas heatmap overlay
  if (overlayState.pollution) {
    if (state.layers.pollution && !map.hasLayer(state.layers.pollution)) {
      map.addLayer(state.layers.pollution);
    } else if (!state.layers.pollution) {
      // No GEE layer yet — show a demo pollution canvas overlay
      showDemoPollutionOverlay(true);
    }
  } else {
    if (state.layers.pollution && map.hasLayer(state.layers.pollution)) {
      map.removeLayer(state.layers.pollution);
    }
    showDemoPollutionOverlay(false);
  }

  // GEE RGB / NDWI layers (only when backend returned them)
  if (state.layers.rgb) {
    overlayState.rgb ? map.addLayer(state.layers.rgb) : map.removeLayer(state.layers.rgb);
  }
  if (state.layers.ndwi) {
    overlayState.ndwi ? map.addLayer(state.layers.ndwi) : map.removeLayer(state.layers.ndwi);
  }

  updateLayerBadges();
}

// Demo pollution overlay — canvas-based semi-transparent red tint over the AOI
let _demoPollutionRect = null;
function showDemoPollutionOverlay(show) {
  if (_demoPollutionRect) {
    map.removeLayer(_demoPollutionRect);
    _demoPollutionRect = null;
  }
  if (show && state.lastAnalysis) {
    const b = state.lastAnalysis.bbox;
    const cls = state.lastAnalysis.classification.label;
    const colors = { Polluted: "#e74c3c", Moderate: "#f39c12", Safe: "#27ae60" };
    _demoPollutionRect = L.rectangle(
      [[b.south, b.west], [b.north, b.east]],
      {
        color: colors[cls] || "#3b82f6",
        fillColor: colors[cls] || "#3b82f6",
        fillOpacity: 0.22,
        weight: 2,
        opacity: 0.6,
        dashArray: "6 4",
      }
    ).addTo(map);
    _demoPollutionRect.bindTooltip(
      `<strong>${cls} Zone</strong><br>Score: ${state.lastAnalysis.classification.score}/100`,
      { sticky: true }
    );
  }
}

// Visual badge on each toggle showing active state
function updateLayerBadges() {
  const badges = {
    "layer-rgb":       overlayState.rgb,
    "layer-ndwi":      overlayState.ndwi,
    "layer-pollution": overlayState.pollution,
  };
  Object.entries(badges).forEach(([id, active]) => {
    const el = document.getElementById(id);
    if (el) {
      const label = el.closest(".toggle-label");
      if (label) label.classList.toggle("toggle-active", active);
    }
  });
}

dom.layerRgb.addEventListener("change", () => {
  overlayState.rgb = dom.layerRgb.checked;
  syncOverlays();
});

dom.layerNdwi.addEventListener("change", () => {
  overlayState.ndwi = dom.layerNdwi.checked;
  syncOverlays();
});

dom.layerPollution.addEventListener("change", () => {
  overlayState.pollution = dom.layerPollution.checked;
  syncOverlays();
  if (dom.layerPollution.checked && !state.lastAnalysis) {
    showToast("warning", "No Analysis Yet",
      "Run an analysis first to see the pollution overlay.", 3000);
  }
});

function clearSatelliteLayers() {
  Object.values(state.layers).forEach((layer) => {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  });
  state.layers.rgb = null;
  state.layers.ndwi = null;
  state.layers.pollution = null;
  showDemoPollutionOverlay(false);
}

function addTileLayer(url, name) {
  if (!url) return;
  const layer = L.tileLayer(url, {
    opacity: 0.85,
    attribution: "Google Earth Engine / Copernicus Sentinel-2",
    maxZoom: 18,
  });
  state.layers[name] = layer;
  // Respect current toggle state
  const isOn = overlayState[name] ?? true;
  if (isOn) map.addLayer(layer);
}

// ─── Analyze Location ─────────────────────────────────────────────────────────
dom.btnAnalyze.addEventListener("click", runAnalysis);

dom.inputLat.addEventListener("change", () => {
  const lat = parseFloat(dom.inputLat.value);
  const lng = parseFloat(dom.inputLng.value);
  if (!isNaN(lat) && !isNaN(lng)) setSelectedLocation(lat, lng);
});

dom.inputLng.addEventListener("change", () => {
  const lat = parseFloat(dom.inputLat.value);
  const lng = parseFloat(dom.inputLng.value);
  if (!isNaN(lat) && !isNaN(lng)) setSelectedLocation(lat, lng);
});

async function runAnalysis() {
  const lat = parseFloat(dom.inputLat.value);
  const lng = parseFloat(dom.inputLng.value);

  if (isNaN(lat) || isNaN(lng)) {
    showToast("error", "No Location Selected", "Click on the map or enter coordinates first.");
    return;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast("error", "Invalid Coordinates", "Latitude must be −90 to 90, longitude −180 to 180.");
    return;
  }

  dom.btnAnalyze.disabled = true;
  dom.mapLoading.classList.remove("hidden");
  dom.resultCard.classList.add("hidden");
  clearSatelliteLayers();

  try {
    let data;
    let usedDemo = false;

    try {
      const url = `${API_BASE_URL}/analyze?lat=${lat}&lng=${lng}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      data = await response.json();
    } catch (fetchErr) {
      // Backend unreachable — fall back to demo data
      console.warn("Backend unavailable, using demo data:", fetchErr.message);
      data = generateDemoAnalysis(lat, lng);
      usedDemo = true;
    }

    state.lastAnalysis = data;

    // Add satellite tile layers (only if real backend returned URLs)
    if (data.tile_urls?.rgb)       addTileLayer(data.tile_urls.rgb,       "rgb");
    if (data.tile_urls?.ndwi)      addTileLayer(data.tile_urls.ndwi,      "ndwi");
    if (data.tile_urls?.pollution) addTileLayer(data.tile_urls.pollution, "pollution");

    // Fit map to AOI bounding box
    const b = data.bbox;
    map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [40, 40] });

    // Update result card
    renderResultCard(data, usedDemo);

    // Update alert badge
    updateAlertBadge(data.classification.label);

    // Sync overlays — pollution rect / GEE layers respect current toggle state
    syncOverlays();

    const toastType =
      data.classification.label === "Safe"     ? "success" :
      data.classification.label === "Moderate" ? "warning" : "error";

    showToast(
      toastType,
      `${usedDemo ? "Demo — " : ""}${data.classification.label} Water Quality`,
      `Pollution score: ${data.classification.score}/100 · ${data.images_used} images${usedDemo ? " (simulated)" : ""}`
    );

  } catch (err) {
    console.error("Analysis error:", err);
    showToast("error", "Analysis Failed", err.message);
  } finally {
    dom.btnAnalyze.disabled = false;
    dom.mapLoading.classList.add("hidden");
  }
}

function renderResultCard(data, isDemo = false) {
  const cls = data.classification;
  const labelClass = cls.label.toLowerCase();

  dom.resultLabel.textContent = cls.label;
  dom.resultLabel.className = `result-label ${labelClass}`;
  dom.resultScore.textContent = `${cls.score}/100`;
  dom.resultScore.style.color = cls.color;

  dom.valNdwi.textContent = data.indices.ndwi.toFixed(4);
  dom.valNdti.textContent = data.indices.ndti.toFixed(4);
  dom.valFai.textContent  = data.indices.fai.toFixed(6);

  // Factors
  dom.resultFactors.innerHTML = cls.factors.length
    ? cls.factors.map((f) => `<span class="factor-tag">${f}</span>`).join("")
    : '<span style="font-size:0.75rem;color:var(--text-muted)">No significant factors detected</span>';

  dom.resultImages.textContent = `📡 ${data.images_used} Sentinel-2 images${isDemo ? " (demo)" : ""}`;
  dom.resultDates.textContent  = `📅 ${data.date_range.start} → ${data.date_range.end}`;

  if (isDemo) {
    dom.resultImages.textContent += " — connect backend for real data";
  }

  dom.resultCard.classList.remove("hidden");
}

function updateAlertBadge(label) {
  if (label === "Polluted") {
    dom.alertBadge.textContent = "!";
    dom.alertBadge.classList.remove("hidden");
  } else if (label === "Moderate") {
    dom.alertBadge.textContent = "~";
    dom.alertBadge.classList.remove("hidden");
  } else {
    dom.alertBadge.classList.add("hidden");
  }
}

// ─── Time-Series Analysis ─────────────────────────────────────────────────────
dom.btnTimeseries.addEventListener("click", runTimeseries);

async function runTimeseries() {
  const lat = state.selectedLat ?? parseFloat(dom.inputLat.value);
  const lng = state.selectedLng ?? parseFloat(dom.inputLng.value);

  if (isNaN(lat) || isNaN(lng)) {
    showToast("error", "No Location Selected", "Select a location on the Map tab first.");
    return;
  }

  const months = parseInt(dom.monthsSelect.value, 10);

  dom.btnTimeseries.disabled = true;
  dom.analysisLoading.classList.remove("hidden");
  dom.analysisContent.classList.add("hidden");
  dom.analysisEmpty.classList.add("hidden");

  try {
    let data;
    let usedDemo = false;

    try {
      const url = `${API_BASE_URL}/timeseries?lat=${lat}&lng=${lng}&months=${months}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      data = await response.json();
    } catch (fetchErr) {
      console.warn("Backend unavailable, using demo timeseries:", fetchErr.message);
      data = generateDemoTimeseries(lat, lng, months);
      usedDemo = true;
    }

    state.lastTimeseries = data;
    renderTimeseries(data, usedDemo);
    dom.analysisContent.classList.remove("hidden");

    showToast(
      "success",
      `${usedDemo ? "Demo — " : ""}Time-Series Loaded`,
      `${data.data_points} monthly points · Trend: ${data.trend}${usedDemo ? " (simulated)" : ""}`
    );

  } catch (err) {
    console.error("Timeseries error:", err);
    dom.analysisEmpty.classList.remove("hidden");
    showToast("error", "Time-Series Failed", err.message);
  } finally {
    dom.btnTimeseries.disabled = false;
    dom.analysisLoading.classList.add("hidden");
  }
}

function renderTimeseries(data, isDemo = false) {
  const series = data.series;

  // Summary cards
  const ndwiValues = series.filter((d) => d.ndwi !== null).map((d) => d.ndwi);
  const avgNdwi = ndwiValues.length
    ? (ndwiValues.reduce((a, b) => a + b, 0) / ndwiValues.length).toFixed(3)
    : "N/A";

  const trendEmoji = { improving: "📈 Improving", degrading: "📉 Degrading", stable: "➡️ Stable" };
  dom.tsTrend.textContent    = trendEmoji[data.trend] || data.trend;
  dom.tsPoints.textContent   = data.data_points;
  dom.tsAvgNdwi.textContent  = avgNdwi;

  const latest = series[series.length - 1];
  dom.tsLatestStatus.textContent = latest ? latest.classification : "N/A";
  dom.tsLatestStatus.style.color =
    latest?.classification === "Safe"     ? "var(--safe)"     :
    latest?.classification === "Moderate" ? "var(--moderate)" :
    latest?.classification === "Polluted" ? "var(--polluted)" : "var(--text-primary)";

  const months = series.map((d) => d.month);
  const plotlyConfig = { responsive: true, displayModeBar: false };
  const plotlyLayout = (yTitle, yRange) => ({
    paper_bgcolor: "transparent",
    plot_bgcolor:  "transparent",
    font:          { family: "Inter, sans-serif", color: "#94a3b8", size: 11 },
    margin:        { t: 10, r: 10, b: 40, l: 50 },
    xaxis: {
      gridcolor:    "rgba(255,255,255,0.05)",
      linecolor:    "rgba(255,255,255,0.1)",
      tickfont:     { size: 10 },
      tickangle:    -30,
    },
    yaxis: {
      title:        { text: yTitle, font: { size: 10 } },
      gridcolor:    "rgba(255,255,255,0.05)",
      linecolor:    "rgba(255,255,255,0.1)",
      range:        yRange,
    },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor:     "#162040",
      bordercolor: "rgba(255,255,255,0.1)",
      font:        { color: "#e2e8f0", size: 12 },
    },
  });

  // NDWI chart
  Plotly.newPlot(
    "chart-ndwi",
    [{
      x:          months,
      y:          series.map((d) => d.ndwi),
      type:       "scatter",
      mode:       "lines+markers",
      name:       "NDWI",
      line:       { color: "#3b82f6", width: 2.5, shape: "spline" },
      marker:     { color: "#3b82f6", size: 6 },
      fill:       "tozeroy",
      fillcolor:  "rgba(59,130,246,0.1)",
      hovertemplate: "<b>%{x}</b><br>NDWI: %{y:.4f}<extra></extra>",
    }],
    plotlyLayout("NDWI", [-0.5, 1.0]),
    plotlyConfig
  );

  // NDTI chart
  Plotly.newPlot(
    "chart-ndti",
    [{
      x:          months,
      y:          series.map((d) => d.ndti),
      type:       "scatter",
      mode:       "lines+markers",
      name:       "NDTI",
      line:       { color: "#f39c12", width: 2.5, shape: "spline" },
      marker:     { color: "#f39c12", size: 6 },
      fill:       "tozeroy",
      fillcolor:  "rgba(243,156,18,0.1)",
      hovertemplate: "<b>%{x}</b><br>NDTI: %{y:.4f}<extra></extra>",
    }],
    plotlyLayout("NDTI", [-0.3, 0.5]),
    plotlyConfig
  );

  // Pollution score bar chart
  const scoreColors = series.map((d) =>
    d.classification === "Safe"     ? "#27ae60" :
    d.classification === "Moderate" ? "#f39c12" : "#e74c3c"
  );

  Plotly.newPlot(
    "chart-score",
    [{
      x:          months,
      y:          series.map((d) => d.score),
      type:       "bar",
      name:       "Pollution Score",
      marker:     { color: scoreColors, opacity: 0.85 },
      hovertemplate: "<b>%{x}</b><br>Score: %{y}/100<extra></extra>",
    }],
    {
      ...plotlyLayout("Pollution Score (0–100)", [0, 100]),
      shapes: [
        { type: "line", x0: 0, x1: 1, xref: "paper", y0: 20, y1: 20,
          line: { color: "#27ae60", width: 1, dash: "dot" } },
        { type: "line", x0: 0, x1: 1, xref: "paper", y0: 50, y1: 50,
          line: { color: "#e74c3c", width: 1, dash: "dot" } },
      ],
      annotations: [
        { x: 1, xref: "paper", y: 20, text: "Safe threshold", showarrow: false,
          font: { color: "#27ae60", size: 9 }, xanchor: "right", yanchor: "bottom" },
        { x: 1, xref: "paper", y: 50, text: "Polluted threshold", showarrow: false,
          font: { color: "#e74c3c", size: 9 }, xanchor: "right", yanchor: "bottom" },
      ],
    },
    plotlyConfig
  );

  // Classification timeline
  const classMap = { Safe: 1, Moderate: 2, Polluted: 3 };
  const classColors2 = series.map((d) =>
    d.classification === "Safe"     ? "#27ae60" :
    d.classification === "Moderate" ? "#f39c12" : "#e74c3c"
  );

  Plotly.newPlot(
    "chart-classification",
    [{
      x:          months,
      y:          series.map((d) => classMap[d.classification] || 0),
      type:       "scatter",
      mode:       "markers+lines",
      name:       "Classification",
      marker:     { color: classColors2, size: 12, symbol: "circle" },
      line:       { color: "rgba(255,255,255,0.15)", width: 1 },
      hovertemplate: "<b>%{x}</b><br>Status: %{text}<extra></extra>",
      text:       series.map((d) => d.classification),
    }],
    {
      ...plotlyLayout("", [0, 4]),
      yaxis: {
        tickvals:  [1, 2, 3],
        ticktext:  ["Safe", "Moderate", "Polluted"],
        gridcolor: "rgba(255,255,255,0.05)",
        linecolor: "rgba(255,255,255,0.1)",
      },
    },
    plotlyConfig
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
dom.btnCheckAlerts.addEventListener("click", runAlerts);

async function runAlerts() {
  const lat = state.selectedLat ?? parseFloat(dom.inputLat.value);
  const lng = state.selectedLng ?? parseFloat(dom.inputLng.value);

  if (isNaN(lat) || isNaN(lng)) {
    showToast("error", "No Location Selected", "Select a location on the Map tab first.");
    return;
  }

  dom.btnCheckAlerts.disabled = true;
  dom.alertsLoading.classList.remove("hidden");
  dom.alertsContent.classList.add("hidden");
  dom.alertsEmpty.classList.add("hidden");
  dom.alertBanner.classList.add("hidden");

  try {
    let data;
    let usedDemo = false;

    try {
      const url = `${API_BASE_URL}/alerts?lat=${lat}&lng=${lng}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      data = await response.json();
    } catch (fetchErr) {
      console.warn("Backend unavailable, using demo alerts:", fetchErr.message);
      data = generateDemoAlerts(lat, lng);
      usedDemo = true;
    }

    state.lastAlerts = data;
    renderAlerts(data, usedDemo);
    dom.alertsContent.classList.remove("hidden");

  } catch (err) {
    console.error("Alerts error:", err);
    dom.alertsEmpty.classList.remove("hidden");
    showToast("error", "Alert Check Failed", err.message);
  } finally {
    dom.btnCheckAlerts.disabled = false;
    dom.alertsLoading.classList.add("hidden");
  }
}

function renderAlerts(data, isDemo = false) {
  const levelClass = data.alert_level.toLowerCase();

  // Banner
  const bannerIcons = { safe: "✅", moderate: "⚠️", polluted: "🚨" };
  dom.alertBanner.className = `alert-banner ${levelClass}`;
  dom.alertBanner.innerHTML = `
    <span style="font-size:1.5rem">${bannerIcons[levelClass] || "ℹ️"}</span>
    <div>
      <strong>${data.alert_level} Water Quality Detected</strong><br>
      Pollution score: ${data.pollution_score}/100 at (${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)})
    </div>
  `;
  dom.alertBanner.classList.remove("hidden");

  // Status display
  dom.alertStatusDisplay.innerHTML = `
    <span class="alert-status-badge ${levelClass}">${data.alert_level}</span>
    <div style="font-size:2rem;font-weight:700;color:${data.alert_color}">${data.pollution_score}<span style="font-size:1rem;color:var(--text-muted)">/100</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted)">Pollution Score</div>
  `;

  // Factors
  dom.alertFactorsList.innerHTML = data.factors.length
    ? data.factors.map((f) => `<li>${f}</li>`).join("")
    : '<li style="color:var(--text-muted)">No significant pollution factors detected.</li>';

  // Recommendations
  dom.alertRecommendations.innerHTML = data.recommendations
    .map((r) => `<li>${r}</li>`)
    .join("");

  // Index values
  dom.alertNdwi.textContent     = data.indices.ndwi.toFixed(4);
  dom.alertNdti.textContent     = data.indices.ndti.toFixed(4);
  dom.alertFai.textContent      = data.indices.fai.toFixed(6);
  dom.alertScoreVal.textContent = data.pollution_score;

  // Timestamp
  const ts = new Date(data.timestamp + "Z");
  dom.alertTimestamp.textContent = `Last checked: ${ts.toLocaleString()}`;

  // Update badge
  updateAlertBadge(data.alert_level);
}

// ─── API Health Check ─────────────────────────────────────────────────────────
let _apiWasOnline = null; // track previous state to avoid repeat toasts

async function checkApiHealth() {
  dom.apiStatusDot.className    = "status-dot loading";
  dom.apiStatusText.textContent = "Connecting…";

  try {
    const response = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      dom.apiStatusDot.className    = "status-dot online";
      dom.apiStatusText.textContent = "API Online";
      if (_apiWasOnline === false) {
        showToast("success", "Backend Connected", "Live satellite data is now available.");
      }
      _apiWasOnline = true;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch {
    dom.apiStatusDot.className    = "status-dot offline";
    dom.apiStatusText.textContent = "Demo Mode";
    _apiWasOnline = false;
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
const TOAST_ICONS = {
  success: "✅",
  warning: "⚠️",
  error:   "❌",
  info:    "ℹ️",
};

function showToast(type, title, message, duration = 5000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] || "ℹ️"}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss notification" type="button">✕</button>
  `;

  // Dismiss: immediately hide then remove — no animation dependency
  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(110%)";
    toast.style.transition = "opacity 200ms ease, transform 200ms ease";
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  if (duration > 0) setTimeout(dismiss, duration);

  dom.toastContainer.appendChild(toast);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ─── Location Search (Nominatim geocoding) ────────────────────────────────────
const searchInput   = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const searchClear   = document.getElementById("search-clear");
const searchSpinner = document.getElementById("search-spinner");

// Icon mapping by OSM type/class
function getResultIcon(type, cls) {
  const t = (type || "").toLowerCase();
  const c = (cls  || "").toLowerCase();
  if (["river", "stream", "canal", "drain", "waterway"].some(k => t.includes(k) || c.includes(k))) return "🌊";
  if (["lake", "reservoir", "pond", "basin", "lagoon"].some(k => t.includes(k) || c.includes(k))) return "💧";
  if (["sea", "ocean", "bay", "gulf", "strait"].some(k => t.includes(k) || c.includes(k))) return "🌊";
  if (["wetland", "marsh", "swamp"].some(k => t.includes(k) || c.includes(k))) return "🌿";
  if (["city", "town", "village", "municipality"].some(k => t.includes(k) || c.includes(k))) return "🏙️";
  if (["country", "state", "region", "county"].some(k => t.includes(k) || c.includes(k))) return "📍";
  return "📍";
}

// Debounce helper
function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// Highlight matched query text in a string
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapeHtml(text).replace(
    new RegExp(`(${escaped})`, "gi"),
    '<span class="search-highlight">$1</span>'
  );
}

let _searchAbort = null;
let _focusedIndex = -1;
let _currentResults = [];

async function geocodeSearch(query) {
  if (query.length < 2) { hideSearchResults(); return; }

  // Cancel previous in-flight request
  if (_searchAbort) _searchAbort.abort();
  _searchAbort = new AbortController();

  searchSpinner.classList.remove("hidden");
  searchClear.classList.add("hidden");

  try {
    // Nominatim — free, no API key needed
    const url = `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q:              query,
        format:         "json",
        limit:          8,
        addressdetails: 1,
        extratags:      1,
        featuretype:    "settlement,waterway,water,natural",
      });

    const res = await fetch(url, {
      signal: _searchAbort.signal,
      headers: { "Accept-Language": "en" },
    });

    if (!res.ok) throw new Error("Geocoding request failed");
    const data = await res.json();

    renderSearchResults(data, query);
  } catch (err) {
    if (err.name === "AbortError") return; // cancelled — ignore
    renderSearchError();
  } finally {
    searchSpinner.classList.add("hidden");
    if (searchInput.value.trim()) searchClear.classList.remove("hidden");
  }
}

function renderSearchResults(results, query) {
  _currentResults = results;
  _focusedIndex   = -1;
  searchResults.innerHTML = "";

  if (!results.length) {
    searchResults.innerHTML = `
      <li class="search-no-results">
        <i class="fa-solid fa-droplet-slash" aria-hidden="true"></i>
        No results for "<strong>${escapeHtml(query)}</strong>"
      </li>`;
    showSearchResults();
    return;
  }

  results.forEach((r, i) => {
    const icon    = getResultIcon(r.type, r.class);
    const name    = r.name || r.display_name.split(",")[0];
    const detail  = r.display_name.replace(name + ", ", "").slice(0, 80);
    const lat     = parseFloat(r.lat).toFixed(4);
    const lng     = parseFloat(r.lon).toFixed(4);

    const li = document.createElement("li");
    li.className = "search-result-item";
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.dataset.index = i;
    li.innerHTML = `
      <span class="search-result-icon" aria-hidden="true">${icon}</span>
      <span class="search-result-body">
        <span class="search-result-name">${highlightMatch(name, query)}</span>
        <span class="search-result-detail">${escapeHtml(detail)}</span>
      </span>
      <span class="search-result-coords">${lat}, ${lng}</span>
    `;

    li.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent input blur before click fires
      selectSearchResult(r);
    });

    searchResults.appendChild(li);
  });

  showSearchResults();
}

function renderSearchError() {
  searchResults.innerHTML = `
    <li class="search-no-results">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      Search unavailable — check your connection
    </li>`;
  showSearchResults();
}

function selectSearchResult(result) {
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  const name = result.name || result.display_name.split(",")[0];

  // Update input to show selected name
  searchInput.value = name;
  searchClear.classList.remove("hidden");
  hideSearchResults();

  // Set location and fly map there
  setSelectedLocation(lat, lng);

  // Zoom level based on result type
  const zoomMap = {
    country: 5, state: 7, county: 9, city: 11, town: 12,
    village: 13, river: 11, lake: 11, reservoir: 12, waterway: 12,
  };
  const zoom = zoomMap[result.type] || zoomMap[result.class] || 12;

  // Use bounding box if available for a better fit
  if (result.boundingbox) {
    const [s, n, w, e] = result.boundingbox.map(Number);
    map.fitBounds([[s, w], [n, e]], { padding: [40, 40], maxZoom: 14 });
  } else {
    map.setView([lat, lng], zoom);
  }

  showToast("info", `📍 ${name}`, `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)} — click Analyze to inspect`, 3000);
}

function showSearchResults() {
  searchResults.classList.remove("hidden");
  searchInput.setAttribute("aria-expanded", "true");
}

function hideSearchResults() {
  searchResults.classList.add("hidden");
  searchInput.setAttribute("aria-expanded", "false");
  _focusedIndex = -1;
}

function updateFocusedItem(index) {
  const items = searchResults.querySelectorAll(".search-result-item");
  items.forEach((el, i) => {
    el.classList.toggle("focused", i === index);
    el.setAttribute("aria-selected", i === index ? "true" : "false");
  });
  _focusedIndex = index;
}

// ── Event listeners ──
searchInput.addEventListener("input", debounce((e) => {
  const q = e.target.value.trim();
  if (q) {
    searchClear.classList.remove("hidden");
    geocodeSearch(q);
  } else {
    searchClear.classList.add("hidden");
    hideSearchResults();
  }
}, 350));

searchInput.addEventListener("keydown", (e) => {
  const items = searchResults.querySelectorAll(".search-result-item");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    updateFocusedItem(Math.min(_focusedIndex + 1, items.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    updateFocusedItem(Math.max(_focusedIndex - 1, 0));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (_focusedIndex >= 0 && _currentResults[_focusedIndex]) {
      selectSearchResult(_currentResults[_focusedIndex]);
    } else if (_currentResults.length > 0) {
      selectSearchResult(_currentResults[0]);
    }
  } else if (e.key === "Escape") {
    hideSearchResults();
    searchInput.blur();
  }
});

searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim() && _currentResults.length) showSearchResults();
});

searchInput.addEventListener("blur", () => {
  // Small delay so mousedown on result fires first
  setTimeout(hideSearchResults, 150);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.add("hidden");
  hideSearchResults();
  searchInput.focus();
});

// Close results when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".map-search-bar")) hideSearchResults();
});

// ─── About Tab — API Base URL display ────────────────────────────────────────
if (dom.apiBaseDisplay) {
  dom.apiBaseDisplay.textContent = API_BASE_URL;
}

// ─── Initialisation ───────────────────────────────────────────────────────────
(function init() {
  // Check API health on load
  checkApiHealth();

  // Re-check every 60 seconds
  setInterval(checkApiHealth, 60_000);

  // Invalidate map size after fonts/layout settle
  setTimeout(() => map.invalidateSize(), 300);
})();
