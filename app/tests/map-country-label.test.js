const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Country names must sit inside their own country (2026-11-04: at Luang Prabang, 중국·베트남·태국 were drawn inside Laos)
export async function run(ctx) {
  const errors = [];
  if (ctx?.modules?.map?.ready) {
    try { await ctx.modules.map.ready; } catch {}
  }
  const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
  if (!map) return { pass: false, detail: "ctx.modules.map.getMap() returned null" };

  const chip = Array.from(document.querySelectorAll("#map-lens button")).find((b) => b.textContent.trim() === "나라");
  if (chip) chip.click();
  map.setView([19.9, 102.1], 8);
  await sleep(2000);

  const labels = [];
  map.eachLayer((l) => {
    const el = l.getElement?.();
    if (el && el.classList.contains("admin-label") && el.classList.contains("level-0")) {
      labels.push({ text: el.textContent.trim(), ll: l.getLatLng() });
    }
  });
  // Rough areas near Luang Prabang: China is north of 21.1, Vietnam east of 103.2, Thailand west of 101.4 or south of 18
  const rules = {
    중국: (p) => p.lat > 21.1,
    베트남: (p) => p.lng > 103.2,
    태국: (p) => p.lng < 101.4 || p.lat < 18,
  };
  for (const { text, ll } of labels) {
    if (rules[text] && !rules[text](ll)) errors.push(`${text} label at ${ll.lat.toFixed(2)},${ll.lng.toFixed(2)} is outside ${text}`);
  }
  if (!labels.some((l) => l.text === "라오스")) errors.push("expected a 라오스 label at Luang Prabang");

  const pass = errors.length === 0;
  return { pass, detail: pass ? `country labels inside their countries (${labels.map((l) => l.text).join(", ")})` : `errors: ${errors.join("; ")}` };
}
