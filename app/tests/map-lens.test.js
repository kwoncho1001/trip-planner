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

  // 1. MAKE SURE the lens has exactly three chips: 나라, 지역, 장소 (user, 2026-11-04)
  map.setView([23.1, 113.3], 4);
  await sleep(1500);
  const lensEl = document.querySelector("#map-lens");
  const chipTexts = lensEl ? Array.from(lensEl.querySelectorAll("button")).map((b) => b.textContent.trim()).filter((t) => ["나라", "지역", "장소", "자동", "성", "시", "구·읍"].includes(t)) : [];
  if (chipTexts.join(",") !== "나라,지역,장소") {
    errors.push(`expected lens chips 나라,지역,장소, got ${chipTexts.join(",")}`);
  }

  // 2. setView([23.1, 113.3], 8). Click the chip 나라. MAKE SURE no path.admin-area.level-2 exists and a visible .admin-label.level-0 has text 중국.
  map.setView([23.1, 113.3], 8);
  await sleep(1500);

  const chipCountry = findChip("나라");
  if (!chipCountry) {
    errors.push("chip '나라' not found");
  } else {
    chipCountry.click();
  }
  await sleep(1500);

  const areasL2Step3 = document.querySelectorAll("path.admin-area.level-2");
  if (areasL2Step3.length > 0) {
    errors.push(`expected no path.admin-area.level-2 after picking '나라', found ${areasL2Step3.length}`);
  }
  const labelsL0 = Array.from(document.querySelectorAll(".admin-label.level-0")).filter(isVisible);
  const hasChina = labelsL0.some((el) => el.textContent.includes("중국"));
  if (!hasChina) {
    errors.push("expected a visible .admin-label.level-0 with text '중국'");
  }

  // 3. Click the chip 장소. MAKE SURE at least one spot marker is in the DOM.
  const chipSpot = findChip("장소");
  if (!chipSpot) {
    errors.push("chip '장소' not found");
  } else {
    chipSpot.click();
  }
  await sleep(1500);

  const spotMarkers = document.querySelectorAll(".spot-marker-pin, .spot-div-icon, .spot-marker");
  if (spotMarkers.length < 1) {
    errors.push("expected at least one spot marker in the DOM after picking '장소'");
  }

  // 4. Click the chip 지역. MAKE SURE at zoom 8 at least one path.admin-area.level-2 exists.
  const chipAuto = findChip("지역");
  if (!chipAuto) {
    errors.push("chip '지역' not found");
  } else {
    chipAuto.click();
  }
  await sleep(1500);

  if (map.getZoom() !== 8) {
    map.setView([23.1, 113.3], 8);
    await sleep(1500);
  }

  const areasL2Step5 = document.querySelectorAll("path.admin-area.level-2");
  if (areasL2Step5.length < 1) {
    errors.push("expected at least one path.admin-area.level-2 at zoom 8 after picking '지역'");
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "map lens controls and level rules verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
