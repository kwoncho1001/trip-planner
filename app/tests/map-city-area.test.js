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

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    await ctx.modules.map.ready;
  } else {
    errors.push("ctx.modules.map.ready is missing");
  }

  const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
  if (!map) {
    errors.push("ctx.modules.map.getMap() returned null or is missing");
    return { pass: false, detail: errors.join("; ") };
  }

  // 1. setView([29.56, 106.55], 7): at least one path.city-area
  map.setView([29.56, 106.55], 7);
  await sleep(1500);

  const cityAreas = document.querySelectorAll("path.city-area");
  if (cityAreas.length < 1) {
    errors.push("expected at least one path.city-area at zoom 7");
  }

  // 2. At z 5: zero .marker-cluster elements, and no .leaflet-marker-icon whose trimmed text is only digits
  map.setView([29.56, 106.55], 5);
  await sleep(1500);

  const clustersZ5 = document.querySelectorAll(".marker-cluster");
  if (clustersZ5.length !== 0) {
    errors.push(`expected zero .marker-cluster at zoom 5, got ${clustersZ5.length}`);
  }
  const digitMarkersZ5 = Array.from(document.querySelectorAll(".leaflet-marker-icon")).filter((el) => {
    return /^\d+$/.test(el.textContent.trim());
  });
  if (digitMarkersZ5.length > 0) {
    errors.push(`found ${digitMarkersZ5.length} .leaflet-marker-icon with only digits at zoom 5`);
  }

  // 3. At z 11: zero .marker-cluster elements, and no .leaflet-marker-icon whose trimmed text is only digits
  map.setView([29.56, 106.55], 11);
  await sleep(1500);

  const clustersZ11 = document.querySelectorAll(".marker-cluster");
  if (clustersZ11.length !== 0) {
    errors.push(`expected zero .marker-cluster at zoom 11, got ${clustersZ11.length}`);
  }
  const digitMarkersZ11 = Array.from(document.querySelectorAll(".leaflet-marker-icon")).filter((el) => {
    return /^\d+$/.test(el.textContent.trim());
  });
  if (digitMarkersZ11.length > 0) {
    errors.push(`found ${digitMarkersZ11.length} .leaflet-marker-icon with only digits at zoom 11`);
  }

  // 4. At z 4 a visible .city-name-label has text 충칭
  // 5. Zoom 9 still shows city names (zoom 4 shows the large cities on purpose, audit B1-01)
  map.setView([23.1, 113.3], 4);
  await sleep(1500);

  let labelsZ4 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
  let hasChongqing = labelsZ4.some((el) => el.textContent.includes("충칭"));

  if (!hasChongqing) {
    map.setView([29.56, 106.55], 4);
    await sleep(1500);
    const labelsChongqingZ4 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
    hasChongqing = labelsChongqingZ4.some((el) => el.textContent.includes("충칭"));

    map.setView([23.1, 113.3], 4);
    await sleep(1500);
    labelsZ4 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
  }

  if (!hasChongqing) {
    errors.push("expected a visible .city-name-label with text '충칭' at zoom 4");
  }

  const countZ4 = labelsZ4.length;

  map.setView([23.1, 113.3], 9);
  await sleep(1500);

  const labelsZ9 = Array.from(document.querySelectorAll(".city-name-label")).filter(isVisible);
  const countZ9 = labelsZ9.length;

  if (countZ4 < 10 || countZ9 < 5) {
    errors.push(`expected 10+ labels at z 4 (${countZ4}) and 5+ at z 9 (${countZ9}) for view [23.1, 113.3]`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "city areas, clusters absence, and city name labels verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
