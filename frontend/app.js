/**
 * AquaVision v2 — Frontend Application
 * Full-featured satellite water quality monitoring dashboard.
 */
"use strict";

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE_URL = window.AQUAWATCH_API_URL || "http://localhost:8000";

// ─── Demo Data ────────────────────────────────────────────────────────────────
function _seed(lat, lng) {
  return Math.abs(Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1;
}

function demoAnalysis(lat, lng) {
  const s = _seed(lat, lng);
  const ndwi = parseFloat((0.1 + s * 0.6).toFixed(4));
  const ndti = parseFloat((s * 0.25 - 0.05).toFixed(4));
  const fai  = parseFloat((s * 0.03 - 0.005).toFixed(6));
  const score = parseFloat(Math.min(100, (0.45 * Math.max(0,(ndti+0.2)/0.6) + 0.35 * Math.max(0,(fai+0.05)/0.1) + 0.20 * (1 - Math.max(0,Math.min(1,ndwi/0.8)))) * 100).toFixed(1));
  const label = score >= 60 ? "Polluted" : score >= 30 ? "Moderate" : "Safe";
  const color = score >= 60 ? "#e74c3c" : score >= 30 ? "#f39c12" : "#27ae60";
  const factors = [];
  if (ndti > 0.1) factors.push("High turbidity detected (NDTI)");
  if (fai > 0.02) factors.push("Algal bloom detected (FAI)");
  if (ndwi < 0.2) factors.push("Low water clarity (NDWI)");
  const today = new Date(); const start = new Date(today); start.setDate(start.getDate()-60);
  const fmt = d => d.toISOString().slice(0,10);
  
  // Water Appearance
  let appearance, appearanceDesc, appearanceIndicator;
  if (fai > 0.02) {
    appearance = "Greenish";
    appearanceDesc = "High algal pigment concentration detected via spectral analysis";
    appearanceIndicator = "Possible algal bloom or eutrophication";
  } else if (ndti > 0.1) {
    appearance = "Brownish/Murky";
    appearanceDesc = "High suspended sediment detected via spectral reflectance";
    appearanceIndicator = "Likely sediment load from erosion or runoff";
  } else if (ndwi > 0.5) {
    appearance = "Clear/Blue";
    appearanceDesc = "Low turbidity and algae, high water clarity";
    appearanceIndicator = "Healthy water body characteristics";
  } else {
    appearance = "Slightly Turbid";
    appearanceDesc = "Moderate clarity with some suspended matter";
    appearanceIndicator = "Normal seasonal variation or minor pollution";
  }
  
  // Pollution Sources
  const sources = [];
  if (ndti > 0.1) {
    sources.push({
      source: "Agricultural runoff",
      likelihood: "High",
      reasoning: "Elevated turbidity consistent with soil erosion and sediment transport from agricultural areas",
      indicators: ["High NDTI", "Suspended sediment signature"]
    });
  }
  if (fai > 0.02) {
    sources.push({
      source: "Nutrient pollution (eutrophication)",
      likelihood: "High",
      reasoning: "Strong algal bloom signature indicates excess nutrients, typically from fertilizers or sewage",
      indicators: ["High FAI", "Algal pigment signature"]
    });
  }
  if (sources.length === 0) {
    sources.push({
      source: "No significant pollution detected",
      likelihood: "High",
      reasoning: "All spectral indicators within normal ranges for healthy water bodies",
      indicators: ["Normal NDWI/NDTI/FAI", "Clean water signature"]
    });
  }
  
  const images = 5 + Math.round(s*10);
  const cloudPct = Math.round(s*15);
  
  return {
    location: {lat, lng}, aoi_buffer_m: 5000,
    date_range: {start: fmt(start), end: fmt(today)},
    images_used: images, cloud_cover_pct: cloudPct,
    indices: {ndwi, ndti, fai},
    classification: {label, score, color, factors,
      contributions: {"Turbidity (NDTI)": parseFloat((0.45*Math.max(0,(ndti+0.2)/0.6)*100).toFixed(1)),
                      "Algal Activity (FAI)": parseFloat((0.35*Math.max(0,(fai+0.05)/0.1)*100).toFixed(1)),
                      "Water Clarity (NDWI)": parseFloat((0.20*(1-Math.max(0,Math.min(1,ndwi/0.8)))*100).toFixed(1))},
      dominant: "Turbidity (NDTI)", weights: {ndti:0.45,fai:0.35,ndwi:0.20}},
    confidence: {level: s > 0.5 ? "High" : "Medium", score: s > 0.5 ? 80 : 55, reason: "Demo mode — simulated data"},
    water_appearance: {
      appearance: appearance,
      description: appearanceDesc,
      indicator: appearanceIndicator,
      note: "Based on spectral reflectance analysis, not direct visual observation"
    },
    pollution_sources: {
      possible_sources: sources,
      confidence: score > 60 ? "Moderate" : "Low",
      disclaimer: "These are probabilistic inferences based on spectral patterns, not confirmed identifications. Ground validation and water sampling required for definitive source attribution.",
      methodology: "Analysis combines spectral indices with established environmental science literature on pollution signatures"
    },
    data_reliability: {
      cloud_cover_pct: cloudPct,
      images_used: images,
      valid_pixels: 1500,
      confidence_level: s > 0.5 ? "High" : "Medium",
      confidence_score: s > 0.5 ? 80 : 55,
      reliability_note: `Analysis based on ${images} Sentinel-2 images with ${cloudPct}% average cloud cover. Confidence: ${s > 0.5 ? "High" : "Medium"} (${s > 0.5 ? 80 : 55}/100).`
    },
    tile_urls: {rgb: null, ndwi: null, pollution: null},
    bbox: {west: lng-0.05, south: lat-0.05, east: lng+0.05, north: lat+0.05},
    timestamp: new Date().toISOString(), _demo: true,
  };
}

function demoTimeseries(lat, lng, months) {
  const s = _seed(lat, lng); const series = []; const now = new Date();
  for (let i = months-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const ms = (s + i*0.07) % 1;
    const ndwi = parseFloat((0.1+ms*0.6).toFixed(4));
    const ndti = parseFloat((ms*0.25-0.05).toFixed(4));
    const fai  = parseFloat((ms*0.03-0.005).toFixed(6));
    const score = parseFloat(Math.min(100,(0.45*Math.max(0,(ndti+0.2)/0.6)+0.35*Math.max(0,(fai+0.05)/0.1)+0.20*(1-Math.max(0,Math.min(1,ndwi/0.8))))*100).toFixed(1));
    const classification = score>=60?"Polluted":score>=30?"Moderate":"Safe";
    series.push({month:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,ndwi,ndti,fai,score,classification,images:3+Math.round(ms*8)});
  }
  const scores = series.map(r=>r.score);
  const slope = scores.length>=3 ? scores[scores.length-1]-scores[0] : 0;
  const trend = slope>5?"degrading":slope<-5?"improving":"stable";
  return {location:{lat,lng},months,data_points:series.length,trend,series,timestamp:new Date().toISOString(),_demo:true};
}

function demoAlerts(lat, lng) {
  const a = demoAnalysis(lat, lng);
  const level = a.classification.label;
  const recs = level==="Polluted"
    ? ["Avoid recreational water contact immediately.","Do not use for drinking or irrigation.","Notify local environmental authorities.","Collect water samples for laboratory analysis."]
    : level==="Moderate"
    ? ["Exercise caution near this water body.","Monitor water quality over the next 2–4 weeks.","Increase sampling frequency."]
    : ["Water quality appears normal.","Continue routine monitoring.","Track seasonal variations."];
  const triggered = [];
  if (a.indices.ndti > 0.1) triggered.push({type:"High Turbidity",index:"NDTI",value:a.indices.ndti,threshold:0.1,severity:"High"});
  if (a.indices.fai > 0.02) triggered.push({type:"Algal Bloom",index:"FAI",value:a.indices.fai,threshold:0.02,severity:"High"});
  return {location:{lat,lng},alert_level:level,severity:level==="Polluted"?"High":level==="Moderate"?"Medium":"None",
    alert_color:a.classification.color,pollution_score:a.classification.score,
    factors:a.classification.factors,indices:a.indices,confidence:a.confidence,
    triggered_alerts:triggered,recommendations:recs,
    pollution_sources:a.pollution_sources,
    data_reliability:a.data_reliability,
    timestamp:new Date().toISOString(),_demo:true};
}

function demoCompare(lat1,lng1,lat2,lng2) {
  const a = demoAnalysis(lat1,lng1); const b = demoAnalysis(lat2,lng2);
  const sa = a.classification.score; const sb = b.classification.score;
  const winner = sa<=sb?"A":"B"; const diff = Math.abs(sa-sb);
  const insights = [];
  if (diff<5) insights.push("Both locations show similar water quality levels.");
  else insights.push(`Location ${winner} has cleaner water (score difference: ${diff.toFixed(0)} points).`);
  if (b.indices.ndti > a.indices.ndti+0.05) insights.push("Location B shows higher turbidity — possible suspended sediment.");
  else if (a.indices.ndti > b.indices.ndti+0.05) insights.push("Location A shows higher turbidity — possible suspended sediment.");
  if (a.indices.fai>0.01) insights.push("Location A shows signs of algal activity.");
  if (b.indices.fai>0.01) insights.push("Location B shows signs of algal activity.");
  insights.push(`Location ${winner==="A"?"B":"A"} requires more urgent monitoring.`);
  return {location_a:{lat:lat1,lng:lng1,indices:a.indices,classification:a.classification,confidence:a.confidence,images_used:a.images_used,cloud_cover_pct:a.cloud_cover_pct},
    location_b:{lat:lat2,lng:lng2,indices:b.indices,classification:b.classification,confidence:b.confidence,images_used:b.images_used,cloud_cover_pct:b.cloud_cover_pct},
    winner,score_diff:parseFloat(diff.toFixed(1)),insights,timestamp:new Date().toISOString(),_demo:true};
}

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  selectedLat: null, selectedLng: null, selectedName: null,
  marker: null,
  layers: {rgb: null, ndwi: null, pollution: null},
  lastAnalysis: null,
  compareA: null, compareB: null,
  compareMapA: null, compareMapB: null,
  compareMarkerA: null, compareMarkerB: null,
  history: JSON.parse(localStorage.getItem("aw_history") || "[]"),
};

