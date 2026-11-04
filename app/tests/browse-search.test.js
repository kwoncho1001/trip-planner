const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  // 1. SET #global-search input value to "광저우", dispatch input, wait 600 ms. MAKE SURE [data-result-id="city:광저우"] exists.
  const input = document.querySelector('#global-search input');
  if (!input) {
    errors.push('#global-search input not found');
  } else {
    input.value = '광저우';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(600);

    const cityResult = document.querySelector('[data-result-id="city:광저우"]');
    if (!cityResult) {
      errors.push('[data-result-id="city:광저우"] not found');
    }

    // 2. In it, SET the value to "빅토리아", dispatch input, wait 600 ms. MAKE SURE [data-result-id="hk-victoria-peak"] exists.
    input.value = '빅토리아';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(600);

    const spotResult = document.querySelector('[data-result-id="hk-victoria-peak"]');
    if (!spotResult) {
      errors.push('[data-result-id="hk-victoria-peak"] not found');
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? 'browse-search passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
