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

  // 2. SET the view to [23.13, 113.26] zoom 13. Wait until the vector file loads (at most 5000 ms).
  map.setView([23.13, 113.26], 13);
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (getVectorLayers(map).length >= 5) {
      break;
    }
    await sleep(100);
  }

  // 3. MAKE SURE the map has 5 or more layers with options.pane cityVectorPane (one layer per class since 2026-11-04, for speed).
  const layersZ13 = getVectorLayers(map);
  if (layersZ13.length < 5) {
    errors.push(`expected 5 or more layers with options.pane cityVectorPane, got ${layersZ13.length}`);
  }

  // 4. SET the view to [23.33, 113.48] zoom 13 (25 km from the center). MAKE SURE such layers exist in the view bounds.
  map.setView([23.33, 113.48], 13);
  await sleep(1000);
  const boundsZ13Far = map.getBounds();
  const layersInBounds = getVectorLayers(map).filter((layer) => {
    if (typeof layer.getBounds === "function") {
      return boundsZ13Far.intersects(layer.getBounds());
    }
    return false;
  });
  if (layersInBounds.length === 0) {
    errors.push("expected cityVectorPane layers to exist in view bounds at [23.33, 113.48]");
  }

  // 5. MAKE SURE no img exists in the pane cityBasemapPane, or the pane does not exist.
  const basemapPane = document.querySelector(".leaflet-cityBasemapPane-pane");
  if (basemapPane) {
    const imgs = basemapPane.querySelectorAll("img");
    if (imgs.length > 0) {
      errors.push(`expected no img in cityBasemapPane, found ${imgs.length}`);
    }
  }

  // 6. SET the view to [23.13, 113.26] zoom 8. MAKE SURE no layer with pane cityVectorPane is on the map.
  map.setView([23.13, 113.26], 8);
  await sleep(500);
  const layersZ8 = getVectorLayers(map);
  if (layersZ8.length > 0) {
    errors.push(`expected no layer with pane cityVectorPane at zoom 8, got ${layersZ8.length}`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "city vector basemap loaded and verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