const overlayState = {rgb: true, ndwi: false, pollution: false, watershed: false, industrial: false};
let _demoPollutionRect = null;
let _apiWasOnline = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  apiDot: $("api-status-dot"), apiText: $("api-status-text"), alertBadge: $("alert-badge"),
  inputLat: $("input-lat"), inputLng: $("input-lng"),
  btnAnalyze: $("btn-analyze"),
  mapLoading: $("map-loading"),
  resultCard: $("result-card"), resultLabel: $("result-label"), resultConfidence: $("result-confidence"),
  resultScoreNum: $("result-score-num"), scoreBarFill: $("score-bar-fill"),
  valNdwi: $("val-ndwi"), valNdti: $("val-ndti"), valFai: $("val-fai"),
  contributionBars: $("contribution-bars"), resultFactors: $("result-factors"),
  resultImages: $("result-images"), resultDates: $("result-dates"), resultTs: $("result-ts"),
  btnSetA: $("btn-set-compare-a"), btnSetB: $("btn-set-compare-b"), btnExport: $("btn-export"),
  historySection: $("history-section"), historyList: $("history-list"), btnClearHistory: $("btn-clear-history"),
  layerRgb: $("layer-rgb"), layerNdwi: $("layer-ndwi"), layerPollution: $("layer-pollution"),
  layerWatershed: $("layer-watershed"), layerIndustrial: $("layer-industrial"),
  monthsSelect: $("months-select"), btnTimeseries: $("btn-timeseries"),
  analysisLoading: $("analysis-loading"), analysisContent: $("analysis-content"), analysisEmpty: $("analysis-empty"),
  tsTrend: $("ts-trend"), tsPoints: $("ts-points"), tsAvgScore: $("ts-avg-score"), tsLatestStatus: $("ts-latest-status"),
  cmpLatA: $("cmp-lat-a"), cmpLngA: $("cmp-lng-a"), cmpLatB: $("cmp-lat-b"), cmpLngB: $("cmp-lng-b"),
  cmpNameA: $("cmp-name-a"), cmpNameB: $("cmp-name-b"),  btnRunCompare: $("btn-run-compare"),
  cmpSearchA: $("cmp-search-a"), cmpSearchResultsA: $("cmp-search-results-a"), 
  cmpSearchClearA: $("cmp-search-clear-a"), cmpSearchSpinnerA: $("cmp-search-spinner-a"),
  cmpSearchB: $("cmp-search-b"), cmpSearchResultsB: $("cmp-search-results-b"),
  cmpSearchClearB: $("cmp-search-clear-b"), cmpSearchSpinnerB: $("cmp-search-spinner-b"),
  cmpMapNameA: $("cmp-map-name-a"), cmpMapNameB: $("cmp-map-name-b"),
  cmpMapMaximizeA: $("cmp-map-maximize-a"), cmpMapMaximizeB: $("cmp-map-maximize-b"),
  compareLoading: $("compare-loading"), compareResults: $("compare-results"), compareEmpty: $("compare-empty"),
  cmpCardA: $("cmp-card-a"), cmpCardB: $("cmp-card-b"),
  cmpScoreA: $("cmp-score-a"), cmpScoreB: $("cmp-score-b"),
  cmpLabelA: $("cmp-label-a"), cmpLabelB: $("cmp-label-b"),
  cmpConfA: $("cmp-conf-a"), cmpConfB: $("cmp-conf-b"),
  cmpWinnerBadge: $("cmp-winner-badge"),
  cmpCardNameA: $("cmp-card-name-a"), cmpCardNameB: $("cmp-card-name-b"),  thNameA: $("th-name-a"), thNameB: $("th-name-b"),
  compareTableBody: $("compare-table-body"),
  insightsList: $("insights-list"),
  btnCheckAlerts: $("btn-check-alerts"),
  alertsLoading: $("alerts-loading"), alertBanner: $("alert-banner"),
  alertsContent: $("alerts-content"), alertsEmpty: $("alerts-empty"),
  triggeredSection: $("triggered-alerts-section"), triggeredList: $("triggered-alerts-list"),
  alertStatusDisplay: $("alert-status-display"), alertFactorsList: $("alert-factors-list"),
  alertRecommendations: $("alert-recommendations"),
  alertNdwi: $("alert-ndwi"), alertNdti: $("alert-ndti"), alertFai: $("alert-fai"),
  alertScoreVal: $("alert-score-val"), alertConfidence: $("alert-confidence"),
  alertTimestamp: $("alert-timestamp"),
  toastContainer: $("toast-container"),
  searchInput: $("search-input"), searchResults: $("search-results"),
  searchClear: $("search-clear"), searchSpinner: $("search-spinner"),
};

// ─── Map ──────────────────────────────────────────────────────────────────────
const map = L.map("map", {center:[20,0], zoom:3, zoomControl:true});

const baseLayers = {
  "🛰️ Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {attribution:"Tiles © Esri", maxZoom:19}),
  "🗺️ Street Map": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {attribution:"© OpenStreetMap contributors", maxZoom:19}),
  "🌊 Ocean": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    {attribution:"Tiles © Esri", maxZoom:13}),
};
baseLayers["🛰️ Satellite"].addTo(map);
L.control.layers(baseLayers, {}, {position:"topright", collapsed:false}).addTo(map);

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected","false"); });
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active"); btn.setAttribute("aria-selected","true");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "map") setTimeout(() => map.invalidateSize(), 100);
  });
});

// ─── Location ─────────────────────────────────────────────────────────────────
map.on("click", e => setLocation(e.latlng.lat, e.latlng.lng));

function setLocation(lat, lng, name) {
  state.selectedLat = lat; state.selectedLng = lng;
  state.selectedName = name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  dom.inputLat.value = lat.toFixed(5); dom.inputLng.value = lng.toFixed(5);
  if (state.marker) { state.marker.setLatLng([lat,lng]); }
  else {
    state.marker = L.circleMarker([lat,lng],{radius:10,color:"#fff",fillColor:"#facc15",fillOpacity:0.95,weight:3}).addTo(map);
  }
  state.marker.bindPopup(
    `<div style="font-size:13px;line-height:1.6;min-width:140px">
      <strong style="color:#facc15">📍 ${escHtml(state.selectedName)}</strong><br>
      <span style="color:#94a3b8">Lat:</span> ${lat.toFixed(5)}<br>
      <span style="color:#94a3b8">Lng:</span> ${lng.toFixed(5)}<br>
      <span style="font-size:11px;color:#64748b">Click Analyze to inspect</span>
    </div>`
  ).openPopup();
}

dom.inputLat.addEventListener("change", () => {
  const lat = parseFloat(dom.inputLat.value), lng = parseFloat(dom.inputLng.value);
  if (!isNaN(lat) && !isNaN(lng)) setLocation(lat, lng);
});
dom.inputLng.addEventListener("change", () => {
  const lat = parseFloat(dom.inputLat.value), lng = parseFloat(dom.inputLng.value);
  if (!isNaN(lat) && !isNaN(lng)) setLocation(lat, lng);
});

document.querySelectorAll(".quick-loc-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const lat = parseFloat(btn.dataset.lat), lng = parseFloat(btn.dataset.lng);
    setLocation(lat, lng, btn.dataset.name);
    map.setView([lat,lng], 11);
  });
});

// ─── Layers ───────────────────────────────────────────────────────────────────
const ndwiOverlay = L.tileLayer(
  "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
  {attribution:"© Stamen/Stadia", opacity:0.45, maxZoom:16}
);

function syncOverlays() {
  const sat = baseLayers["🛰️ Satellite"];
  if (sat && map.hasLayer(sat)) sat.setOpacity(overlayState.rgb ? 1.0 : 0.35);
  overlayState.ndwi ? (map.hasLayer(ndwiOverlay) || map.addLayer(ndwiOverlay))
                    : (map.hasLayer(ndwiOverlay) && map.removeLayer(ndwiOverlay));
  if (overlayState.pollution) {
    if (state.layers.pollution && !map.hasLayer(state.layers.pollution)) map.addLayer(state.layers.pollution);
    else if (!state.layers.pollution) showPollutionRect(true);
  } else {
    if (state.layers.pollution && map.hasLayer(state.layers.pollution)) map.removeLayer(state.layers.pollution);
    showPollutionRect(false);
  }
  if (state.layers.rgb)  overlayState.rgb  ? map.addLayer(state.layers.rgb)  : map.removeLayer(state.layers.rgb);
  if (state.layers.ndwi) overlayState.ndwi ? map.addLayer(state.layers.ndwi) : map.removeLayer(state.layers.ndwi);
  if (overlayState.watershed) {
    if (watershedLayer && !map.hasLayer(watershedLayer)) map.addLayer(watershedLayer);
  } else {
    if (watershedLayer && map.hasLayer(watershedLayer)) map.removeLayer(watershedLayer);
  }
  if (overlayState.industrial) {
    if (!map.hasLayer(industrialGroup)) map.addLayer(industrialGroup);
  } else {
    if (map.hasLayer(industrialGroup)) map.removeLayer(industrialGroup);
  }
}

function showPollutionRect(show) {
  if (_demoPollutionRect) { map.removeLayer(_demoPollutionRect); _demoPollutionRect = null; }
  if (show && state.lastAnalysis) {
    const b = state.lastAnalysis.bbox, cls = state.lastAnalysis.classification.label;
    const c = {Polluted:"#e74c3c",Moderate:"#f39c12",Safe:"#27ae60"}[cls]||"#3b82f6";
    _demoPollutionRect = L.rectangle([[b.south,b.west],[b.north,b.east]],
      {color:c,fillColor:c,fillOpacity:0.22,weight:2,opacity:0.6,dashArray:"6 4"}).addTo(map);
    _demoPollutionRect.bindTooltip(`<strong>${cls}</strong> — Score: ${state.lastAnalysis.classification.score}/100`,{sticky:true});
  }
}

function clearSatLayers() {
  Object.values(state.layers).forEach(l => { if (l && map.hasLayer(l)) map.removeLayer(l); });
  state.layers.rgb = state.layers.ndwi = state.layers.pollution = null;
  if (watershedLayer && map.hasLayer(watershedLayer)) map.removeLayer(watershedLayer);
  watershedLayer = null;
  industrialGroup.clearLayers();
  showPollutionRect(false);
}

function addTileLayer(url, name) {
  if (!url) return;
  const l = L.tileLayer(url, {opacity:0.85, attribution:"GEE / Sentinel-2", maxZoom:18});
  state.layers[name] = l;
  if (overlayState[name] ?? true) map.addLayer(l);
}

dom.layerRgb.addEventListener("change",       () => { overlayState.rgb        = dom.layerRgb.checked;       syncOverlays(); });
dom.layerNdwi.addEventListener("change",      () => { overlayState.ndwi       = dom.layerNdwi.checked;      syncOverlays(); });
dom.layerPollution.addEventListener("change", () => { overlayState.pollution   = dom.layerPollution.checked; syncOverlays();
  if (dom.layerPollution.checked && !state.lastAnalysis) showToast("warning","No Analysis Yet","Run an analysis first.",3000);
});
dom.layerWatershed.addEventListener("change", () => { overlayState.watershed  = dom.layerWatershed.checked;  syncOverlays();
  if (dom.layerWatershed.checked && !watershedLayer) showToast("warning","No Land Use Data","Run an analysis first.",3000);
});
dom.layerIndustrial.addEventListener("change", () => { overlayState.industrial = dom.layerIndustrial.checked; syncOverlays();
  if (dom.layerIndustrial.checked && state.selectedLat) fetchIndustrialFacilities(state.selectedLat, state.selectedLng);
  else if (dom.layerIndustrial.checked) showToast("warning","No Location","Select a location first.",3000);
});

// ─── Analyze ──────────────────────────────────────────────────────────────────
dom.btnAnalyze.addEventListener("click", runAnalysis);

