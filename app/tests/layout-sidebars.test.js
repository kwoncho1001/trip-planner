const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(300);

  const paneBrowse = document.querySelector("#pane-browse");
  const paneMap = document.querySelector("#pane-map");
  const panePlan = document.querySelector("#pane-plan");

  if (!paneBrowse || !paneMap || !panePlan) {
    return { pass: false, detail: "panes not found" };
  }

  // 5. Read the #pane-map width. Click #toggle-browse, wait 500 ms. MAKE SURE #pane-browse width is below 5 px and #pane-map is wider.
  const initialMapWidth = paneMap.getBoundingClientRect().width;

  const toggleBrowse = document.querySelector("#toggle-browse");
  if (!toggleBrowse) {
    errors.push("#toggle-browse button not found");
  } else {
    toggleBrowse.click();
    await sleep(500);

    const browseWidth = paneBrowse.getBoundingClientRect().width;
    const currentMapWidth = paneMap.getBoundingClientRect().width;

    if (browseWidth >= 5) {
      errors.push(`expected #pane-browse width below 5 px, got ${browseWidth}px`);
    }
    if (currentMapWidth <= initialMapWidth) {
      errors.push(`expected #pane-map to be wider than ${initialMapWidth}px, got ${currentMapWidth}px`);
    }
  }

  // 6. In it, click #toggle-plan, wait 500 ms, MAKE SURE #pane-plan width is below 5 px.
  const togglePlan = document.querySelector("#toggle-plan");
  if (!togglePlan) {
    errors.push("#toggle-plan button not found");
  } else {
    togglePlan.click();
    await sleep(500);

    const planWidth = panePlan.getBoundingClientRect().width;
    if (planWidth >= 5) {
      errors.push(`expected #pane-plan width below 5 px, got ${planWidth}px`);
    }
  }

  // Click both toggles again. MAKE SURE both panes are wider than 200 px.
  if (toggleBrowse && togglePlan) {
    toggleBrowse.click();
    togglePlan.click();
    await sleep(500);

    const browseWidthAfter = paneBrowse.getBoundingClientRect().width;
    const planWidthAfter = panePlan.getBoundingClientRect().width;

    if (browseWidthAfter <= 200) {
      errors.push(`expected #pane-browse width > 200 px after reopening, got ${browseWidthAfter}px`);
    }
    if (planWidthAfter <= 200) {
      errors.push(`expected #pane-plan width > 200 px after reopening, got ${planWidthAfter}px`);
    }
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "desktop sidebars collapse and restore verified"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
