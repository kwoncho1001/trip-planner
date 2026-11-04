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

function boxesIntersect(b1, b2) {
  return !(b1.x2 <= b2.x1 || b1.x1 >= b2.x2 || b1.y2 <= b2.y1 || b1.y1 >= b2.y2);
}

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

const COUNTRY_CENTERS = {
  CHN: [35.86, 104.16],
  VNM: [15.89, 105.81],
  LAO: [18.20, 103.86],
  KHM: [12.30, 104.98],
  THA: [13.04, 101.49],
  MYS: [4.12, 102.50],
  SGP: [1.32, 103.85]
};

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

  // 1. setView([16, 104], 4), wait 1500 ms
  map.setView([16, 104], 4);
  await sleep(1500);

  const paneMap = document.querySelector("#pane-map");
  const mapRect = paneMap ? paneMap.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };

  // 2. For each point: CALL document.elementFromPoint at map.latLngToContainerPoint plus the map rect.
  // MAKE SURE the element is a path.admin-area.level-0 whose fill attribute equals COUNTRY_PALETTE of that country.
  const checkPoints = [
    { name: "Hanoi", point: [21.03, 105.85], cc: "VNM" },
    { name: "Vientiane", point: [17.97, 102.6], cc: "LAO" },
    { name: "Phnom Penh", point: [11.56, 104.92], cc: "KHM" },
    { name: "Bangkok", point: [13.75, 100.5], cc: "THA" }
  ];

  for (const item of checkPoints) {
    const pt = map.latLngToContainerPoint(item.point);
    const clientX = Math.round(mapRect.left + pt.x);
    const clientY = Math.round(mapRect.top + pt.y);
    const el = document.elementFromPoint(clientX, clientY);
    const expectedColor = COUNTRY_PALETTE[item.cc]?.toLowerCase();

    if (!el) {
      errors.push(`${item.name} (${item.cc}) at [${clientX}, ${clientY}]: elementFromPoint returned null`);
    } else if (!el.matches("path.admin-area.level-0")) {
      errors.push(
        `${item.name} (${item.cc}): expected path.admin-area.level-0, got <${el.tagName.toLowerCase()} class="${el.className || ""}">`
      );
    } else {
      const fill = (el.getAttribute("fill") || "").toLowerCase();
      if (fill !== expectedColor) {
        errors.push(`${item.name} (${item.cc}): expected fill "${expectedColor}", got "${fill}"`);
      }
    }
  }

  // 3. MAKE SURE visible .admin-label.level-0 texts include 베트남, 라오스, 캄보디아, 태국,
  // or MAKE SURE a hidden country label overlaps a visible country label (D4 rule).
  const visibleL0 = Array.from(document.querySelectorAll(".admin-label.level-0")).filter(isVisible);
  const visibleBoxes = visibleL0.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      el,
      text: el.textContent.trim(),
      box: {
        x1: r.left - mapRect.left,
        x2: r.right - mapRect.left,
        y1: r.top - mapRect.top,
        y2: r.bottom - mapRect.top
      }
    };
  });

  const targetCountries = [
    { cc: "VNM", name: "베트남" },
    { cc: "LAO", name: "라오스" },
    { cc: "KHM", name: "캄보디아" },
    { cc: "THA", name: "태국" }
  ];

  for (const { cc, name } of targetCountries) {
    const isDirectlyVisible = visibleBoxes.some((vb) => vb.text.includes(name));
    if (isDirectlyVisible) {
      continue;
    }

    const center = COUNTRY_CENTERS[cc];
    if (!center) {
      errors.push(`no center defined for ${cc}`);
      continue;
    }
    const pt = map.latLngToContainerPoint(center);
    const w = name.length * 14 + 8;
    const h = 22;
    const labelBox = {
      x1: pt.x - w / 2,
      x2: pt.x + w / 2,
      y1: pt.y - h / 2,
      y2: pt.y + h / 2
    };

    const overlapsVisible = visibleBoxes.some((vb) => boxesIntersect(labelBox, vb.box));
    if (!overlapsVisible) {
      errors.push(`country label "${name}" is not visible and does not overlap any visible country label`);
    }
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "country fill and labels verified at zoom 4"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