async function runAnalysis() {
  const lat = parseFloat(dom.inputLat.value), lng = parseFloat(dom.inputLng.value);
  if (isNaN(lat)||isNaN(lng)) { showToast("error","No Location","Click the map or enter coordinates first."); return; }
  if (lat<-90||lat>90||lng<-180||lng>180) { showToast("error","Invalid Coordinates","Lat: −90 to 90, Lng: −180 to 180."); return; }

  dom.btnAnalyze.disabled = true;
  dom.mapLoading.classList.remove("hidden");
  dom.resultCard.classList.add("hidden");
  clearSatLayers();

  try {
    let data, demo = false;
    try {
      const r = await fetch(`${API_BASE_URL}/analyze?lat=${lat}&lng=${lng}`, {signal: AbortSignal.timeout(30000)});
      if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||`HTTP ${r.status}`); }
      data = await r.json();
    } catch(e) { console.warn("Backend unavailable, using demo:", e.message); data = demoAnalysis(lat,lng); demo = true; }

    state.lastAnalysis = data;
    if (data.tile_urls?.rgb)       addTileLayer(data.tile_urls.rgb,       "rgb");
    if (data.tile_urls?.ndwi)      addTileLayer(data.tile_urls.ndwi,      "ndwi");
    if (data.tile_urls?.pollution) addTileLayer(data.tile_urls.pollution, "pollution");

    const b = data.bbox;
    map.fitBounds([[b.south,b.west],[b.north,b.east]], {padding:[40,40]});
    renderResultCard(data, demo);
    updateAlertBadge(data.classification.label);
    syncOverlays();
    addToHistory(lat, lng, state.selectedName, data);
    // Tier-2 enrichment — fire in parallel, non-blocking
    fetchWatershed(lat, lng);
    fetchForecast(lat, lng, data.classification.score);
    checkDisasterEvents(lat, lng);
    if (overlayState.industrial) fetchIndustrialFacilities(lat, lng);

    const t = data.classification.label==="Safe"?"success":data.classification.label==="Moderate"?"warning":"error";
    showToast(t, `${demo?"Demo — ":""}${data.classification.label}`,
      `Score: ${data.classification.score}/100 · Confidence: ${data.confidence.level}${demo?" (simulated)":""}`);
  } catch(e) {
    showToast("error","Analysis Failed", e.message);
  } finally {
    dom.btnAnalyze.disabled = false;
    dom.mapLoading.classList.add("hidden");
  }
}

