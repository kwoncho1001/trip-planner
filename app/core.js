/**
 * Asia trip planner v4 - Shared core
 * docs/design/app-contract.md
 */

// --- Event Bus (contract §4) ---
const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(fn);
    return () => {
      const set = listeners.get(event);
      if (set) {
        set.delete(fn);
        if (set.size === 0) {
          listeners.delete(event);
        }
      }
    };
  },
  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`bus listener error on event "${event}":`, err);
      }
    }
  }
};

// --- Back button ---
// Each open screen (city detail, photo viewer, phone tab) adds one history entry.
// The browser Back button closes the latest screen instead of leaving the artifact.
const navStack = [];
export const nav = {
  // Open a screen. Opening the screen that is already on top only replaces its close function.
  open(key, closeFn) {
    const top = navStack[navStack.length - 1];
    if (top && top.key === key) { top.closeFn = closeFn; return; }
    navStack.push({ key, closeFn });
    try { history.pushState({ tripNav: navStack.length }, ""); } catch (e) {}
  },
  // Close a screen from the page (a button or Escape): go back one entry, popstate runs closeFn
  close(key, closeFn) {
    const top = navStack[navStack.length - 1];
    if (top && top.key === key) { history.back(); return; }
    const i = navStack.findIndex((x) => x.key === key);
    if (i >= 0) navStack.splice(i, 1);
    closeFn();
  },
  isOpen(key) { return navStack.some((x) => x.key === key); }
};
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const top = navStack.pop();
    if (top) top.closeFn();
  });
}

// --- Mode detection (D2) ---
export function isWebMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("web") === "1" || params.get("selftest") === "web-mode") return true;
  if (!window.claude && !params.has("selftest")) return true;
  return false;
}

// --- Utilities (contract §7) ---
export const util = {
  isWebMode,
  distanceKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
    const R = 6371;
    const p1 = (Number(lat1) * Math.PI) / 180;
    const p2 = (Number(lat2) * Math.PI) / 180;
    const dp = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
    const dl = ((Number(lng2) - Number(lng1)) * Math.PI) / 180;
    const a =
      Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toKRW(amount, currency) {
    if (amount == null || amount === "" || isNaN(amount)) return null;
    const num = Number(amount);
    if (!isFinite(num)) return null;
    const curr = String(currency || "").toUpperCase();
    if (curr === "KRW") return Math.round(num);
    const rate = data.rates?.toKRW?.[curr];
    if (rate == null || isNaN(rate)) return null;
    return Math.round(num * Number(rate));
  },

  addDays(isoDate, n) {
    if (!isoDate || typeof isoDate !== "string") return "";
    const parts = isoDate.split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return isoDate;
    const [y, m, d] = parts;
    const dt = new Date(Date.UTC(y, m - 1, d + Number(n || 0)));
    return dt.toISOString().slice(0, 10);
  },

  daysBetween(a, b) {
    if (!a || !b) return 0;
    const [ya, ma, da] = a.split("-").map(Number);
    const [yb, mb, db] = b.split("-").map(Number);
    const utca = Date.UTC(ya, ma - 1, da);
    const utcb = Date.UTC(yb, mb - 1, db);
    return Math.round((utcb - utca) / (24 * 3600 * 1000));
  },

  formatKRW(n) {
    if (n == null || isNaN(n)) return "";
    const num = Number(n);
    if (num >= 10000) {
      const man = num / 10000;
      const formatted = Number.isInteger(man) ? String(man) : parseFloat(man.toFixed(1)).toString();
      return `${formatted}만원`;
    }
    return `${Math.round(num).toLocaleString("ko-KR")}원`;
  },

  planDates(plan) {
    if (!plan || !Array.isArray(plan.stops) || plan.stops.length === 0) {
      return [];
    }
    const result = [];
    let currentArrive = plan.startDate || "2026-12-13";
    for (let i = 0; i < plan.stops.length; i++) {
      const stop = plan.stops[i];
      const nights = Number(stop.nights) || 0;
      const depart = util.addDays(currentArrive, nights);
      result.push({
        key: stop.key,
        arrive: currentArrive,
        depart
      });
      const overnight = Boolean(stop.leg && stop.leg.overnight);
      currentArrive = util.addDays(depart, overnight ? 1 : 0);
    }
    return result;
  },

  el(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class" || k === "className") {
        element.className = v;
      } else if (k === "style" && typeof v === "object") {
        Object.assign(element.style, v);
      } else if (k.startsWith("on") && typeof v === "function") {
        element.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== null && v !== undefined && v !== false) {
        element.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child == null) continue;
      if (typeof child === "string" || typeof child === "number") {
        element.appendChild(document.createTextNode(String(child)));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    }
    return element;
  },

  photoStyle(path, count) {
    if (!path || typeof path !== "string" || !path.includes("#")) {
      return { src: path || "" };
    }
    const hashIdx = path.lastIndexOf("#");
    const file = path.slice(0, hashIdx);
    // "#n/N": frame n of a pack with N frames (food and media packs hold many items)
    const [nStr, nTotal] = path.slice(hashIdx + 1).split("/");
    const n = parseInt(nStr, 10) || 0;
    const c = parseInt(nTotal, 10) || (typeof count === "number" && count > 0 ? count : 1);
    const pos = c <= 1 ? "0% 0%" : `0% ${(n / (c - 1)) * 100}%`;
    return {
      backgroundImage: `url(${file})`,
      backgroundSize: `100% ${c * 100}%`,
      backgroundPosition: pos
    };
  }
};

