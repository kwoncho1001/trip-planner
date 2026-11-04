const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findTileLayer(map, urlSubstr) {
  let found = null;
  map.eachLayer((layer) => {
    if (layer._url && layer._url.includes(urlSubstr)) {
      found = layer;
    }
  });
  return found;
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

  // 2. MAKE SURE the map has a tile layer whose URL contains basemaps.cartocdn.com.
  const cartoLayer = findTileLayer(map, "basemaps.cartocdn.com");
  if (!cartoLayer) {
    errors.push("expected tile layer with URL containing basemaps.cartocdn.com");
  }

  // 3. SET the view to [22.30, 114.17] zoom 13. MAKE SURE no layer with pane cityVectorPane has fill colour #f2efe9 (no land box).
  map.setView([22.30, 114.17], 13);
  await sleep(600);
  let hasLandBox = false;
  map.eachLayer((layer) => {
    if (layer.options && layer.options.pane === "cityVectorPane") {
      const fc = layer.options.fillColor;
      if (typeof fc === "string" && fc.toLowerCase() === "#f2efe9") {
        hasLandBox = true;
      }
    }
  });
  if (hasLandBox) {
    errors.push("found layer with pane cityVectorPane and fill colour #f2efe9 (no land box expected in web mode)");
  }

  // 4. Click the button 위성. MAKE SURE a tile layer whose URL contains World_Imagery is on the map. Click it again. MAKE SURE the Voyager layer is back.
  const satBtn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent.trim() === "위성"
  );
  if (!satBtn) {
    errors.push('button "위성" not found');
  } else {
    satBtn.click();
    await sleep(200);
    const esriLayer = findTileLayer(map, "World_Imagery");
    if (!esriLayer) {
      errors.push("expected tile layer with URL containing World_Imagery after clicking 위성");
    }
    satBtn.click();
    await sleep(200);
    const voyagerLayer = findTileLayer(map, "basemaps.cartocdn.com");
    if (!voyagerLayer) {
      errors.push("expected tile layer with URL containing basemaps.cartocdn.com after clicking 위성 again");
    }
  }

  // 5. MAKE SURE the plan pane has the buttons 내 데이터 내보내기 and 가져오기.
  const planPane = document.querySelector("#pane-plan") || document;
  const planButtons = Array.from(planPane.querySelectorAll("button, label"));
  const hasExportBtn = planButtons.some((b) => b.textContent.trim().includes("내 데이터 내보내기"));
  const hasImportBtn = planButtons.some((b) => b.textContent.trim().includes("가져오기"));
  if (!hasExportBtn) {
    errors.push('plan pane missing button "내 데이터 내보내기"');
  }
  if (!hasImportBtn) {
    errors.push('plan pane missing button "가져오기"');
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "web mode base map, satellite toggle and data buttons verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
