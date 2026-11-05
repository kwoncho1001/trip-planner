/**
 * Asia trip planner v4 - Map pane
 * docs/plans/completed/2026-11-01_ui-i1-map.md
 */

const PALETTE = ["#f6d8a8", "#cfe6b8", "#f3c4c4", "#c9d9f0", "#e6d3ef", "#f7efb0"];

// Pale tint per country; provinces and smaller areas get no fill
const COUNTRY_PALETTE = {
  CHN: "#f1e2c4",
  HKG: "#f1e2c4",
  MAC: "#f1e2c4",
  VNM: "#dcebcf",
  LAO: "#f2c2c2",
  KHM: "#d6e3f1",
  THA: "#e5dbf0",
  MYS: "#efe8c4",
  SGP: "#dcebcf"
};

const COUNTRY_NAMES_KO = {
  CHN: "중국",
  VNM: "베트남",
  LAO: "라오스",
  KHM: "캄보디아",
  THA: "태국",
  MYS: "말레이시아",
  SGP: "싱가포르"
};

const COUNTRY_CENTERS = {
  CHN: [35.86, 104.16],
  VNM: [15.89, 105.81],
  LAO: [18.20, 103.86],
  KHM: [12.30, 104.98],
  THA: [13.04, 101.49],
  MYS: [4.12, 102.50],
  SGP: [1.32, 103.85]
};

// Three lenses (user, 2026-11-04): 나라, 지역 (level follows the zoom), 장소
const LENS_OPTIONS = [
  { id: "country", label: "나라" },
  { id: "auto", label: "지역" },
  { id: "spot", label: "장소" }
];

const LENS_MIN_ZOOM = {
  "장소": 6
};

function getEffectiveAdminLevel(z, lens) {
  if (lens === "나라") return 0;
  if (lens === "장소") return 1;
  if (z <= 4) return 0;
  if (z <= 6) return 1;
  if (z <= 9) return 2;
  return 3;
}

const PICK_COLORS = {
  like: "#1E8E5A",
  pass: "#9a9a9a",
  request: "#D9A441",
  none: "#2F6FDB"
};

// Web mode draws on colourful OSM tiles: city outlines need a colour that OSM does not use, and more weight
let webOutline = false;
// City outlines are always dashed, at every zoom and for every pick (user, 2026-11-05)
function cityAreaStyle(pick, zoom) {
  const st = cityAreaStyleBase(pick, zoom);
  // Liked cities get a pale green fill, passed cities a pale grey fill (user, 2026-11-05)
  const fill = pick === "like" ? { fillColor: "#30A46C", fillOpacity: 0.16 } : pick === "pass" ? { fillColor: "#8E8E93", fillOpacity: 0.22 } : { fillOpacity: 0 };
  return { ...st, ...fill, dashArray: "6 4" };
}
function cityAreaStyleBase(pick, zoom) {
  const isCityView = typeof zoom === "number" ? zoom >= 10 : false;
  const undecided = !PICK_COLORS[pick] || pick === "none";
  if (webOutline && undecided) {
    // Charcoal on OSM: dashed in city view, a thin solid line when wide (user, 2026-11-05)
    const z0 = typeof zoom === "number" ? zoom : 6;
    return isCityView
      ? { className: "city-area", color: "#2B2F36", weight: 2.6, opacity: 0.85, dashArray: "7 5", fillOpacity: 0 }
      : { className: "city-area", color: "#B4562C", weight: z0 >= 8 ? 2 : 1.4, opacity: z0 >= 8 ? 0.85 : 0.7, dashArray: z0 >= 8 ? "6 4" : "4 3", fillOpacity: 0 };
  }

  if (isCityView) {
    const color = undecided ? "#9a9a9a" : (PICK_COLORS[pick] || "#9a9a9a");
    return {
      className: "city-area",
      color: color,
      weight: 2,
      dashArray: undecided ? "4 4" : undefined,
      fillColor: color,
      fillOpacity: 0
    };
  }
  const color = PICK_COLORS[pick] || PICK_COLORS.none;
  // Sub-areas have no fill (D1, B1-05): outline only keeps the map readable

  return {
    className: "city-area",
    color: color,
    weight: undecided ? 0.8 : 2.5,
    opacity: undecided ? 0.45 : 1,
    fillColor: color,
    fillOpacity: 0
  };
}