// --- Store (contract §5) ---
function createEmptyPlan() {
  return {
    version: 1,
    startDate: "2026-12-13",
    budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
    stops: [],
    legs: [],
    requests: []
  };
}

function syncLegs(plan) {
  if (!plan || !Array.isArray(plan.stops)) return;
  const stops = plan.stops;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const nextStop = stops[i + 1];
    if (!nextStop) {
      if (stops.length > 1 && stop.leg) {
        stop.leg = {
          mode: null,
          hours: null,
          cost: null,
          currency: null,
          overnight: false
        };
      }
    } else {
      if (!stop.leg) {
        stop.leg = {
          fromCityId: stop.cityId,
          toCityId: nextStop.cityId,
          mode: null,
          hours: null,
          cost: null,
          currency: null,
          overnight: false
        };
      } else {
        if (stop.leg.fromCityId || stop.leg.toCityId) {
          if (stop.leg.fromCityId !== stop.cityId || stop.leg.toCityId !== nextStop.cityId) {
            stop.leg = {
              fromCityId: stop.cityId,
              toCityId: nextStop.cityId,
              mode: null,
              hours: null,
              cost: null,
              currency: null,
              overnight: false
            };
          }
        } else {
          stop.leg.fromCityId = stop.cityId;
          stop.leg.toCityId = nextStop.cityId;
        }
      }
    }
  }
}

let lastStopTimestamp = 0;
function nextStopKey() {
  let now = Date.now();
  if (now <= lastStopTimestamp) {
    now = lastStopTimestamp + 1;
  }
  lastStopTimestamp = now;
  return "s" + now;
}

let storageBannerTimer = null;
function showStorageBanner(text) {
  const slot = document.getElementById("banner-slot");
  if (!slot) return;
  let b = document.getElementById("storage-banner");
  if (!b) {
    b = document.createElement("div");
    b.id = "storage-banner";
    b.className = "banner warning";
    slot.appendChild(b);
  }
  b.textContent = text;
  b.hidden = false;
  if (storageBannerTimer) clearTimeout(storageBannerTimer);
  storageBannerTimer = setTimeout(() => {
    b.hidden = true;
  }, 4000);
}

function showSaveError() {
  const slot = document.getElementById("banner-slot");
  if (!slot) return;
  const div = document.createElement("div");
  div.className = "banner error";
  div.textContent = "저장하지 못했습니다. 다시 시도하세요";
  slot.appendChild(div);
  setTimeout(() => {
    div.remove();
  }, 4000);
}

