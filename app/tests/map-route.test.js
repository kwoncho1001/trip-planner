export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    await ctx.modules.map.ready;
  }

  if (ctx?.store?.addStop) {
    await ctx.store.addStop("city:홍콩");
    await ctx.store.addStop("city:선전");
    await ctx.store.addStop("city:광저우");
  } else {
    errors.push("ctx.store.addStop is not a function");
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const routeLines = document.querySelectorAll("#pane-map .route-line");
  if (routeLines.length !== 1) {
    errors.push(`#pane-map .route-line count !== 1: got ${routeLines.length}`);
  }

  const routeBadges = document.querySelectorAll("#pane-map .route-badge");
  if (routeBadges.length !== 3) {
    errors.push(`#pane-map .route-badge count !== 3: got ${routeBadges.length}`);
  }

  const legLabels = document.querySelectorAll("#pane-map .leg-label");
  if (legLabels.length !== 2) {
    errors.push(`#pane-map .leg-label count !== 2: got ${legLabels.length}`);
  }

  const pass = errors.length === 0;
  const detail = pass
    ? `routeLines=${routeLines.length}, routeBadges=${routeBadges.length}, legLabels=${legLabels.length}`
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
