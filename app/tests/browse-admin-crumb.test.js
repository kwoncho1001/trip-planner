const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    await ctx.modules.map.ready;
  }

  if (typeof ctx?.modules?.map?.getMap === "function") {
    ctx.modules.map.getMap();
  }

  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:충칭", source: "map" });
  } else {
    errors.push("ctx.bus.emit is not available");
  }

  await sleep(1500);

  const crumb = document.querySelector(".detail-breadcrumb");
  if (!crumb) {
    errors.push(".detail-breadcrumb not found");
  } else {
    const text = crumb.textContent.trim();
    if (!text.includes("충칭시")) {
      errors.push(`expected .detail-breadcrumb text to contain "충칭시", got "${text}"`);
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? "detail-breadcrumb contains 충칭시" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
