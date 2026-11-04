const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // 6. emit city:focus for "city:광저우", wait 800 ms, click [data-action="request-research"], wait 300 ms.
  if (ctx?.bus?.emit) {
    ctx.bus.emit('city:focus', { cityId: 'city:광저우', source: 'map' });
  } else {
    errors.push('ctx.bus.emit is not available');
  }
  await sleep(800);

  const reqBtn = document.querySelector('[data-action="request-research"]');
  if (!reqBtn) {
    errors.push('[data-action="request-research"] not found');
  } else {
    reqBtn.click();
    await sleep(300);
  }

  // 7. In it, MAKE SURE getPick("research:city:광저우") === "request". Then click [data-action="add-stop"] and MAKE SURE the last plan stop has cityId "city:광저우".
  const pick = ctx?.store?.getPick ? ctx.store.getPick('research:city:광저우') : null;
  if (pick !== 'request') {
    errors.push(`getPick("research:city:광저우") expected "request", got "${pick}"`);
  }

  const addStopBtn = document.querySelector('[data-action="add-stop"]');
  if (!addStopBtn) {
    errors.push('[data-action="add-stop"] not found');
  } else {
    addStopBtn.click();
    await sleep(300);

    const plan = ctx?.store?.getPlan ? ctx.store.getPlan() : null;
    const lastStop = plan?.stops?.[plan.stops.length - 1];
    if (!lastStop || lastStop.cityId !== 'city:광저우') {
      errors.push(`last plan stop expected cityId "city:광저우", got "${lastStop?.cityId}"`);
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? 'browse-research passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
