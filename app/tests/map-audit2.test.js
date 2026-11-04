const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const paneMap = document.querySelector("#pane-map");
  if (paneMap) {
    const mapRect = paneMap.getBoundingClientRect();
    if (
      rect.right < mapRect.left ||
      rect.left > mapRect.right ||
      rect.bottom < mapRect.top ||
      rect.top > mapRect.bottom
    ) {
      return false;
    }
  }
  return true;
}

function findChip(name) {
  const lens = document.querySelector("#map-lens") || document;
  const elements = Array.from(lens.querySelectorAll("button, [role='button'], .chip, [data-lens], span, div"));
  const matches = elements.filter((el) => {
    const text = el.textContent.trim();
    const val = el.getAttribute("data-lens") || el.getAttribute("data-value");
    return text === name || val === name;
  });
  if (matches.length === 0) return null;
  const preferred = matches.find((el) => el.tagName === "BUTTON" || el.hasAttribute("data-lens") || el.classList.contains("chip"));
  return preferred || matches[0];
}

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

  const paneMap = document.querySelector("#pane-map");

  // 1. setView([30, 108], 4). MAKE SURE at least 15 .city-name-label elements are visible.
  map.setView([30, 108], 4);
  await sleep(1500);

  const visibleCityLabelsZ4 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
  if (visibleCityLabelsZ4.length < 15) {
    errors.push(`expected at least 15 visible .city-name-label at zoom 4, found ${visibleCityLabelsZ4.length}`);
  }

  // 2. setView([1.35, 103.82], 8). MAKE SURE at least one visible label is in Singapore.
  map.setView([1.35, 103.82], 8);
  await sleep(1500);

  const mapRectStep3 = paneMap ? paneMap.getBoundingClientRect() : { left: 0, top: 0 };
  const visibleCityLabelsZ8 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
  const sgpCityNames = new Set(
    (ctx?.data?.cities || []).filter((c) => c.country === "싱가포르").map((c) => c.city)
  );
  sgpCityNames.add("싱가포르");

  const hasSingaporeLabel = visibleCityLabelsZ8.some((el) => {
    const text = el.textContent.trim();
    if (sgpCityNames.has(text) || Array.from(sgpCityNames).some((name) => text.includes(name))) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    const pt = L.point(
      rect.left + rect.width / 2 - mapRectStep3.left,
      rect.top + rect.height / 2 - mapRectStep3.top
    );
    const latLng = map.containerPointToLatLng(pt);
    return (
      latLng.lat >= 1.15 &&
      latLng.lat <= 1.50 &&
      latLng.lng >= 103.55 &&
      latLng.lng <= 104.10
    );
  });
  if (!hasSingaporeLabel) {
    errors.push("expected at least one visible label in Singapore at zoom 8");
  }

  // 3. Click the lens chip 장소 at setView([23.1, 113.3], 7). MAKE SURE every spot marker in the DOM is inside the map bounds padded by 50 percent.
  map.setView([23.1, 113.3], 7);
  await sleep(1500);

  const chipSpot = findChip("장소");
  if (!chipSpot) {
    errors.push("chip '장소' not found");
  } else {
    chipSpot.click();
  }
  await sleep(1500);

  const paddedBounds = map.getBounds().pad(0.5);
  const spotIcons = Array.from(document.querySelectorAll(".spot-div-icon"));
  if (spotIcons.length === 0) {
    errors.push("expected at least one spot marker in the DOM after picking '장소'");
  } else {
    const mapRectStep4 = paneMap ? paneMap.getBoundingClientRect() : { left: 0, top: 0 };
    const outsideSpots = spotIcons.filter((el) => {
      const rect = el.getBoundingClientRect();
      const pt = L.point(
        rect.left + rect.width / 2 - mapRectStep4.left,
        rect.top + rect.height / 2 - mapRectStep4.top
      );
      const latLng = map.containerPointToLatLng(pt);
      return !paddedBounds.contains(latLng);
    });
    if (outsideSpots.length > 0) {
      errors.push(`expected every spot marker in DOM to be inside map bounds padded by 50%, found ${outsideSpots.length} outside`);
    }
  }

  // 4. Block tiles: remove every .leaflet-tile layer, then setView([29.56, 106.55], 10). MAKE SURE the Chongqing vector map is drawn (it replaced the basemap images, 2026-11-04).
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer || (layer._url && layer.getTileUrl)) {
      map.removeLayer(layer);
    }
  });
  document.querySelectorAll(".leaflet-tile-pane, .leaflet-tile").forEach((el) => {
    if (el.classList.contains("leaflet-tile")) {
      el.remove();
    }
  });

  map.setView([29.56, 106.55], 10);
  await sleep(1500);

  let vectorLayers = 0;
  for (let t = 0; t < 30 && vectorLayers === 0; t++) {
    map.eachLayer((layer) => { if (layer.options && layer.options.pane === "cityVectorPane") vectorLayers++; });
    if (vectorLayers === 0) await sleep(200);
  }
  if (vectorLayers === 0) {
    errors.push("expected Chongqing vector map layers at zoom 10");
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "map audit2 fixes verified (zoom 4 city labels, Singapore at zoom 8, viewport spot markers, offline city basemap at zoom 10)"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
