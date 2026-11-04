export async function run(ctx) {
  const errors = [];

  if (!ctx?.store?.setPlan) {
    return { pass: false, detail: "ctx.store.setPlan is not a function" };
  }

  // 1. setPlan with city:홍콩 5 nights and city:광저우 40 nights
  const planBad = {
    version: 1,
    startDate: "2026-12-13",
    budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
    stops: [
      {
        key: "s1",
        cityId: "city:홍콩",
        nights: 5,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      },
      {
        key: "s2",
        cityId: "city:광저우",
        nights: 40,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      }
    ]
  };

  await ctx.store.setPlan(planBad);
  await new Promise((r) => setTimeout(r, 500));

  const warnElBad = document.querySelector('[data-warn="china"]');
  if (!warnElBad) {
    errors.push('[data-warn="china"] element not found');
  } else if (!warnElBad.classList.contains("is-bad")) {
    errors.push(`[data-warn="china"] expected to have class "is-bad", classList="${warnElBad.className}"`);
  }

  // 2. setPlan with city:홍콩 5 nights and city:광저우 10 nights
  const planOk = {
    version: 1,
    startDate: "2026-12-13",
    budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
    stops: [
      {
        key: "s1",
        cityId: "city:홍콩",
        nights: 5,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      },
      {
        key: "s2",
        cityId: "city:광저우",
        nights: 10,
        note: "",
        excludeBudget: false,
        leg: { mode: null, hours: null, cost: null, currency: null, overnight: false }
      }
    ]
  };

  await ctx.store.setPlan(planOk);
  await new Promise((r) => setTimeout(r, 500));

  const warnElOk = document.querySelector('[data-warn="china"]');
  if (!warnElOk) {
    if (warnElBad) {
      errors.push('[data-warn="china"] element not found after second setPlan');
    }
  } else if (!warnElOk.classList.contains("is-ok")) {
    errors.push(`[data-warn="china"] expected to have class "is-ok", classList="${warnElOk.className}"`);
  }

  const pass = errors.length === 0;
  return {
    pass,
    detail: pass ? "plan-warn passed" : `errors: ${errors.join("; ")}`
  };
}