let resolveStoreReady;
const storeReadyPromise = new Promise((resolve) => {
  resolveStoreReady = resolve;
});



export const store = {
  ready: storeReadyPromise,
  picksMap: {},
  planObj: createEmptyPlan(),
  useLocal: false,
  isSelftest: false,
  db: null,
  refPicks: null,
  refPlan: null,
  picksDocExists: false,
  planDocExists: false,
  initialized: false,

  async init() {
    if (this.initialized) return this.ready;
    this.initialized = true;

    this.isSelftest =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("selftest");

    if (this.isSelftest) {
      resolveStoreReady();
      return this.ready;
    }

    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(null), 10000);
    });

    let dbInstance = null;
    try {
      if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
        const usePromise = window.claude.use("db").catch(() => null);
        dbInstance = await Promise.race([usePromise, timeoutPromise]);
      }
    } catch (e) {
      dbInstance = null;
    }
    clearTimeout(timeoutId);

    if (dbInstance && typeof dbInstance.doc === "function") {
      try {
        this.db = dbInstance;
        this.refPicks = dbInstance.doc("state/picks");
        this.refPlan = dbInstance.doc("state/plan");

        let picksLoaded = false;
        let planLoaded = false;
        const checkReady = () => {
          if (picksLoaded && planLoaded) {
            resolveStoreReady();
          }
        };

        this.refPicks.onSnapshot(
          (snap) => {
            this.picksDocExists = Boolean(snap && snap.exists);
            // db snapshots are frozen: copy them so setPick can add keys
            this.picksMap = (snap && snap.exists) ? JSON.parse(JSON.stringify(snap.data() || {})) : {};
            picksLoaded = true;
            checkReady();
          },
          (err) => {
            console.warn("db picks snapshot error, fallback to localStorage", err);
            this.fallbackToLocal();
          }
        );

        this.refPlan.onSnapshot(
          (snap) => {
            this.planDocExists = Boolean(snap && snap.exists);
            this.planObj =
              (snap && snap.exists && snap.data()?.version)
                ? JSON.parse(JSON.stringify(snap.data()))
                : createEmptyPlan();
            planLoaded = true;
            checkReady();
          },
          (err) => {
            console.warn("db plan snapshot error, fallback to localStorage", err);
            this.fallbackToLocal();
          }
        );
        return this.ready;
      } catch (err) {
        console.warn("db setup error, fallback to localStorage", err);
      }
    }

    this.fallbackToLocal();
    return this.ready;
  },

  fallbackToLocal() {
    this.useLocal = true;
    showStorageBanner("이 기기에만 저장 중 — Claude가 읽을 수 없습니다");
    try {
      const savedPicks = localStorage.getItem("trip-picks");
      this.picksMap = savedPicks ? JSON.parse(savedPicks) : {};
    } catch (e) {
      this.picksMap = {};
    }
    try {
      const savedPlan = localStorage.getItem("trip-plan");
      this.planObj = savedPlan ? JSON.parse(savedPlan) : createEmptyPlan();
    } catch (e) {
      this.planObj = createEmptyPlan();
    }
    resolveStoreReady();
  },

  getPick(id) {
    const item = this.picksMap[id];
    if (!item) return "none";
    return item.v === "curious" ? "like" : (item.v || "none");
  },

  async setPick(id, v) {
    const t = Date.now();
    const existing = this.picksMap[id] || {};
    const nextPick = { ...existing, v, t };
    this.picksMap[id] = nextPick;
    bus.emit("pick:changed", { id, v });

    if (this.isSelftest) return;

    if (this.useLocal || !this.refPicks) {
      try {
        localStorage.setItem("trip-picks", JSON.stringify(this.picksMap));
      } catch (e) {
        showSaveError();
      }
      return;
    }

    try {
      // Write the whole map: field keys like "city:홍콩" fail as update paths, and the failed write let the snapshot revert the pick
      await this.refPicks.set({ ...this.picksMap });
      this.picksDocExists = true;
    } catch (e) {
      console.error("store.setPick error", e);
      showSaveError();
    }
  },

  picks() {
    return { ...this.picksMap };
  },

  getNote(id) {
    return this.picksMap[id]?.note || "";
  },

  async setNote(id, text) {
    const t = Date.now();
    const existing = this.picksMap[id] || { v: "none" };
    const nextPick = { ...existing, note: text, t };
    this.picksMap[id] = nextPick;

    if (this.isSelftest) return;

    if (this.useLocal || !this.refPicks) {
      try {
        localStorage.setItem("trip-picks", JSON.stringify(this.picksMap));
      } catch (e) {
        showSaveError();
      }
      return;
    }

    try {
      // Write the whole map: field keys like "city:홍콩" fail as update paths, and the failed write let the snapshot revert the pick
      await this.refPicks.set({ ...this.picksMap });
      this.picksDocExists = true;
    } catch (e) {
      console.error("store.setNote error", e);
      showSaveError();
    }
  },

  getPlan() {
    const plan = JSON.parse(JSON.stringify(this.planObj || createEmptyPlan()));
    if (!plan.legs) plan.legs = [];
    if (!plan.requests) plan.requests = [];
    return plan;
  },

  async setPlan(plan) {
    const p = JSON.parse(JSON.stringify(plan || createEmptyPlan()));
    if (!p.legs) p.legs = [];
    if (!p.requests) p.requests = [];
    syncLegs(p);
    this.planObj = p;
    bus.emit("plan:changed", { plan: this.planObj });

    if (this.isSelftest) return;

    if (this.useLocal || !this.refPlan) {
      try {
        localStorage.setItem("trip-plan", JSON.stringify(this.planObj));
      } catch (e) {
        showSaveError();
      }
      return;
    }

    try {
      await this.refPlan.set(this.planObj);
      this.planDocExists = true;
    } catch (e) {
      console.error("store.setPlan error", e);
      showSaveError();
    }
  },

  async addStop(cityId) {
    const plan = this.getPlan();
    const stops = plan.stops || [];
    if (stops.length > 0 && stops[stops.length - 1].cityId === cityId) {
      return stops[stops.length - 1].key;
    }
    const key = nextStopKey();
    if (stops.length > 0) {
      const prevStop = stops[stops.length - 1];
      prevStop.leg = prevStop.leg || {};
      prevStop.leg.fromCityId = prevStop.cityId;
      prevStop.leg.toCityId = cityId;
    }
    stops.push({
      key,
      cityId,
      nights: 1,
      note: "",
      excludeBudget: false,
      leg: {
        mode: null,
        hours: null,
        cost: null,
        currency: null,
        overnight: false
      }
    });
    plan.stops = stops;
    await this.setPlan(plan);
    return key;
  }
};

