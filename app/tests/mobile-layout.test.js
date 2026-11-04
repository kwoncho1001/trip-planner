const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility();
  }
  let cur = el;
  while (cur) {
    if (cur.hidden) return false;
    const style = window.getComputedStyle(cur);
    if (style.display === "none" || style.visibility === "hidden") return false;
    cur = cur.parentElement;
  }
  return true;
}

export async function run(ctx) {
  const errors = [];

  // Wait for initial modules if needed
  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(300);

  // Step 2: ADD two stops with ctx.store.addStop so that #progress-bar shows. Wait 800 ms.
  const initialPlan = ctx?.store?.getPlan ? JSON.parse(JSON.stringify(ctx.store.getPlan())) : null;
  if (ctx?.store?.addStop) {
    await ctx.store.addStop("city:홍콩");
    await ctx.store.addStop("city:선전");
  } else {
    errors.push("ctx.store.addStop is not a function");
  }
  await sleep(800);

  const header = document.querySelector("#app-header");
  const main = document.querySelector("#app-main");
  const tabs = document.querySelector("#mobile-tabs");

  // Step 3: MAKE SURE the bottom of #app-header is at or above the top of #app-main.
  if (!header || !main) {
    errors.push("#app-header or #app-main not found");
  } else {
    const headerRect = header.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    if (headerRect.bottom > mainRect.top + 0.5) {
      errors.push(`header bottom (${headerRect.bottom}px) is below main top (${mainRect.top}px)`);
    }
  }

  // Step 4: MAKE SURE the bottom of #app-main is at or above the top of #mobile-tabs.
  if (!main || !tabs) {
    errors.push("#app-main or #mobile-tabs not found");
  } else {
    const mainRect = main.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    if (mainRect.bottom > tabsRect.top + 0.5) {
      errors.push(`main bottom (${mainRect.bottom}px) is below tabs top (${tabsRect.top}px)`);
    }
  }

  // Step 5: TYPE 광저우 in the header search. MAKE SURE the top of .search-dropdown is at or below the header bottom.
  const searchInput = document.querySelector("#global-search input");
  if (!searchInput) {
    errors.push("#global-search input not found");
  } else {
    searchInput.value = "광저우";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(600);

    const dropdown = document.querySelector(".search-dropdown");
    if (!dropdown) {
      errors.push(".search-dropdown not found");
    } else {
      const dropRect = dropdown.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      if (dropRect.top < headerRect.bottom - 0.5) {
        errors.push(`search-dropdown top (${dropRect.top}px) is above header bottom (${headerRect.bottom}px)`);
      }
    }
    // Clean up search
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
  }

  // Step 6: MAKE SURE a stylesheet rule for #app-header contains safe-area-inset-top.
  let hasSafeArea = false;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule.cssText && rule.cssText.includes("#app-header") && rule.cssText.includes("safe-area-inset-top")) {
          hasSafeArea = true;
          break;
        }
        if (rule.cssRules) {
          for (const subRule of rule.cssRules) {
            if (subRule.cssText && subRule.cssText.includes("#app-header") && subRule.cssText.includes("safe-area-inset-top")) {
              hasSafeArea = true;
              break;
            }
          }
        }
        if (hasSafeArea) break;
      }
    } catch {}
    if (hasSafeArea) break;
  }
  if (!hasSafeArea) {
    errors.push("no stylesheet rule for #app-header contains safe-area-inset-top");
  }

  // Step 7: MAKE SURE each visible .btn-pick is 40x40 px or more.
  const browseTab = document.querySelector('#mobile-tabs button[data-pane="browse"]');
  if (browseTab) {
    browseTab.click();
    await sleep(300);
  }
  const chinaGroup = document.querySelector('.country-group[data-country="중국"]');
  if (chinaGroup && !chinaGroup.classList.contains("is-open")) {
    const groupHead = chinaGroup.querySelector(".country-group-header");
    if (groupHead) {
      groupHead.click();
      await sleep(300);
    }
  }
  const pickButtons = Array.from(document.querySelectorAll(".btn-pick")).filter(isElementVisible);
  if (pickButtons.length === 0) {
    errors.push("no visible .btn-pick found");
  } else {
    for (const btn of pickButtons) {
      const rect = btn.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) {
        errors.push(`.btn-pick size < 40x40: got ${rect.width}x${rect.height}`);
        break;
      }
    }
  }

  // Step 8: OPEN a city detail. MAKE SURE document.documentElement.scrollWidth is 375 or less.
  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:광저우", source: "map" });
  } else {
    const row = document.querySelector('.city-row[data-city-id="city:광저우"]') || document.querySelector(".city-row");
    row?.click();
  }
  await sleep(800);

  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > 375) {
    errors.push(`document.documentElement.scrollWidth (${scrollWidth}) > 375`);
  }

  // Step 9: MAKE SURE .spot-note-input has font size 16 px or more.
  const noteInput = document.querySelector(".spot-note-input");
  if (!noteInput) {
    errors.push(".spot-note-input not found");
  } else {
    const style = window.getComputedStyle(noteInput);
    const fontSize = parseFloat(style.fontSize);
    if (fontSize < 16) {
      errors.push(`.spot-note-input font size < 16px: got ${fontSize}px`);
    }
  }

  // Step 10: OPEN the photo viewer. MAKE SURE the close button box does not meet the source link box.
  const mediaCard = document.querySelector(".city-media-card") || document.querySelector(".spot-photo") || document.querySelector(".spot-photo-wrap img");
  if (mediaCard) {
    mediaCard.click();
    await sleep(400);
  }
  const closeBtn = document.querySelector(".photo-modal-close");
  const srcLink = document.querySelector(".photo-modal-source-link");
  if (!closeBtn || !srcLink) {
    errors.push("photo modal close button or source link not found");
  } else {
    const cRect = closeBtn.getBoundingClientRect();
    const sRect = srcLink.getBoundingClientRect();
    const meets = !(
      cRect.right <= sRect.left ||
      cRect.left >= sRect.right ||
      cRect.bottom <= sRect.top ||
      cRect.top >= sRect.bottom
    );
    if (meets) {
      errors.push(`photo-modal-close box meets source link box (close: [${cRect.left},${cRect.top},${cRect.right},${cRect.bottom}], link: [${sRect.left},${sRect.top},${sRect.right},${sRect.bottom}])`);
    }
    // Close the photo modal
    closeBtn.click();
    await sleep(200);
  }

  // Step 11: MAKE SURE a .drawer element, if one exists, is as wide as the screen.
  let drawer = document.querySelector(".drawer");
  let createdDrawer = false;
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.className = "drawer";
    document.body.appendChild(drawer);
    createdDrawer = true;
  }
  const drawerWidth = drawer.getBoundingClientRect().width;
  if (drawerWidth < window.innerWidth) {
    errors.push(`.drawer width (${drawerWidth}px) < window.innerWidth (${window.innerWidth}px)`);
  }
  if (createdDrawer) {
    drawer.remove();
  }

  // Step 12: MAKE SURE #banner-slot is below the header bottom.
  const bannerSlot = document.querySelector("#banner-slot");
  if (!bannerSlot) {
    errors.push("#banner-slot not found");
  } else {
    const bannerRect = bannerSlot.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    if (bannerRect.top < headerRect.bottom) {
      errors.push(`banner-slot top (${bannerRect.top}px) is above header bottom (${headerRect.bottom}px)`);
    }
  }

  // Step 13: REMOVE the two stops at the end.
  if (initialPlan && ctx?.store?.setPlan) {
    await ctx.store.setPlan(initialPlan);
  } else if (ctx?.store?.getPlan && ctx?.store?.setPlan) {
    const p = ctx.store.getPlan();
    p.stops = [];
    await ctx.store.setPlan(p);
  }
  await sleep(300);

  const pass = errors.length === 0;
  const detail = pass ? "mobile-layout passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
