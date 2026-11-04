export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    await ctx.modules.map.ready;
  }

  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:광저우", source: "browse" });
  } else {
    errors.push("ctx.bus.emit is not a function");
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
  if (!map) {
    errors.push("ctx.modules.map.getMap() returned null or is missing");
  } else {
    const zoom = typeof map.getZoom === "function" ? map.getZoom() : null;
    if (zoom == null || zoom < 9) {
      errors.push(`getMap().getZoom() < 9: got ${zoom}`);
    }

    const center = typeof map.getCenter === "function" ? map.getCenter() : null;
    if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") {
      errors.push("map.getCenter() missing or invalid");
    } else {
      const latDiff = Math.abs(center.lat - 23.13);
      const lngDiff = Math.abs(center.lng - 113.26);
      if (latDiff > 0.5 || lngDiff > 0.5) {
        errors.push(`map center not within 0.5 deg of (23.13, 113.26): got lat=${center.lat}, lng=${center.lng}`);
      }
    }
  }

  const paneBrowse = document.querySelector("#pane-browse");
  if (!paneBrowse || paneBrowse.offsetWidth === 0) {
    errors.push(`#pane-browse offsetWidth is 0 (got ${paneBrowse ? paneBrowse.offsetWidth : "null"})`);
  }

  const paneMap = document.querySelector("#pane-map");
  if (!paneMap || paneMap.offsetWidth === 0) {
    errors.push(`#pane-map offsetWidth is 0 (got ${paneMap ? paneMap.offsetWidth : "null"})`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? `zoom=${map?.getZoom?.()}, center=(${map?.getCenter?.()?.lat?.toFixed(2)}, ${map?.getCenter?.()?.lng?.toFixed(2)}), panes visible`
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
