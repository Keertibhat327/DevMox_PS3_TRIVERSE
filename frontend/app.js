/**
 * AquaWatch v2 — Frontend Application
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
  return {
    location: {lat, lng}, aoi_buffer_m: 5000,
    date_range: {start: fmt(start), end: fmt(today)},
    images_used: 5 + Math.round(s*10), cloud_cover_pct: Math.round(s*15),
    indices: {ndwi, ndti, fai},
    classification: {label, score, color, factors,
      contributions: {"Turbidity (NDTI)": parseFloat((0.45*Math.max(0,(ndti+0.2)/0.6)*100).toFixed(1)),
                      "Algal Activity (FAI)": parseFloat((0.35*Math.max(0,(fai+0.05)/0.1)*100).toFixed(1)),
                      "Water Clarity (NDWI)": parseFloat((0.20*(1-Math.max(0,Math.min(1,ndwi/0.8)))*100).toFixed(1))},
      dominant: "Turbidity (NDTI)", weights: {ndti:0.45,fai:0.35,ndwi:0.20}},
    confidence: {level: s > 0.5 ? "High" : "Medium", score: s > 0.5 ? 80 : 55, reason: "Demo mode — simulated data"},
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
    triggered_alerts:triggered,recommendations:recs,timestamp:new Date().toISOString(),_demo:true};
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

const overlayState = {rgb: true, ndwi: false, pollution: false};
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
  showPollutionRect(false);
}

function addTileLayer(url, name) {
  if (!url) return;
  const l = L.tileLayer(url, {opacity:0.85, attribution:"GEE / Sentinel-2", maxZoom:18});
  state.layers[name] = l;
  if (overlayState[name] ?? true) map.addLayer(l);
}

dom.layerRgb.addEventListener("change",       () => { overlayState.rgb       = dom.layerRgb.checked;       syncOverlays(); });
dom.layerNdwi.addEventListener("change",      () => { overlayState.ndwi      = dom.layerNdwi.checked;      syncOverlays(); });
dom.layerPollution.addEventListener("change", () => { overlayState.pollution  = dom.layerPollution.checked; syncOverlays();
  if (dom.layerPollution.checked && !state.lastAnalysis) showToast("warning","No Analysis Yet","Run an analysis first.",3000);
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

  dom.resultImages.textContent = `📡 ${data.images_used} images · ☁️ ${data.cloud_cover_pct}% cloud${demo?" (demo)":""}`;
  dom.resultDates.textContent  = `📅 ${data.date_range.start} → ${data.date_range.end}`;
  dom.resultTs.textContent     = `🕐 ${formatTimestamp(data.timestamp)}`;

  dom.resultCard.classList.remove("hidden");
}

function updateAlertBadge(label) {
  if (label==="Polluted") { dom.alertBadge.textContent="!"; dom.alertBadge.classList.remove("hidden"); }
  else if (label==="Moderate") { dom.alertBadge.textContent="~"; dom.alertBadge.classList.remove("hidden"); }
  else dom.alertBadge.classList.add("hidden");
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
    "AquaWatch — Water Quality Analysis Report",
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
