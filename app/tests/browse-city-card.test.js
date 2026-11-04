const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility();
  }
  let cur = el;
  while (cur) {
    if (cur.hidden) return false;
    const style = window.getComputedStyle(cur);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    cur = cur.parentElement;
  }
  return true;
}

export async function run(ctx) {
  const errors = [];

  if (ctx?.modules?.map?.ready) {
    try {
      await ctx.modules.map.ready;
    } catch {}
  }
  await sleep(300);

  // 4. Open the country group 캄보디아. MAKE SURE each visible .city-row has a non-empty .city-row-desc.
  const group = document.querySelector('.country-group[data-country="캄보디아"]');
  if (!group) {
    errors.push('country group "캄보디아" not found');
  } else {
    if (!group.classList.contains('is-open')) {
      const header = group.querySelector('.country-group-header');
      if (header) {
        header.click();
        await sleep(300);
      }
    }

    const visibleRows = Array.from(group.querySelectorAll('.city-row')).filter(isElementVisible);
    if (visibleRows.length === 0) {
      errors.push('no visible .city-row in 캄보디아');
    } else {
      for (const row of visibleRows) {
        const descEl = row.querySelector('.city-row-desc');
        const descText = descEl ? descEl.textContent.trim() : '';
        if (!descText) {
          const cId = row.getAttribute('data-city-id') || 'unknown';
          errors.push(`visible .city-row (${cId}) has missing or empty .city-row-desc`);
        }
      }
    }

    // 5. In it, MAKE SURE the row of 프놈펜 has 3 or more .city-row-media thumbnails.
    const rowPhnomPenh = group.querySelector('.city-row[data-city-id="city:프놈펜"]') ||
      Array.from(group.querySelectorAll('.city-row')).find((r) => r.textContent.includes('프놈펜'));
    if (!rowPhnomPenh) {
      errors.push('row of 프놈펜 not found');
    } else {
      const mediaBox = rowPhnomPenh.querySelector('.city-row-media');
      const thumbCount = mediaBox
        ? (mediaBox.children.length || mediaBox.querySelectorAll('img, div').length)
        : rowPhnomPenh.querySelectorAll('.city-row-media').length;
      if (thumbCount < 3) {
        errors.push(`row of 프놈펜 has ${thumbCount} .city-row-media thumbnails (expected >= 3)`);
      }
    }

    // 6. In it, MAKE SURE the visible rows of 캄보디아 are only 대도시 and 중소도시 cities.
    for (const row of visibleRows) {
      const cityId = row.getAttribute('data-city-id');
      const cityObj = ctx?.data?.cityById ? ctx.data.cityById(cityId) : null;
      const badge = row.querySelector('.badge');
      const kind = cityObj?.kind || (badge ? badge.textContent.trim() : '');
      if (kind !== '대도시' && kind !== '중소도시') {
        errors.push(`visible row (${cityId || 'unknown'}) has kind "${kind}" (expected only 대도시 or 중소도시)`);
      }
    }

    // 7. In it, MAKE SURE the more button text starts with 작은 도시·마을.
    const allButtons = Array.from(group.querySelectorAll('button, [role="button"], .city-more-btn, .btn-more'));
    const moreBtn = allButtons.find((b) => b.textContent.trim().startsWith('작은 도시·마을')) ||
      Array.from(group.querySelectorAll('*')).find((el) => {
        const text = el.textContent.trim();
        return text.startsWith('작은 도시·마을') && isElementVisible(el);
      });
    if (!moreBtn || !moreBtn.textContent.trim().startsWith('작은 도시·마을')) {
      errors.push('more button starting with "작은 도시·마을" not found');
    }

    // 5 (continued). Open its detail. MAKE SURE .city-media has 3 or more cards.
    if (rowPhnomPenh) {
      const target = rowPhnomPenh.querySelector('.city-row-main') || rowPhnomPenh;
      target.click();
    } else if (ctx?.bus?.emit) {
      ctx.bus.emit('city:focus', { cityId: 'city:프놈펜', source: 'browse' });
    }
    await sleep(500);

    const cityMedia = document.querySelector('.city-media');
    if (!cityMedia) {
      errors.push('.city-media not found in city detail');
    } else {
      const cards = cityMedia.querySelectorAll('.city-media-card, .card, img, > *');
      const cardCount = cityMedia.children.length > 0 ? cityMedia.children.length : cards.length;
      if (cardCount < 3) {
        errors.push(`.city-media has ${cardCount} cards (expected >= 3)`);
      }
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? 'browse-city-card passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
