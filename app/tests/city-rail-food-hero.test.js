const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(300);

  // Ensure '중국' country group is open so Hong Kong and Dongguan rows are visible
  const groupChina = document.querySelector('.country-group[data-country="중국"]');
  if (groupChina && !groupChina.classList.contains("is-open")) {
    const header = groupChina.querySelector(".country-group-header");
    if (header) {
      header.click();
      await sleep(300);
    }
  }

  // 2. MAKE SURE the list row of 홍콩 has a rail badge with text 고속철.
  const rowHK = document.querySelector('.city-row[data-city-id="city:홍콩"]') ||
    Array.from(document.querySelectorAll('.city-row')).find((r) => r.textContent.includes("홍콩"));
  if (!rowHK) {
    errors.push('list row of 홍콩 not found');
  } else {
    const railBadge = Array.from(rowHK.querySelectorAll(".rail-badge, .badge-rail, .badge")).find(
      (b) => b.textContent.trim() === "고속철"
    );
    if (!railBadge) {
      errors.push('list row of 홍콩 does not have a rail badge with text "고속철"');
    }
  }

  // 3. MAKE SURE the list row of 둥관 has a rail badge with text 고속철.
  const rowDG = document.querySelector('.city-row[data-city-id="city:둥관"]') ||
    Array.from(document.querySelectorAll('.city-row')).find((r) => r.textContent.includes("둥관"));
  if (!rowDG) {
    errors.push('list row of 둥관 not found');
  } else {
    const railBadge = Array.from(rowDG.querySelectorAll(".rail-badge, .badge-rail, .badge")).find(
      (b) => b.textContent.trim() === "고속철"
    );
    if (!railBadge) {
      errors.push('list row of 둥관 does not have a rail badge with text "고속철"');
    }
  }

  // 4. Open the detail of 홍콩. MAKE SURE a cover image and the caption text exist.
  if (ctx?.modules?.browse?.openCityDetail) {
    ctx.modules.browse.openCityDetail("city:홍콩");
  } else if (rowHK) {
    const target = rowHK.querySelector(".city-row-main") || rowHK;
    target.click();
  } else if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:홍콩", source: "browse" });
  }
  await sleep(400);

  const viewDetail = document.querySelector("#view-detail, .view-detail") || document.body;
  const coverImg = viewDetail.querySelector(".hero-cover, .cover-hero, .detail-cover-img, img.hero-cover, .detail-hero-cover img, .detail-cover img");
  const captionEl = viewDetail.querySelector(".hero-caption, .cover-caption, .detail-hero-caption");
  if (!coverImg) {
    errors.push("detail of 홍콩: cover image not found");
  }
  if (!captionEl || !captionEl.textContent.trim()) {
    errors.push("detail of 홍콩: caption text not found");
  }

  // 5. MAKE SURE the station box exists and shows 서구룡. MAKE SURE it comes before the first spot card.
  const stationBox = viewDetail.querySelector(".station-box, .rail-station-box, .detail-station-box, .detail-rail-box");
  if (!stationBox) {
    errors.push("detail of 홍콩: station box not found");
  } else {
    if (!stationBox.textContent.includes("서구룡")) {
      errors.push('detail of 홍콩: station box does not show "서구룡"');
    }
    const firstSpotCard = viewDetail.querySelector(".spot-card, .detail-spot-card");
    if (firstSpotCard) {
      const position = stationBox.compareDocumentPosition(firstSpotCard);
      if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
        errors.push("detail of 홍콩: station box does not come before the first spot card");
      }
    }
  }

  // 6. MAKE SURE a 도시 평가 or 여행 후기 section has 2 or more links with href starting with http.
  const evalSection = viewDetail.querySelector(".city-eval-section, .detail-eval-section");
  const reviewSection = viewDetail.querySelector(".review-section, .reviews-section, .detail-reviews-section, .detail-review-section");
  const section = evalSection || reviewSection;
  if (!section) {
    errors.push('detail of 홍콩: "도시 평가" or "여행 후기" section not found');
  } else {
    const reviewLinks = Array.from(section.querySelectorAll('a[href^="http"]'));
    if (reviewLinks.length < 2) {
      errors.push(`detail of 홍콩: section has ${reviewLinks.length} links (expected >= 2)`);
    }
  }

  // 7. Open the detail of 둥관. MAKE SURE the food section has 2 or more dish cards.
  if (ctx?.modules?.browse?.openCityDetail) {
    ctx.modules.browse.openCityDetail("city:둥관");
  } else if (rowDG) {
    const target = rowDG.querySelector(".city-row-main") || rowDG;
    target.click();
  } else if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:둥관", source: "browse" });
  }
  await sleep(400);

  const foodSection = viewDetail.querySelector(".food-section, .detail-food-section");
  const dishCards = foodSection ? foodSection.querySelectorAll(".dish-card") : viewDetail.querySelectorAll(".dish-card");
  if (dishCards.length < 2) {
    errors.push(`detail of 둥관: food section has ${dishCards.length} dish cards (expected >= 2)`);
  }

  // 8. SET the map view to [22.30, 114.17] zoom 13. MAKE SURE a station marker exists.
  const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
  if (!map) {
    errors.push("ctx.modules.map.getMap() returned null or is missing");
  } else {
    map.setView([22.30, 114.17], 13);
    await sleep(600);

    const stationMarkers = Array.from(document.querySelectorAll(".station-marker, .marker-station, .leaflet-stationPane-pane .leaflet-marker-icon, .station-icon"));
    if (stationMarkers.length === 0) {
      // Also check layers in station pane if SVG / canvas / circleMarker
      let stationLayerCount = 0;
      map.eachLayer((layer) => {
        if (layer.options && (layer.options.pane === "stationPane" || layer.options.isStationMarker)) {
          stationLayerCount++;
        }
      });
      if (stationLayerCount === 0) {
        errors.push("map at [22.30, 114.17] zoom 13: station marker not found");
      }
    }
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "city rail food hero verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
