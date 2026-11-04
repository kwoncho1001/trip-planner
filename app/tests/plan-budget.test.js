export async function run(ctx) {
  const errors = [];

  if (!ctx?.store?.setPlan) {
    return { pass: false, detail: "ctx.store.setPlan is not a function" };
  }

  const plan = {
    version: 1,
    startDate: "2026-12-13",
    budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
    stops: [
      {
        key: "s1",
        cityId: "city:홍콩",
        nights: 2,
        note: "",
        excludeBudget: false,
        leg: { mode: "train", hours: 2, cost: 75, currency: "HKD", overnight: false }
      }
    ]
  };

  await ctx.store.setPlan(plan);
  await new Promise((r) => setTimeout(r, 500));

  // Compute expected total according to contract §5.2 rules:
  // Per stop (unless excludeBudget):
  // lodging = nights × info.lodging.krw
  // food = (nights + 1) × mealsPerDay × info.food.cheap_meal_krw
  // misc = (nights + 1) × dailyMiscKRW
  // leg = util.toKRW(leg.cost, leg.currency)
  // fees = sum of fee.krw of liked spots of that city
  const city = ctx?.data?.cityById ? ctx.data.cityById("city:홍콩") : null;
  const info = city?.info || null;

  const nights = 2;
  const mealsPerDay = 3;
  const dailyMiscKRW = 5000;
  const legCost = 75;
  const legCurrency = "HKD";

  const lodgingKRW = nights * (Number(info?.lodging?.krw) || 0);
  const foodKRW = (nights + 1) * mealsPerDay * (Number(info?.food?.cheap_meal_krw) || 0);
  const miscKRW = (nights + 1) * dailyMiscKRW;
  const legKRW = (ctx?.util?.toKRW ? ctx.util.toKRW(legCost, legCurrency) : null) || 0;

  let feesKRW = 0;
  if (ctx?.store?.picks && ctx?.data?.spotsOfCity) {
    const picks = ctx.store.picks();
    const citySpots = ctx.data.spotsOfCity("city:홍콩") || [];
    for (const spot of citySpots) {
      if (picks[spot.id]?.v === "like" || picks[spot.id] === "like") {
        feesKRW += Number(spot?.fee?.krw) || 0;
      }
    }
  }

  const expectedTotal = lodgingKRW + foodKRW + miscKRW + legKRW + feesKRW;

  const budgetTotalEl = document.querySelector("[data-budget-total]");
  if (!budgetTotalEl) {
    errors.push('[data-budget-total] element not found');
  } else {
    const valAttr = budgetTotalEl.getAttribute("data-value");
    if (valAttr == null || valAttr === "") {
      errors.push('[data-budget-total] attribute data-value is missing');
    } else {
      const actualVal = Number(valAttr);
      if (isNaN(actualVal)) {
        errors.push(`[data-budget-total] data-value "${valAttr}" is not a valid number`);
      } else if (Math.abs(actualVal - expectedTotal) > 1) {
        errors.push(`[data-budget-total] data-value expected ${expectedTotal}, got ${actualVal} (diff ${Math.abs(actualVal - expectedTotal)})`);
      }
    }
  }

  const pass = errors.length === 0;
  return {
    pass,
    detail: pass ? "plan-budget passed" : `errors: ${errors.join("; ")}`
  };
}
