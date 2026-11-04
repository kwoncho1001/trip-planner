export async function run(ctx) {
  const errors = [];

  const input = document.querySelector("#global-search input");
  if (!input) {
    errors.push("#global-search input not found");
  } else {
    input.value = "홍콩";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));

    const firstResult = document.querySelector("[data-result-id]");
    if (!firstResult) {
      errors.push("first [data-result-id] element not found");
    } else {
      const rect = firstResult.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const elAtPoint = document.elementFromPoint(cx, cy);
      const dropdown = document.querySelector(".search-dropdown");

      if (!elAtPoint) {
        errors.push(`elementFromPoint at (${cx}, ${cy}) returned null`);
      } else if (!dropdown || (!dropdown.contains(elAtPoint) && elAtPoint !== dropdown)) {
        errors.push(
          `elementFromPoint at (${cx}, ${cy}) is ${elAtPoint.tagName}#${elAtPoint.id}.${elAtPoint.className}, not inside .search-dropdown`
        );
      }
    }
  }

  const pass = errors.length === 0;
  return {
    pass,
    detail: pass ? "search result is visible above panes" : `errors: ${errors.join("; ")}`
  };
}
