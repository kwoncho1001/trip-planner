const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checkNoHorizontalScroll() {
  const scrollWidth = document.documentElement.scrollWidth;
  const innerWidth = window.innerWidth;
  if (scrollWidth > innerWidth) {
    return `scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`;
  }
  return null;
}

export async function run(ctx) {
  // 5. Click tab 둘러보기 and MAKE SURE #pane-browse is visible.
  const browseTab = document.querySelector('#mobile-tabs button[data-pane="browse"]');
  if (!browseTab) {
    return { pass: false, detail: 'step 1 failed: tab button [data-pane="browse"] not found' };
  }
  browseTab.click();
  await sleep(300);

  const browsePane = document.querySelector("#pane-browse");
  if (!browsePane || window.getComputedStyle(browsePane).display === "none") {
    return { pass: false, detail: "step 1 failed: #pane-browse is not visible" };
  }
  const scrollErr1 = checkNoHorizontalScroll();
  if (scrollErr1) {
    return { pass: false, detail: `step 1 failed: ${scrollErr1}` };
  }

  // 6. In it, open the detail of city:호이안 the same way browse-food.test.js does.
  // MAKE SURE .food-section is visible and its right edge is inside the screen.
  const city = ctx?.data?.cityById ? ctx.data.cityById("city:호이안") : null;
  if (!city) {
    return { pass: false, detail: 'step 2 failed: city "city:호이안" not found' };
  }
  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:호이안", source: "map" });
  } else {
    return { pass: false, detail: "step 2 failed: ctx.bus.emit is not available" };
  }
  await sleep(1000);

  const foodSection = document.querySelector(".food-section");
  if (!foodSection || window.getComputedStyle(foodSection).display === "none") {
    return { pass: false, detail: "step 2 failed: .food-section is not visible" };
  }
  const foodRect = foodSection.getBoundingClientRect();
  if (foodRect.right > window.innerWidth) {
    return {
      pass: false,
      detail: `step 2 failed: .food-section right edge (${foodRect.right}px) > innerWidth (${window.innerWidth}px)`
    };
  }
  const scrollErr2 = checkNoHorizontalScroll();
  if (scrollErr2) {
    return { pass: false, detail: `step 2 failed: ${scrollErr2}` };
  }

  // 7. In it, add the city to the route with the detail button 경로에 추가. Click tab 일정 and MAKE SURE the route list shows 호이안.
  const addStopBtn = document.querySelector('[data-action="add-stop"]');
  if (!addStopBtn) {
    return { pass: false, detail: 'step 3 failed: button [data-action="add-stop"] not found' };
  }
  addStopBtn.click();
  await sleep(300);

  const planTab = document.querySelector('#mobile-tabs button[data-pane="plan"]');
  if (!planTab) {
    return { pass: false, detail: 'step 3 failed: tab button [data-pane="plan"] not found' };
  }
  planTab.click();
  await sleep(300);

  const planPane = document.querySelector("#pane-plan");
  if (!planPane || window.getComputedStyle(planPane).display === "none") {
    return { pass: false, detail: "step 3 failed: #pane-plan is not visible" };
  }
  const stopNames = Array.from(planPane.querySelectorAll(".stop-name")).map((el) => el.textContent.trim());
  const hasHoiAn = stopNames.includes("호이안") || planPane.textContent.includes("호이안");
  if (!hasHoiAn) {
    return { pass: false, detail: 'step 3 failed: route list does not show "호이안"' };
  }
  const scrollErr3 = checkNoHorizontalScroll();
  if (scrollErr3) {
    return { pass: false, detail: `step 3 failed: ${scrollErr3}` };
  }

  // 8. In it, click tab 지도. MAKE SURE the Leaflet container is at least 300 px high and fully inside the screen.
  const mapTab = document.querySelector('#mobile-tabs button[data-pane="map"]');
  if (!mapTab) {
    return { pass: false, detail: 'step 4 failed: tab button [data-pane="map"] not found' };
  }
  mapTab.click();
  await sleep(300);

  const mapPane = document.querySelector("#pane-map");
  if (!mapPane || window.getComputedStyle(mapPane).display === "none") {
    return { pass: false, detail: "step 4 failed: #pane-map is not visible" };
  }
  const leafletContainer = mapPane.querySelector(".leaflet-container") || mapPane;
  const mapRect = leafletContainer.getBoundingClientRect();
  if (mapRect.height < 300) {
    return {
      pass: false,
      detail: `step 4 failed: Leaflet container height (${mapRect.height}px) < 300px`
    };
  }
  if (
    mapRect.left < 0 ||
    mapRect.right > window.innerWidth ||
    mapRect.top < 0 ||
    mapRect.bottom > window.innerHeight
  ) {
    return {
      pass: false,
      detail: `step 4 failed: Leaflet container not fully inside screen (left=${mapRect.left}, right=${mapRect.right}, top=${mapRect.top}, bottom=${mapRect.bottom}, innerWidth=${window.innerWidth}, innerHeight=${window.innerHeight})`
    };
  }
  const scrollErr4 = checkNoHorizontalScroll();
  if (scrollErr4) {
    return { pass: false, detail: `step 4 failed: ${scrollErr4}` };
  }

  return { pass: true, detail: "mobile-flow passed" };
}
