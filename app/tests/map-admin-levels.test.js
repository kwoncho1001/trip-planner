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

  // 1. setView([23.1, 113.3], 4): visible .admin-label.level-0 has text 중국; no visible .admin-label.level-2
  map.setView([23.1, 113.3], 4);
  await sleep(1500);

  const labelsL0 = Array.from(document.querySelectorAll(".admin-label.level-0")).filter(isVisible);
  const hasChina = labelsL0.some((el) => el.textContent.includes("중국"));
  if (!hasChina) {
    errors.push("expected a visible .admin-label.level-0 with text '중국' at zoom 4");
  }

  const labelsL2AtZ4 = Array.from(document.querySelectorAll(".admin-label.level-2")).filter(isVisible);
  if (labelsL2AtZ4.length > 0) {
    errors.push(`expected no visible .admin-label.level-2 at zoom 4, found ${labelsL2AtZ4.length}`);
  }

  // 2. setView(.., 6): at least one path.admin-area.level-1; visible .admin-label.level-1 has text 광둥성
  map.setView([23.1, 113.3], 6);
  await sleep(1500);

  const areasL1 = document.querySelectorAll("path.admin-area.level-1");
  if (areasL1.length < 1) {
    errors.push("expected at least one path.admin-area.level-1 at zoom 6");
  }

  const labelsL1 = Array.from(document.querySelectorAll(".admin-label.level-1")).filter(isVisible);
  const hasGuangdong = labelsL1.some((el) => el.textContent.includes("광둥성"));
  if (!hasGuangdong) {
    errors.push("expected a visible .admin-label.level-1 with text '광둥성' at zoom 6");
  }

  const imgLayersZ6 = Array.from(document.querySelectorAll("img.leaflet-image-layer")).filter(isVisible);
  if (imgLayersZ6.length > 0) {
    errors.push(`expected no visible img.leaflet-image-layer at zoom 6, found ${imgLayersZ6.length}`);
  }

  // 3. setView(.., 8): visible .admin-label.level-2 has text 광저우시
  map.setView([23.1, 113.3], 8);
  await sleep(1500);

  const labelsL2AtZ8 = Array.from(document.querySelectorAll(".admin-label.level-2")).filter(isVisible);
  const hasGuangzhou = labelsL2AtZ8.some((el) => el.textContent.includes("광저우시"));
  if (!hasGuangzhou) {
    errors.push("expected a visible .admin-label.level-2 with text '광저우시' at zoom 8");
  }

  const imgLayersZ8 = Array.from(document.querySelectorAll("img.leaflet-image-layer")).filter(isVisible);
  if (imgLayersZ8.length > 0) {
    errors.push(`expected no visible img.leaflet-image-layer at zoom 8, found ${imgLayersZ8.length}`);
  }

  // 4. setView([13.75, 100.5], 11): at least one path.admin-area.level-3
  map.setView([13.75, 100.5], 11);
  await sleep(1500);

  const areasL3 = document.querySelectorAll("path.admin-area.level-3");
  if (areasL3.length < 1) {
    errors.push("expected at least one path.admin-area.level-3 at zoom 11");
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "admin areas and labels verified across zooms"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
