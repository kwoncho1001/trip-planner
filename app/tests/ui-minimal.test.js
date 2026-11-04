const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  if (el.tagName === "OPTION" || el.tagName === "OPTGROUP") {
    return isElementVisible(el.parentElement);
  }
  const style = window.getComputedStyle(el);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }
  if (typeof el.checkVisibility === "function") {
    if (!el.checkVisibility()) return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(300);

  // 1. After boot, MAKE SURE no visible element has the text 해당 없음, 장소 있음, 비용 정보 있음, 끌림 보기, 전체 국가, 기본 순서 or 도시 추가 (이름 검색).
  const forbiddenTexts = [
    "해당 없음",
    "장소 있음",
    "비용 정보 있음",
    "끌림 보기",
    "전체 국가",
    "기본 순서",
    "도시 추가 (이름 검색)"
  ];

  const allElements = Array.from(document.querySelectorAll("*"));
  for (const text of forbiddenTexts) {
    const matching = allElements.filter((el) => {
      if (!isElementVisible(el)) return false;
      const hasText = Boolean(el.textContent && el.textContent.includes(text));
      const hasPlaceholder = Boolean(
        (el.placeholder && el.placeholder.includes(text)) ||
        (typeof el.getAttribute === "function" && el.getAttribute("placeholder")?.includes(text))
      );
      const hasValue = typeof el.value === "string" && el.value.includes(text);
      return hasText || hasPlaceholder || hasValue;
    });

    if (matching.length > 0) {
      const innermost = matching.filter(
        (el) => !matching.some((other) => other !== el && el.contains(other))
      )[0] || matching[0];
      const desc = `${innermost.tagName.toLowerCase()}${innermost.className ? "." + String(innermost.className).trim().replace(/\s+/g, ".") : ""}`;
      errors.push(`visible element has forbidden text "${text}" (<${desc}>)`);
    }
  }

  // 2. In it, MAKE SURE .leaflet-control-scale and the map legend are not in the DOM.
  // The +/- zoom buttons stay: the user asked for them on 2026-11-04.
  if (document.querySelector(".leaflet-control-scale")) {
    errors.push(".leaflet-control-scale found in DOM");
  }
  if (document.querySelector("#map-legend, .map-legend-control")) {
    errors.push("map legend found in DOM");
  }

  // 3. In it, open the detail of city:프놈펜. MAKE SURE the detail has at most 5 visible buttons in its action row (끌림, 패스, 경로에 추가, 조사 요청, 위성지도 since 2026-11-04).
  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:프놈펜", source: "map" });
  } else {
    errors.push("ctx.bus.emit is not available");
  }
  await sleep(800);

  const detailActions = document.querySelector(".detail-actions");
  if (!detailActions) {
    errors.push(".detail-actions (action row) not found in city detail");
  } else {
    const actionButtons = Array.from(detailActions.querySelectorAll("button")).filter(isElementVisible);
    if (actionButtons.length > 5) {
      errors.push(`detail action row has ${actionButtons.length} visible buttons (expected at most 5)`);
    }
  }

  // 4. In it, MAKE SURE no .dish-card .badge is visible.
  const dishBadges = Array.from(document.querySelectorAll(".dish-card .badge")).filter(isElementVisible);
  if (dishBadges.length > 0) {
    errors.push(`${dishBadges.length} visible .dish-card .badge elements found`);
  }

  const pass = errors.length === 0;
  const detail = pass ? "ui-minimal passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
