const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // Save original plan and picks to restore at the end
  const origPlan = ctx?.store?.getPlan ? JSON.parse(JSON.stringify(ctx.store.getPlan())) : null;
  const origPicks = ctx?.store?.picks ? JSON.parse(JSON.stringify(ctx.store.picks())) : {};

  // Find 3 Hong Kong spots
  const citySpots = ctx?.data?.spotsOfCity ? ctx.data.spotsOfCity("city:홍콩") : [];
  const spotIds = citySpots.slice(0, 3).map((s) => s.id);
  if (spotIds.length < 3) {
    const fallback = ["hk-victoria-peak", "hk-peak-tram", "hk-lugard-road"];
    for (const id of fallback) {
      if (!spotIds.includes(id)) spotIds.push(id);
      if (spotIds.length >= 3) break;
    }
  }
  const testIds = spotIds.slice(0, 3);

  try {
    // 2. In the test, ADD a stop city:홍콩. SET picks like for 3 Hong Kong spots.
    const testPlan = {
      version: 1,
      startDate: "2026-12-13",
      budget: { dailyMiscKRW: 5000, mealsPerDay: 3 },
      stops: [
        {
          key: "s_hk_test",
          cityId: "city:홍콩",
          nights: 1,
          note: "",
          excludeBudget: false
        }
      ]
    };
    await ctx.store.setPlan(testPlan);

    for (const id of testIds) {
      await ctx.store.setPick(id, "like");
    }
    await sleep(1500);

    // 3. MAKE SURE the stop shows 3 spot rows with the text "순서 요청 전".
    const stopRow = document.querySelector('[data-stop-key="s_hk_test"]') || document.querySelector("#pane-plan [data-stop-key]");
    if (!stopRow) {
      errors.push("stop row for city:홍콩 not found");
    } else {
      const spotRows = Array.from(stopRow.querySelectorAll(".stop-spot-row, [data-spot-id]"));
      if (spotRows.length !== 3) {
        errors.push(`expected 3 spot rows with '순서 요청 전', found ${spotRows.length}`);
      }
      for (const row of spotRows) {
        if (!row.textContent.includes("순서 요청 전")) {
          errors.push(`expected spot row to include '순서 요청 전', got: "${row.textContent.trim()}"`);
        }
      }
    }

    // 4. SET stop.spots to the 3 ids in reverse order with ctx.store.setPlan. MAKE SURE the rows show numbers 1 to 3 in that order.
    const reversedIds = [...testIds].reverse();
    const curPlan = ctx.store.getPlan();
    const targetStop = (curPlan.stops || []).find((s) => s.cityId === "city:홍콩" || s.key === "s_hk_test");
    if (targetStop) {
      targetStop.spots = reversedIds;
      await ctx.store.setPlan(curPlan);
      await sleep(1500);
    } else {
      errors.push("target stop not found in curPlan to set stop.spots");
    }

    const stopRowAfter = document.querySelector('[data-stop-key="s_hk_test"]') || document.querySelector("#pane-plan [data-stop-key]");
    if (stopRowAfter) {
      const spotRowsAfter = Array.from(stopRowAfter.querySelectorAll(".stop-spot-row, [data-spot-id]"));
      if (spotRowsAfter.length !== 3) {
        errors.push(`expected 3 spot rows after setting spots order, found ${spotRowsAfter.length}`);
      } else {
        for (let i = 0; i < spotRowsAfter.length; i++) {
          const row = spotRowsAfter[i];
          const expectedNum = String(i + 1);
          const expectedId = reversedIds[i];
          const expectedSpot = citySpots.find((s) => s.id === expectedId);
          const expectedName = expectedSpot?.name || expectedId;

          const text = row.textContent;
          if (!text.includes(expectedNum)) {
            errors.push(`row ${i + 1} expected number ${expectedNum}, got text: "${text.trim()}"`);
          }
          if (row.getAttribute("data-spot-id") !== expectedId && !text.includes(expectedName)) {
            errors.push(`row ${i + 1} expected spot "${expectedName}" (${expectedId}), got text: "${text.trim()}"`);
          }
          if (text.includes("순서 요청 전")) {
            errors.push(`row ${i + 1} should not include '순서 요청 전' after order is set`);
          }
        }
      }
    }

    // 5. SET one pick back to none. MAKE SURE 2 rows remain.
    await ctx.store.setPick(reversedIds[0], "none");
    await sleep(1500);

    const stopRowAfterNone = document.querySelector('[data-stop-key="s_hk_test"]') || document.querySelector("#pane-plan [data-stop-key]");
    if (stopRowAfterNone) {
      const spotRowsAfterNone = Array.from(stopRowAfterNone.querySelectorAll(".stop-spot-row, [data-spot-id]"));
      if (spotRowsAfterNone.length !== 2) {
        errors.push(`expected 2 spot rows after setting one pick to none, found ${spotRowsAfterNone.length}`);
      }
    }
  } finally {
    // 6. RESTORE the picks and the plan at the end.
    try {
      for (const id of testIds) {
        const orig = origPicks[id];
        const val = (orig && typeof orig === "object") ? orig.v : (orig || "none");
        await ctx.store.setPick(id, val);
      }
      if (origPlan) {
        await ctx.store.setPlan(origPlan);
      }
      await sleep(500);
    } catch (e) {
      console.warn("failed to restore test state", e);
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? "plan-spot-order passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