function renderResultCard(data, demo=false) {
  const cls = data.classification;
  const lc  = cls.label.toLowerCase();

  dom.resultLabel.textContent = cls.label;
  dom.resultLabel.className   = `result-label ${lc}`;
  dom.resultScoreNum.textContent = cls.score;
  dom.resultScoreNum.style.color = cls.color;

  // Score bar
  dom.scoreBarFill.style.width = `${cls.score}%`;
  dom.scoreBarFill.style.background = cls.color;

  // Confidence badge
  const conf = data.confidence;
  const confColor = conf.level==="High"?"var(--safe)":conf.level==="Medium"?"var(--moderate)":"var(--polluted)";
  dom.resultConfidence.innerHTML = `<span class="conf-badge" style="color:${confColor};border-color:${confColor}">${conf.level} Confidence</span>`;
  dom.resultConfidence.title = conf.reason;

  dom.valNdwi.textContent = data.indices.ndwi.toFixed(4);
  dom.valNdti.textContent = data.indices.ndti.toFixed(4);
  dom.valFai.textContent  = data.indices.fai.toFixed(6);

  // Contribution bars
  if (cls.contributions) {
    dom.contributionBars.innerHTML = Object.entries(cls.contributions).map(([k,v]) =>
      `<div class="contrib-row">
        <span class="contrib-label">${k}</span>
        <div class="contrib-track"><div class="contrib-fill" style="width:${Math.min(100,v*2)}%;background:${cls.color}"></div></div>
        <span class="contrib-val">${v.toFixed(1)}</span>
      </div>`
    ).join("");
  }

  dom.resultFactors.innerHTML = cls.factors.length
    ? cls.factors.map(f=>`<span class="factor-tag">${f}</span>`).join("")
    : `<span style="font-size:0.75rem;color:var(--text-muted)">No significant factors detected</span>`;

  // Water Appearance (NEW)
  if (data.water_appearance) {
    const wa = data.water_appearance;
    const appearanceEl = document.getElementById('water-appearance');
    if (appearanceEl) {
      // Determine badge color based on appearance type
      let badgeColor = 'rgba(59, 130, 246, 0.15)';
      let badgeTextColor = '#3b82f6';
      const appearance = wa.appearance.toLowerCase();
      if (appearance.includes('brownish') || appearance.includes('murky')) {
        badgeColor = 'rgba(243, 156, 18, 0.15)';
        badgeTextColor = '#f39c12';
      } else if (appearance.includes('greenish')) {
        badgeColor = 'rgba(39, 174, 96, 0.15)';
        badgeTextColor = '#27ae60';
      } else if (appearance.includes('clear') || appearance.includes('blue')) {
        badgeColor = 'rgba(59, 130, 246, 0.15)';
        badgeTextColor = '#3b82f6';
      }
      
      appearanceEl.innerHTML = `
        <div class="appearance-badge" style="background: ${badgeColor}; color: ${badgeTextColor}; border-color: ${badgeTextColor}40;">
          ${escHtml(wa.appearance)}
        </div>
        <p class="appearance-desc">${escHtml(wa.description)}</p>
        <p class="appearance-indicator"><strong>Indicator:</strong> ${escHtml(wa.indicator)}</p>
        <p class="appearance-note"><i class="fa-solid fa-info-circle"></i> ${escHtml(wa.note)}</p>
      `;
    }
  }

  // Possible Pollution Sources (NEW)
  if (data.pollution_sources) {
    const ps = data.pollution_sources;
    const sourcesEl = document.getElementById('pollution-sources');
    if (sourcesEl) {
      sourcesEl.innerHTML = `
        <div class="sources-confidence">Confidence: <strong>${escHtml(ps.confidence)}</strong></div>
        ${ps.possible_sources.map(source => `
          <div class="source-item">
            <div class="source-header">
              <span class="source-name">${escHtml(source.source)}</span>
              <span class="source-likelihood likelihood-${source.likelihood.toLowerCase()}">${escHtml(source.likelihood)}</span>
            </div>
            <p class="source-reasoning">${escHtml(source.reasoning)}</p>
            <div class="source-indicators">
              ${source.indicators.map(ind => `<span class="indicator-tag">${escHtml(ind)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
        <p class="sources-disclaimer"><i class="fa-solid fa-shield-halved"></i> ${escHtml(ps.disclaimer)}</p>
      `;
    }
  }

  // Data Reliability (NEW)
  if (data.data_reliability) {
    const dr = data.data_reliability;
    const reliabilityEl = document.getElementById('data-reliability');
    if (reliabilityEl) {
      const confColor = dr.confidence_level==="High"?"#27ae60":dr.confidence_level==="Medium"?"#f39c12":"#e74c3c";
      reliabilityEl.innerHTML = `
        <div class="reliability-grid">
          <div class="reliability-item">
            <div class="reliability-label">Images Used</div>
            <div class="reliability-value">${dr.images_used}</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Cloud Cover</div>
            <div class="reliability-value">${dr.cloud_cover_pct}%</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Valid Pixels</div>
            <div class="reliability-value">${dr.valid_pixels.toLocaleString()}</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Confidence</div>
            <div class="reliability-value" style="color:${confColor}">${dr.confidence_level}</div>
          </div>
        </div>
        <div class="reliability-score-bar">
          <div class="reliability-score-fill" style="width:${dr.confidence_score}%;background:${confColor}"></div>
        </div>
        <p class="reliability-note">${escHtml(dr.reliability_note)}</p>
      `;
    }
  }

  dom.resultImages.textContent = `📡 ${data.images_used} images · ☁️ ${data.cloud_cover_pct}% cloud${demo?" (demo)":""}`;
  dom.resultDates.textContent  = `📅 ${data.date_range.start} → ${data.date_range.end}`;
  dom.resultTs.textContent     = `🕐 ${formatTimestamp(data.timestamp)}`;

  // Reset Tier-2 sections to loading state
  const luEl = document.getElementById('land-use-content');
  const fcEl = document.getElementById('forecast-content');
  const disEl = document.getElementById('section-disaster');
  if (luEl) luEl.innerHTML = '<p class="luc-placeholder luc-loading">Fetching upstream land use…</p>';
  if (fcEl) fcEl.innerHTML = '<p class="forecast-placeholder forecast-loading">Fetching weather forecast…</p>';
  if (disEl) disEl.classList.add('hidden');

  dom.resultCard.classList.remove("hidden");
}

function updateAlertBadge(label) {
  if (label==="Polluted") { dom.alertBadge.textContent="!"; dom.alertBadge.classList.remove("hidden"); }
  else if (label==="Moderate") { dom.alertBadge.textContent="~"; dom.alertBadge.classList.remove("hidden"); }
  else dom.alertBadge.classList.add("hidden");
}

// ─── Tier-2: Helpers ─────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function wmoIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3)  return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  return '⛈️';
}

function wmoLabel(code) {
  if (code === 0) return 'Clear';
  if (code <= 3)  return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}

// ─── Tier-2: Watershed / Upstream Land Use ────────────────────────────────────
let watershedLayer = null;

const LU_COLORS = {
  'Cropland':     '#e9c46a',
  'Built-up':     '#e76f51',
  'Tree Cover':   '#2d6a4f',
  'Grassland':    '#95d5b2',
  'Shrubland':    '#52b788',
  'Water Bodies': '#4895ef',
  'Wetlands':     '#56cfe1',
  'Bare/Sparse':  '#adb5bd',
  'Snow/Ice':     '#e0fbfc',
  'Mangroves':    '#1b4332',
  'Moss/Lichen':  '#b7e4c7',
};

function demoWatershed(lat, lng) {
  const s = _seed(lat, lng);
  const cropland = Math.round(10 + s * 40);
  const builtup  = Math.round(5  + s * 25);
  const trees    = Math.round(5  + (1 - s) * 35);
  const grass    = Math.round(5  + s * 20);
  const water    = 5;
  const other    = Math.max(0, 100 - cropland - builtup - trees - grass - water);
  const pot      = Math.min(100, cropland * 0.6 + builtup * 0.9);
  return {
    location: {lat, lng}, buffer_m: 15000,
    land_use: Object.fromEntries(
      [['Cropland', cropland], ['Tree Cover', trees], ['Built-up', builtup],
       ['Grassland', grass],   ['Water Bodies', water], ['Bare/Sparse', other]]
      .filter(([, v]) => v > 0)
    ),
    pollution_potential: Math.round(pot),
    risk_level: pot > 50 ? 'High' : pot > 25 ? 'Moderate' : 'Low',
    risk_factors: [
      cropland > 30 ? `High agricultural land (${cropland}%) — fertilizer runoff risk` : null,
      builtup  > 20 ? `Urban area (${builtup}%) — stormwater runoff risk` : null,
      trees    < 10 ? 'Low forest cover — reduced natural filtration' : null,
      '⚠️ Demo mode — simulated land use data',
    ].filter(Boolean),
    source: 'Demo (ESA WorldCover 2021)', tile_url: null, _demo: true,
  };
}

async function fetchWatershed(lat, lng) {
  const el = document.getElementById('land-use-content');
  let data;
  try {
    const r = await fetch(`${API_BASE_URL}/watershed?lat=${lat}&lng=${lng}`, {signal: AbortSignal.timeout(25000)});
    if (!r.ok) throw new Error('Backend unavailable');
    data = await r.json();
  } catch {
    data = demoWatershed(lat, lng);
  }
  renderWatershed(data);
  if (data.tile_url) {
    if (watershedLayer) map.removeLayer(watershedLayer);
    watershedLayer = L.tileLayer(data.tile_url, {opacity: 0.65, attribution: 'ESA WorldCover 2021'});
    if (overlayState.watershed) map.addLayer(watershedLayer);
  }
}

function renderWatershed(data) {
  const el = document.getElementById('land-use-content');
  if (!el) return;
  const riskColor = {High: 'var(--polluted)', Moderate: 'var(--moderate)', Low: 'var(--safe)'}[data.risk_level] || 'var(--text-muted)';
  const lu   = data.land_use || {};
  const bars = Object.entries(lu).sort(([, a], [, b]) => b - a).map(([name, pct]) => {
    const color = LU_COLORS[name] || '#6c757d';
    return `<div class="luc-row">
      <span class="luc-label">${escHtml(name)}</span>
      <div class="luc-track"><div class="luc-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="luc-val">${pct}%</span>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="luc-header">
      <span class="luc-risk" style="color:${riskColor}">Pollution Potential: <strong>${escHtml(data.risk_level)}</strong></span>
      <span class="luc-score" style="color:${riskColor}">${data.pollution_potential}/100</span>
    </div>
    <div class="luc-bars">${bars}</div>
    <ul class="luc-factors">${(data.risk_factors || []).map(f => `<li>${escHtml(f)}</li>`).join('')}</ul>
    <p class="luc-source"><i class="fa-solid fa-satellite"></i> ${escHtml(data.source)} · ${data.buffer_m / 1000} km radius${data._demo ? ' (demo)' : ''}</p>
  `;
}

// ─── Tier-2: Industrial Facilities Overlay ────────────────────────────────────
const industrialGroup = L.layerGroup();

const FACILITY_META = {
  wastewater_plant:     {icon: '🏭', color: '#e74c3c', label: 'Wastewater Plant'},
  water_treatment_plant:{icon: '💧', color: '#3b82f6', label: 'Water Treatment'},
  factory:              {icon: '🏗️', color: '#e67e22', label: 'Factory'},
  industrial:           {icon: '⚙️', color: '#f39c12', label: 'Industrial'},
};

async function fetchIndustrialFacilities(lat, lng) {
  const query = `[out:json][timeout:20];
(
  node["man_made"="wastewater_plant"](around:10000,${lat},${lng});
  node["man_made"="water_treatment_plant"](around:10000,${lat},${lng});
  node["industrial"](around:10000,${lat},${lng});
  way["man_made"="wastewater_plant"](around:10000,${lat},${lng});
  way["man_made"="water_treatment_plant"](around:10000,${lat},${lng});
  way["landuse"="industrial"](around:10000,${lat},${lng});
);
out center;`;
  industrialGroup.clearLayers();
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderIndustrialFacilities(data.elements || []);
  } catch(e) {
    console.warn('Industrial facilities unavailable:', e.message);
  }
}

function renderIndustrialFacilities(elements) {
  industrialGroup.clearLayers();
  let count = 0;
  elements.forEach(el => {
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (!elLat || !elLng) return;
    const manMade = el.tags?.man_made || '';
    const indTag  = el.tags?.industrial || '';
    const name    = el.tags?.name || manMade || indTag || 'Industrial Facility';
    let type = 'industrial';
    if (manMade === 'wastewater_plant')      type = 'wastewater_plant';
    else if (manMade === 'water_treatment_plant') type = 'water_treatment_plant';
    else if (el.tags?.building === 'factory' || indTag === 'factory') type = 'factory';
    const {icon, color, label} = FACILITY_META[type] || FACILITY_META.industrial;
    const divIcon = L.divIcon({
      html: `<div style="background:${color};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)">${icon}</div>`,
      className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    });
    const marker = L.marker([elLat, elLng], {icon: divIcon});
    marker.bindPopup(
      `<div style="font-size:13px;line-height:1.6;min-width:160px">
        <strong style="color:${color}">${icon} ${escHtml(name)}</strong><br>
        <span style="color:#94a3b8">Type:</span> ${escHtml(label)}<br>
        <span style="color:#94a3b8">Coords:</span> ${elLat.toFixed(4)}, ${elLng.toFixed(4)}<br>
        <span style="font-size:11px;color:#64748b">Source: OpenStreetMap</span>
      </div>`
    );
    industrialGroup.addLayer(marker);
    count++;
  });
  if (count > 0 && overlayState.industrial && !map.hasLayer(industrialGroup)) map.addLayer(industrialGroup);
  if (count > 0) showToast('info', `${count} Industrial Facilities`, 'Found within 10 km. Enable "Industrial Facilities" layer to view.', 4000);
}

// ─── Tier-2: 7-Day Rainfall Forecast ─────────────────────────────────────────
async function fetchForecast(lat, lng, currentScore) {
  const el = document.getElementById('forecast-content');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,precipitation_probability_max,weathercode&forecast_days=7&timezone=auto`;
    const r   = await fetch(url, {signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error('Open-Meteo error');
    const data = await r.json();
    renderForecast(data, currentScore);
  } catch(e) {
    if (el) el.innerHTML = '<p class="forecast-placeholder"><i class="fa-solid fa-circle-xmark"></i> Weather forecast unavailable.</p>';
    console.warn('Forecast fetch failed:', e.message);
  }
}

function renderForecast(data, currentScore) {
  const el = document.getElementById('forecast-content');
  if (!el || !data.daily) return;
  const {time, weathercode, precipitation_sum, precipitation_probability_max} = data.daily;
  const rain3 = precipitation_sum.slice(0, 3).reduce((a, b) => a + (b || 0), 0);
  let impactText = 'Stable', impactColor = 'var(--safe)', scoreDelta = 0;
  if (rain3 > 20) {
    scoreDelta  = Math.min(30, Math.round(rain3 * 0.8));
    impactText  = `+${scoreDelta} pts`;
    impactColor = 'var(--polluted)';
  } else if (rain3 > 8) {
    scoreDelta  = Math.round(rain3 * 0.5);
    impactText  = `+${scoreDelta} pts`;
    impactColor = 'var(--moderate)';
  }
  const predicted = Math.min(100, currentScore + scoreDelta);
  const days = time.map((date, i) => {
    const d       = new Date(date);
    const dayName = i === 0 ? 'Today' : d.toLocaleDateString(undefined, {weekday: 'short'});
    const rain    = precipitation_sum[i] ?? 0;
    const prob    = precipitation_probability_max[i] ?? 0;
    const code    = weathercode[i] ?? 0;
    const barH    = Math.min(100, rain * 8);
    const isHigh  = rain > 10;
    return `<div class="forecast-day${isHigh ? ' forecast-day-alert' : ''}">
      <div class="fd-name">${escHtml(dayName)}</div>
      <div class="fd-icon" title="${escHtml(wmoLabel(code))}">${wmoIcon(code)}</div>
      <div class="fd-rain${isHigh ? ' fd-rain-high' : ''}">${rain.toFixed(1)}mm</div>
      <div class="fd-prob">${prob}%</div>
      <div class="fd-bar-wrap"><div class="fd-bar" style="height:${barH}%;background:${isHigh ? 'var(--polluted)' : '#4895ef'}"></div></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="forecast-impact">
      <span class="fi-label">Turbidity Impact (3-day rain total: ${rain3.toFixed(1)}mm)</span>
      <span class="fi-value" style="color:${impactColor}">${impactText}</span>
      ${scoreDelta > 0 ? `<span class="fi-predicted">Projected score: ~${predicted}/100</span>` : ''}
    </div>
    <div class="forecast-days">${days}</div>
    <p class="forecast-source"><i class="fa-solid fa-cloud"></i> Open-Meteo · ${escHtml(data.timezone || 'UTC')}</p>
  `;
}

// ─── Tier-2: Active Flood / Disaster Events ───────────────────────────────────
async function checkDisasterEvents(lat, lng) {
  try {
    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=floods&status=open&days=30&limit=100';
    const r   = await fetch(url, {signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error();
    const data = await r.json();
    const nearby = (data.events || []).flatMap(event => {
      return (event.geometry || []).slice(0, 1).map(geom => {
        if (!geom?.coordinates) return null;
        const [eLng, eLat] = geom.coordinates;
        const dist = haversineKm(lat, lng, eLat, eLng);
        if (dist > 600) return null;
        const rawUrl = event.sources?.[0]?.url || null;
        const safeUrl = rawUrl && /^https:\/\//.test(rawUrl) ? rawUrl : null;
        return {title: event.title, date: geom.date?.slice(0, 10) || '', dist: Math.round(dist), url: safeUrl};
      });
    }).filter(Boolean).sort((a, b) => a.dist - b.dist);
    renderDisasterEvents(nearby);
  } catch(e) {
    console.warn('Disaster events check failed:', e.message);
  }
}

function renderDisasterEvents(events) {
  const section = document.getElementById('section-disaster');
  const el      = document.getElementById('disaster-content');
  if (!section || !el) return;
  if (!events.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  el.innerHTML = events.slice(0, 3).map(ev => `
    <div class="disaster-event">
      <span class="de-icon">🌊</span>
      <div class="de-body">
        <div class="de-title">${escHtml(ev.title)}</div>
        <div class="de-meta"><span>${escHtml(ev.date)}</span><span>~${ev.dist} km away</span></div>
      </div>
      ${ev.url ? `<a href="${escHtml(ev.url)}" target="_blank" rel="noopener noreferrer" class="de-link" title="View source"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
    </div>
  `).join('') + `<p class="disaster-note"><i class="fa-solid fa-circle-info"></i> Active flood events from NASA EONET detected nearby. Current satellite readings may reflect post-flood water conditions.</p>`;
}

// ─── Compare set buttons ──────────────────────────────────────────────────────
dom.btnSetA.addEventListener("click", () => {
  if (!state.lastAnalysis) { showToast("warning","No Analysis","Run an analysis first."); return; }
  state.compareA = {...state.lastAnalysis, _name: state.selectedName};
  dom.cmpLatA.value = state.selectedLat; dom.cmpLngA.value = state.selectedLng;
  dom.cmpNameA.textContent = state.selectedName;
  showToast("success","Set as Location A", state.selectedName, 2500);
});

dom.btnSetB.addEventListener("click", () => {
  if (!state.lastAnalysis) { showToast("warning","No Analysis","Run an analysis first."); return; }
  state.compareB = {...state.lastAnalysis, _name: state.selectedName};
  dom.cmpLatB.value = state.selectedLat; dom.cmpLngB.value = state.selectedLng;
  dom.cmpNameB.textContent = state.selectedName;
  showToast("success","Set as Location B", state.selectedName, 2500);
});

// ─── Export ───────────────────────────────────────────────────────────────────
dom.btnExport.addEventListener("click", () => {
  if (!state.lastAnalysis) return;
  const d = state.lastAnalysis;
  const lines = [
    "AquaVision — Water Quality Analysis Report",
    "==========================================",
    `Location:       ${d.location.lat}, ${d.location.lng}`,
    `Name:           ${state.selectedName || "Unknown"}`,
    `Date Range:     ${d.date_range.start} to ${d.date_range.end}`,
    `Images Used:    ${d.images_used}`,
    `Cloud Cover:    ${d.cloud_cover_pct}%`,
    "",
    "INDICES",
    `  NDWI (Water Clarity):  ${d.indices.ndwi}`,
    `  NDTI (Turbidity):      ${d.indices.ndti}`,
    `  FAI  (Algae):          ${d.indices.fai}`,
    "",
    "CLASSIFICATION",
    `  Status:     ${d.classification.label}`,
    `  Score:      ${d.classification.score}/100`,
    `  Confidence: ${d.confidence.level} (${d.confidence.reason})`,
    "",
    "FACTORS",
    ...(d.classification.factors.length ? d.classification.factors.map(f=>`  - ${f}`) : ["  None detected"]),
    "",
    `Generated: ${formatTimestamp(d.timestamp)}`,
    "Disclaimer: Indicative analysis only. Ground validation recommended.",
  ];
  const blob = new Blob([lines.join("\n")], {type:"text/plain"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aquawatch-${d.location.lat.toFixed(3)}-${d.location.lng.toFixed(3)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ─── History ──────────────────────────────────────────────────────────────────
function addToHistory(lat, lng, name, data) {
  const entry = {lat, lng, name: name||`${lat.toFixed(3)},${lng.toFixed(3)}`,
    label: data.classification.label, score: data.classification.score,
    color: data.classification.color, ts: data.timestamp};
  state.history.unshift(entry);
  if (state.history.length > 20) state.history.pop();
  localStorage.setItem("aw_history", JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  if (!state.history.length) { dom.historySection.style.display="none"; return; }
  dom.historySection.style.display="block";
  dom.historyList.innerHTML = state.history.map((h,i) =>
    `<div class="history-item" data-index="${i}" title="Click to re-select">
      <span class="history-dot" style="background:${h.color}"></span>
      <div class="history-body">
        <div class="history-name">${escHtml(h.name)}</div>
        <div class="history-time">${formatTimestamp(h.ts)}</div>
      </div>
      <span class="history-score" style="color:${h.color}">${h.score}</span>
    </div>`
  ).join("");
  dom.historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const h = state.history[parseInt(el.dataset.index)];
      setLocation(h.lat, h.lng, h.name);
      map.setView([h.lat,h.lng], 11);
      document.querySelector('[data-tab="map"]').click();
    });
  });
}

dom.btnClearHistory.addEventListener("click", () => {
  state.history = []; localStorage.removeItem("aw_history"); renderHistory();
});

// ─── Time-Series ──────────────────────────────────────────────────────────────
dom.btnTimeseries.addEventListener("click", runTimeseries);

async function runTimeseries() {
  const lat = state.selectedLat ?? parseFloat(dom.inputLat.value);
  const lng = state.selectedLng ?? parseFloat(dom.inputLng.value);
  if (isNaN(lat)||isNaN(lng)) { showToast("error","No Location","Select a location on the Map tab first."); return; }
  const months = parseInt(dom.monthsSelect.value, 10);

  dom.btnTimeseries.disabled = true;
  dom.analysisLoading.classList.remove("hidden");
  dom.analysisContent.classList.add("hidden");
  dom.analysisEmpty.classList.add("hidden");

  try {
    let data, demo = false;
    try {
      const r = await fetch(`${API_BASE_URL}/timeseries?lat=${lat}&lng=${lng}&months=${months}`, {signal:AbortSignal.timeout(60000)});
      if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||`HTTP ${r.status}`); }
      data = await r.json();
    } catch(e) { console.warn("Demo timeseries:", e.message); data = demoTimeseries(lat,lng,months); demo = true; }

    renderTimeseries(data, demo);
    dom.analysisContent.classList.remove("hidden");
    showToast("success",`${demo?"Demo — ":""}Time-Series Loaded`,`${data.data_points} monthly points · Trend: ${data.trend}`);
  } catch(e) {
    dom.analysisEmpty.classList.remove("hidden");
    showToast("error","Time-Series Failed", e.message);
  } finally {
    dom.btnTimeseries.disabled = false;
    dom.analysisLoading.classList.add("hidden");
  }
}

function renderTimeseries(data, demo=false) {
  const s = data.series;
  const scores = s.map(d=>d.score);
  const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : "N/A";
  const trendMap = {improving:"📈 Improving", degrading:"📉 Degrading", stable:"➡️ Stable"};
  dom.tsTrend.textContent = trendMap[data.trend]||data.trend;
  dom.tsPoints.textContent = data.data_points;
  dom.tsAvgScore.textContent = avgScore;
  const latest = s[s.length-1];
  dom.tsLatestStatus.textContent = latest ? latest.classification : "N/A";
  dom.tsLatestStatus.style.color = latest?.classification==="Safe"?"var(--safe)":latest?.classification==="Moderate"?"var(--moderate)":"var(--polluted)";

  const months = s.map(d=>d.month);
  const cfg = {responsive:true, displayModeBar:false};
  const layout = (yTitle, yRange) => ({
    paper_bgcolor:"transparent", plot_bgcolor:"transparent",
    font:{family:"Inter,sans-serif",color:"#94a3b8",size:11},
    margin:{t:10,r:10,b:40,l:50},
    xaxis:{gridcolor:"rgba(255,255,255,0.05)",linecolor:"rgba(255,255,255,0.1)",tickfont:{size:10},tickangle:-30},
    yaxis:{title:{text:yTitle,font:{size:10}},gridcolor:"rgba(255,255,255,0.05)",linecolor:"rgba(255,255,255,0.1)",range:yRange},
    hovermode:"x unified",
    hoverlabel:{bgcolor:"#162040",bordercolor:"rgba(255,255,255,0.1)",font:{color:"#e2e8f0",size:12}},
  });

  Plotly.newPlot("chart-ndwi",[{x:months,y:s.map(d=>d.ndwi),type:"scatter",mode:"lines+markers",name:"NDWI",
    line:{color:"#3b82f6",width:2.5,shape:"spline"},marker:{color:"#3b82f6",size:6},
    fill:"tozeroy",fillcolor:"rgba(59,130,246,0.1)",hovertemplate:"<b>%{x}</b><br>NDWI: %{y:.4f}<extra></extra>"}],
    layout("NDWI",[-0.5,1.0]),cfg);

  Plotly.newPlot("chart-ndti",[{x:months,y:s.map(d=>d.ndti),type:"scatter",mode:"lines+markers",name:"NDTI",
    line:{color:"#f39c12",width:2.5,shape:"spline"},marker:{color:"#f39c12",size:6},
    fill:"tozeroy",fillcolor:"rgba(243,156,18,0.1)",hovertemplate:"<b>%{x}</b><br>NDTI: %{y:.4f}<extra></extra>"}],
    layout("NDTI",[-0.3,0.5]),cfg);

  const scoreColors = s.map(d=>d.classification==="Safe"?"#27ae60":d.classification==="Moderate"?"#f39c12":"#e74c3c");
  Plotly.newPlot("chart-score",[{x:months,y:scores,type:"bar",name:"Score",
    marker:{color:scoreColors,opacity:0.85},hovertemplate:"<b>%{x}</b><br>Score: %{y}/100<extra></extra>"}],
    {...layout("Pollution Score (0–100)",[0,100]),
      shapes:[
        {type:"line",x0:0,x1:1,xref:"paper",y0:30,y1:30,line:{color:"#27ae60",width:1,dash:"dot"}},
        {type:"line",x0:0,x1:1,xref:"paper",y0:60,y1:60,line:{color:"#e74c3c",width:1,dash:"dot"}},
      ],
      annotations:[
        {x:1,xref:"paper",y:30,text:"Safe/Moderate",showarrow:false,font:{color:"#27ae60",size:9},xanchor:"right",yanchor:"bottom"},
        {x:1,xref:"paper",y:60,text:"Moderate/Polluted",showarrow:false,font:{color:"#e74c3c",size:9},xanchor:"right",yanchor:"bottom"},
      ]},cfg);
}

// ─── Compare ──────────────────────────────────────────────────────────────────
dom.btnRunCompare.addEventListener("click", runCompare);

async function runCompare() {
  const lat1 = parseFloat(dom.cmpLatA.value), lng1 = parseFloat(dom.cmpLngA.value);
  const lat2 = parseFloat(dom.cmpLatB.value), lng2 = parseFloat(dom.cmpLngB.value);
  if (isNaN(lat1)||isNaN(lng1)) { showToast("error","Location A Missing","Enter coordinates for Location A."); return; }
  if (isNaN(lat2)||isNaN(lng2)) { showToast("error","Location B Missing","Enter coordinates for Location B."); return; }

  dom.btnRunCompare.disabled = true;
  dom.compareLoading.classList.remove("hidden");
  dom.compareResults.classList.add("hidden");
  dom.compareEmpty.classList.add("hidden");

  try {
    let data, demo = false;
    try {
      const r = await fetch(`${API_BASE_URL}/compare?lat1=${lat1}&lng1=${lng1}&lat2=${lat2}&lng2=${lng2}`,{signal:AbortSignal.timeout(60000)});
      if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||`HTTP ${r.status}`); }
      data = await r.json();
    } catch(e) { console.warn("Demo compare:", e.message); data = demoCompare(lat1,lng1,lat2,lng2); demo = true; }

    renderCompare(data, dom.cmpNameA.textContent||`${lat1.toFixed(3)},${lng1.toFixed(3)}`,
                       dom.cmpNameB.textContent||`${lat2.toFixed(3)},${lng2.toFixed(3)}`, demo);
    dom.compareResults.classList.remove("hidden");
    showToast("success",`${demo?"Demo — ":""}Comparison Complete`,`Winner: Location ${data.winner} · Diff: ${data.score_diff} pts`);
  } catch(e) {
    dom.compareEmpty.classList.remove("hidden");
    showToast("error","Comparison Failed", e.message);
  } finally {
    dom.btnRunCompare.disabled = false;
    dom.compareLoading.classList.add("hidden");
  }
}

