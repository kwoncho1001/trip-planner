function isElementVisible(el) {
  if (!el) return false;
  if (typeof el.checkVisibility === "function") {
    if (!el.checkVisibility()) return false;
  } else {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (el.offsetParent === null && style.position !== "fixed") return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export async function run(ctx) {
  const errors = [];

  // 2. After boot, MAKE SURE exactly one of the three panes is visible and it is #pane-map.
  const panes = [
    document.querySelector("#pane-browse"),
    document.querySelector("#pane-map"),
    document.querySelector("#pane-plan")
  ];
  const visiblePanes = panes.filter((pane) => isElementVisible(pane));
  if (visiblePanes.length !== 1 || visiblePanes[0].id !== "pane-map") {
    const ids = visiblePanes.map((p) => p.id).join(", ") || "none";
    errors.push(`expected exactly #pane-map visible, got: ${ids}`);
  }

  // 3. In it, MAKE SURE each tab button is fully inside window.innerHeight. MAKE SURE document.documentElement.scrollWidth <= window.innerWidth.
  const tabButtons = Array.from(document.querySelectorAll("#mobile-tabs button"));
  if (tabButtons.length === 0) {
    errors.push("no tab buttons found in #mobile-tabs");
  }
  for (const btn of tabButtons) {
    const rect = btn.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      errors.push(
        `tab button "${btn.textContent.trim()}" not fully inside window.innerHeight: top=${rect.top}, bottom=${rect.bottom}, innerHeight=${window.innerHeight}`
      );
    }
  }

  if (document.documentElement.scrollWidth > window.innerWidth) {
    errors.push(
      `document.documentElement.scrollWidth (${document.documentElement.scrollWidth}) > window.innerWidth (${window.innerWidth})`
    );
  }

  // 4. In it, MAKE SURE each visible button and tab is at least 32 px high. MAKE SURE each visible input has font size 16 px or more.
  const buttons = Array.from(document.querySelectorAll("button"));
  for (const btn of buttons) {
    if (isElementVisible(btn)) {
      const rect = btn.getBoundingClientRect();
      if (rect.height < 32) {
        errors.push(`button "${btn.textContent.trim() || btn.className}" height < 32px: got ${rect.height}px`);
      }
    }
  }

  const inputs = Array.from(document.querySelectorAll("input"));
  for (const input of inputs) {
    if (isElementVisible(input)) {
      const style = window.getComputedStyle(input);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize < 16) {
        errors.push(`input "${input.placeholder || input.className}" font size < 16px: got ${fontSize}px`);
      }
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? "mobile-boot passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
