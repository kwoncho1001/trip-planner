export async function run(ctx) {
  const errors = [];

  const cities = ctx?.data?.cities ?? [];
  if (cities.length < 690) {
    errors.push(`cities count < 690: got ${cities.length}`);
  }
  const invalidCities = cities.filter((c) => typeof c?.id !== 'string' || !c.id.startsWith('city:'));
  if (invalidCities.length > 0) {
    errors.push(`${invalidCities.length} cities have invalid id (must start with "city:")`);
  }

  const spots = ctx?.data?.spots ?? [];
  if (spots.length < 220) {
    errors.push(`spots count < 220: got ${spots.length}`);
  }
  const spotsWithoutCity = spots.filter((s) => !s?.cityId || !ctx?.data?.cityById || ctx.data.cityById(s.cityId) === null);
  if (spotsWithoutCity.length > 0) {
    errors.push(`${spotsWithoutCity.length} spots have missing cityById`);
  }

  const selectors = ['#pane-browse', '#pane-map', '#pane-plan', '#global-search', '#progress-bar'];
  for (const selector of selectors) {
    if (!document.querySelector(selector)) {
      errors.push(`element "${selector}" not found`);
    }
  }

  const modules = ['map', 'browse', 'plan'];
  for (const modName of modules) {
    const mod = ctx?.modules?.[modName];
    if (typeof mod !== 'object' || mod === null) {
      errors.push(`ctx.modules.${modName} is not an object`);
    }
  }

  const pass = errors.length === 0;
  const detail = `cities=${cities.length}, spots=${spots.length}${errors.length > 0 ? `, errors: ${errors.join('; ')}` : ''}`;
  return { pass, detail };
}
