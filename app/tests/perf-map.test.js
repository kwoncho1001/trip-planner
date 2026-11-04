const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Map speed (user, 2026-11-04: "렉이 너무 많이 걸림"). Measures pans and zooms in a dense city view
// and the longest blocking task. Budgets: every step 250 ms or less, total 6000 ms or less, longest task 200 ms or less.
export async function run(ctx) {
  if (ctx?.modules?.map?.ready) {
    try { await ctx.modules.map.ready; } catch {}
  }
  const map = ctx?.modules?.map?.getMap?.();
  if (!map) return { pass: false, detail: "no map" };

  let longest = 0;
  let po = null;
  try {
    po = new PerformanceObserver((list) => { for (const e of list.getEntries()) longest = Math.max(longest, e.duration); });
    po.observe({ type: "longtask", buffered: false });
  } catch {}

  const waitIdle = () => new Promise((r) => setTimeout(r, 0));
  map.setView([22.3, 114.17], 12);
  await sleep(2500);
  longest = 0;

  const steps = [];
  const t0 = performance.now();
  const moves = [
    () => map.panBy([300, 0], { animate: false }),
    () => map.panBy([0, 300], { animate: false }),
    () => map.panBy([-300, 0], { animate: false }),
    () => map.panBy([0, -300], { animate: false }),
    () => map.setZoom(13, { animate: false }),
    () => map.setZoom(11, { animate: false }),
    () => map.setZoom(9, { animate: false }),
    () => map.setZoom(12, { animate: false }),
    () => map.setView([23.13, 113.26], 12, { animate: false }),
    () => map.panBy([400, 200], { animate: false }),
  ];
  for (const m of moves) {
    const s = performance.now();
    m();
    await waitIdle();
    await sleep(50);
    steps.push(Math.round(performance.now() - s - 50));
  }
  await sleep(1500);
  const total = Math.round(performance.now() - t0);
  if (po) po.disconnect();

  const worst = Math.max(...steps);
  const detail = `steps ${steps.join(",")} ms; worst ${worst}; total ${total}; longest task ${Math.round(longest)} ms; layers ${Object.keys(map._layers).length}`;
  const pass = worst <= 250 && total <= 6000 && longest <= 200;
  return { pass, detail };
}
