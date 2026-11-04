export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    await ctx.modules.map.ready;
  }

  const addStop = ctx?.store?.addStop ? ctx.store.addStop.bind(ctx.store) : ctx?.addStop;
  if (typeof addStop === "function") {
    await addStop("city:광저우");
    await addStop("city:구이린");
    await addStop("city:충칭");
  } else {
    errors.push("ctx.store.addStop is not a function");
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const btn = document.querySelector("#map-fit-route");
  if (!btn) {
    errors.push("#map-fit-route element not found");
  } else {
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const map = typeof ctx?.modules?.map?.getMap === "function" ? ctx.modules.map.getMap() : null;
    if (!map) {
      errors.push("ctx.modules.map.getMap() returned null or is missing");
    } else {
      const bounds = map.getBounds();
      const targetCities = [
        { id: "city:광저우", defaultLat: 23.13, defaultLng: 113.26 },
        { id: "city:구이린", defaultLat: 25.274, defaultLng: 110.29 },
        { id: "city:충칭", defaultLat: 29.56, defaultLng: 106.55 }
      ];

      for (const target of targetCities) {
        const cityData = ctx?.data?.cityById ? ctx.data.cityById(target.id) : null;
        const lat = cityData?.lat ?? target.defaultLat;
        const lng = cityData?.lng ?? target.defaultLng;

        const containsPoint = typeof bounds.contains === "function"
          ? bounds.contains([lat, lng])
          : (lat >= bounds.getSouth() && lat <= bounds.getNorth() && lng >= bounds.getWest() && lng <= bounds.getEast());

        if (!containsPoint) {
          errors.push(`getBounds() does not contain ${target.id} (${lat}, ${lng})`);
        }
      }
    }
  }

  const pass = errors.length === 0;
  return {
    pass,
    detail: pass ? "map-fit-route passed" : `errors: ${errors.join("; ")}`
  };
}
