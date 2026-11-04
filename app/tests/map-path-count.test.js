const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // 1. After ready, MAKE SURE getZoom() is 6 or less
  const initialZoom = map.getZoom();
  if (initialZoom > 6) {
    errors.push(`expected initial getZoom() to be 6 or less, got ${initialZoom}`);
  }

  // 2. Then setView([13.75, 100.5], 13), wait 1500 ms
  map.setView([13.75, 100.5], 13);
  await sleep(1500);

  // 3. MAKE SURE path.admin-area count is below 1500
  const pathCount = document.querySelectorAll("path.admin-area").length;
  if (pathCount >= 1500) {
    errors.push(`expected path.admin-area count to be below 1500, got ${pathCount}`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? `initial zoom ${initialZoom} <= 6, path count at z13: ${pathCount} < 1500`
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
