export async function run(ctx) {
  const errors = [];

  const plan = {
    version: 1,
    startDate: "2026-12-13",
    budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
    stops: [
      {
        key: "s1",
        cityId: "city:홍콩",
        nights: 3,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      },
      {
        key: "s2",
        cityId: "city:선전",
        nights: 2,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      },
      {
        key: "s3",
        cityId: "city:광저우",
        nights: 4,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      }
    ]
  };

  if (!ctx?.store?.setPlan) {
    return { pass: false, detail: "ctx.store.setPlan is not a function" };
  }

  await ctx.store.setPlan(plan);
  await new Promise((r) => setTimeout(r, 100));

  const stopEls = document.querySelectorAll("#pane-plan [data-stop-key]");
  if (stopEls.length !== 3) {
    errors.push(`#pane-plan [data-stop-key] count expected 3, got ${stopEls.length}`);
  } else {
    const thirdStop = stopEls[2];
    const arriveEl = thirdStop.querySelector(".stop-arrive");
    const arriveText = arriveEl ? arriveEl.textContent : "";
    if (!arriveText.includes("12/18")) {
      errors.push(`third stop .stop-arrive expected to contain "12/18", got "${arriveText}"`);
    }

    const moveUpBtn = thirdStop.querySelector('[data-action="move-up"]');
    if (!moveUpBtn) {
      errors.push('third stop [data-action="move-up"] not found');
    } else {
      moveUpBtn.click();
    }
  }

  await new Promise((r) => setTimeout(r, 300));

  const updatedPlan = ctx.store.getPlan ? ctx.store.getPlan() : null;
  if (!updatedPlan?.stops?.[1] || updatedPlan.stops[1].cityId !== "city:광저우") {
    errors.push(`expected getPlan().stops[1].cityId === "city:광저우", got "${updatedPlan?.stops?.[1]?.cityId}"`);
  }

  const pass = errors.length === 0;
  return {
    pass,
    detail: pass ? "plan-dates passed" : `errors: ${errors.join("; ")}`
  };
}