function renderCompare(data, nameA, nameB, demo=false) {
  const a = data.location_a, b = data.location_b;
  const clsA = a.classification, clsB = b.classification;
  const lcA = clsA.label.toLowerCase(), lcB = clsB.label.toLowerCase();

  // Name headers
  dom.cmpCardNameA.textContent = nameA; dom.cmpCardNameB.textContent = nameB;
  dom.thNameA.textContent = nameA; dom.thNameB.textContent = nameB;

  // Update maps
  initCompareMaps();
  updateCompareMap(data.location_a.lat, data.location_a.lng, nameA, 'A');
  updateCompareMap(data.location_b.lat, data.location_b.lng, nameB, 'B');

  // Score cards
  dom.cmpScoreA.textContent = clsA.score; dom.cmpScoreA.style.color = clsA.color;
  dom.cmpScoreB.textContent = clsB.score; dom.cmpScoreB.style.color = clsB.color;
  dom.cmpLabelA.innerHTML = `<span class="result-label ${lcA}">${clsA.label}</span>`;
  dom.cmpLabelB.innerHTML = `<span class="result-label ${lcB}">${clsB.label}</span>`;
  dom.cmpConfA.textContent = `Confidence: ${a.confidence.level}`;
  dom.cmpConfB.textContent = `Confidence: ${b.confidence.level}`;

  // Winner highlight
  dom.cmpCardA.classList.toggle("is-winner", data.winner==="A");
  dom.cmpCardB.classList.toggle("is-winner", data.winner==="B");
  dom.cmpWinnerBadge.innerHTML = `<span class="winner-crown">🏆</span><span>Location ${data.winner} is cleaner</span>`;

  // Comparison table
  const rows = [
    {metric:"Pollution Score", a:clsA.score, b:clsB.score, unit:"", higherIsBetter:false},
    {metric:"NDWI (Water Clarity)", a:a.indices.ndwi, b:b.indices.ndwi, unit:"", higherIsBetter:true},
    {metric:"NDTI (Turbidity)", a:a.indices.ndti, b:b.indices.ndti, unit:"", higherIsBetter:false},
    {metric:"FAI (Algae)", a:a.indices.fai, b:b.indices.fai, unit:"", higherIsBetter:false},
    {metric:"Images Used", a:a.images_used, b:b.images_used, unit:"", higherIsBetter:true},
    {metric:"Cloud Cover", a:a.cloud_cover_pct, b:b.cloud_cover_pct, unit:"%", higherIsBetter:false},
    {metric:"Status", a:clsA.label, b:clsB.label, unit:"", isText:true},
    {metric:"Confidence", a:a.confidence.level, b:b.confidence.level, unit:"", isText:true},
  ];

  dom.compareTableBody.innerHTML = rows.map(row => {    let diffCell = "—", aClass = "", bClass = "";
    if (!row.isText) {
      const diff = parseFloat((row.a - row.b).toFixed(4));
      const better = row.higherIsBetter ? diff > 0 : diff < 0;
      const worse  = row.higherIsBetter ? diff < 0 : diff > 0;
      diffCell = `<span style="color:${diff===0?"var(--text-muted)":better?"var(--safe)":"var(--polluted)"}">${diff>0?"+":""}${diff}</span>`;
      aClass = better?"td-better":worse?"td-worse":"";
      bClass = worse?"td-better":better?"td-worse":"";
    }
    const fmtVal = v => typeof v === "number" ? (Math.abs(v)<0.001?v.toFixed(6):v.toFixed(4)) : v;
    return `<tr>
      <td class="td-metric">${row.metric}</td>
      <td class="${aClass}">${fmtVal(row.a)}${row.unit}</td>
      <td class="${bClass}">${fmtVal(row.b)}${row.unit}</td>
      <td>${diffCell}</td>
    </tr>`;
  }).join("");

  // Charts
  const cfg = {responsive:true,displayModeBar:false};
  const chartLayout = title => ({
    paper_bgcolor:"transparent",plot_bgcolor:"transparent",
    font:{family:"Inter,sans-serif",color:"#94a3b8",size:11},
    margin:{t:30,r:20,b:40,l:50},
    title:{text:title,font:{size:13,color:"#e2e8f0"},x:0},
    legend:{font:{color:"#94a3b8"},bgcolor:"transparent"},
    hovermode:"closest",
    hoverlabel:{bgcolor:"#162040",bordercolor:"rgba(255,255,255,0.1)",font:{color:"#e2e8f0",size:12}},
  });

  // Score bar chart
  Plotly.newPlot("cmp-chart-score",[
    {x:[nameA], y:[clsA.score], type:"bar", name:nameA, marker:{color:clsA.color,opacity:0.85},
     hovertemplate:`<b>${nameA}</b><br>Score: %{y}/100<extra></extra>`},
    {x:[nameB], y:[clsB.score], type:"bar", name:nameB, marker:{color:clsB.color,opacity:0.85},
     hovertemplate:`<b>${nameB}</b><br>Score: %{y}/100<extra></extra>`},
  ],{...chartLayout("Pollution Score Comparison"),
    yaxis:{range:[0,100],gridcolor:"rgba(255,255,255,0.05)",linecolor:"rgba(255,255,255,0.1)"},
    xaxis:{gridcolor:"rgba(255,255,255,0.05)",linecolor:"rgba(255,255,255,0.1)"},
    barmode:"group"},cfg);

  // Radar chart
  const categories = ["NDWI","NDTI (inv)","FAI (inv)","Score (inv)"];
  const normA = [
    Math.max(0,Math.min(1,(a.indices.ndwi)/0.8)),
    1-Math.max(0,Math.min(1,(a.indices.ndti+0.2)/0.6)),
    1-Math.max(0,Math.min(1,(a.indices.fai+0.05)/0.1)),
    1-(clsA.score/100),
  ];
  const normB = [
    Math.max(0,Math.min(1,(b.indices.ndwi)/0.8)),
    1-Math.max(0,Math.min(1,(b.indices.ndti+0.2)/0.6)),
    1-Math.max(0,Math.min(1,(b.indices.fai+0.05)/0.1)),
    1-(clsB.score/100),
  ];
  Plotly.newPlot("cmp-chart-radar",[
    {type:"scatterpolar",r:[...normA,normA[0]],theta:[...categories,categories[0]],fill:"toself",
     name:nameA,line:{color:"#3b82f6"},fillcolor:"rgba(59,130,246,0.15)"},
    {type:"scatterpolar",r:[...normB,normB[0]],theta:[...categories,categories[0]],fill:"toself",
     name:nameB,line:{color:"#f39c12"},fillcolor:"rgba(243,156,18,0.15)"},
  ],{...chartLayout("Water Quality Radar (higher = better)"),
    polar:{radialaxis:{visible:true,range:[0,1],gridcolor:"rgba(255,255,255,0.1)",linecolor:"rgba(255,255,255,0.1)"},
           angularaxis:{gridcolor:"rgba(255,255,255,0.1)",linecolor:"rgba(255,255,255,0.1)"},
           bgcolor:"transparent"}},cfg);

  // Insights
  dom.insightsList.innerHTML = data.insights.map(i=>`<li>${escHtml(i)}</li>`).join("");
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
dom.btnCheckAlerts.addEventListener("click", runAlerts);

async function runAlerts() {
  const lat = state.selectedLat ?? parseFloat(dom.inputLat.value);
  const lng = state.selectedLng ?? parseFloat(dom.inputLng.value);
  if (isNaN(lat)||isNaN(lng)) { showToast("error","No Location","Select a location on the Map tab first."); return; }

  dom.btnCheckAlerts.disabled = true;
  dom.alertsLoading.classList.remove("hidden");
  dom.alertsContent.classList.add("hidden");
  dom.alertsEmpty.classList.add("hidden");
  dom.alertBanner.classList.add("hidden");

  try {
    let data, demo = false;
    try {
      const r = await fetch(`${API_BASE_URL}/alerts?lat=${lat}&lng=${lng}`,{signal:AbortSignal.timeout(30000)});
      if (!r.ok) { const e = await r.json().catch(()=>({detail:r.statusText})); throw new Error(e.detail||`HTTP ${r.status}`); }
      data = await r.json();
    } catch(e) { console.warn("Demo alerts:", e.message); data = demoAlerts(lat,lng); demo = true; }

    renderAlerts(data, demo);
    dom.alertsContent.classList.remove("hidden");
  } catch(e) {
    dom.alertsEmpty.classList.remove("hidden");
    showToast("error","Alert Check Failed", e.message);
  } finally {
    dom.btnCheckAlerts.disabled = false;
    dom.alertsLoading.classList.add("hidden");
  }
}

function renderAlerts(data, demo=false) {
  const lc = data.alert_level.toLowerCase();
  const icons = {safe:"✅",moderate:"⚠️",polluted:"🚨"};

  // Banner
  dom.alertBanner.className = `alert-banner ${lc}`;
  dom.alertBanner.innerHTML = `<span style="font-size:1.5rem">${icons[lc]||"ℹ️"}</span>
    <div><strong>${data.alert_level} — Severity: ${data.severity}</strong><br>
    Score: ${data.pollution_score}/100 · Confidence: ${data.confidence.level}${demo?" (demo)":""}</div>`;
  dom.alertBanner.classList.remove("hidden");

  // Triggered alerts
  if (data.triggered_alerts?.length) {
    dom.triggeredSection.classList.remove("hidden");
    dom.triggeredList.innerHTML = data.triggered_alerts.map(t =>
      `<div class="triggered-alert-item severity-${t.severity.toLowerCase()}">
        <span class="ta-icon">⚡</span>
        <div class="ta-body">
          <strong>${t.type}</strong>
          <span>${t.index}: <strong>${t.value}</strong> (threshold: ${t.threshold})</span>
          ${t.detail ? `<span style="margin-top:2px;opacity:1;color:var(--text-secondary)">${t.detail}</span>` : ""}
        </div>
        <span class="ta-severity">${t.severity}</span>
      </div>`
    ).join("");
  } else {
    dom.triggeredSection.classList.add("hidden");
  }

  // Status display
  dom.alertStatusDisplay.innerHTML = `
    <span class="alert-status-badge ${lc}">${data.alert_level}</span>
    <div style="font-size:2rem;font-weight:700;color:${data.alert_color}">${data.pollution_score}<span style="font-size:1rem;color:var(--text-muted)">/100</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted)">Pollution Score</div>`;

  dom.alertFactorsList.innerHTML = data.factors.length
    ? data.factors.map(f=>`<li>${f}</li>`).join("")
    : `<li style="color:var(--text-muted)">No significant factors detected.</li>`;

  dom.alertRecommendations.innerHTML = data.recommendations.map(r=>`<li>${r}</li>`).join("");

  dom.alertNdwi.textContent     = data.indices.ndwi.toFixed(4);
  dom.alertNdti.textContent     = data.indices.ndti.toFixed(4);
  dom.alertFai.textContent      = data.indices.fai.toFixed(6);
  dom.alertScoreVal.textContent = data.pollution_score;
  dom.alertConfidence.textContent = data.confidence.level;
  dom.alertConfidence.style.color = data.confidence.level==="High"?"var(--safe)":data.confidence.level==="Medium"?"var(--moderate)":"var(--polluted)";

  dom.alertTimestamp.textContent = `Last checked: ${formatTimestamp(data.timestamp)}`;
  updateAlertBadge(data.alert_level);

  // Possible Pollution Sources (NEW) - in Alerts tab
  if (data.pollution_sources) {
    const ps = data.pollution_sources;
    const alertSourcesEl = document.getElementById('alert-pollution-sources');
    if (alertSourcesEl) {
      alertSourcesEl.innerHTML = `
        <div class="sources-confidence">Confidence: <strong>${escHtml(ps.confidence)}</strong></div>
        ${ps.possible_sources.map(source => `
          <div class="source-item">
            <div class="source-header">
              <span class="source-name">${escHtml(source.source)}</span>
              <span class="source-likelihood likelihood-${source.likelihood.toLowerCase()}">${escHtml(source.likelihood)}</span>
            </div>
            <p class="source-reasoning">${escHtml(source.reasoning)}</p>
            <div class="source-indicators">
              ${source.indicators.map(ind => `<span class="indicator-tag">${escHtml(ind)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
        <p class="sources-disclaimer"><i class="fa-solid fa-shield-halved"></i> ${escHtml(ps.disclaimer)}</p>
      `;
    }
  }

  // Data Reliability (NEW) - in Alerts tab
  if (data.data_reliability) {
    const dr = data.data_reliability;
    const alertReliabilityEl = document.getElementById('alert-data-reliability');
    if (alertReliabilityEl) {
      const confColor = dr.confidence_level==="High"?"#27ae60":dr.confidence_level==="Medium"?"#f39c12":"#e74c3c";
      alertReliabilityEl.innerHTML = `
        <div class="reliability-grid">
          <div class="reliability-item">
            <div class="reliability-label">Images Used</div>
            <div class="reliability-value">${dr.images_used}</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Cloud Cover</div>
            <div class="reliability-value">${dr.cloud_cover_pct}%</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Valid Pixels</div>
            <div class="reliability-value">${dr.valid_pixels.toLocaleString()}</div>
          </div>
          <div class="reliability-item">
            <div class="reliability-label">Confidence</div>
            <div class="reliability-value" style="color:${confColor}">${dr.confidence_level}</div>
          </div>
        </div>
        <div class="reliability-score-bar">
          <div class="reliability-score-fill" style="width:${dr.confidence_score}%;background:${confColor}"></div>
        </div>
        <p class="reliability-note">${escHtml(dr.reliability_note)}</p>
      `;
    }
  }
}

// ─── API Health ───────────────────────────────────────────────────────────────
async function checkHealth() {
  dom.apiDot.className = "status-dot loading";
  dom.apiText.textContent = "Connecting…";
  try {
    const r = await fetch(`${API_BASE_URL}/health`, {signal:AbortSignal.timeout(8000)});
    if (r.ok) {
      dom.apiDot.className = "status-dot online"; dom.apiText.textContent = "API Online";
      if (_apiWasOnline===false) showToast("success","Backend Connected","Live GEE satellite data is now available.",3000);
      _apiWasOnline = true;
    } else throw new Error();
  } catch {
    dom.apiDot.className = "status-dot offline"; dom.apiText.textContent = "Demo Mode";
    _apiWasOnline = false;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS = {success:"✅",warning:"⚠️",error:"❌",info:"ℹ️"};

function showToast(type, title, message, duration=5000) {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.setAttribute("role","alert");
  t.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type]||"ℹ️"}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message?`<div class="toast-message">${escHtml(message)}</div>`:""}
    </div>
    <button class="toast-close" type="button">✕</button>`;
  const dismiss = () => {
    t.style.opacity="0"; t.style.transform="translateX(110%)";
    t.style.transition="opacity 200ms ease,transform 200ms ease";
    setTimeout(()=>{ if(t.parentNode) t.parentNode.removeChild(t); },220);
  };
  t.querySelector(".toast-close").addEventListener("click", dismiss);
  if (duration>0) setTimeout(dismiss, duration);
  dom.toastContainer.appendChild(t);
}

// ─── Search ───────────────────────────────────────────────────────────────────
let _searchAbort = null, _focusIdx = -1, _searchResults = [];

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

function getIcon(type, cls) {
  const t=(type||"").toLowerCase(), c=(cls||"").toLowerCase();
  if (["river","stream","canal","waterway"].some(k=>t.includes(k)||c.includes(k))) return "🌊";
  if (["lake","reservoir","pond","lagoon"].some(k=>t.includes(k)||c.includes(k))) return "💧";
  if (["sea","ocean","bay","gulf"].some(k=>t.includes(k)||c.includes(k))) return "🌊";
  if (["city","town","village"].some(k=>t.includes(k)||c.includes(k))) return "🏙️";
  return "📍";
}

async function geocode(q) {
  if (q.length<2) { hideSearch(); return; }
  if (_searchAbort) _searchAbort.abort();
  _searchAbort = new AbortController();
  dom.searchSpinner.classList.remove("hidden"); dom.searchClear.classList.add("hidden");
  try {
    const url = `https://nominatim.openstreetmap.org/search?`+new URLSearchParams({q,format:"json",limit:8,addressdetails:1});
    const r = await fetch(url,{signal:_searchAbort.signal,headers:{"Accept-Language":"en"}});
    if (!r.ok) throw new Error();
    renderSearch(await r.json(), q);
  } catch(e) {
    if (e.name==="AbortError") return;
    dom.searchResults.innerHTML=`<li class="search-no-results"><i class="fa-solid fa-triangle-exclamation"></i> Search unavailable</li>`;
    showSearch();
  } finally {
    dom.searchSpinner.classList.add("hidden");
    if (dom.searchInput.value.trim()) dom.searchClear.classList.remove("hidden");
  }
}

function renderSearch(results, q) {
  _searchResults = results; _focusIdx = -1;
  if (!results.length) {
    dom.searchResults.innerHTML=`<li class="search-no-results"><i class="fa-solid fa-droplet-slash"></i> No results for "${escHtml(q)}"</li>`;
    showSearch(); return;
  }
  dom.searchResults.innerHTML = "";
  results.forEach((r,i) => {
    const icon = getIcon(r.type,r.class);
    const name = r.name||r.display_name.split(",")[0];
    const detail = r.display_name.replace(name+", ","").slice(0,80);
    const li = document.createElement("li");
    li.className="search-result-item"; li.setAttribute("role","option"); li.dataset.index=i;
    li.innerHTML=`<span class="search-result-icon">${icon}</span>
      <span class="search-result-body">
        <span class="search-result-name">${escHtml(name)}</span>
        <span class="search-result-detail">${escHtml(detail)}</span>
      </span>
      <span class="search-result-coords">${parseFloat(r.lat).toFixed(3)}, ${parseFloat(r.lon).toFixed(3)}</span>`;
    li.addEventListener("mousedown", e => { e.preventDefault(); selectResult(r); });
    dom.searchResults.appendChild(li);
  });
  showSearch();
}

function selectResult(r) {
  const lat=parseFloat(r.lat), lng=parseFloat(r.lon);
  const name=r.name||r.display_name.split(",")[0];
  dom.searchInput.value=name; dom.searchClear.classList.remove("hidden"); hideSearch();
  setLocation(lat,lng,name);
  if (r.boundingbox) { const [s,n,w,e]=r.boundingbox.map(Number); map.fitBounds([[s,w],[n,e]],{padding:[40,40],maxZoom:14}); }
  else map.setView([lat,lng],12);
}

function showSearch() { dom.searchResults.classList.remove("hidden"); dom.searchInput.setAttribute("aria-expanded","true"); }
function hideSearch() { dom.searchResults.classList.add("hidden"); dom.searchInput.setAttribute("aria-expanded","false"); _focusIdx=-1; }

dom.searchInput.addEventListener("input", debounce(e => {
  const q=e.target.value.trim();
  if (q) { dom.searchClear.classList.remove("hidden"); geocode(q); }
  else { dom.searchClear.classList.add("hidden"); hideSearch(); }
},350));

dom.searchInput.addEventListener("keydown", e => {
  const items=dom.searchResults.querySelectorAll(".search-result-item");
  if (!items.length) return;
  if (e.key==="ArrowDown") { e.preventDefault(); _focusIdx=Math.min(_focusIdx+1,items.length-1); items.forEach((el,i)=>el.classList.toggle("focused",i===_focusIdx)); }
  else if (e.key==="ArrowUp") { e.preventDefault(); _focusIdx=Math.max(_focusIdx-1,0); items.forEach((el,i)=>el.classList.toggle("focused",i===_focusIdx)); }
  else if (e.key==="Enter") { e.preventDefault(); if (_focusIdx>=0&&_searchResults[_focusIdx]) selectResult(_searchResults[_focusIdx]); else if (_searchResults.length) selectResult(_searchResults[0]); }
  else if (e.key==="Escape") { hideSearch(); dom.searchInput.blur(); }
});

dom.searchInput.addEventListener("blur", () => setTimeout(hideSearch,150));
dom.searchClear.addEventListener("click", () => { dom.searchInput.value=""; dom.searchClear.classList.add("hidden"); hideSearch(); dom.searchInput.focus(); });
document.addEventListener("click", e => { if (!e.target.closest(".map-search-bar")) hideSearch(); });

// ─── Compare Tab Search ───────────────────────────────────────────────────────
let _cmpSearchAbortA = null, _cmpSearchAbortB = null;
let _cmpFocusIdxA = -1, _cmpFocusIdxB = -1;
let _cmpSearchResultsA = [], _cmpSearchResultsB = [];

async function geocodeCompare(q, location) {
  const isA = location === 'A';
  const searchInput = isA ? dom.cmpSearchA : dom.cmpSearchB;
  const searchResults = isA ? dom.cmpSearchResultsA : dom.cmpSearchResultsB;
  const searchSpinner = isA ? dom.cmpSearchSpinnerA : dom.cmpSearchSpinnerB;
  const searchClear = isA ? dom.cmpSearchClearA : dom.cmpSearchClearB;
  const abortController = isA ? _cmpSearchAbortA : _cmpSearchAbortB;
  
  if (q.length < 2) { 
    searchResults.classList.add("hidden"); 
    searchInput.setAttribute("aria-expanded", "false");
    return; 
  }
  
  if (abortController) abortController.abort();
  const newAbort = new AbortController();
  if (isA) _cmpSearchAbortA = newAbort;
  else _cmpSearchAbortB = newAbort;
  
  searchSpinner.classList.remove("hidden");
  searchClear.classList.add("hidden");
  
  try {
    const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({q, format: "json", limit: 8, addressdetails: 1});
    const r = await fetch(url, {signal: newAbort.signal, headers: {"Accept-Language": "en"}});
    if (!r.ok) throw new Error();
    const results = await r.json();
    renderCompareSearch(results, q, location);
  } catch(e) {
    if (e.name === "AbortError") return;
    searchResults.innerHTML = `<li class="search-no-results"><i class="fa-solid fa-triangle-exclamation"></i> Search unavailable</li>`;
    searchResults.classList.remove("hidden");
    searchInput.setAttribute("aria-expanded", "true");
  } finally {
    searchSpinner.classList.add("hidden");
    if (searchInput.value.trim()) searchClear.classList.remove("hidden");
  }
}

function renderCompareSearch(results, q, location) {
  const isA = location === 'A';
  const searchResults = isA ? dom.cmpSearchResultsA : dom.cmpSearchResultsB;
  const searchInput = isA ? dom.cmpSearchA : dom.cmpSearchB;
  
  if (isA) {
    _cmpSearchResultsA = results;
    _cmpFocusIdxA = -1;
  } else {
    _cmpSearchResultsB = results;
    _cmpFocusIdxB = -1;
  }
  
  if (!results.length) {
    searchResults.innerHTML = `<li class="search-no-results"><i class="fa-solid fa-droplet-slash"></i> No results for "${escHtml(q)}"</li>`;
    searchResults.classList.remove("hidden");
    searchInput.setAttribute("aria-expanded", "true");
    return;
  }
  
  searchResults.innerHTML = "";
  results.forEach((r, i) => {
    const icon = getIcon(r.type, r.class);
    const name = r.name || r.display_name.split(",")[0];
    const detail = r.display_name.replace(name + ", ", "").slice(0, 80);
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.setAttribute("role", "option");
    li.dataset.index = i;
    li.innerHTML = `<span class="search-result-icon">${icon}</span>
      <span class="search-result-body">
        <span class="search-result-name">${escHtml(name)}</span>
        <span class="search-result-detail">${escHtml(detail)}</span>
      </span>
      <span class="search-result-coords">${parseFloat(r.lat).toFixed(3)}, ${parseFloat(r.lon).toFixed(3)}</span>`;
    li.addEventListener("mousedown", e => { e.preventDefault(); selectCompareResult(r, location); });
    searchResults.appendChild(li);
  });
  
  searchResults.classList.remove("hidden");
  searchInput.setAttribute("aria-expanded", "true");
}

function selectCompareResult(r, location) {
  const isA = location === 'A';
  const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  const name = r.name || r.display_name.split(",")[0];
  
  if (isA) {
    dom.cmpSearchA.value = name;
    dom.cmpSearchClearA.classList.remove("hidden");
    dom.cmpSearchResultsA.classList.add("hidden");
    dom.cmpSearchA.setAttribute("aria-expanded", "false");
    dom.cmpLatA.value = lat.toFixed(5);
    dom.cmpLngA.value = lng.toFixed(5);
    dom.cmpNameA.textContent = name;
  } else {
    dom.cmpSearchB.value = name;
    dom.cmpSearchClearB.classList.remove("hidden");
    dom.cmpSearchResultsB.classList.add("hidden");
    dom.cmpSearchB.setAttribute("aria-expanded", "false");
    dom.cmpLatB.value = lat.toFixed(5);
    dom.cmpLngB.value = lng.toFixed(5);
    dom.cmpNameB.textContent = name;
  }
}

// Search input handlers for Location A
function initCompareSearchHandlers() {
  if (!dom.cmpSearchA || !dom.cmpSearchB) {
    setTimeout(initCompareSearchHandlers, 500);
    return;
  }

  // Location A handlers
  dom.cmpSearchA.addEventListener("input", debounce(e => {
    const q = e.target.value.trim();
    if (q) {
      dom.cmpSearchClearA.classList.remove("hidden");
      geocodeCompare(q, 'A');
    } else {
      dom.cmpSearchClearA.classList.add("hidden");
      dom.cmpSearchResultsA.classList.add("hidden");
      dom.cmpSearchA.setAttribute("aria-expanded", "false");
    }
  }, 350));

  dom.cmpSearchA.addEventListener("keydown", e => {
    const items = dom.cmpSearchResultsA.querySelectorAll(".search-result-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _cmpFocusIdxA = Math.min(_cmpFocusIdxA + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle("focused", i === _cmpFocusIdxA));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _cmpFocusIdxA = Math.max(_cmpFocusIdxA - 1, 0);
      items.forEach((el, i) => el.classList.toggle("focused", i === _cmpFocusIdxA));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (_cmpFocusIdxA >= 0 && _cmpSearchResultsA[_cmpFocusIdxA]) selectCompareResult(_cmpSearchResultsA[_cmpFocusIdxA], 'A');
      else if (_cmpSearchResultsA.length) selectCompareResult(_cmpSearchResultsA[0], 'A');
    } else if (e.key === "Escape") {
      dom.cmpSearchResultsA.classList.add("hidden");
      dom.cmpSearchA.setAttribute("aria-expanded", "false");
      dom.cmpSearchA.blur();
    }
  });

  dom.cmpSearchA.addEventListener("blur", () => setTimeout(() => {
    dom.cmpSearchResultsA.classList.add("hidden");
    dom.cmpSearchA.setAttribute("aria-expanded", "false");
  }, 150));

  dom.cmpSearchClearA.addEventListener("click", () => {
    dom.cmpSearchA.value = "";
    dom.cmpSearchClearA.classList.add("hidden");
    dom.cmpSearchResultsA.classList.add("hidden");
    dom.cmpSearchA.setAttribute("aria-expanded", "false");
    dom.cmpSearchA.focus();
  });

  // Location B handlers
  dom.cmpSearchB.addEventListener("input", debounce(e => {
    const q = e.target.value.trim();
    if (q) {
      dom.cmpSearchClearB.classList.remove("hidden");
      geocodeCompare(q, 'B');
    } else {
      dom.cmpSearchClearB.classList.add("hidden");
      dom.cmpSearchResultsB.classList.add("hidden");
      dom.cmpSearchB.setAttribute("aria-expanded", "false");
    }
  }, 350));

  dom.cmpSearchB.addEventListener("keydown", e => {
    const items = dom.cmpSearchResultsB.querySelectorAll(".search-result-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _cmpFocusIdxB = Math.min(_cmpFocusIdxB + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle("focused", i === _cmpFocusIdxB));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _cmpFocusIdxB = Math.max(_cmpFocusIdxB - 1, 0);
      items.forEach((el, i) => el.classList.toggle("focused", i === _cmpFocusIdxB));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (_cmpFocusIdxB >= 0 && _cmpSearchResultsB[_cmpFocusIdxB]) selectCompareResult(_cmpSearchResultsB[_cmpFocusIdxB], 'B');
      else if (_cmpSearchResultsB.length) selectCompareResult(_cmpSearchResultsB[0], 'B');
    } else if (e.key === "Escape") {
      dom.cmpSearchResultsB.classList.add("hidden");
      dom.cmpSearchB.setAttribute("aria-expanded", "false");
      dom.cmpSearchB.blur();
    }
  });

  dom.cmpSearchB.addEventListener("blur", () => setTimeout(() => {
    dom.cmpSearchResultsB.classList.add("hidden");
    dom.cmpSearchB.setAttribute("aria-expanded", "false");
  }, 150));

  dom.cmpSearchClearB.addEventListener("click", () => {
    dom.cmpSearchB.value = "";
    dom.cmpSearchClearB.classList.add("hidden");
    dom.cmpSearchResultsB.classList.add("hidden");
    dom.cmpSearchB.setAttribute("aria-expanded", "false");
    dom.cmpSearchB.focus();
  });
}

// Initialize search handlers (call once on page load)

// ─── Compare Maps ─────────────────────────────────────────────────────────────
function initCompareMaps() {
  if (!state.compareMapA) {
    state.compareMapA = L.map("cmp-map-a", {center: [20, 0], zoom: 3, zoomControl: true});
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {attribution: "Tiles © Esri", maxZoom: 19}).addTo(state.compareMapA);
  }
  if (!state.compareMapB) {
    state.compareMapB = L.map("cmp-map-b", {center: [20, 0], zoom: 3, zoomControl: true});
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {attribution: "Tiles © Esri", maxZoom: 19}).addTo(state.compareMapB);
  }
  setTimeout(() => {
    state.compareMapA.invalidateSize();
    state.compareMapB.invalidateSize();
  }, 100);
}