// --- Data (contract §6) ---
async function fetchJsonSafe(url, defaultVal) {
  try {
    const res = await fetch(url);
    if (!res.ok) return defaultVal;
    return await res.json();
  } catch (e) {
    return defaultVal;
  }
}

export const data = {
  cities: [],
  spots: [],
  rates: null,
  constraints: null,
  cityById(id) {
    return null;
  },
  spotsOfCity(cityId) {
    return [];
  },

  async load() {
    const defaultConstraints = {
      startDate: "2026-12-13",
      chinaEntry: "2026-12-18",
      chinaExitBy: "2027-01-17",
      chinaMaxDays: 30,
      nhaTrangArrive: "2027-01-25",
      familyNights: 6,
      returnDate: "2027-02-20",
      budgetKRW: 4000000
    };
    const defaultRates = {
      asOf: "",
      approx: true,
      toKRW: { KRW: 1 }
    };

    const [citiesIdx, spotsIdx, cityinfoIdx, ratesJson, constraintsJson] =
      await Promise.all([
        fetchJsonSafe("cities/index.json", []),
        fetchJsonSafe("spots/index.json", []),
        fetchJsonSafe("cityinfo/index.json", []),
        fetchJsonSafe("data/rates.json", null),
        fetchJsonSafe("data/constraints.json", null)
      ]);

    this.rates = ratesJson || defaultRates;
    this.constraints = constraintsJson || defaultConstraints;

    const cityFilesPromises = (Array.isArray(citiesIdx) ? citiesIdx : []).map(
      (f) => fetchJsonSafe(f, [])
    );
    const spotFilesPromises = (Array.isArray(spotsIdx) ? spotsIdx : []).map(
      (f) => fetchJsonSafe(f, [])
    );
    const cityinfoFilesPromises = (Array.isArray(cityinfoIdx) ? cityinfoIdx : []).map(
      (f) => fetchJsonSafe(f, null)
    );

    const [cityFiles, spotFiles, cityinfoFiles] = await Promise.all([
      Promise.all(cityFilesPromises),
      Promise.all(spotFilesPromises),
      Promise.all(cityinfoFilesPromises)
    ]);

    const cityInfoMap = new Map();
    for (const raw of cityinfoFiles) {
      if (!raw) continue;
      const isOldFile = !Array.isArray(raw);
      const entries = isOldFile ? [raw] : raw;
      for (const entry of entries) {
        if (!entry || !entry.city_id) continue;
        const id = entry.city_id;
        if (!cityInfoMap.has(id)) {
          cityInfoMap.set(id, { ...entry });
        } else {
          const cur = cityInfoMap.get(id);
          for (const [k, v] of Object.entries(entry)) {
            if (k === "city_id") continue;
            if (isOldFile) {
              if (v !== undefined && v !== null) {
                cur[k] = v;
              }
            } else {
              if (
                cur[k] === undefined ||
                cur[k] === null ||
                (Array.isArray(cur[k]) && cur[k].length === 0) ||
                k === "eval" ||
                k === "bus"
              ) {
                cur[k] = v;
              }
            }
          }
        }
      }
    }
    if (false) {
      if (false) {
        // superseded by array/object merge above
      }
    }

    const cities = [];
    const citiesByIdMap = new Map();
    for (const list of cityFiles) {
      if (Array.isArray(list)) {
        for (const c of list) {
          if (!c.id) {
            c.id = `city:${c.city}`;
          } else if (!c.id.startsWith("city:")) {
            c.id = `city:${c.id}`;
          }
          c.info = cityInfoMap.get(c.id) || null;
          cities.push(c);
          citiesByIdMap.set(c.id, c);
        }
      }
    }

    const spots = [];
    const spotsByCityMap = new Map();
    let spotOrder = 0;
    for (const list of spotFiles) {
      if (Array.isArray(list)) {
        for (const s of list) {
          if (!s.cityId) {
            s.cityId = s.city
              ? s.city.startsWith("city:")
                ? s.city
                : `city:${s.city}`
              : "";
          }
          s._order = spotOrder++;
          spots.push(s);

          if (!spotsByCityMap.has(s.cityId)) {
            spotsByCityMap.set(s.cityId, []);
          }
          spotsByCityMap.get(s.cityId).push(s);

          // If spot references a city not in cities list, create synthetic city
          if (s.cityId && !citiesByIdMap.has(s.cityId)) {
            const rawCityName = s.city || s.cityId.replace(/^city:/, "");
            const syntheticCity = {
              id: s.cityId,
              country: s.country || "기타",
              city: rawCityName,
              local: rawCityName,
              kind: "기타",
              desc: "",
              known_for: [],
              sources: [],
              note: "",
              info: null
            };
            cities.push(syntheticCity);
            citiesByIdMap.set(s.cityId, syntheticCity);
          }
        }
      }
    }

    this.cities = cities;
    this.spots = spots;
    this.cityById = (id) => citiesByIdMap.get(id) || null;
    this.spotsOfCity = (cityId) => spotsByCityMap.get(cityId) || [];
  }
};

