const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  } else {
    errors.push("ctx.modules.map.ready is missing");
  }

  const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
  if (!map) {
    errors.push("ctx.modules.map.getMap() returned null or is missing");
    return { pass: false, detail: errors.join("; ") };
  }

  // 1. setView over 구이린 (no vector map; vector cities hide the coarse areas since 2026-11-04), zoom 11, wait 1500 ms
  map.setView([25.274, 110.29], 11);
  await sleep(1500);

  // 2. MAKE SURE every path.admin-area has fill-opacity 0 and the pane .leaflet-landPane-pane has at least one path
  const adminAreasZ11 = Array.from(document.querySelectorAll("path.admin-area"));
  if (adminAreasZ11.length === 0) {
    errors.push("expected at least one path.admin-area at zoom 11");
  } else {
    for (const el of adminAreasZ11) {
      const fillOp = el.getAttribute("fill-opacity") ?? window.getComputedStyle(el).fillOpacity;
      if (fillOp !== "0" && Number(fillOp) !== 0) {
        errors.push(`expected path.admin-area to have fill-opacity 0 at zoom 11, got ${fillOp}`);
        break;
      }
    }
  }

  const landPane = document.querySelector(".leaflet-landPane-pane");
  // The land pane draws on a canvas since 2026-11-04 (speed)
  const landPaths = landPane ? landPane.querySelectorAll("path, canvas") : [];
  if (landPaths.length < 1) {
    errors.push("expected .leaflet-landPane-pane to have at least one path");
  }

  // 3. MAKE SURE exactly one path.city-area touches the point [25.274, 110.29] (use elementsFromPoint)
  const paneMap = document.querySelector("#pane-map");
  const mapRect = paneMap ? paneMap.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
  const pt = map.latLngToContainerPoint([25.274, 110.29]);
  const clientX = Math.round(mapRect.left + pt.x);
  const clientY = Math.round(mapRect.top + pt.y);
  const elements = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [];
  const cityAreaElements = elements.filter((el) => el.matches && el.matches("path.city-area"));
  if (cityAreaElements.length !== 1) {
    errors.push(`expected exactly one path.city-area touching [25.274, 110.29], got ${cityAreaElements.length}`);
  }

  // 4. setView([23.1, 113.3], 6), wait 1500 ms. MAKE SURE areas take only their country's pale tint (one color per country, 2026-11-04)
  map.setView([23.1, 113.3], 6);
  await sleep(1500);

  const adminAreasZ6 = Array.from(document.querySelectorAll("path.admin-area"));
  const filled = adminAreasZ6.filter((el) => Number(el.getAttribute("fill-opacity") ?? 0) > 0);
  const fills = new Set(filled.map((el) => (el.getAttribute("fill") || "").toLowerCase()));
  if (adminAreasZ6.length === 0 || filled.length === 0) {
    errors.push("expected tinted path.admin-area at zoom 6");
  }
  // Only the per-country tints: no per-province palette
  const tints = new Set(["#f1e2c4", "#dcebcf", "#f2c2c2", "#d6e3f1", "#e5dbf0", "#efe8c4"]);
  const other = [...fills].filter((c) => !tints.has(c));
  if (other.length) {
    errors.push(`expected only country tints at zoom 6, got ${other.join(", ")}`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "city view calm styling and city-area verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