let vbaseIndexPromise = null;
function loadVbaseIndex() {
  if (!vbaseIndexPromise) {
    vbaseIndexPromise = fetch("vbasemaps/index.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return vbaseIndexPromise;
}

function decodeLine(flat) {
  if (!flat || flat.length < 2) return [];
  const coords = [];
  let curX = flat[0];
  let curY = flat[1];
  coords.push([curY / 1e4, curX / 1e4]);
  for (let i = 2; i < flat.length; i += 2) {
    curX += flat[i];
    curY += flat[i + 1];
    coords.push([curY / 1e4, curX / 1e4]);
  }
  return coords;
}

async function fetchVectorTile(slug) {
  try {
    // The published build has plain .json (artifacts do not serve .gz); the source folder has .json.gz
    const plain = await fetch(`vbasemaps/${slug}.json`);
    if (plain.ok) return await plain.json();
    const res = await fetch(`vbasemaps/${slug}.json.gz`);
    if (!res.ok) return null;
    const encoding = res.headers.get("Content-Encoding");
    if (encoding && encoding.includes("gzip")) {
      return await res.json();
    }
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("gzip");
      const decompressed = new Response(res.body.pipeThrough(ds));
      return await decompressed.json();
    }
    return await res.json();
  } catch (err) {
    console.warn("Failed to load vector basemap:", slug, err);
    return null;
  }
}

let adminIndexPromise = null;
function loadAdminIndex() {
  if (!adminIndexPromise) {
    adminIndexPromise = fetch("geo/admin/index.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return adminIndexPromise;
}

let namesKoPromise = null;
function loadNamesKo() {
  if (!namesKoPromise) {
    namesKoPromise = fetch("geo/admin/names-ko.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return namesKoPromise;
}

let adm0Promise = null;
function loadAdm0() {
  if (!adm0Promise) {
    adm0Promise = fetch("geo/adm0.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return adm0Promise;
}

let cityAreasPromise = null;
let cityAreasData = null;
function loadCityAreas() {
  if (!cityAreasPromise) {
    cityAreasPromise = fetch("geo/admin/city-areas.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        cityAreasData = data;
        return data;
      })
      .catch(() => null);
  }
  return cityAreasPromise;
}

let cityAdminPromise = null;
function loadCityAdmin() {
  if (!cityAdminPromise) {
    cityAdminPromise = fetch("geo/admin/city-admin.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cityAdminPromise;
}

const geoJsonCache = new Map();
const geoJsonData = new Map();
function loadGeoJson(url) {
  if (!geoJsonCache.has(url)) {
    geoJsonCache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) geoJsonData.set(url, data);
          return data;
        })
        .catch(() => null)
    );
  }
  return geoJsonCache.get(url);
}

function getFeatureForCity(c, cityAdmin, adminIndex) {
  if (!c || !cityAdmin || !adminIndex) return null;
  const entry = cityAdmin[c.id];
  if (!entry) return null;

  if (entry.cc === "HKG" || entry.cc === "MAC" || entry.cc === "SGP") {
    const file = adminIndex.files[entry.cc]?.["1"]?.file;
    if (cityAreasData) {
      const geom =
        cityAreasData[c.id] ||
        cityAreasData[`city:${c.city}`] ||
        (entry.cc === "HKG" ? cityAreasData["city:홍콩"] : null) ||
        (entry.cc === "SGP" ? cityAreasData["city:싱가포르"] : null) ||
        (entry.cc === "MAC" ? cityAreasData["city:마카오"] : null);
      if (geom) {
        return {
          type: "Feature",
          geometry: geom,
          properties: { id: c.id, name: c.city }
        };
      }
    }
    return file ? geoJsonData.get(file) : null;
  }

  const lvl = entry.adm2 ? "2" : "1";
  const file = adminIndex.files[entry.cc]?.[lvl]?.file;
  if (!file) return null;
  const fileData = geoJsonData.get(file);
  if (!fileData) return null;

  if (!fileData._featuresById) {
    fileData._featuresById = new Map();
    for (const f of fileData.features || []) {
      if (f.properties?.id) {
        fileData._featuresById.set(f.properties.id, f);
      }
    }
  }
  const targetId = entry.adm2 || entry.adm1;
  return fileData._featuresById.get(targetId) || null;
}

function getLargestRingCenterAndArea(geometry) {
  if (!geometry) return { center: null, area: 0 };
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  let maxArea = -1;
  let bestCenter = null;
  for (const p of polys) {
    if (!p || !p[0]) continue;
    const ring = p[0];
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const pt of ring) {
      const lng = pt[0];
      const lat = pt[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const area = (maxLng - minLng) * (maxLat - minLat);
    if (area > maxArea) {
      maxArea = area;
      bestCenter = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
    }
  }
  return { center: bestCenter, area: maxArea };
}

function getAreaLabelText(f, namesKo) {
  if (!f || !f.properties) return "";
  const id = f.properties.id;
  if (id && namesKo && namesKo[id]) return namesKo[id];
  const local = f.properties.local;
  if (local && /[\u4e00-\u9fff]/.test(local)) {
    return local.includes("|") ? local.split("|")[0] : local;
  }
  return f.properties.name || "";
}

function boxesIntersect(a, b) {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

// Ray casting on [lng, lat] rings; holes count because they flip the parity
function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  let inside = false;
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

function featureTouchesBounds(f, bounds) {
  if (!f || !f.geometry || !bounds) return false;
  if (!f._bbox) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function walk(c) {
      if (typeof c[0] === "number") {
        if (c[0] < minLng) minLng = c[0];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      } else if (Array.isArray(c)) {
        for (let i = 0; i < c.length; i++) walk(c[i]);
      }
    }
    walk(f.geometry.coordinates || []);
    f._bbox = [minLng, minLat, maxLng, maxLat];
  }
  const [w, s, e, n] = f._bbox;
  return !(e < bounds.getWest() || w > bounds.getEast() || n < bounds.getSouth() || s > bounds.getNorth());
}

function getTier(city) {
  if (city.kind === "대도시") return 1;
  if (city.kind === "중소도시") return 2;
  return 3;
}

const TIER_SIZES = { 1: 14, 2: 10, 3: 7 };

export function init(ctx) {
  if (!ctx || !ctx.el) return {};

  ctx.el.innerHTML = "";

  const map = L.map(ctx.el, {
    attributionControl: false,
    zoomControl: false,
    minZoom: 3,
    maxZoom: 17,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    inertia: false
  });
  L.control.zoom({ position: "bottomright", zoomInTitle: "확대", zoomOutTitle: "축소" }).addTo(map);

  // Quiet OSM tile layer or Web mode base map (D2, D3, D4)
  const isSelftest =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("selftest");
  const webMode = Boolean(ctx?.util?.isWebMode?.());
  webOutline = webMode;

  let voyagerLayer = null;
  let esriLayer = null;
  let cartoLabelsLayer = null;
  let currentBasemap = "voyager";

  if (webMode) {
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

    try {
      const saved = localStorage.getItem("trip-basemap");
      if (saved === "satellite") currentBasemap = "satellite";
    } catch (_) {}

    // CARTO now needs an API key (tiles showed "API KEY REQUIRED", 2026-11-04): OpenStreetMap standard tiles need none
    voyagerLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
      // Faded base (map.css): OSM's own pink and yellow roads looked like metro lines
      className: "osm-base-tiles"
    });
    esriLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics"
    });
    // Place names over the satellite view, also keyless
    cartoLabelsLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: ""
    });

    if (currentBasemap === "satellite") {
      esriLayer.addTo(map);
      cartoLabelsLayer.addTo(map);
    } else {
      voyagerLayer.addTo(map);
    }
  } else if (!isSelftest) {
    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    let tileErrors = 0;
    osmLayer.on("tileerror", () => {
      tileErrors++;
      if (tileErrors >= 3 && map.hasLayer(osmLayer)) {
        map.removeLayer(osmLayer);
      }
    });
    osmLayer.addTo(map);
  }

  let basemapBtn = null;
  function setBasemap(mode) {
    if (!webMode) return;
    currentBasemap = mode === "satellite" ? "satellite" : "voyager";
    try {
      localStorage.setItem("trip-basemap", currentBasemap);
    } catch (_) {}
    if (basemapBtn) {
      const isSat = currentBasemap === "satellite";
      basemapBtn.classList.toggle("is-active", isSat);
      basemapBtn.classList.toggle("active", isSat);
    }
    if (currentBasemap === "satellite") {
      if (map.hasLayer(voyagerLayer)) map.removeLayer(voyagerLayer);
      if (!map.hasLayer(esriLayer)) esriLayer.addTo(map);
      if (!map.hasLayer(cartoLabelsLayer)) cartoLabelsLayer.addTo(map);
    } else {
      if (map.hasLayer(esriLayer)) map.removeLayer(esriLayer);
      if (map.hasLayer(cartoLabelsLayer)) map.removeLayer(cartoLabelsLayer);
      if (!map.hasLayer(voyagerLayer)) voyagerLayer.addTo(map);
    }
  }

  if (ctx.bus && typeof ctx.bus.on === "function") {
    ctx.bus.on("map:basemap", ({ basemap }) => {
      setBasemap(basemap);
    });
  }


  // Land pane below tilePane (D2, D12: canvas renderer for speed)
  const landPaneEl = map.createPane("landPane");
  landPaneEl.classList.add("leaflet-landPane-pane");
  landPaneEl.style.zIndex = "150";

  const landCanvasRenderer = L.canvas({ pane: "landPane" });
  const landPaneLayer = L.featureGroup({ pane: "landPane" }).addTo(map);
  let landPanePromise = null;
  function initLandPane() {
    if (!landPanePromise) {
      landPanePromise = (async () => {
        const [adminIndex, adm0Data] = await Promise.all([loadAdminIndex(), loadAdm0()]);
        if (adm0Data) {
          L.geoJSON(adm0Data, {
            pane: "landPane",
            renderer: landCanvasRenderer,
            style: {
              stroke: false,
              weight: 0,
              fillColor: "#f3f1ec",
              fillOpacity: 1
            },
            interactive: false
          }).addTo(landPaneLayer);
        }
        if (adminIndex && adminIndex.files) {
          const tripCCs = ["CHN", "HKG", "MAC", "VNM", "THA", "KHM", "LAO", "MYS", "SGP"];
          const files = tripCCs.map((cc) => adminIndex.files[cc]?.["1"]?.file).filter(Boolean);
          await Promise.all(
            files.map(async (file) => {
              const data = await loadGeoJson(file);
              if (data) {
                L.geoJSON(data, {
                  pane: "landPane",
                  renderer: landCanvasRenderer,
                  style: {
                    stroke: false,
                    weight: 0,
                    fillColor: "#f3f1ec",
                    fillOpacity: 1
                  },
                  interactive: false
                }).addTo(landPaneLayer);
              }
            })
          );
        }
      })();
    }
    return landPanePromise;
  }
  initLandPane();


  // City vector basemap (D8, D9, D10)
  map.createPane("cityVectorPane");
  map.getPane("cityVectorPane").style.zIndex = "410";

  const cityVectorRenderer = L.canvas({ pane: "cityVectorPane" });
  const cityVectorGroup = L.layerGroup().addTo(map);

  // Intercity rail for the whole trip area (geo/rail.json from scripts/national_rail.py), under the city lines.
  // High-speed lines are thicker; from zoom 8 both get the railway look (dark line, white dash) like the city train lines.
  map.createPane("nationalRailPane");
  map.getPane("nationalRailPane").style.zIndex = "405";
  map.getPane("nationalRailPane").style.pointerEvents = "none";
  const railRenderer = L.canvas({ pane: "nationalRailPane", padding: 0.3 });
  const railGroup = L.layerGroup().addTo(map);
  const railLayerCache = {};
  let railData = null;
  let railTier = null;
  function railLayers(tier) {
    if (railLayerCache[tier]) return railLayerCache[tier];
    const o = { pane: "nationalRailPane", renderer: railRenderer, interactive: false, lineCap: "round", lineJoin: "round" };
    const src = tier === "far" || tier === "low" ? "low" : "mid";
    const dec = (a) => (a || []).map(decodeLine).filter((p) => p.length >= 2);
    const rail = dec(railData.rail?.[src]);
    const hsr = dec(railData.hsr?.[src]);
    const layers = [];
    if (tier === "far") {
      // Whole-Asia view: thin and pale, so dense China does not turn black
      if (rail.length) layers.push(L.polyline(rail, { ...o, color: "#3a3a3a", weight: 0.8, opacity: 0.45 }));
      if (hsr.length) layers.push(L.polyline(hsr, { ...o, color: "#1f1f1f", weight: 1.4, opacity: 0.75 }));
    } else if (tier === "low") {
      // Railway look already at zoom 6-7, so rails never read as borders
      if (rail.length) {
        layers.push(L.polyline(rail, { ...o, color: "#333333", weight: 2.6 }));
        layers.push(L.polyline(rail, { ...o, color: "#ffffff", weight: 1, dashArray: "4 4", lineCap: "butt" }));
      }
      if (hsr.length) {
        layers.push(L.polyline(hsr, { ...o, color: "#1f1f1f", weight: 3.4 }));
        layers.push(L.polyline(hsr, { ...o, color: "#ffffff", weight: 1.3, dashArray: "6 6", lineCap: "butt" }));
      }
    } else {
      const k = tier === "mid" ? 1 : 1.4;
      if (rail.length) {
        layers.push(L.polyline(rail, { ...o, color: "#3d3d3d", weight: 3 * k }));
        layers.push(L.polyline(rail, { ...o, color: "#ffffff", weight: 1.2 * k, dashArray: `${5 * k} ${5 * k}`, lineCap: "butt" }));
      }
      if (hsr.length) {
        layers.push(L.polyline(hsr, { ...o, color: "#2f2f2f", weight: 4 * k }));
        layers.push(L.polyline(hsr, { ...o, color: "#ffffff", weight: 1.6 * k, dashArray: `${8 * k} ${8 * k}`, lineCap: "butt" }));
      }
    }
    railLayerCache[tier] = layers;
    return layers;
  }
  function updateNationalRail() {
    if (!railData) return;
    const z = map.getZoom();
    const tier = z < 4 ? null : z <= 5 ? "far" : z <= 7 ? "low" : z <= 10 ? "mid" : "near";
    if (tier === railTier) return;
    railTier = tier;
    railGroup.clearLayers();
    if (tier) for (const l of railLayers(tier)) railGroup.addLayer(l);
  }
  fetch("geo/rail.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      railData = d;
      updateNationalRail();
    })
    .catch(() => {});
  map.on("zoomend", updateNationalRail);

  const cityVectorCache = new Map();
  const loadingCities = new Set();
  let currentZoomTier = null;
  let currentCitySlugs = new Set();

  async function updateVectorBasemaps() {
    const z = map.getZoom();
    if (z < 10) {
      if (currentZoomTier !== null || currentCitySlugs.size > 0) {
        cityVectorGroup.clearLayers();
        currentZoomTier = null;
        currentCitySlugs.clear();
      }
      if (map.hasLayer(cityVectorRenderer)) {
        map.removeLayer(cityVectorRenderer);
      }
      return;
    }

    const vbaseIndex = await loadVbaseIndex();
    if (!vbaseIndex) return;

    const targetTier = z >= 15 ? "names" : z >= 13 ? "stations" : z >= 12 ? "high" : "low";
    const bounds = map.getBounds();

    const visibleSlugs = [];
    for (const slug of Object.keys(vbaseIndex)) {
      const entry = vbaseIndex[slug];
      if (!entry || !entry.bbox) continue;
      const cityBounds = L.latLngBounds(
        [entry.bbox[0], entry.bbox[1]],
        [entry.bbox[2], entry.bbox[3]]
      );
      if (bounds.intersects(cityBounds)) {
        visibleSlugs.push(slug);
      }
    }

    for (const slug of visibleSlugs) {
      if (!cityVectorCache.has(slug) && !loadingCities.has(slug)) {
        if (webMode) {
          const item = { land: [], bottom: [], mid: [], top: [], roadsOnly: [], stations: [], metroLines: [], trainLines: [] };
          cityVectorCache.set(slug, item);
          const opts = { pane: "cityVectorPane", renderer: cityVectorRenderer, interactive: false };
          fetch(`vbasemaps/lines/${slug}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .then((ln) => {
              const cur = cityVectorCache.get(slug);
              if (!cur || !ln) return;
              const dec = (paths) => (paths || []).map(decodeLine).filter((p) => p.length >= 2);
              const metro = (ln.metro || []).filter((m) => !/APM|Window of the World/i.test(m.name || ""));
              cur.metroLines = [
                ...metro.map((m) => L.polyline(dec(m.paths), { ...opts, color: "#ffffff", weight: 7, lineCap: "round", lineJoin: "round" })),
                ...metro.map((m) =>
                  L.polyline(dec(m.paths), { ...opts, color: m.colour || "#888888", weight: 4.5, lineCap: "round", lineJoin: "round" })
                )
              ];
              const train = ln.train || [];
              cur.trainLines = [
                ...train.map((t) => L.polyline(dec(t.paths), { ...opts, color: "#3d3d3d", weight: 4.5 })),
                ...train.map((t) => L.polyline(dec(t.paths), { ...opts, color: "#ffffff", weight: 2, dashArray: "8 8" }))
              ];
              cur.hasLines = metro.length > 0 || train.length > 0;
              currentZoomTier = null;
              updateVectorBasemaps();
            })
            .catch(() => {});
          fetch(`vbasemaps/stations/${slug}.json`)
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => {
              const cur = cityVectorCache.get(slug);
              if (!cur || !Array.isArray(list)) return;
              cur.stations = list.map(([x, y, name]) =>
                L.circleMarker([y / 1e4, x / 1e4], {
                  pane: "cityVectorPane",
                  renderer: cityVectorRenderer,
                  radius: 4.5,
                  color: "#333333",
                  weight: 2,
                  fillColor: "#ffffff",
                  fillOpacity: 1
                }).bindTooltip(name, { direction: "top", offset: [0, -4], className: "metro-station-tip" })
              );
              currentZoomTier = null;
              updateVectorBasemaps();
            })
            .catch(() => {});
        } else {
          loadingCities.add(slug);
          fetchVectorTile(slug).then((data) => {
            loadingCities.delete(slug);
            if (!data || !data.layers) return;
            // One layer per class: tens of thousands of single-line layers made every pan take about 1 s
            const opts = { pane: "cityVectorPane", renderer: cityVectorRenderer, interactive: false };
            const lines = (name, min) => (data.layers[name] || []).map(decodeLine).filter((p) => p.length >= min);
            const area = (name, fill) => {
              const rings = lines(name, 3);
              return rings.length ? [L.polygon(rings, { ...opts, stroke: false, fillColor: fill, fillOpacity: 1 })] : [];
            };
            const path = (name, style) => {
              const ls = lines(name, 2);
              return ls.length ? [L.polyline(ls, { ...opts, ...style })] : [];
            };
            const [s, w, n, e] = data.bbox || [];
            // Land under the city box hides the coarse land outline; the sea comes from real coastlines
            // A city without a sea layer yet (coast not processed) keeps the old look: a land box would cover its sea
            const land = data.bbox && Array.isArray(data.layers.sea)
              ? [L.rectangle([[s, w], [n, e]], { ...opts, stroke: false, fillColor: "#f2efe9", fillOpacity: 1 })]
              : [];
            const bottom = [
              ...area("sea", "#aad3df"),
              ...area("water", "#aad3df"),
              ...path("river", { color: "#aad3df", weight: 2.5 }),
              ...area("park", "#d4e9c8")
            ];
            // Metro only at zoom 12 and more; thin and soft so it does not cover the map
            const mid = [
              ...path("metro", { color: "#9b59b6", weight: 1.5, opacity: 0.45 })
            ];
            // No highways (user, 2026-11-04): main roads and rail only
            const roadsOnly = [
              ...path("road2", { color: "#cfc8bb", weight: 4 }),
              ...path("road2", { color: "#ffffff", weight: 2.5 })
            ];
            const top = [...roadsOnly, ...path("rail", { color: "#3d3d3d", weight: 3 }), ...path("rail", { color: "#ffffff", weight: 1.2, dashArray: "6 6" })];

            cityVectorCache.set(slug, { land, bottom, mid, top, roadsOnly, stations: [], metroLines: [], trainLines: [] });
            // Lines by route (vbasemaps/lines): metro in each line's colour, intercity rail as a black and white track.
            // When they exist, the raw OSM metro and rail ways (many parallel tracks) are not drawn.
            fetch(`vbasemaps/lines/${slug}.json`)
              .then((r) => (r.ok ? r.json() : null))
              .then((ln) => {
                const item = cityVectorCache.get(slug);
                if (!item || !ln) return;
                const dec = (paths) => (paths || []).map(decodeLine).filter((p) => p.length >= 2);
                const metro = (ln.metro || []).filter((m) => !/APM|Window of the World/i.test(m.name || ""));
                item.metroLines = [
                  ...metro.map((m) => L.polyline(dec(m.paths), { ...opts, color: "#ffffff", weight: 7, lineCap: "round", lineJoin: "round" })),
                  ...metro.map((m) =>
                    L.polyline(dec(m.paths), { ...opts, color: m.colour || "#888888", weight: 4.5, lineCap: "round", lineJoin: "round" })
                  )
                ];
                const train = ln.train || [];
                item.trainLines = [
                  ...train.map((t) => L.polyline(dec(t.paths), { ...opts, color: "#3d3d3d", weight: 4.5 })),
                  ...train.map((t) => L.polyline(dec(t.paths), { ...opts, color: "#ffffff", weight: 2, dashArray: "8 8" }))
                ];
                item.hasLines = metro.length > 0 || train.length > 0;
                currentZoomTier = null;
                updateVectorBasemaps();
              })
              .catch(() => {});
            fetch(`vbasemaps/stations/${slug}.json`)
              .then((r) => (r.ok ? r.json() : []))
              .then((list) => {
                const item = cityVectorCache.get(slug);
                if (!item || !Array.isArray(list)) return;
                item.stations = list.map(([x, y, name]) =>
                  L.circleMarker([y / 1e4, x / 1e4], {
                    pane: "cityVectorPane",
                    renderer: cityVectorRenderer,
                    radius: 4.5,
                    color: "#333333",
                    weight: 2,
                    fillColor: "#ffffff",
                    fillOpacity: 1
                  }).bindTooltip(name, { direction: "top", offset: [0, -4], className: "metro-station-tip" })
                );
                currentZoomTier = null;
                updateVectorBasemaps();
              })
              .catch(() => {});
            updateVectorBasemaps();
          });
        }
      }
    }

    const loadedVisible = visibleSlugs.filter((s) => cityVectorCache.has(s));
    const sameTier = targetTier === currentZoomTier;
    const sameSlugs =
      sameTier &&
      loadedVisible.length === currentCitySlugs.size &&
      loadedVisible.every((s) => currentCitySlugs.has(s));

    // At zoom 15 names follow the view, so a pan redraws
    if (sameSlugs && targetTier !== "names") return;

    cityVectorGroup.clearLayers();
    currentZoomTier = targetTier;
    currentCitySlugs = new Set(loadedVisible);

    // Canvas draws in add order: every city's land box first, so a neighbour's box never covers this city's sea
    const items = loadedVisible.map((slug) => cityVectorCache.get(slug)).filter(Boolean);
    // Metro lines from zoom 12, metro station dots from zoom 13
    // Order (user, 2026-11-04): roads at the bottom, metro second from the top, intercity rail on top, then station dots
    // In web mode, real tiles provide land, water, roads; only rail/metro overlays are drawn (D3, D5)
    const tiers = webMode
      ? ["metroLines", "trainLines"]
      : (targetTier === "low" ? ["land", "bottom", "top", "metroLines", "trainLines"] : ["land", "bottom", "mid", "top", "metroLines", "trainLines"]);
    if (targetTier === "stations" || targetTier === "names") tiers.push("stations");
    // Metro station names stay open at zoom 15 and more, only for stations in view
    const showNames = z >= 15;
    const nameBounds = map.getBounds();
    for (const item of items) {
      for (const m of item.stations || []) {
        const tip = m.getTooltip();
        if (!tip) continue;
        const want = showNames && nameBounds.contains(m.getLatLng());
        tip.options.permanent = want;
        if (!want && m.isTooltipOpen && m.isTooltipOpen()) m.closeTooltip();
      }
    }
    for (const tier of tiers) {
      for (const item of items) {
        let layers = item[tier] || [];
        // Raw metro ways and raw rail are replaced by the route lines when a city has them
        if (item.hasLines && tier === "mid") continue;
        if (item.hasLines && tier === "top") layers = item.roadsOnly || layers;
        for (const l of layers) cityVectorGroup.addLayer(l);
      }
    }
    if (showNames) {
      for (const item of items) for (const m of item.stations || []) if (m.getTooltip()?.options.permanent) m.openTooltip();
    }
  }

  updateVectorBasemaps();

  // Train station markers (D9)
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Train station markers (D3)
  // City names stay above station and terminal icons so they can be clicked (user, 2026-11-05)
  map.createPane("cityLabelPane");
  map.getPane("cityLabelPane").style.zIndex = "660";
  map.createPane("stationPane");
  map.getPane("stationPane").style.zIndex = "650";

  // Bus terminal markers (D4)
  map.createPane("busTerminalPane");
  map.getPane("busTerminalPane").style.zIndex = "645";

  const stationLayerGroup = L.layerGroup().addTo(map);
  const busTerminalLayerGroup = L.layerGroup().addTo(map);

  function createStationPopupEl(st) {
    const div = document.createElement("div");
    div.className = "transit-popup station-popup";
    const title = document.createElement("div");
    title.className = "transit-popup-title";
    const strong = document.createElement("strong");
    strong.textContent = st.name || "기차역";
    title.appendChild(strong);
    if (st.local) {
      const loc = document.createElement("span");
      loc.className = "transit-popup-local";
      loc.textContent = st.local;
      title.appendChild(loc);
    }
    div.appendChild(title);

    if (st.type) {
      const typeDiv = document.createElement("div");
      typeDiv.className = "transit-popup-type";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = st.type;
      typeDiv.appendChild(badge);
      div.appendChild(typeDiv);
    }

    if (st.lines) {
      const linesDiv = document.createElement("div");
      linesDiv.className = "transit-popup-lines";
      linesDiv.textContent = Array.isArray(st.lines) ? st.lines.join(", ") : String(st.lines);
      div.appendChild(linesDiv);
    }

    return div;
  }

  function updateStationMarkers() {
    let z;
    try {
      z = map.getZoom();
    } catch (_) {
      return;
    }
    if (z == null || z < 7) {
      stationLayerGroup.clearLayers();
      return;
    }

    let bounds;
    try {
      bounds = map.getBounds();
    } catch (_) {
      return;
    }
    stationLayerGroup.clearLayers();

    const isClose = z >= 11;
    const cities = ctx.data?.cities || [];
    for (const c of cities) {
      const stations = c.info?.rail?.stations;
      if (!Array.isArray(stations) || stations.length === 0) continue;

      let cityCount = 0;
      for (const st of stations) {
        if (st.lat == null || st.lng == null) continue;
        if (!isClose) {
          const isHsr = st.type === "고속철" || st.type === "고속철+일반";
          if (!isHsr) continue;
          if (cityCount >= 2) continue;
        }

        const latLng = L.latLng(st.lat, st.lng);
        if (bounds.contains(latLng)) {
          if (!isClose) cityCount++;
          const iconHtml = isClose
            ? `<div class="station-marker-circle">🚆</div><div class="station-marker-name">${escapeHtml(st.name || "")}</div>`
            : `<div class="station-marker-circle">🚆</div>`;
          const icon = L.divIcon({
            className: "station-marker",
            html: iconHtml,
            iconSize: isClose ? [80, 44] : [26, 26],
            iconAnchor: isClose ? [40, 13] : [13, 13]
          });
          const marker = L.marker(latLng, {
            icon,
            pane: "stationPane"
          });
          marker.bindPopup(() => createStationPopupEl(st), {
            className: "map-transit-popup",
            offset: [0, -13]
          });
          stationLayerGroup.addLayer(marker);
        }
      }
    }
  }

  function createBusTerminalPopupEl(t) {
    const div = document.createElement("div");
    div.className = "transit-popup bus-terminal-popup";
    const title = document.createElement("div");
    title.className = "transit-popup-title";
    const strong = document.createElement("strong");
    strong.textContent = t.name || "버스터미널";
    title.appendChild(strong);
    if (t.local) {
      const loc = document.createElement("span");
      loc.className = "transit-popup-local";
      loc.textContent = t.local;
      title.appendChild(loc);
    }
    div.appendChild(title);

    if (t.routes) {
      const routesDiv = document.createElement("div");
      routesDiv.className = "transit-popup-routes";
      routesDiv.textContent = Array.isArray(t.routes) ? t.routes.join(", ") : String(t.routes);
      div.appendChild(routesDiv);
    }

    return div;
  }

  function updateBusTerminalMarkers() {
    let z;
    try {
      z = map.getZoom();
    } catch (_) {
      return;
    }
    if (z == null || z < 11) {
      busTerminalLayerGroup.clearLayers();
      return;
    }

    let bounds;
    try {
      bounds = map.getBounds();
    } catch (_) {
      return;
    }
    busTerminalLayerGroup.clearLayers();

    // Terminal names from zoom 14: at 12 and 13 they covered the train station names
    const isClose = z >= 14;
    const cities = ctx.data?.cities || [];
    for (const c of cities) {
      const terminals = c.info?.bus?.terminals;
      if (!Array.isArray(terminals) || terminals.length === 0) continue;

      for (const t of terminals) {
        if (t.lat == null || t.lng == null) continue;
        const latLng = L.latLng(t.lat, t.lng);
        if (bounds.contains(latLng)) {
          const iconHtml = isClose
            ? `<div class="bus-terminal-marker-circle">🚌</div><div class="bus-terminal-marker-name">${escapeHtml(t.name || "")}</div>`
            : `<div class="bus-terminal-marker-circle">🚌</div>`;
          const icon = L.divIcon({
            className: "bus-terminal-marker",
            html: iconHtml,
            iconSize: isClose ? [80, 40] : [22, 22],
            iconAnchor: isClose ? [40, 11] : [11, 11]
          });
          const marker = L.marker(latLng, {
            icon,
            pane: "busTerminalPane"
          });
          marker.bindPopup(() => createBusTerminalPopupEl(t), {
            className: "map-transit-popup",
            offset: [0, -11]
          });
          busTerminalLayerGroup.addLayer(marker);
        }
      }
    }
  }

  updateStationMarkers();
  updateBusTerminalMarkers();

  // Admin vector areas, city areas, and labels (D1, D2, D3, D4, D5, D6)
  const adminAreasLayer = L.featureGroup().addTo(map);
  const cityAreasLayer = L.featureGroup().addTo(map);
  const adminLabelsLayer = L.featureGroup().addTo(map);
  const cityAreaLayers = new Map();

  let currentFilter = { country: "all", status: "all", query: "" };
  let currentLens = "지역";
  try {
    const saved = localStorage.getItem("trip-map-lens");
    if (saved && LENS_OPTIONS.some((o) => o.label === saved)) {
      currentLens = saved;
    }
  } catch (_) {}
  let renderSeq = 0;
  const adminGeoJsonCache = new Map();

  function getFeatureBbox(feature) {
    if (feature._bbox) return feature._bbox;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    function scan(coords) {
      if (!Array.isArray(coords) || coords.length === 0) return;
      if (typeof coords[0] === "number") {
        const lng = coords[0];
        const lat = coords[1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      } else {
        for (const c of coords) scan(c);
      }
    }
    scan(feature.geometry?.coordinates);
    feature._bbox = [minLat, minLng, maxLat, maxLng];
    return feature._bbox;
  }

  async function updateAdminLayers() {
    const seq = ++renderSeq;
    const z = map.getZoom();
    const bounds = map.getBounds();
    const padded = bounds.pad(0.1);
    const mW = bounds.getWest();
    const mS = bounds.getSouth();
    const mE = bounds.getEast();
    const mN = bounds.getNorth();

    const [adminIndex, namesKo, adm0Data, cityAdmin, cityAreas, vbaseIndex] = await Promise.all([
      loadAdminIndex(),
      loadNamesKo(),
      loadAdm0(),
      loadCityAdmin(),
      loadCityAreas(),
      loadVbaseIndex()
    ]);
    if (seq !== renderSeq || !adminIndex) return;

    const visibleVectorBboxes = [];
    if (vbaseIndex) {
      for (const slug of Object.keys(vbaseIndex)) {
        const entry = vbaseIndex[slug];
        if (!entry || !entry.bbox) continue;
        const [s, w, n, e] = entry.bbox;
        const b = L.latLngBounds([s, w], [n, e]);
        if (bounds.intersects(b)) {
          visibleVectorBboxes.push(entry.bbox);
        }
      }
    }
    const isInsideVector = visibleVectorBboxes.some(([s, w, n, e]) => {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      return sw.lat >= s && sw.lng >= w && ne.lat <= n && ne.lng <= e;
    });

    const areaLayers = [];
    const candidates = [];

    // City areas at z >= 5 (D5)
    const cityAreaFilesToLoad = new Set();
    const visibleCitiesForArea = [];

    if (z >= 5 && cityAdmin && !(webMode && z >= 10)) {
      for (const c of ctx.data.cities || []) {
        if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
        if (currentFilter.country && currentFilter.country !== "all" && c.country !== currentFilter.country) continue;
        if (currentFilter.status && currentFilter.status !== "all") {
          const pick = ctx.store ? ctx.store.getPick(c.id) : "none";
          if (pick !== currentFilter.status) continue;
        }
        if (currentFilter.query && currentFilter.query.trim()) {
          const q = currentFilter.query.trim().toLowerCase();
          const match =
            (c.city && c.city.toLowerCase().includes(q)) ||
            (c.local && c.local.toLowerCase().includes(q));
          if (!match) continue;
        }

        // D1: Do not draw city-area outline inside vector bbox at z >= 10
        if (z >= 10 && visibleVectorBboxes.some(([s, w, n, e]) => c.lat >= s && c.lat <= n && c.lng >= w && c.lng <= e)) {
          continue;
        }

        if (padded.contains([c.lat, c.lng])) {
          const entry = cityAdmin[c.id];
          if (entry) {
            visibleCitiesForArea.push(c);
            if ((entry.cc === "HKG" || entry.cc === "MAC" || entry.cc === "SGP") && !cityAreasData) {
              const f = adminIndex.files[entry.cc]?.["1"]?.file;
              if (f) cityAreaFilesToLoad.add(f);
            } else {
              const lvl = entry.adm2 ? "2" : "1";
              const f = adminIndex.files[entry.cc]?.[lvl]?.file;
              if (f) cityAreaFilesToLoad.add(f);
            }
          }
        }
      }

      if (cityAreaFilesToLoad.size > 0) {
        await Promise.all(Array.from(cityAreaFilesToLoad).map(loadGeoJson));
        if (seq !== renderSeq) return;
      }
    }

    const effectiveLevel = getEffectiveAdminLevel(z, currentLens);

    if (effectiveLevel === 0) {
      const tier = z >= 10 ? "city" : (webMode ? "web" : "normal");
      if (adm0Data && adm0Data.features) {
        const cacheKey = `adm0:${tier}:${webMode ? "w" : "a"}`;
        let neighborLayer = adminGeoJsonCache.get(cacheKey);
        if (!neighborLayer) {
          neighborLayer = L.geoJSON(adm0Data, {
            style: {
              className: "admin-area level-0",
              color: "#8a8a8a",
              weight: 0.6,
              fillColor: "#e4e4e4",
              fillOpacity: z >= 10 ? 0 : (webMode ? 0.15 : 0.25),
              fill: true
            },
            interactive: false,
            onEachFeature: (feature, lyr) => {
              lyr.on("add", () => {
                if (lyr._path) lyr._path.style.pointerEvents = "auto";
              });
            }
          });
          adminGeoJsonCache.set(cacheKey, neighborLayer);
        }
        if (!(webMode && z >= 10)) {
          areaLayers.push(neighborLayer);
        }
      }

      const tripCCs = ["CHN", "HKG", "MAC", "VNM", "THA", "KHM", "LAO", "MYS", "SGP"];
      const filesToLoad = [];
      for (const cc of tripCCs) {
        const info = adminIndex.files[cc] && adminIndex.files[cc]["1"];
        if (!info || !info.file || !info.bbox) continue;
        const [w, s, e, n] = info.bbox;
        if (e < mW || w > mE || n < mS || s > mN) continue;
        filesToLoad.push({ cc, file: info.file, bbox: info.bbox });
      }

      const loaded = await Promise.all(
        filesToLoad.map(async (item) => {
          const data = await loadGeoJson(item.file);
          return { cc: item.cc, bbox: item.bbox, file: item.file, data };
        })
      );
      if (seq !== renderSeq) return;

      for (const item of loaded) {
        if (!item.data) continue;
        const cacheKey = `${item.file}:${item.cc}:${tier}:${webMode ? "w" : "a"}`;
        let countryLayer = adminGeoJsonCache.get(cacheKey);
        if (!countryLayer) {
          const cColor = COUNTRY_PALETTE[item.cc] || PALETTE[0];
          countryLayer = L.geoJSON(item.data, {
            style: {
              className: "admin-area level-0",
              color: "#8a8a8a",
              weight: 1.2,
              fillColor: cColor,
              fillOpacity: z >= 10 ? 0 : (webMode ? 0.35 : 0.85),
              fill: true
            },
            interactive: false,
            onEachFeature: (feature, lyr) => {
              lyr.on("add", () => {
                if (lyr._path) lyr._path.style.pointerEvents = "auto";
              });
            }
          });
          adminGeoJsonCache.set(cacheKey, countryLayer);
        }
        if (!(webMode && z >= 10)) {
          areaLayers.push(countryLayer);
        }
      }

      for (const [cc, name] of Object.entries(COUNTRY_NAMES_KO)) {
        let center = COUNTRY_CENTERS[cc];
        let touches = false;
        if (center && padded.contains(center)) {
          touches = true;
        } else {
          const countryItem = loaded.find((it) => it.cc === cc);
          if (countryItem && countryItem.data) {
            const hasTouching = (countryItem.data.features || []).some((f) => featureTouchesBounds(f, padded));
            if (hasTouching) {
              // Put the name on the visible part of the country: sample the view, keep points inside it,
              // and use the inside point nearest to their mean (a bbox center can fall in a neighbour country)
              const feats = countryItem.data.features || [];
              const inside = [];
              const N = 9;
              for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                  const lat = mS + ((i + 0.5) / N) * (mN - mS);
                  const lng = mW + ((j + 0.5) / N) * (mE - mW);
                  if (feats.some((f) => pointInGeometry(lng, lat, f.geometry))) inside.push([lat, lng]);
                }
              }
              if (inside.length) {
                touches = true;
                const mLat = inside.reduce((a, p) => a + p[0], 0) / inside.length;
                const mLng = inside.reduce((a, p) => a + p[1], 0) / inside.length;
                center = inside.reduce((b, p) => ((p[0] - mLat) ** 2 + (p[1] - mLng) ** 2 < (b[0] - mLat) ** 2 + (b[1] - mLng) ** 2 ? p : b), inside[0]);
              }
            }
          }
        }
        if (touches && center) {


          candidates.push({
            type: "admin",
            text: name,
            center,
            level: 0,
            priority: 1,
            area: 1e9
          });
        }
      }
    } else {
      const skipLevels1to3 = z >= 10 && isInsideVector;
      if (!skipLevels1to3) {
        const targetLevel = effectiveLevel;
        const filesToLoad = [];

        for (const [cc, countryFiles] of Object.entries(adminIndex.files)) {
          let chosen = null;
          for (let l = targetLevel; l >= 1; l--) {
            if (countryFiles[String(l)]) {
              chosen = { level: l, ...countryFiles[String(l)] };
              break;
            }
          }
          if (!chosen || !chosen.file || !chosen.bbox) continue;
          const [w, s, e, n] = chosen.bbox;
          if (e < mW || w > mE || n < mS || s > mN) continue;
          if (z >= 10 && visibleVectorBboxes.some(([vs, vw, vn, ve]) => s >= vs && w >= vw && n <= vn && e <= ve)) {
            continue;
          }
          filesToLoad.push({ cc, level: chosen.level, file: chosen.file });
        }

        const loaded = await Promise.all(
          filesToLoad.map(async (item) => {
            const data = await loadGeoJson(item.file);
            return { ...item, data };
          })
        );
        if (seq !== renderSeq) return;

        const isCityView = z >= 10;
        const tier = isCityView ? "city" : (webMode ? "web" : "normal");

        for (const item of loaded) {
          if (!item.data) continue;
          const cacheKey = `${item.file}:${item.level}:${tier}:${webMode ? "w" : "a"}`;
          let lLayer = adminGeoJsonCache.get(cacheKey);
          if (!lLayer) {
            lLayer = L.geoJSON(item.data, {
              style: (feature) => {
                const fLevel = feature.properties?.level || item.level;
                if (isCityView) {
                  return {
                    className: `admin-area level-${fLevel}`,
                    color: "#b5b5b5",
                    weight: 0.6,
                    fillColor: "#b5b5b5",
                    fillOpacity: 0
                  };
                }
                return {
                  className: `admin-area level-${fLevel}`,
                  color: fLevel === 1 ? "#9a9a9a" : "#c8c8c8",
                  weight: fLevel === 1 ? 0.9 : 0.5,
                  fillColor: COUNTRY_PALETTE[item.cc] || "#f3f1ec",
                  fillOpacity: COUNTRY_PALETTE[item.cc] ? (webMode ? 0.35 : 0.85) : 0
                };
              },
              interactive: false
            });
            adminGeoJsonCache.set(cacheKey, lLayer);
          }
          if (!(webMode && z >= 10)) {
            areaLayers.push(lLayer);
          }

          const features = item.data.features || [];
          for (const f of features) {
            const fBox = getFeatureBbox(f);
            if (fBox[3] < mW || fBox[1] > mE || fBox[2] < mS || fBox[0] > mN) {
              continue;
            }
            if (!f._labelCenter) {
              const { center, area } = getLargestRingCenterAndArea(f.geometry);
              f._labelCenter = center;
              f._labelArea = area;
              f._labelText = getAreaLabelText(f, namesKo);
            }
            const labelLevel = f.properties?.level || item.level;
            if (labelLevel === 3 && z < 12) continue;
            if (labelLevel >= 2 && currentLens === "지역" && f._labelText === f.properties?.name) continue;
            if (f._labelCenter && padded.contains(f._labelCenter) && f._labelText) {
              const fLevel = labelLevel;
              const priority = fLevel === 1 ? 2 : (fLevel === 2 ? 4 : 6);
              candidates.push({
                type: "admin",
                text: f._labelText,
                center: f._labelCenter,
                level: fLevel,
                priority,
                area: f._labelArea
              });
            }
          }
        }
      }
    }

    // City label candidates by tier and zoom (D2, D4)
    for (const c of ctx.data.cities || []) {
      if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
      if (currentFilter.country && currentFilter.country !== "all" && c.country !== currentFilter.country) continue;
      if (currentFilter.status && currentFilter.status !== "all") {
        const pick = ctx.store ? ctx.store.getPick(c.id) : "none";
        if (pick !== currentFilter.status) continue;
      }
      if (currentFilter.query && currentFilter.query.trim()) {
        const q = currentFilter.query.trim().toLowerCase();
        const match =
          (c.city && c.city.toLowerCase().includes(q)) ||
          (c.local && c.local.toLowerCase().includes(q));
        if (!match) continue;
      }

      const tier = getTier(c);
      const cityPick = ctx.store ? ctx.store.getPick(c.id) : "none";
      const isSingapore = c.country === "싱가포르";
      let allowed = false;
      if (tier === 1 || cityPick === "like") {
        allowed = true;
      } else if (tier === 2 && z >= 7) {
        allowed = true;
      } else if (tier === 3 && (z >= 9 || (isSingapore && z >= 3))) {
        allowed = true;
      }
      if (!allowed) continue;

      if (padded.contains([c.lat, c.lng])) {
        // Liked cities show at every zoom and win label overlaps
        const priority = cityPick === "like" ? 0.5 : (isSingapore && z <= 8 ? 2.5 : (tier === 1 ? 3 : (tier === 2 ? 5 : 7)));
        candidates.push({
          type: "city",
          pick: cityPick,
          city: c,
          text: c.city,
          center: [c.lat, c.lng],
          tier,
          priority,
          area: c.city === "충칭" ? 2e8 : (1e8 - tier * 1000)
        });
      }
    }

    if (seq !== renderSeq) return;

    // Update admin background areas (draw neighbors first, trip countries above)
    adminAreasLayer.clearLayers();
    for (const l of areaLayers) {
      adminAreasLayer.addLayer(l);
    }
    adminAreasLayer.eachLayer(function setPointer(lyr) {
      if (lyr.eachLayer) {
        lyr.eachLayer(setPointer);
      } else if (lyr._path) {
        lyr._path.style.pointerEvents = "auto";
      }
    });

    // Update city boundary areas (D5)
    cityAreasLayer.clearLayers();
    cityAreaLayers.clear();

    if (z >= 5 && visibleCitiesForArea.length > 0) {
      visibleCitiesForArea.sort((a, b) => getTier(b) - getTier(a));

      for (const c of visibleCitiesForArea) {
        const geoData = getFeatureForCity(c, cityAdmin, adminIndex);
        if (!geoData) continue;

        const pick = ctx.store ? ctx.store.getPick(c.id) : "none";
        const cityLayer = L.geoJSON(geoData, {
          style: () => cityAreaStyle(pick, z),
          interactive: true
        });

        cityLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (ctx.bus && typeof ctx.bus.emit === "function") {
            ctx.bus.emit("city:focus", { cityId: c.id, source: "map" });
          }
          openCityPopup(c);
          showCitySpots(c);
        });

        cityAreasLayer.addLayer(cityLayer);
        cityAreaLayers.set(c.id, cityLayer);
      }
    }

    // Place labels by priority collision (D4)
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.area - a.area;
    });

    const placedBoxes = [];
    adminLabelsLayer.clearLayers();

    // D6: City labels: one label per city. Do not draw an admin label (level 2 or 3)
    // whose name, without the suffix 시, 현, 구, equals a city label in view.
    const cityLabelsInView = new Set(
      candidates.filter((c) => c.type === "city").map((c) => c.text)
    );
    for (const c of ctx.data.cities || []) {
      if (c.lat != null && c.lng != null && padded.contains([c.lat, c.lng]) && c.city) {
        cityLabelsInView.add(c.city);
      }
    }

    for (const c of candidates) {
      if (z >= 10 && c.type === "admin" && c.level >= 2) {
        const baseName = c.text.replace(/(시|현|구)$/, "");
        if (cityLabelsInView.has(baseName)) {
          continue;
        }
      }
      const pt = map.latLngToContainerPoint(c.center);
      const charWidth = c.type === "city" ? (c.tier === 3 ? 10 : 12) : (c.level === 0 ? 14 : (c.level === 1 ? 12 : 10));
      const extraPadX = 0;
      const extraPadY = 0;
      const w = c.text.length * charWidth + (c.type === "city" ? 12 : 8) + extraPadX;
      const h = (c.level === 0 ? 22 : 18) + extraPadY;
      const box = {
        x1: pt.x - w / 2,
        x2: pt.x + w / 2,
        y1: pt.y - h / 2,
        y2: pt.y + h / 2
      };

      const overlaps = placedBoxes.some((b) => boxesIntersect(b.box, box));
      if (!overlaps) {
        placedBoxes.push({ box, priority: c.priority });
        if (c.type === "city") {
          const isInteractive = z > 4;
          const marker = L.marker(c.center, {
            pane: "cityLabelPane",
            icon: L.divIcon({
              className: `city-name-label tier-${c.tier} pick-${c.pick}${z <= 4 ? " low-zoom" : ""}`,
              html: c.text,
              iconSize: null
            }),
            interactive: isInteractive
          });
          if (isInteractive) {
            marker.on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              if (ctx.bus && typeof ctx.bus.emit === "function") {
                ctx.bus.emit("city:focus", { cityId: c.city.id, source: "map" });
              }
              openCityPopup(c.city);
              showCitySpots(c.city);
            });
          }
          adminLabelsLayer.addLayer(marker);
        } else {
          const marker = L.marker(c.center, {
            icon: L.divIcon({
              className: `admin-label level-${c.level}${z >= 10 ? " city-view" : ""}`,
              html: `<span class="admin-label-text">${c.text}</span>`,
              iconSize: [w, h],
              iconAnchor: [w / 2, h / 2]
            }),
            interactive: false
          });
          adminLabelsLayer.addLayer(marker);
        }
      }
    }
  }

  let moveDebounceTimer = null;
  function scheduleMapUpdate() {
    if (moveDebounceTimer) clearTimeout(moveDebounceTimer);
    moveDebounceTimer = setTimeout(() => {
      updateVectorBasemaps();
      updateAdminLayers();
      updateStationMarkers();
      updateBusTerminalMarkers();
    }, 150);
  }
  map.on("zoomend moveend", scheduleMapUpdate);

  // Spots layer (M1-2 Step 6)
  const spotsGroup = L.featureGroup().addTo(map);
  const spotMarkers = new Map();
  let currentSpotCity = null;

  map.on("zoomend moveend", () => {
    updateSpotMarkers();
  });

  function createCityPopupEl(c) {
    const div = document.createElement("div");
    div.className = "city-popup";
    div.setAttribute("data-city-id", c.id);

    const title = document.createElement("div");
    title.className = "popup-title";
    title.innerHTML = `<span>${c.city}</span>${c.local ? `<span class="popup-local">${c.local}</span>` : ""}`;
    div.appendChild(title);

    const descLine = (c.desc || "").split("\n")[0].trim();
    if (descLine) {
      const desc = document.createElement("div");
      desc.className = "popup-desc";
      desc.textContent = descLine;
      div.appendChild(desc);
    }

    const actions = document.createElement("div");
    actions.className = "popup-actions";

    const currentPick = ctx.store ? ctx.store.getPick(c.id) : "none";

    const btnLike = document.createElement("button");
    btnLike.type = "button";
    btnLike.className = `btn-popup-action like ${currentPick === "like" ? "active" : ""}`;
    btnLike.textContent = "끌림";
    btnLike.addEventListener("click", () => {
      if (ctx.store) {
        const cur = ctx.store.getPick(c.id);
        ctx.store.setPick(c.id, cur === "like" ? "none" : "like");
      }
    });
    actions.appendChild(btnLike);

    const btnPass = document.createElement("button");
    btnPass.type = "button";
    btnPass.className = `btn-popup-action pass ${currentPick === "pass" ? "active" : ""}`;
    btnPass.textContent = "패스";
    btnPass.addEventListener("click", () => {
      if (ctx.store) {
        const cur = ctx.store.getPick(c.id);
        ctx.store.setPick(c.id, cur === "pass" ? "none" : "pass");
      }
    });
    actions.appendChild(btnPass);

    const btnAdd = document.createElement("button");
    btnAdd.type = "button";
    btnAdd.className = "btn-popup-action add-stop";
    btnAdd.textContent = "경로에 추가";
    btnAdd.addEventListener("click", () => {
      if (ctx.store && typeof ctx.store.addStop === "function") {
        ctx.store.addStop(c.id);
      }
    });
    actions.appendChild(btnAdd);

    const btnDetail = document.createElement("button");
    btnDetail.type = "button";
    btnDetail.className = "btn-popup-action detail";
    btnDetail.setAttribute("data-action", "detail");
    btnDetail.textContent = "자세히";
    btnDetail.addEventListener("click", () => {
      ctx.bus?.emit?.("city:focus", { cityId: c.id, source: "popup" });
    });
    actions.appendChild(btnDetail);

    div.appendChild(actions);
    return div;
  }

  let activeCityPopup = null;
  function openCityPopup(c) {
    if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;
    const content = createCityPopupEl(c);
    if (!activeCityPopup) {
      activeCityPopup = L.popup({
        className: "map-city-popup",
        offset: [0, -10]
      });
    }
    activeCityPopup
      .setLatLng([c.lat, c.lng])
      .setContent(content)
      .openOn(map);
  }

  function createSpotPopupEl(spot) {
    const div = document.createElement("div");
    div.className = "spot-popup";
    div.setAttribute("data-spot-id", spot.id);

    const firstPhoto = Array.isArray(spot.photos) && spot.photos.length > 0 ? spot.photos[0] : null;
    if (firstPhoto) {
      const photosDiv = document.createElement("div");
      photosDiv.className = "spot-photos-row";
      photosDiv.style.marginBottom = "8px";
      photosDiv.style.width = "240px";
      const style = ctx.util ? ctx.util.photoStyle(firstPhoto, 1) : { src: firstPhoto };
      let photoEl;
      if (style.backgroundImage) {
        photoEl = document.createElement("div");
        photoEl.className = "spot-photo-thumb single-photo";
        photoEl.style.backgroundImage = style.backgroundImage;
        photoEl.style.backgroundSize = style.backgroundSize || "cover";
        photoEl.style.backgroundPosition = style.backgroundPosition || "center";
        photoEl.style.backgroundRepeat = "no-repeat";
        photoEl.style.width = "100%";
        photoEl.style.height = "140px";
        photoEl.style.borderRadius = "6px";
      } else {
        photoEl = document.createElement("img");
        photoEl.className = "spot-photo-thumb single-photo";
        photoEl.alt = spot.name || spot.spot || "장소 사진";
        photoEl.src = style.src || firstPhoto;
        photoEl.style.width = "100%";
        photoEl.style.height = "140px";
        photoEl.style.objectFit = "cover";
        photoEl.style.borderRadius = "6px";
      }
      photosDiv.appendChild(photoEl);
      div.appendChild(photosDiv);
    }

    const title = document.createElement("div");
    title.className = "popup-title";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = spot.name || spot.spot || "";
    title.appendChild(titleSpan);
    div.appendChild(title);

    const cat = spot.cat || spot.category_std;
    if (cat) {
      const badge = document.createElement("span");
      badge.className = "cost-badge spot-cat-badge";
      badge.textContent = cat;
      div.appendChild(badge);
    }

    if (spot.fee) {
      const feeBadge = document.createElement("span");
      feeBadge.className = "cost-badge spot-fee-badge";
      if (spot.fee.free) feeBadge.textContent = "무료";
      else if (spot.fee.krw) feeBadge.textContent = `입장료 ${ctx.util.formatKRW(spot.fee.krw)}`;
      else if (spot.fee.text) feeBadge.textContent = spot.fee.text;
      else feeBadge.textContent = "입장료 유료";
      div.appendChild(feeBadge);
    }

    const actions = document.createElement("div");
    actions.className = "popup-actions spot-popup-actions";

    const curPick = ctx.store ? ctx.store.getPick(spot.id) : "none";

    const btnLike = document.createElement("button");
    btnLike.type = "button";
    btnLike.className = `btn btn-popup-action btn-spot-like like ${curPick === "like" ? "is-active active" : ""}`;
    btnLike.setAttribute("data-action", "like");
    btnLike.textContent = "끌림";
    btnLike.addEventListener("click", () => {
      if (ctx.store) {
        const p = ctx.store.getPick(spot.id);
        ctx.store.setPick(spot.id, p === "like" ? "none" : "like");
      }
    });
    actions.appendChild(btnLike);

    const btnPass = document.createElement("button");
    btnPass.type = "button";
    btnPass.className = `btn btn-popup-action btn-spot-pass pass ${curPick === "pass" ? "is-active active" : ""}`;
    btnPass.setAttribute("data-action", "pass");
    btnPass.textContent = "패스";
    btnPass.addEventListener("click", () => {
      if (ctx.store) {
        const p = ctx.store.getPick(spot.id);
        ctx.store.setPick(spot.id, p === "pass" ? "none" : "pass");
      }
      map.closePopup();
    });
    actions.appendChild(btnPass);

    const btnDetail = document.createElement("button");
    btnDetail.type = "button";
    btnDetail.className = "btn btn-popup-action btn-spot-detail detail";
    btnDetail.setAttribute("data-action", "detail");
    btnDetail.textContent = "자세히";
    btnDetail.addEventListener("click", () => {
      const cityId = spot.cityId || (spot.city ? `city:${spot.city}` : null);
      if (ctx.bus && typeof ctx.bus.emit === "function") {
        ctx.bus.emit("pane:show", { pane: "browse" });
      }
      const browseTab = document.querySelector('#mobile-tabs button[data-pane="browse"]');
      if (browseTab) {
        browseTab.click();
      }
      if (cityId && ctx.bus && typeof ctx.bus.emit === "function") {
        ctx.bus.emit("city:focus", { cityId, source: "map" });
      }
      setTimeout(() => {
        const card = document.querySelector(`.spot-card[data-spot-id="${spot.id}"], [data-spot-id="${spot.id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("is-flashing");
          setTimeout(() => card.classList.remove("is-flashing"), 1200);
        }
      }, 300);
      map.closePopup();
    });
    actions.appendChild(btnDetail);

    div.appendChild(actions);
    return div;
  }

  function createSpotMarker(spot) {
    if (typeof spot.lat !== "number" || typeof spot.lng !== "number") return null;

    const pick = ctx.store ? ctx.store.getPick(spot.id) : "none";
    if (pick === "pass") return null;

    const rawCat = spot.cat || spot.category_std || "명소";
    const letter = (rawCat.length > 0 ? rawCat[0] : "•").toUpperCase();

    const spotIcon = L.divIcon({
      className: "spot-div-icon",
      html: `<span class="spot-marker-pin pick-${pick}"><span class="spot-letter">${letter}</span></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const spotMarker = L.marker([spot.lat, spot.lng], { icon: spotIcon });
    spotMarker._spot = spot;

    spotMarker.bindPopup(() => createSpotPopupEl(spot), {
      className: "map-spot-popup",
      offset: [0, -10]
    });

    spotMarker.on("click", () => {
      if (ctx.bus && typeof ctx.bus.emit === "function") {
        ctx.bus.emit("spot:focus", { spotId: spot.id, source: "map" });
      }
      spotMarker.openPopup();
    });

    return spotMarker;
  }

  function updateSpotMarkers() {
    spotsGroup.clearLayers();
    spotMarkers.clear();

    // Spots follow the map area, not one city (user, 2026-11-04): at zoom 11 and more every lens shows the spots in view;
    // the 장소 lens shows them at every zoom
    if (currentLens !== "장소" && map.getZoom() < 11) {
      return;
    }
    const allSpots = ctx.data.spots || [];
    const paddedBounds = map.getBounds().pad(0.3);
    for (const s of allSpots) {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
      if (!paddedBounds.contains([s.lat, s.lng])) continue;
      if (currentFilter.country && currentFilter.country !== "all" && s.country !== currentFilter.country) continue;
      const marker = createSpotMarker(s);
      if (marker) {
        spotMarkers.set(s.id, marker);
        spotsGroup.addLayer(marker);
      }
    }
  }

  function showCitySpots(city) {
    currentSpotCity = city || null;
    updateSpotMarkers();
  }

  function _legacyShowCitySpots(city) {
    spotsGroup.clearLayers();
    spotMarkers.clear();
    currentSpotCity = city || null;
    if (!city) return;
    if (map.getZoom() < 11) return;

    const spots = ctx.data.spotsOfCity ? ctx.data.spotsOfCity(city.id) : [];
    for (const spot of spots) {
      if (typeof spot.lat !== "number" || typeof spot.lng !== "number") continue;

      const rawCat = spot.cat || spot.category_std || "명소";
      const letter = (rawCat.length > 0 ? rawCat[0] : "•").toUpperCase();

      const pick = ctx.store ? ctx.store.getPick(spot.id) : "none";
      if (pick === "pass") continue;
      const spotIcon = L.divIcon({
        className: "spot-div-icon",
        html: `<span class="spot-marker-pin pick-${pick}"><span class="spot-letter">${letter}</span></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const spotMarker = L.marker([spot.lat, spot.lng], { icon: spotIcon });
      spotMarker._spot = spot;
      spotMarkers.set(spot.id, spotMarker);

      const content = createSpotPopupEl(spot);
      spotMarker.bindPopup(content, {
        className: "map-spot-popup",
        offset: [0, -10]
      });

      spotMarker.on("click", () => {
        if (ctx.bus && typeof ctx.bus.emit === "function") {
          ctx.bus.emit("spot:focus", { spotId: spot.id, source: "map" });
        }
        spotMarker.openPopup();
      });

      spotsGroup.addLayer(spotMarker);
    }
  }

  // Bus listeners
  if (ctx.bus && typeof ctx.bus.on === "function") {
    ctx.bus.on("pick:changed", ({ id, v }) => {
      if (String(id).startsWith("city:")) {
        updateAdminLayers();
        updateSpotMarkers();
      } else {
        if (v === "pass") {
          const sm = spotMarkers.get(id);
          if (sm) {
            spotsGroup.removeLayer(sm);
            spotMarkers.delete(id);
          }
        } else {
          let sm = spotMarkers.get(id);
          if (!sm) {
            const spot = (ctx.data.spots || []).find((s) => s.id === id);
            if (spot) {
              sm = createSpotMarker(spot);
              if (sm) {
                spotMarkers.set(id, sm);
                spotsGroup.addLayer(sm);
              }
            }
          } else {
            const el = sm.getElement ? sm.getElement() : null;
            const pin = el ? el.querySelector(".spot-marker-pin") : null;
            if (pin) pin.className = `spot-marker-pin pick-${v}`;
          }
        }
        const spotPopup = document.querySelector(`.spot-popup[data-spot-id="${id}"]`);
        if (spotPopup) {
          const btnLike = spotPopup.querySelector(".btn-spot-like");
          const btnPass = spotPopup.querySelector(".btn-spot-pass");
          if (btnLike) btnLike.classList.toggle("is-active", v === "like");
          if (btnPass) btnPass.classList.toggle("is-active", v === "pass");
        }
      }
      const layer = cityAreaLayers.get(id);
      if (layer) {
        layer.setStyle(cityAreaStyle(v, map.getZoom()));
      }
      const popupEl = document.querySelector(`.city-popup[data-city-id="${id}"]`);
      if (popupEl) {
        const btnLike = popupEl.querySelector(".btn-popup-action.like");
        const btnPass = popupEl.querySelector(".btn-popup-action.pass");
        if (btnLike) btnLike.classList.toggle("active", v === "like");
        if (btnPass) btnPass.classList.toggle("active", v === "pass");
      }
    });

    ctx.bus.on("city:focus", ({ cityId, source }) => {
      if (source === "map") return;
      const c = ctx.data.cityById ? ctx.data.cityById(cityId) : null;
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return;

      if (typeof map.flyTo === "function") {
        map.flyTo([c.lat, c.lng], 10, { duration: 0.5 });
      }
      map.setView([c.lat, c.lng], 10);
      showCitySpots(c);
      openCityPopup(c);
    });

    ctx.bus.on("spot:focus", ({ spotId, source }) => {
      let sm = spotMarkers.get(spotId);
      if (!sm) {
        const spot = (ctx.data.spots || []).find((s) => s.id === spotId);
        if (spot && spot.cityId) {
          const city = ctx.data.cityById ? ctx.data.cityById(spot.cityId) : null;
          if (city) {
            if (map.getZoom() < 11 && currentLens !== "장소") {
              map.setView([spot.lat || city.lat, spot.lng || city.lng], 11);
            }
            showCitySpots(city);
            sm = spotMarkers.get(spotId);
          }
        }
      }
      if (source === "card") {
        // From a spot card name: go to the place even before its marker exists, then open it once the view loads spots
        const spot = (ctx.data.spots || []).find((x) => x.id === spotId);
        if (spot && typeof spot.lat === "number") {
          // Markers are rebuilt after the move, so open the popup on the new marker
          map.once("moveend", () => setTimeout(() => spotMarkers.get(spotId)?.openPopup(), 450));
          map.setView([spot.lat, spot.lng], Math.max(map.getZoom(), 13), { animate: true });
          setTimeout(() => { const mk = spotMarkers.get(spotId); if (mk && !mk.isPopupOpen()) mk.openPopup(); }, 1300);
          return;
        }
      }
      if (sm) {
        if (source === "card") {
          map.setView(sm.getLatLng(), Math.max(map.getZoom(), 13), { animate: true });
        } else if (source !== "map") {
          map.panTo(sm.getLatLng());
        }
        sm.openPopup();
      }
    });
  }

  const FILTER_STATUS_MAP = {
    "전체": "all",
    "all": "all",
    "끌림": "like",
    "like": "like",
    "미정": "none",
    "none": "none",
    "패스": "pass",
    "pass": "pass"
  };

  function applyFilter(filter) {
    if (filter) {
      if (filter.country !== undefined) currentFilter.country = filter.country;
      if (filter.status !== undefined) {
        currentFilter.status = FILTER_STATUS_MAP[filter.status] || filter.status;
      }
      if (filter.query !== undefined) currentFilter.query = filter.query;
    }
    updateSpotMarkers();
    updateAdminLayers();
  }

  let updateRouteBtnVisibility = () => {};
  const lensButtons = [];
  const lensControl = L.control({ position: "topleft" });
  lensControl.onAdd = function () {
    const div = L.DomUtil.create("div", "map-lens-control");
    div.id = "map-lens";

    // Satellite sits on the map only, left of 나라/지역/장소 (user, 2026-11-05)
    if (webMode) {
      basemapBtn = document.createElement("button");
      basemapBtn.type = "button";
      basemapBtn.className = `chip-lens chip-basemap ${currentBasemap === "satellite" ? "is-active active" : ""}`;
      basemapBtn.setAttribute("data-basemap", "satellite");
      basemapBtn.textContent = "위성";
      basemapBtn.addEventListener("click", () => {
        setBasemap(currentBasemap === "satellite" ? "voyager" : "satellite");
      });
      div.appendChild(basemapBtn);
      const sep = document.createElement("span");
      sep.className = "map-lens-sep";
      div.appendChild(sep);
    }

    for (const opt of LENS_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip-lens ${opt.label === currentLens ? "is-active" : ""}`;
      btn.setAttribute("data-lens", opt.label);
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        setLens(opt.label);
      });
      div.appendChild(btn);
      lensButtons.push(btn);
    }

    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  lensControl.addTo(map);


  function updateLensChipsUI() {
    for (const btn of lensButtons) {
      const isActive = btn.getAttribute("data-lens") === currentLens;
      btn.classList.toggle("is-active", isActive);
      btn.classList.toggle("active", isActive);
    }
  }

  function setLens(lensLabel) {
    currentLens = lensLabel;
    try {
      localStorage.setItem("trip-map-lens", currentLens);
    } catch (_) {}
    updateLensChipsUI();

    const minZ = LENS_MIN_ZOOM[currentLens];
    if (minZ && map.getZoom() < minZ) {
      map.setZoom(minZ);
    } else {
      updateAdminLayers();
      updateSpotMarkers();
    }
  }

  const toolbarControl = L.control({ position: "topright" });
  toolbarControl.onAdd = function () {
    const div = L.DomUtil.create("div", "map-toolbar-control");
    div.id = "map-toolbar";

    const btnRoute = document.createElement("button");
    btnRoute.type = "button";
    btnRoute.id = "map-fit-route";
    btnRoute.className = "btn-fit-route";
    btnRoute.title = "경로 맞춤";
    btnRoute.setAttribute("aria-label", "경로 맞춤");
    btnRoute.textContent = "⤢";
    btnRoute.addEventListener("click", () => {
      const plan = ctx.store && typeof ctx.store.getPlan === "function" ? ctx.store.getPlan() : null;
      fitRoute(plan);
    });
    div.appendChild(btnRoute);

    updateRouteBtnVisibility = function (plan) {
      const p = plan || (ctx.store && typeof ctx.store.getPlan === "function" ? ctx.store.getPlan() : null);
      const stops = p && Array.isArray(p.stops) ? p.stops : [];
      const show = stops.length >= 1;
      btnRoute.hidden = !show;
      div.hidden = !show;
    };
    updateRouteBtnVisibility();

    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  toolbarControl.addTo(map);

  if (ctx.bus && typeof ctx.bus.on === "function") {
    ctx.bus.on("filter:changed", (filter) => {
      applyFilter(filter);
    });
  }

  // Initial bounds fit
  const cityBounds = L.latLngBounds();
  for (const c of ctx.data.cities || []) {
    if (typeof c.lat === "number" && typeof c.lng === "number") {
      cityBounds.extend([c.lat, c.lng]);
    }
  }

  map.invalidateSize();
  if (cityBounds.isValid()) {
    map.fitBounds(cityBounds, { padding: [24, 24], maxZoom: 6 });
  } else {
    map.setView([15.0, 105.0], 5);
  }

  // Handle pane show and resize (Edge Cases §4)
  if (ctx.bus && typeof ctx.bus.on === "function") {
    ctx.bus.on("pane:show", ({ pane }) => {
      if (pane === "map") {
        map.invalidateSize();
        updateAdminLayers();
        updateSpotMarkers();
      }
    });
  }

  window.addEventListener("resize", () => {
    map.invalidateSize();
  });

  // M1-3: Route line and leg distances
  const routeGroup = L.featureGroup().addTo(map);

  function updateRoute(plan) {
    routeGroup.clearLayers();
    if (!plan || !Array.isArray(plan.stops) || plan.stops.length === 0) {
      return;
    }

    const validStops = [];
    for (const stop of plan.stops) {
      const cityId = stop.cityId;
      const c = ctx.data.cityById ? ctx.data.cityById(cityId) : null;
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") {
        console.warn(`Stop city "${cityId}" has no coordinates, skipping in route`);
        continue;
      }
      validStops.push({ stop, city: c, lat: c.lat, lng: c.lng });
    }

    if (validStops.length === 0) return;

    // Step 1: Polyline through the stop cities in order with className: "route-line"
    if (validStops.length >= 2) {
      const latlngs = validStops.map((s) => [s.lat, s.lng]);
      const polyline = L.polyline(latlngs, {
        className: "route-line",
        color: "#2F6FDB",
        weight: 3,
        opacity: 0.85
      });
      polyline.addTo(routeGroup);
    }

    // Step 2: ADD one route-badge marker per stop with its number (1, 2, 3) above the city marker
    for (let i = 0; i < validStops.length; i++) {
      const s = validStops[i];
      const num = i + 1;
      const badgeIcon = L.divIcon({
        className: "route-badge",
        html: `<span>${num}</span>`,
        iconSize: [20, 20],
        iconAnchor: [10, 22]
      });
      const badgeMarker = L.marker([s.lat, s.lng], {
        icon: badgeIcon,
        interactive: false,
        zIndexOffset: 1000
      });
      badgeMarker.addTo(routeGroup);
    }

    // Step 3: ADD one leg-label tooltip at the middle of each leg with straight distance from util.distanceKm
    for (let i = 0; i < validStops.length - 1; i++) {
      const a = validStops[i];
      const b = validStops[i + 1];
      const midLat = (a.lat + b.lat) / 2;
      const midLng = (a.lng + b.lng) / 2;
      const km =
        ctx.util && typeof ctx.util.distanceKm === "function"
          ? ctx.util.distanceKm(a.lat, a.lng, b.lat, b.lng)
          : 0;
      const distText = `약 ${Math.round(km)}km`;

      const legMarker = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "leg-label-anchor",
          iconSize: [1, 1],
          html: ""
        }),
        interactive: false
      });
      legMarker.bindTooltip(distText, {
        permanent: true,
        direction: "center",
        className: "leg-label",
        interactive: false
      });
      legMarker.addTo(routeGroup);
    }
  }

  function fitRoute(plan) {
    const currentPlan = plan || (ctx.store && typeof ctx.store.getPlan === "function" ? ctx.store.getPlan() : null);
    const stops = currentPlan && Array.isArray(currentPlan.stops) ? currentPlan.stops : [];
    const validStops = [];
    for (const stop of stops) {
      const cityId = stop.cityId;
      const c = ctx.data.cityById ? ctx.data.cityById(cityId) : null;
      if (c && typeof c.lat === "number" && typeof c.lng === "number") {
        validStops.push({ lat: c.lat, lng: c.lng });
      }
    }
    if (validStops.length === 0) {
      return false;
    }
    const bounds = L.latLngBounds();
    for (const s of validStops) {
      bounds.extend([s.lat, s.lng]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      return true;
    }
    return false;
  }

  let lastStopCount = 0;
  // At start and on plan:changed, replace route layer
  if (ctx.store && typeof ctx.store.getPlan === "function") {
    const initPlan = ctx.store.getPlan();
    updateRoute(initPlan);
    updateRouteBtnVisibility(initPlan);
    if (initPlan && Array.isArray(initPlan.stops)) {
      lastStopCount = initPlan.stops.length;
    }
  }

  if (ctx.bus && typeof ctx.bus.on === "function") {
    ctx.bus.on("plan:changed", ({ plan }) => {
      updateRoute(plan);
      updateRouteBtnVisibility(plan);
      const newStops = plan && Array.isArray(plan.stops) ? plan.stops : [];
      const newCount = newStops.length;
      if (newCount > lastStopCount && newCount > 0) {
        const newStop = newStops[newStops.length - 1];
        const c = ctx.data.cityById ? ctx.data.cityById(newStop.cityId) : null;
        if (c && typeof c.lat === "number" && typeof c.lng === "number") {
          const inView = map.getBounds().contains([c.lat, c.lng]);
          if (!inView) {
            fitRoute(plan);
          }
        }
      }
      lastStopCount = newCount;
    });
  }

  function fitTo(cityIds) {
    if (!cityIds || !cityIds.length) return;
    const bounds = L.latLngBounds();
    for (const id of cityIds) {
      const c = ctx.data.cityById ? ctx.data.cityById(id) : null;
      if (c && typeof c.lat === "number" && typeof c.lng === "number") {
        bounds.extend([c.lat, c.lng]);
      }
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  const ready = (async () => {
    map.invalidateSize();
    try {
      await Promise.all([updateAdminLayers(), initLandPane()]);
      updateSpotMarkers();
    } catch (_) {}
    return true;
  })();

  return {
    ready,
    getMap: () => map,
    fitTo,
    fitRoute,
    setBasemap,
    getBasemap: () => currentBasemap
  };
}