function updateCompareMap(lat, lng, name, location) {
  const isA = location === 'A';
  const mapInstance = isA ? state.compareMapA : state.compareMapB;
  
  if (!mapInstance) return;
  
  // Remove old marker
  if (isA && state.compareMarkerA) {
    mapInstance.removeLayer(state.compareMarkerA);
  } else if (!isA && state.compareMarkerB) {
    mapInstance.removeLayer(state.compareMarkerB);
  }
  
  // Add new marker
  const marker = L.circleMarker([lat, lng], {
    radius: 10,
    color: "#fff",
    fillColor: isA ? "#3b82f6" : "#f39c12",
    fillOpacity: 0.95,
    weight: 3
  }).addTo(mapInstance);
  
  marker.bindPopup(
    `<div style="font-size:13px;line-height:1.6;min-width:140px">
      <strong style="color:${isA ? '#3b82f6' : '#f39c12'}">📍 ${escHtml(name)}</strong><br>
      <span style="color:#94a3b8">Lat:</span> ${lat.toFixed(5)}<br>
      <span style="color:#94a3b8">Lng:</span> ${lng.toFixed(5)}
    </div>`
  );
  
  if (isA) {
    state.compareMarkerA = marker;
    dom.cmpMapNameA.textContent = name;
  } else {
    state.compareMarkerB = marker;
    dom.cmpMapNameB.textContent = name;
  }
  
  mapInstance.setView([lat, lng], 11);
}

