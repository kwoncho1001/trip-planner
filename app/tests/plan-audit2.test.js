const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // 1. Clear the plan. MAKE SURE the header shows "0일 / 70일".
  if (ctx?.store?.setPlan) {
    await ctx.store.setPlan({
      version: 1,
      startDate: "2026-12-13",
      budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
      stops: []
    });
  } else {
    errors.push("ctx.store.setPlan is not a function");
  }
  await sleep(1500);

  const headerProgressEl = document.querySelector("#progress-bar") || document.querySelector("#app-header");
  const headerText = headerProgressEl ? headerProgressEl.textContent : "";
  if (!headerText.includes("0일 / 70일")) {
    errors.push(`expected header to show "0일 / 70일", got "${headerText.trim()}"`);
  }

  // 2. Add "홍콩", "선전", "광저우". Set a leg cost on 홍콩→선전. Move "선전" up. MAKE SURE no leg shows the old cost for a new pair.
  if (ctx?.store?.addStop) {
    await ctx.store.addStop("city:홍콩");
    await ctx.store.addStop("city:선전");
    await ctx.store.addStop("city:광저우");
  } else if (ctx?.store?.setPlan) {
    await ctx.store.setPlan({
      version: 1,
      startDate: "2026-12-13",
      budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
      stops: [
        { key: "s1", cityId: "city:홍콩", nights: 1, note: "", excludeBudget: false, leg: { mode: null, hours: null, cost: null, currency: null, overnight: false } },
        { key: "s2", cityId: "city:선전", nights: 1, note: "", excludeBudget: false, leg: { mode: null, hours: null, cost: null, currency: null, overnight: false } },
        { key: "s3", cityId: "city:광저우", nights: 1, note: "", excludeBudget: false, leg: { mode: null, hours: null, cost: null, currency: null, overnight: false } }
      ]
    });
  }
  await sleep(1500);

  // Set leg cost on 홍콩→선전
  const costInputs = document.querySelectorAll(".leg-cost-input");
  if (costInputs.length > 0) {
    costInputs[0].value = "75";
    costInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
  }
  const curPlan = ctx?.store?.getPlan ? ctx.store.getPlan() : null;
  if (curPlan?.stops?.[0]) {
    curPlan.stops[0].leg = curPlan.stops[0].leg || {};
    curPlan.stops[0].leg.cost = 75;
    curPlan.stops[0].leg.currency = "HKD";
    await ctx.store.setPlan(curPlan);
  }
  await sleep(1500);

  // Move "선전" up
  const stopRows = document.querySelectorAll("#pane-plan [data-stop-key]");
  const shenzhenRow = stopRows[1];
  const moveUpBtn = shenzhenRow ? shenzhenRow.querySelector('[data-action="move-up"]') : null;
  if (moveUpBtn) {
    moveUpBtn.click();
  } else {
    const p = ctx.store.getPlan();
    if (p.stops && p.stops.length >= 2) {
      const [item] = p.stops.splice(1, 1);
      p.stops.splice(0, 0, item);
      await ctx.store.setPlan(p);
    }
  }
  await sleep(1500);

  // MAKE SURE no leg shows the old cost for a new pair
  const inputsAfterMove = Array.from(document.querySelectorAll(".leg-cost-input"));
  const inputShowingOldCost = inputsAfterMove.some((inp) => inp.value === "75");

  const planAfterMove = ctx.store.getPlan ? ctx.store.getPlan() : null;
  const stopsAfter = planAfterMove?.stops || [];
  let stateHasMismatchedCost = false;
  if (stopsAfter[1]?.leg?.cost === 75 || stopsAfter[0]?.leg?.cost === 75) {
    stateHasMismatchedCost = true;
  }
  if (inputShowingOldCost || stateHasMismatchedCost) {
    errors.push("expected no leg to show old cost 75 for a new pair after moving stop");
  }

  // 3. Click "교통편 조사 요청". MAKE SURE the plan state has one request with type transport and status open.
  const transportBtn = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent.includes("교통편 조사 요청")
  );
  if (!transportBtn) {
    errors.push('button "교통편 조사 요청" not found');
  } else {
    transportBtn.click();
  }
  await sleep(1500);

  const planAfterReq = ctx.store.getPlan ? ctx.store.getPlan() : null;
  const requests = planAfterReq?.requests || [];
  const hasTransportReq = requests.some(
    (r) => r.type === "transport" && r.status === "open"
  );
  if (!hasTransportReq) {
    errors.push('expected plan state to have a request with type "transport" and status "open"');
  }

  // 4. Write options for the leg 홍콩→선전 into the state. MAKE SURE the leg shows them.
  const currentStops = ctx.store.getPlan()?.stops || [];
  const hkIdx = currentStops.findIndex((s) => s.cityId === "city:홍콩" || s.cityId === "홍콩");
  const szIdx = currentStops.findIndex((s) => s.cityId === "city:선전" || s.cityId === "선전");
  if (hkIdx > szIdx && szIdx >= 0) {
    const rows = document.querySelectorAll("#pane-plan [data-stop-key]");
    const downBtn = rows[szIdx]?.querySelector('[data-action="move-down"]');
    if (downBtn) {
      downBtn.click();
    } else {
      const cur = ctx.store.getPlan();
      const [item] = cur.stops.splice(szIdx, 1);
      cur.stops.splice(szIdx + 1, 0, item);
      await ctx.store.setPlan(cur);
    }
    await sleep(1500);
  }

  const sampleOptions = [
    {
      mode: "sleeper",
      hours: 1.5,
      cost: 120,
      currency: "HKD",
      overnight: false,
      source: "MTR"
    }
  ];

  const planForOptions = ctx.store.getPlan();
  planForOptions.legs = planForOptions.legs || [];
  let legEntry = planForOptions.legs.find(
    (l) =>
      (l.fromCityId === "city:홍콩" || l.fromCityId === "홍콩") &&
      (l.toCityId === "city:선전" || l.toCityId === "선전")
  );
  if (!legEntry) {
    legEntry = {
      fromCityId: "city:홍콩",
      toCityId: "city:선전",
      options: sampleOptions,
      chosen: null
    };
    planForOptions.legs.push(legEntry);
  } else {
    legEntry.options = sampleOptions;
  }

  if (planForOptions.stops) {
    const hkStop = planForOptions.stops.find((s) => s.cityId === "city:홍콩" || s.cityId === "홍콩");
    if (hkStop) {
      hkStop.leg = hkStop.leg || {};
      hkStop.leg.fromCityId = "city:홍콩";
      hkStop.leg.toCityId = "city:선전";
      hkStop.leg.options = sampleOptions;
    }
  }

  await ctx.store.setPlan(planForOptions);
  await sleep(1500);

  const legEditors = document.querySelectorAll(".plan-leg-editor");
  const firstLegEditor = legEditors[0];
  const firstLegText = firstLegEditor ? firstLegEditor.textContent : "";
  const hasOptionsUI = firstLegEditor && (
    firstLegEditor.querySelector(".leg-options, .leg-option, [data-leg-option]") ||
    firstLegText.includes("MTR") ||
    firstLegText.includes("120") ||
    firstLegText.includes("sleeper")
  );
  if (!hasOptionsUI) {
    errors.push('expected leg 홍콩→선전 to show options, but options UI not found');
  }

  const pass = errors.length === 0;
  const detail = pass
    ? "plan-audit2 passed"
    : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
