const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getVectorLayers(map) {
  const layers = [];
  map.eachLayer((layer) => {
    if (layer.options && layer.options.pane === "cityVectorPane") {
      layers.push(layer);
    }
  });
  return layers;
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

  // 2. SET the view to [22.30, 114.17] zoom 13. MAKE SURE no path.admin-area of level 1 or more is in the view.
  map.setView([22.30, 114.17], 13);
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (getVectorLayers(map).length >= 5) {
      break;
    }
    await sleep(100);
  }
  await sleep(400);

  const adminAreasL1Plus = Array.from(
    document.querySelectorAll("path.admin-area.level-1, path.admin-area.level-2, path.admin-area.level-3")
  );
  if (adminAreasL1Plus.length > 0) {
    errors.push(`expected no path.admin-area of level 1 or more in view at zoom 13, found ${adminAreasL1Plus.length}`);
  }

  // 3. MAKE SURE layers with pane cityVectorPane include sea fill #aad3df and main road casing #cfc8bb (highways removed, user 2026-11-04).
  const vLayers = getVectorLayers(map);
  const hasSea = vLayers.some((l) => l.options && l.options.fillColor === "#aad3df");
  const hasRoad1 = vLayers.some((l) => l.options && l.options.color === "#cfc8bb");
  if (!hasSea) {
    errors.push("expected cityVectorPane layer with sea fill #aad3df");
  }
  if (!hasRoad1) {
    errors.push("expected cityVectorPane layer with main road casing #cfc8bb");
  }

  // 4. SET the view to [22.6, 114.0] zoom 8. MAKE SURE a station marker exists (West Kowloon or Shenzhen North).
  map.setView([22.6, 114.0], 8);
  await sleep(600);
  const stationDom = document.querySelectorAll(".station-marker, .leaflet-stationPane-pane .leaflet-marker-icon");
  let stationCount = stationDom.length;
  if (stationCount === 0) {
    map.eachLayer((layer) => {
      if (layer.options && (layer.options.pane === "stationPane" || layer.options.isStationMarker)) {
        stationCount++;
      }
    });
  }
  if (stationCount === 0) {
    errors.push("expected a station marker to exist at [22.6, 114.0] zoom 8");
  }

  // 5. SET a pick pass on one Hong Kong spot and like on another (use the store).
  const hkSpots = ctx.data?.spotsOfCity
    ? ctx.data.spotsOfCity("city:홍콩")
    : (ctx.data?.spots || []).filter((s) => s.cityId === "city:홍콩");
  if (!hkSpots || hkSpots.length < 3) {
    errors.push("expected at least 3 spots for 홍콩");
  }
  const spotPass = hkSpots?.[0];
  const spotLike = hkSpots?.[1];
  const spotUndecided = hkSpots?.[2];

  let origPass = "none";
  let origLike = "none";
  let origUndecided = "none";

  if (spotPass && spotLike && spotUndecided && ctx.store) {
    origPass = ctx.store.getPick(spotPass.id);
    origLike = ctx.store.getPick(spotLike.id);
    origUndecided = ctx.store.getPick(spotUndecided.id);

    await ctx.store.setPick(spotPass.id, "pass");
    await ctx.store.setPick(spotLike.id, "like");
    await ctx.store.setPick(spotUndecided.id, "none");

    // 6. At zoom 14 near them, MAKE SURE the passed spot has no marker. MAKE SURE the liked spot marker has the like color.
    map.setView([spotLike.lat, spotLike.lng], 14);
    await sleep(600);

    let passMarkerFound = false;
    let likeMarkerFound = false;
    let likeColorCorrect = false;

    map.eachLayer((layer) => {
      if (layer._spot) {
        if (layer._spot.id === spotPass.id) passMarkerFound = true;
        if (layer._spot.id === spotLike.id) {
          likeMarkerFound = true;
          const el = layer.getElement ? layer.getElement() : null;
          const html = layer.options?.icon?.options?.html || "";
          const pin = el ? el.querySelector(".spot-marker-pin") : null;
          const combined = (el ? el.innerHTML : "") + html + (pin ? pin.outerHTML : "");
          if (
            combined.includes("pick-like") ||
            combined.includes("#1E8E5A") ||
            combined.includes("#1e8e5a") ||
            combined.includes("rgb(30, 142, 90)")
          ) {
            likeColorCorrect = true;
          }
        }
      }
    });

    if (passMarkerFound) {
      errors.push(`expected passed spot ${spotPass.id} to have no marker at zoom 14`);
    }
    if (!likeMarkerFound) {
      errors.push(`expected liked spot ${spotLike.id} to have a marker at zoom 14`);
    } else if (!likeColorCorrect) {
      errors.push(`expected liked spot ${spotLike.id} marker to have like color #1E8E5A`);
    }

    // 7. Click an undecided spot marker. MAKE SURE the popup has the buttons 끌림, 패스, 자세히.
    let undecidedMarker = null;
    map.eachLayer((layer) => {
      if (layer._spot && layer._spot.id === spotUndecided.id) {
        undecidedMarker = layer;
      }
    });
    if (!undecidedMarker) {
      map.eachLayer((layer) => {
        if (!undecidedMarker && layer._spot && ctx.store.getPick(layer._spot.id) === "none") {
          undecidedMarker = layer;
        }
      });
    }

    if (!undecidedMarker) {
      errors.push("undecided spot marker not found");
    } else {
      undecidedMarker.fire("click");
      await sleep(400);

      const popupEl = document.querySelector(".leaflet-popup-content, .spot-popup, .map-spot-popup");
      if (!popupEl) {
        errors.push("spot popup not opened after marker click");
      } else {
        const text = popupEl.textContent || "";
        const btns = Array.from(popupEl.querySelectorAll("button, .btn"));
        const hasLikeBtn = btns.some((b) => b.textContent.includes("끌림")) || text.includes("끌림");
        const hasPassBtn = btns.some((b) => b.textContent.includes("패스")) || text.includes("패스");
        const hasDetailBtn = btns.some((b) => b.textContent.includes("자세히")) || text.includes("자세히");

        if (!hasLikeBtn || !hasPassBtn || !hasDetailBtn) {
          errors.push(
            `expected popup to have buttons 끌림, 패스, 자세히 (끌림=${hasLikeBtn}, 패스=${hasPassBtn}, 자세히=${hasDetailBtn})`
          );
        }

        // 8. Click 자세히. MAKE SURE the browse detail of 홍콩 opens.
        const detailBtn = btns.find((b) => b.textContent.includes("자세히"));
        if (!detailBtn) {
          errors.push('button "자세히" not found in spot popup');
        } else {
          detailBtn.click();
          await sleep(500);

          const viewDetail = document.querySelector("#view-detail, .view-detail") || document.body;
          const titleEl = viewDetail.querySelector(".detail-title, h2");
          if (!titleEl || !titleEl.textContent.includes("홍콩")) {
            errors.push('expected browse detail of 홍콩 to open after clicking "자세히"');
          }

          // 9. MAKE SURE the detail of 홍콩 has a section 도시 평가 with 3 or more 좋은 점 items.
          const evalSection =
            viewDetail.querySelector(".city-eval-section, .detail-eval-section, .eval-section") ||
            Array.from(viewDetail.querySelectorAll("section, div")).find((el) => {
              const h = el.querySelector("h2, h3, h4, .section-title");
              return h && h.textContent.includes("도시 평가");
            });

          if (!evalSection) {
            errors.push('expected section "도시 평가" in detail of 홍콩');
          } else {
            const prosItems = evalSection.querySelectorAll(".eval-pro, .pro-item, .eval-pros li, .pros li, li");
            if (prosItems.length < 3) {
              errors.push(`expected 3 or more "좋은 점" items in 도시 평가, found ${prosItems.length}`);
            }
          }

          // 10. MAKE SURE the detail action row has the buttons 조사 요청 and 위성지도.
          const actionRow = viewDetail.querySelector(".detail-actions, .detail-hero-actions");
          if (!actionRow) {
            errors.push("detail action row not found");
          } else {
            const actBtns = Array.from(actionRow.querySelectorAll("button, a, .btn"));
            const hasResearch = actBtns.some((b) => b.dataset.action === "request-research");
            const hasSat = actBtns.some((b) => b.textContent.includes("위성지도"));
            if (!hasResearch) errors.push('action row missing button "조사 요청"');
            if (!hasSat) errors.push('action row missing button "위성지도"');
          }
        }
      }
    }

    // 11. Restore the two picks at the end.
    if (spotPass) await ctx.store.setPick(spotPass.id, origPass);
    if (spotLike) await ctx.store.setPick(spotLike.id, origLike);
    if (spotUndecided) await ctx.store.setPick(spotUndecided.id, origUndecided);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "map real look verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