// Map maximize handlers
dom.cmpMapMaximizeA.addEventListener("click", () => {
  const mapCard = dom.cmpMapMaximizeA.closest(".cmp-map-card");
  mapCard.classList.toggle("maximized");
  const icon = dom.cmpMapMaximizeA.querySelector("i");
  if (mapCard.classList.contains("maximized")) {
    icon.className = "fa-solid fa-compress";
    dom.cmpMapMaximizeA.title = "Minimize map";
  } else {
    icon.className = "fa-solid fa-expand";
    dom.cmpMapMaximizeA.title = "Maximize map";
  }
  setTimeout(() => state.compareMapA?.invalidateSize(), 100);
});

dom.cmpMapMaximizeB.addEventListener("click", () => {
  const mapCard = dom.cmpMapMaximizeB.closest(".cmp-map-card");
  mapCard.classList.toggle("maximized");
  const icon = dom.cmpMapMaximizeB.querySelector("i");
  if (mapCard.classList.contains("maximized")) {
    icon.className = "fa-solid fa-compress";
    dom.cmpMapMaximizeB.title = "Minimize map";
  } else {
    icon.className = "fa-solid fa-expand";
    dom.cmpMapMaximizeB.title = "Maximize map";
  }
  setTimeout(() => state.compareMapB?.invalidateSize(), 100);
});

// Initialize maps when compare tab is opened
document.querySelector('[data-tab="compare"]').addEventListener("click", () => {
  setTimeout(() => {
    initCompareMaps();
  }, 100);
});

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  const d=document.createElement("div"); d.appendChild(document.createTextNode(String(str))); return d.innerHTML;
}

function formatTimestamp(ts) {
  if (!ts) return "Unknown";
  try {
    const d = new Date(ts.endsWith("Z")||ts.includes("+") ? ts : ts+"Z");
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
  } catch { return ts; }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  checkHealth();
  setInterval(checkHealth, 60000);
  setTimeout(() => map.invalidateSize(), 300);
  renderHistory();
  initCompareSearchHandlers();
})();
