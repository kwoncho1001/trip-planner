export async function run(ctx) {
  const errors = [];

  // 7. Subscribe to pick:changed, CALL ctx.store.setPick("city:광저우", "like")
  const pickEvents = [];
  const unsubPick = ctx?.bus?.on ? ctx.bus.on('pick:changed', (payload) => {
    pickEvents.push(payload);
  }) : null;

  if (ctx?.store?.setPick) {
    await ctx.store.setPick('city:광저우', 'like');
  } else {
    errors.push('ctx.store.setPick is not a function');
  }

  const lastPick = pickEvents[pickEvents.length - 1];
  if (!lastPick || lastPick.id !== 'city:광저우' || lastPick.v !== 'like') {
    errors.push(`pick:changed payload mismatch: expected { id: "city:광저우", v: "like" }, got ${JSON.stringify(lastPick)}`);
  }

  const pickValue = ctx?.store?.getPick ? ctx.store.getPick('city:광저우') : null;
  if (pickValue !== 'like') {
    errors.push(`getPick("city:광저우") expected "like", got "${pickValue}"`);
  }

  if (typeof unsubPick === 'function') unsubPick();

  // 8 & 9. Subscribe to plan:changed, CALL addStop, SET stop 0 nights to 3 and leg.overnight to true with setPlan
  let planEventCount = 0;
  const unsubPlan = ctx?.bus?.on ? ctx.bus.on('plan:changed', () => {
    planEventCount++;
  }) : null;

  if (ctx?.store?.addStop) {
    await ctx.store.addStop('city:홍콩');
    if (planEventCount !== 1) {
      errors.push(`expected 1 plan:changed event after first addStop, got ${planEventCount}`);
    }

    await ctx.store.addStop('city:선전');
    if (planEventCount !== 2) {
      errors.push(`expected 2 plan:changed events after second addStop, got ${planEventCount}`);
    }
  } else {
    errors.push('ctx.store.addStop is not a function');
  }

  const plan = ctx?.store?.getPlan ? ctx.store.getPlan() : null;
  if (!plan?.stops || plan.stops.length < 2) {
    errors.push(`plan stops length < 2: got ${plan?.stops?.length}`);
  } else {
    plan.stops[0].nights = 3;
    if (!plan.stops[0].leg) {
      plan.stops[0].leg = {};
    }
    plan.stops[0].leg.overnight = true;

    if (ctx?.store?.setPlan) {
      await ctx.store.setPlan(plan);
      if (planEventCount !== 3) {
        errors.push(`expected 3 plan:changed events after setPlan, got ${planEventCount}`);
      }
    } else {
      errors.push('ctx.store.setPlan is not a function');
    }

    const dates = ctx?.util?.planDates ? ctx.util.planDates(ctx.store.getPlan()) : null;
    if (!dates || !dates[1] || dates[1].arrive !== '2026-12-17') {
      errors.push(`planDates[1].arrive expected "2026-12-17", got "${dates?.[1]?.arrive}"`);
    }
  }

  if (typeof unsubPlan === 'function') unsubPlan();

  // 10. util checks
  const krw = ctx?.util?.toKRW ? ctx.util.toKRW(100, 'KRW') : null;
  if (krw !== 100) {
    errors.push(`toKRW(100, "KRW") expected 100, got ${krw}`);
  }

  const formatted = ctx?.util?.formatKRW ? ctx.util.formatKRW(123000) : null;
  if (formatted !== '12.3만원') {
    errors.push(`formatKRW(123000) expected "12.3만원", got "${formatted}"`);
  }

  const added = ctx?.util?.addDays ? ctx.util.addDays('2026-12-31', 1) : null;
  if (added !== '2027-01-01') {
    errors.push(`addDays("2026-12-31", 1) expected "2027-01-01", got "${added}"`);
  }

  const pass = errors.length === 0;
  const detail = pass ? 'store and util checks passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
