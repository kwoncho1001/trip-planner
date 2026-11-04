const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // 1. Initial wait after page boot
  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(1500);

  // 2. Open the detail of "순더". MAKE SURE the last breadcrumb text is "순더".
  const chinaGroup = document.querySelector('.country-group[data-country="중국"]');
  if (chinaGroup && !chinaGroup.classList.contains("is-open")) {
    chinaGroup.querySelector(".country-group-header")?.click();
  }
  const rowShunde = document.querySelector('[data-city-id="city:순더"]');
  if (rowShunde) {
    rowShunde.click();
  } else if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:순더", source: "test" });
  }
  await sleep(1500);

  const crumbShunde = document.querySelector(".detail-breadcrumb");
  if (!crumbShunde) {
    errors.push('.detail-breadcrumb not found for "순더"');
  } else {
    const nonSepCrumbs = Array.from(crumbShunde.children).filter(
      (el) => !el.classList.contains("crumb-separator") && !el.classList.contains("btn-back")
    );
    const lastCrumb = nonSepCrumbs[nonSepCrumbs.length - 1];
    const lastText = lastCrumb ? lastCrumb.textContent.trim() : "";
    if (lastText !== "순더") {
      errors.push(`expected last breadcrumb text to be "순더", got "${lastText}"`);
    }
  }

  // 3. Open the detail of "방콕". MAKE SURE the card of "방콕 왕궁" shows its hours.
  const thaiGroup = document.querySelector('.country-group[data-country="태국"]');
  if (thaiGroup && !thaiGroup.classList.contains("is-open")) {
    thaiGroup.querySelector(".country-group-header")?.click();
  }
  const rowBangkok = document.querySelector('[data-city-id="city:방콕"]');
  if (rowBangkok) {
    rowBangkok.click();
  } else if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:방콕", source: "test" });
  }
  await sleep(1500);

  const palaceCard =
    document.querySelector('[data-spot-id="bangkok-grand-palace"]') ||
    Array.from(document.querySelectorAll(".spot-card")).find((c) =>
      c.textContent.includes("방콕 왕궁")
    );
  if (!palaceCard) {
    errors.push('card of "방콕 왕궁" not found');
  } else {
    const cardText = palaceCard.textContent;
    const hasHours = cardText.includes("08:30") || cardText.includes("운영시간");
    if (!hasHours) {
      errors.push('card of "방콕 왕궁" does not show its hours');
    }
  }

  // 4. Call util.photoStyle("packs/x.jpg#3/10", 2). MAKE SURE the background size is 100% 1000%.
  const photoStyle = ctx?.util?.photoStyle ? ctx.util.photoStyle("packs/x.jpg#3/10", 2) : null;
  if (!photoStyle) {
    errors.push("ctx.util.photoStyle is not available");
  } else if (photoStyle.backgroundSize !== "100% 1000%") {
    errors.push(`expected background size "100% 1000%", got "${photoStyle.backgroundSize}"`);
  }
  await sleep(1500);

  // 5. Set the filter "끌림". MAKE SURE no error is in the console.
  const consoleErrors = [];
  const origConsoleError = console.error;
  console.error = (...args) => {
    consoleErrors.push(
      args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ")
    );
    origConsoleError.apply(console, args);
  };
  const windowErrors = [];
  const onWinError = (ev) => {
    windowErrors.push(ev.message || String(ev.error || ev));
  };
  window.addEventListener("error", onWinError);

  try {
    const backBtn = document.querySelector(".btn-back");
    if (backBtn) {
      backBtn.click();
      await sleep(200);
    }
    const filterBtn = document.querySelector('button[data-filter="끌림"]');
    if (filterBtn) {
      filterBtn.click();
    } else if (ctx?.bus?.emit) {
      ctx.bus.emit("filter:changed", { country: "all", status: "끌림", query: "" });
    }
    await sleep(1500);

    const loggedErrors = [...consoleErrors, ...windowErrors];
    if (loggedErrors.length > 0) {
      errors.push(`errors in console after setting filter "끌림": ${loggedErrors.join("; ")}`);
    }
  } finally {
    console.error = origConsoleError;
    window.removeEventListener("error", onWinError);
  }

  const pass = errors.length === 0;
  const detail = pass ? "browse-audit2 passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
