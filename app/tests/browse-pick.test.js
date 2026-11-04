const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // 3. emit city:focus { cityId: "city:홍콩", source: "map" }, wait 1000 ms. MAKE SURE #pane-browse [data-spot-id] count is at least 100.
  if (ctx?.bus?.emit) {
    ctx.bus.emit('city:focus', { cityId: 'city:홍콩', source: 'map' });
  } else {
    errors.push('ctx.bus.emit is not available');
  }
  await sleep(1000);

  const spotCards = document.querySelectorAll('#pane-browse [data-spot-id]');
  if (spotCards.length < 100) {
    errors.push(`#pane-browse [data-spot-id] count < 100 (got ${spotCards.length})`);
  }

  // 4. In it, keep a reference to the card [data-spot-id="hk-victoria-peak"], click its [data-pick="like"], wait 300 ms.
  const card = document.querySelector('#pane-browse [data-spot-id="hk-victoria-peak"]');
  if (!card) {
    errors.push('card [data-spot-id="hk-victoria-peak"] not found');
  } else {
    const likeBtn = card.querySelector('[data-pick="like"]');
    if (!likeBtn) {
      errors.push('[data-pick="like"] button not found in card');
    } else {
      likeBtn.click();
      await sleep(300);

      // 5. In it, MAKE SURE getPick("hk-victoria-peak") === "like", the kept card is still isConnected, and it has class is-like.
      const pick = ctx?.store?.getPick ? ctx.store.getPick('hk-victoria-peak') : null;
      if (pick !== 'like') {
        errors.push(`getPick("hk-victoria-peak") expected "like", got "${pick}"`);
      }
      if (!card.isConnected) {
        errors.push('card is not isConnected');
      }
      if (!card.classList.contains('is-like')) {
        errors.push('card does not have class "is-like"');
      }
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? 'browse-pick passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