// --- Boot (contract §4, §8) ---
function recordBannerError(message) {
  const slot = document.getElementById("banner-slot");
  if (!slot) return;
  const div = document.createElement("div");
  div.className = "banner error";
  div.textContent = message;
  slot.appendChild(div);
  setTimeout(() => {
    div.remove();
  }, 4000);
}

export async function boot() {
  store.init();
  await Promise.all([data.load(), store.ready]);

  const progressEl = document.getElementById("progress-bar");
  if (progressEl) progressEl.innerHTML = "";

  const modules = { map: {}, browse: {}, plan: {} };
  const moduleConfigs = [
    { name: "map", path: "./map.js", selector: "#pane-map" },
    { name: "browse", path: "./browse.js", selector: "#pane-browse" },
    { name: "plan", path: "./plan.js", selector: "#pane-plan" }
  ];

  for (const mc of moduleConfigs) {
    try {
      const mod = await import(mc.path);
      const paneEl = document.querySelector(mc.selector);
      const ctx = { bus, store, data, util, nav, el: paneEl, modules };
      if (typeof mod.init === "function") {
        const api = mod.init(ctx);
        modules[mc.name] = api || {};
      }
    } catch (err) {
      console.error(`Failed to init module ${mc.name}:`, err);
      recordBannerError(`모듈 오류 (${mc.name}): ${err.message || String(err)}`);
    }
  }

  // Wire mobile tabs and pane:show
  const mobileTabs = document.getElementById("mobile-tabs");
  if (mobileTabs) {
    mobileTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pane]");
      if (btn) {
        const pane = btn.getAttribute("data-pane");
        const prev = document.querySelector("#mobile-tabs button.is-active")?.getAttribute("data-pane");
        if (prev && prev !== pane) {
          if (nav.isOpen("pane")) {
            // Back from any later tab returns to the first tab of the chain
            bus.emit("pane:show", { pane });
            return;
          }
          nav.open("pane", () => bus.emit("pane:show", { pane: prev }));
        }
        bus.emit("pane:show", { pane });
      }
    });
  }

  bus.on("pane:show", ({ pane }) => {
    if (typeof window !== "undefined" && window.innerWidth >= 900) {
      return; // on desktop does nothing
    }
    const paneEls = document.querySelectorAll("#pane-browse, #pane-map, #pane-plan");
    paneEls.forEach((el) => {
      if (el.id === `pane-${pane}`) {
        el.classList.add("is-active");
      } else {
        el.classList.remove("is-active");
      }
    });
    const tabBtns = document.querySelectorAll("#mobile-tabs button[data-pane]");
    tabBtns.forEach((btn) => {
      if (btn.getAttribute("data-pane") === pane) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
    if (pane === "map") {
      const mapInstance = modules.map?.getMap?.();
      if (mapInstance && typeof mapInstance.invalidateSize === "function") {
        mapInstance.invalidateSize();
      }
    }
  });

  // On mobile (< 900px), default to map pane and invalidate map size
  if (typeof window !== "undefined" && window.innerWidth < 900) {
    bus.emit("pane:show", { pane: "map" });
  }

  // Desktop sidebars toggle (D5)
  const appMain = document.getElementById("app-main");
  const paneBrowse = document.getElementById("pane-browse");
  const panePlan = document.getElementById("pane-plan");
  const toggleBrowse = document.getElementById("toggle-browse");
  const togglePlan = document.getElementById("toggle-plan");

  if (appMain && toggleBrowse && togglePlan) {
    let sidebarState = { browseCollapsed: false, planCollapsed: false };
    try {
      const saved = localStorage.getItem("trip-sidebars");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          sidebarState.browseCollapsed = Boolean(parsed.browseCollapsed);
          sidebarState.planCollapsed = Boolean(parsed.planCollapsed);
          if (typeof parsed.browseWidth === "number") sidebarState.browseWidth = parsed.browseWidth;
        }
      }
    } catch (_) {}

    const saveSidebarState = () => {
      try {
        localStorage.setItem("trip-sidebars", JSON.stringify(sidebarState));
      } catch (_) {}
    };

    const applySidebarState = () => {
      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 900;
      if (isDesktop) {
        appMain.classList.toggle("collapsed-browse", sidebarState.browseCollapsed);
        paneBrowse?.classList.toggle("is-collapsed", sidebarState.browseCollapsed);
        toggleBrowse.textContent = sidebarState.browseCollapsed ? "›" : "‹";

        appMain.classList.toggle("collapsed-plan", sidebarState.planCollapsed);
        panePlan?.classList.toggle("is-collapsed", sidebarState.planCollapsed);
        togglePlan.textContent = sidebarState.planCollapsed ? "‹" : "›";
      } else {
        appMain.classList.remove("collapsed-browse", "collapsed-plan");
        paneBrowse?.classList.remove("is-collapsed");
        panePlan?.classList.remove("is-collapsed");
        toggleBrowse.textContent = "‹";
        togglePlan.textContent = "›";
      }
    };

    applySidebarState();

    // Browse pane width: drag its right edge (280 px to 70% of the window), double-click resets, saved with the sidebar state
    const MIN_BROWSE_W = 280;
    const maxBrowseW = () => Math.round(window.innerWidth * 0.7);
    const setBrowseWidth = (w) => {
      const clamped = Math.max(MIN_BROWSE_W, Math.min(maxBrowseW(), Math.round(w)));
      appMain.style.setProperty("--browse-w", `${clamped}px`);
      return clamped;
    };
    if (typeof sidebarState.browseWidth === "number") setBrowseWidth(sidebarState.browseWidth);
    const resizer = document.createElement("div");
    resizer.className = "browse-resizer";
    resizer.title = "끌어서 너비 조절 (두 번 누르면 원래대로)";
    appMain.appendChild(resizer);
    const refreshMap = () => {
      const mapInstance = modules.map?.getMap?.();
      if (mapInstance && typeof mapInstance.invalidateSize === "function") mapInstance.invalidateSize();
    };
    resizer.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add("is-dragging");
      appMain.classList.add("is-resizing");
      const left = appMain.getBoundingClientRect().left;
      const onMove = (ev) => setBrowseWidth(ev.clientX - left);
      const onUp = (ev) => {
        resizer.releasePointerCapture(ev.pointerId);
        resizer.removeEventListener("pointermove", onMove);
        resizer.removeEventListener("pointerup", onUp);
        resizer.classList.remove("is-dragging");
        appMain.classList.remove("is-resizing");
        sidebarState.browseWidth = setBrowseWidth(ev.clientX - left);
        saveSidebarState();
        refreshMap();
      };
      resizer.addEventListener("pointermove", onMove);
      resizer.addEventListener("pointerup", onUp);
    });
    resizer.addEventListener("dblclick", () => {
      appMain.style.removeProperty("--browse-w");
      delete sidebarState.browseWidth;
      saveSidebarState();
      refreshMap();
    });

    toggleBrowse.addEventListener("click", () => {
      sidebarState.browseCollapsed = !sidebarState.browseCollapsed;
      saveSidebarState();
      applySidebarState();
      const mapInstance = modules.map?.getMap?.();
      if (mapInstance && typeof mapInstance.invalidateSize === "function") {
        mapInstance.invalidateSize();
      }
    });

    togglePlan.addEventListener("click", () => {
      sidebarState.planCollapsed = !sidebarState.planCollapsed;
      saveSidebarState();
      applySidebarState();
      const mapInstance = modules.map?.getMap?.();
      if (mapInstance && typeof mapInstance.invalidateSize === "function") {
        mapInstance.invalidateSize();
      }
    });

    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => {
        applySidebarState();
      });
    }
  }

  // Selftest runner
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const testName = params.get("selftest");
    if (testName) {
      try {
        const testMod = await import(`./tests/${testName}.test.js`);
        const result = await testMod.run({ bus, store, data, util, modules });
        const pre = document.createElement("pre");
        pre.id = "selftest-result";
        if (result && result.pass) {
          pre.textContent = `PASS ${result.detail || ""}`.trim();
        } else {
          pre.textContent = `FAIL ${result?.detail || "test failed"}`.trim();
        }
        document.body.appendChild(pre);
      } catch (err) {
        const pre = document.createElement("pre");
        pre.id = "selftest-result";
        pre.textContent = `FAIL ${err.message || String(err)}`.trim();
        document.body.appendChild(pre);
      }
    }
  }
}

