/**
 * Asia trip planner v4 - Plan pane
 * docs/plans/completed/2026-11-01_ui-i3-plan.md
 */

function formatMD(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  const parts = isoStr.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return isoStr;
  return `${parts[1]}/${parts[2]}`;
}

function computeBudgetBreakdown(plan, ctx) {
  if (!plan || !plan.stops) return { grandTotal: 0, stopRows: [] };
  const mealsPerDay = Number(plan.budget?.mealsPerDay ?? 3);
  const dailyMiscKRW = Number(plan.budget?.dailyMiscKRW ?? 5000);
  const picks = ctx.store?.picks ? ctx.store.picks() : {};
  let grandTotal = 0;
  const stopRows = [];

  for (let i = 0; i < plan.stops.length; i++) {
    const stop = plan.stops[i];
    const nextStop = plan.stops[i + 1];
    const city = ctx.data?.cityById ? ctx.data.cityById(stop.cityId) : null;
    const cityName = city?.city || (stop.cityId || "").replace(/^city:/, "");
    const info = city?.info || null;
    const isExcluded = Boolean(stop.excludeBudget || cityName === "나트랑" || stop.cityId === "city:나트랑");

    if (isExcluded) {
      stopRows.push({
        key: stop.key,
        cityName,
        isExcluded: true,
        hasInfo: Boolean(info),
        lodging: 0,
        food: 0,
        misc: 0,
        leg: 0,
        fees: 0,
        total: 0
      });
      continue;
    }

    const nights = Number(stop.nights) || 0;
    const lodging = nights * (Number(info?.lodging?.krw) || 0);
    const food = (nights + 1) * mealsPerDay * (Number(info?.food?.cheap_meal_krw) || 0);
    const misc = (nights + 1) * dailyMiscKRW;

    let leg = 0;
    const isLastStop = i === plan.stops.length - 1;
    const includeLeg = (plan.stops.length === 1) || (!isLastStop && (!stop.leg?.toCityId || stop.leg.toCityId === nextStop?.cityId));
    if (includeLeg && stop.leg && stop.leg.cost != null && stop.leg.currency) {
      leg = (ctx.util?.toKRW ? ctx.util.toKRW(stop.leg.cost, stop.leg.currency) : null) || 0;
    }

    let fees = 0;
    const citySpots = ctx.data?.spotsOfCity ? ctx.data.spotsOfCity(stop.cityId) : [];
    for (const spot of citySpots) {
      const pick = picks[spot.id];
      if (pick?.v === "like" || pick === "like") {
        fees += Number(spot?.fee?.krw) || 0;
      }
    }

    const total = lodging + food + misc + leg + fees;
    grandTotal += total;

    stopRows.push({
      key: stop.key,
      cityName,
      isExcluded: false,
      hasInfo: Boolean(info),
      lodging,
      food,
      misc,
      leg,
      fees,
      total
    });
  }

  return { grandTotal: Math.round(grandTotal), stopRows };
}

export function init(ctx) {
  const { bus, store, data, util, el } = ctx;
  if (!el) return {};

  let draggedIndex = null;
  let isRendering = false;

  function updateProgressBar(plan, dates, dateMap) {
    const progressEl = document.getElementById("progress-bar");
    if (!progressEl) return;
    progressEl.innerHTML = "";

    const constraints = data.constraints || {
      startDate: "2026-12-13",
      chinaEntry: "2026-12-18",
      chinaExitBy: "2027-01-17",
      chinaMaxDays: 30,
      nhaTrangArrive: "2027-01-25",
      familyNights: 6,
      returnDate: "2027-02-20",
      budgetKRW: 4000000
    };

    const stops = plan.stops || [];

    // 1. Total days: "N일 / 70일" (D1: calendar days from start date to last departure. "0일 / 70일" with no stops)
    const totalDaysEl = document.createElement("span");
    totalDaysEl.className = "progress-item progress-total-days";
    let totalDays = 0;
    if (stops.length > 0 && dates.length > 0) {
      const start = plan.startDate || constraints.startDate || "2026-12-13";
      const lastDepart = dates[dates.length - 1].depart;
      totalDays = util.daysBetween(start, lastDepart) + 1;
    }
    totalDaysEl.textContent = `${totalDays}일 / 70일`;
    progressEl.appendChild(totalDaysEl);

    // 2. China stay: 30 days max and must exit by 1/17 (2027-01-17)
    const mainlandStops = [];
    for (const stop of stops) {
      const city = data.cityById ? data.cityById(stop.cityId) : null;
      const cityName = city?.city || (stop.cityId || "").replace(/^city:/, "");
      const isHongKong = cityName === "홍콩" || stop.cityId === "city:홍콩" || city?.region === "홍콩";
      if (isHongKong) continue;
      const isChina = (city?.country === "중국") ||
        ["선전", "광저우", "주하이", "포산", "순더", "둥관", "중산", "장먼", "카이핑", "타이산", "후이저우", "차오저우", "산터우", "구이린", "양숴", "난닝", "구이양", "충칭", "청두", "쿤밍", "다리", "리장", "샹그릴라", "시솽반나", "샤먼", "푸저우", "취안저우", "우이산", "장저우", "샤푸", "룽옌", "창팅", "롄청", "난핑", "푸딩", "충우", "더화", "진장", "류아오"].some((n) => cityName.includes(n) || stop.cityId.includes(n));
      if (isChina) {
        const dInfo = dateMap.get(stop.key);
        if (dInfo) {
          mainlandStops.push({ stop, dInfo });
        }
      }
    }

    const chinaWarnEl = document.createElement("span");
    chinaWarnEl.setAttribute("data-warn", "china");
    if (mainlandStops.length === 0) {
      chinaWarnEl.className = "progress-item progress-warn is-ok";
      // Nothing to check yet: keep the header quiet
      chinaWarnEl.hidden = true;
    } else {
      const firstArrive = mainlandStops[0].dInfo.arrive;
      const lastDepart = mainlandStops[mainlandStops.length - 1].dInfo.depart;
      const chinaDays = util.daysBetween(firstArrive, lastDepart);
      const isOverDays = chinaDays > (constraints.chinaMaxDays || 30);
      const isAfterExit = Boolean(lastDepart && lastDepart > (constraints.chinaExitBy || "2027-01-17"));
      const isBad = isOverDays || isAfterExit;
      chinaWarnEl.className = `progress-item progress-warn ${isBad ? "is-bad" : "is-ok"}`;
      chinaWarnEl.textContent = `중국 본토 ${chinaDays}일 (1/17까지)`;
      if (isBad) {
        chinaWarnEl.title = isAfterExit ? `${formatMD(lastDepart)} 출국 — 1/17 초과` : `체류 ${chinaDays}일 — 30일 초과`;
      }
    }
    progressEl.appendChild(chinaWarnEl);

    // 3. Nha Trang warning: [data-warn="nhatrang"]
    const ntWarnEl = document.createElement("span");
    ntWarnEl.setAttribute("data-warn", "nhatrang");
    const ntStop = stops.find((s) => {
      const city = data.cityById ? data.cityById(s.cityId) : null;
      const cityName = city?.city || (s.cityId || "").replace(/^city:/, "");
      return cityName === "나트랑" || s.cityId === "city:나트랑";
    });
    if (!ntStop) {
      ntWarnEl.className = "progress-item progress-warn is-ok";
      // Nothing to check yet: keep the header quiet
      ntWarnEl.hidden = true;
    } else {
      const dInfo = dateMap.get(ntStop.key);
      const arrive = dInfo?.arrive || "";
      const isBad = Boolean(arrive && arrive > (constraints.nhaTrangArrive || "2027-01-25"));
      ntWarnEl.className = `progress-item progress-warn ${isBad ? "is-bad" : "is-ok"}`;
      ntWarnEl.textContent = `나트랑 도착 ${formatMD(arrive)} (1/25 고정)`;
      if (isBad) {
        ntWarnEl.title = `${formatMD(arrive)} 도착 — 1/25 초과`;
      }
    }
    progressEl.appendChild(ntWarnEl);

    // 4. Return warning: [data-warn="return"]
    const returnWarnEl = document.createElement("span");
    returnWarnEl.setAttribute("data-warn", "return");
    if (stops.length === 0 || dates.length === 0) {
      returnWarnEl.className = "progress-item progress-warn is-ok";
      // Nothing to check yet: keep the header quiet
      returnWarnEl.hidden = true;
    } else {
      const lastDepart = dates[dates.length - 1].depart;
      const isBad = Boolean(lastDepart && lastDepart > (constraints.returnDate || "2027-02-20"));
      returnWarnEl.className = `progress-item progress-warn ${isBad ? "is-bad" : "is-ok"}`;
      returnWarnEl.textContent = `귀국 ${formatMD(lastDepart)} (2/20)`;
      if (isBad) {
        returnWarnEl.title = `${formatMD(lastDepart)} 귀국 — 2/20 초과`;
      }
    }
    progressEl.appendChild(returnWarnEl);

    // 5. Budget warning: [data-warn="budget"]
    const { grandTotal } = computeBudgetBreakdown(plan, ctx);
    const budgetLimit = constraints.budgetKRW || 4000000;
    const budgetWarnEl = document.createElement("span");
    budgetWarnEl.setAttribute("data-warn", "budget");
    const budgetBad = grandTotal > budgetLimit;
    budgetWarnEl.className = `progress-item progress-warn ${budgetBad ? "is-bad" : "is-ok"}`;
    budgetWarnEl.textContent = `예산 ${util.formatKRW(grandTotal)} / ${util.formatKRW(budgetLimit)}`;
    if (budgetBad) {
      budgetWarnEl.title = `예산 초과: ${util.formatKRW(grandTotal - budgetLimit)}`;
    }
    progressEl.appendChild(budgetWarnEl);
  }

  // Device sync (web mode): built once and moved into each render, so a half-typed token survives re-renders
  let syncEl = null;
  function syncSection() {
    if (syncEl) return syncEl;
    syncEl = document.createElement("section");
    syncEl.className = "plan-export-section plan-sync-section";
    const det = document.createElement("details");
    det.className = "plan-export-details";
    const sum = document.createElement("summary");
    det.appendChild(sum);
    const body = document.createElement("div");
    body.className = "sync-body";
    det.appendChild(body);
    syncEl.appendChild(det);

    const fmt = (t) => (t ? new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "");
    function draw() {
      const info = store.syncInfo();
      sum.textContent = info.enabled
        ? `기기 간 동기화 · ${info.status === "error" ? "오류" : info.status === "syncing" ? "동기화 중" : "켜짐"}`
        : "기기 간 동기화 · 꺼짐";
      body.innerHTML = "";
      const p = (text, cls = "sync-note") => {
        const e = document.createElement("p");
        e.className = cls;
        e.textContent = text;
        body.appendChild(e);
        return e;
      };
      if (info.enabled) {
        p(info.status === "error" ? `마지막 시도 실패: ${info.error}` : info.at ? `마지막 동기화 ${fmt(info.at)}` : "동기화 준비 중", info.status === "error" ? "sync-note sync-error" : "sync-note");
        p("끌림·패스·메모·계획이 내 비공개 GitHub Gist에 저장됩니다. 다른 기기에서도 같은 토큰으로 연결하면 같은 데이터를 봅니다.");
        const idLine = p("Gist ID: ", "sync-note sync-id");
        const code = document.createElement("code");
        code.textContent = info.gistId;
        idLine.appendChild(code);
        const row = document.createElement("div");
        row.className = "export-buttons-grid";
        const now = document.createElement("button");
        now.type = "button";
        now.className = "btn";
        now.textContent = "지금 동기화";
        now.addEventListener("click", () => store.syncNow());
        const off = document.createElement("button");
        off.type = "button";
        off.className = "btn";
        off.textContent = "연결 해제";
        off.addEventListener("click", () => {
          if (confirm("이 기기의 동기화를 끕니다. 이 기기에 저장된 데이터와 Gist는 그대로 남습니다.")) store.disconnectSync();
        });
        row.appendChild(now);
        row.appendChild(off);
        body.appendChild(row);
        return;
      }
      p("지금은 이 기기에만 저장됩니다. 켜면 휴대폰·PC가 같은 끌림·계획을 보고, Claude도 읽을 수 있습니다.");
      const steps = document.createElement("ol");
      steps.className = "sync-steps";
      const li1 = document.createElement("li");
      const link = document.createElement("a");
      link.href = "https://github.com/settings/tokens/new?scopes=gist&description=trip-planner-sync";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "GitHub 토큰 만들기";
      li1.appendChild(link);
      li1.appendChild(document.createTextNode(" — 'gist'만 체크된 상태로 맨 아래 Generate token"));
      const li2 = document.createElement("li");
      li2.textContent = "만든 토큰(ghp_로 시작)을 아래에 붙여 넣고 연결";
      steps.appendChild(li1);
      steps.appendChild(li2);
      body.appendChild(steps);
      const row = document.createElement("div");
      row.className = "sync-connect-row";
      const input = document.createElement("input");
      input.type = "password";
      input.placeholder = "ghp_…";
      input.autocomplete = "off";
      input.className = "sync-token";
      const go = document.createElement("button");
      go.type = "button";
      go.className = "btn btn-primary";
      go.textContent = "연결";
      go.addEventListener("click", async () => {
        go.disabled = true;
        go.textContent = "연결 중…";
        try {
          await store.connectSync(input.value);
        } catch (e) {
          go.disabled = false;
          go.textContent = "연결";
          draw();
        }
      });
      row.appendChild(input);
      row.appendChild(go);
      body.appendChild(row);
      if (info.error) p(info.error, "sync-note sync-error");
    }
    draw();
    bus.on("sync:status", draw);
    return syncEl;
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      el.innerHTML = "";
      const plan = store.getPlan();
      const dates = util.planDates(plan);
      const dateMap = new Map();
      for (const d of dates) {
        dateMap.set(d.key, d);
      }

      updateProgressBar(plan, dates, dateMap);

      const container = document.createElement("div");
      container.className = "plan-pane-inner";

      // 1. Plan header controls (start-date & add city)
      const headerEl = document.createElement("div");
      headerEl.className = "plan-header-controls";

      const startDateRow = document.createElement("div");
      startDateRow.className = "plan-start-date-row";
      const startLabel = document.createElement("label");
      startLabel.className = "plan-label";
      startLabel.textContent = "출발일";
      const startInput = document.createElement("input");
      startInput.type = "text";
      startInput.inputMode = "numeric";
      startInput.placeholder = "YYYY-MM-DD";
      startInput.className = "plan-date-input";
      startInput.value = plan.startDate || "2026-12-13";
      startInput.addEventListener("change", async () => {
        const val = (startInput.value || "").trim();
        const isValid = /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
        if (isValid) {
          plan.startDate = val;
        } else {
          plan.startDate = "2026-12-13";
          startInput.value = "2026-12-13";
        }
        await store.setPlan(plan);
      });
      startLabel.appendChild(startInput);
      startDateRow.appendChild(startLabel);
      headerEl.appendChild(startDateRow);

      // City search & add (B5-06)
      const addCityWrapper = document.createElement("div");
      addCityWrapper.className = "plan-add-city-wrapper";

      const addCityInput = document.createElement("input");
      addCityInput.type = "text";
      addCityInput.className = "plan-add-city-input";
      addCityInput.placeholder = "도시 검색 후 추가...";

      const dropdown = document.createElement("div");
      dropdown.className = "plan-search-dropdown dropdown-menu";
      dropdown.hidden = true;

      addCityInput.addEventListener("input", () => {
        const query = addCityInput.value.trim().toLowerCase();
        dropdown.innerHTML = "";
        if (!query) {
          dropdown.hidden = true;
          return;
        }
        const matches = (data.cities || []).filter((c) =>
          (c.city && c.city.toLowerCase().includes(query)) ||
          (c.local && c.local.toLowerCase().includes(query)) ||
          (c.region && c.region.toLowerCase().includes(query))
        ).slice(0, 8);

        if (matches.length === 0) {
          const noResult = document.createElement("div");
          noResult.className = "dropdown-item is-disabled";
          noResult.textContent = "검색 결과 없음";
          dropdown.appendChild(noResult);
        } else {
          matches.forEach((c) => {
            const item = document.createElement("div");
            item.className = "dropdown-item";

            const nameSpan = document.createElement("span");
            nameSpan.className = "city-name";
            nameSpan.textContent = c.city;

            const metaSpan = document.createElement("span");
            metaSpan.className = "city-meta";
            metaSpan.textContent = `${c.country} · ${c.region || ""}`;

            item.appendChild(nameSpan);
            item.appendChild(metaSpan);

            item.addEventListener("click", async () => {
              await store.addStop(c.id || `city:${c.city}`);
              addCityInput.value = "";
              dropdown.hidden = true;
            });
            dropdown.appendChild(item);
          });
        }
        dropdown.hidden = false;
      });

      addCityWrapper.appendChild(addCityInput);
      addCityWrapper.appendChild(dropdown);
      headerEl.appendChild(addCityWrapper);

      // Request buttons (D4, D5, D6, B5-10)
      const reqRow = document.createElement("div");
      reqRow.className = "plan-request-row";

      const transportBtn = document.createElement("button");
      transportBtn.type = "button";
      transportBtn.className = "btn btn-sm btn-request-transport";
      transportBtn.textContent = "교통편 조사 요청";
      transportBtn.title = "Gemini에게 구간 교통편 조사 요청";
      transportBtn.addEventListener("click", async () => {
        const cur = store.getPlan();
        cur.requests = cur.requests || [];
        cur.requests.push({
          type: "transport",
          scope: "route",
          at: new Date().toISOString(),
          status: "open"
        });
        await store.setPlan(cur);
      });

      const optimizeBtn = document.createElement("button");
      optimizeBtn.type = "button";
      optimizeBtn.className = "btn btn-sm btn-request-optimize";
      optimizeBtn.textContent = "최적 경로 요청";
      optimizeBtn.title = "Claude에게 제약 조건 기반 최적 경로 요청";
      optimizeBtn.addEventListener("click", async () => {
        const cur = store.getPlan();
        cur.requests = cur.requests || [];
        cur.requests.push({
          type: "optimize",
          scope: "route",
          at: new Date().toISOString(),
          status: "open"
        });
        await store.setPlan(cur);
      });

      reqRow.appendChild(transportBtn);
      reqRow.appendChild(optimizeBtn);
      headerEl.appendChild(reqRow);

      container.appendChild(headerEl);

    // 2. Stops list or empty state
    const stopsListEl = document.createElement("div");
    stopsListEl.className = "plan-stops-list";

    if (!plan.stops || plan.stops.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state";
      emptyDiv.textContent = "경로가 비어 있습니다";
      stopsListEl.appendChild(emptyDiv);
    } else {
      plan.stops.forEach((stop, i) => {
      const city = data.cityById ? data.cityById(stop.cityId) : null;
      const cityName = city?.city || (stop.cityId || "").replace(/^city:/, "");
      const dateInfo = dateMap.get(stop.key) || { arrive: "", depart: "" };

      const isNhaTrang = cityName === "나트랑" || stop.cityId === "city:나트랑";
      const isExcludeBudget = Boolean(stop.excludeBudget || isNhaTrang);

      const stopRow = document.createElement("div");
      stopRow.className = "plan-stop-row";
      stopRow.setAttribute("data-stop-key", stop.key);
      stopRow.draggable = true;

      // Drag and drop events
      stopRow.addEventListener("dragstart", (e) => {
        draggedIndex = i;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(i));
        stopRow.classList.add("is-dragging");
      });

      stopRow.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        stopRow.classList.add("drag-over");
      });

      stopRow.addEventListener("dragleave", () => {
        stopRow.classList.remove("drag-over");
      });

      stopRow.addEventListener("drop", async (e) => {
        e.preventDefault();
        stopRow.classList.remove("drag-over");
        const fromIdx = draggedIndex != null ? draggedIndex : parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIdx = i;
        if (!isNaN(fromIdx) && fromIdx !== toIdx && fromIdx >= 0 && fromIdx < plan.stops.length) {
          const currentPlan = store.getPlan();
          const [moved] = currentPlan.stops.splice(fromIdx, 1);
          currentPlan.stops.splice(toIdx, 0, moved);
          await store.setPlan(currentPlan);
        }
      });

      stopRow.addEventListener("dragend", () => {
        draggedIndex = null;
        stopRow.classList.remove("is-dragging");
        document.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
      });

      // Stop header: number, name, actions
      const head = document.createElement("div");
      head.className = "stop-head";

      const dragHandle = document.createElement("span");
      dragHandle.className = "drag-handle";
      dragHandle.textContent = "⋮⋮";
      dragHandle.title = "드래그하여 순서 변경";

      const numBadge = document.createElement("span");
      numBadge.className = "stop-no";
      numBadge.textContent = String(i + 1);

      const nameEl = document.createElement("span");
      nameEl.className = "stop-name";
      nameEl.textContent = cityName;
      nameEl.setAttribute("role", "button");
      nameEl.setAttribute("tabindex", "0");
      nameEl.title = "지도/정보에서 보기";
      nameEl.addEventListener("click", () => {
        bus.emit("city:focus", { cityId: stop.cityId, source: "plan" });
      });

      head.appendChild(dragHandle);
      head.appendChild(numBadge);
      head.appendChild(nameEl);

      if (isExcludeBudget) {
        const badge = document.createElement("span");
        badge.className = "badge badge-family";
        badge.textContent = "가족 기간 — 예산 제외";
        head.appendChild(badge);
      }

      // Actions: move-up, move-down, delete
      const actions = document.createElement("div");
      actions.className = "stop-actions";
      const stopKey = stop.key;

      const moveUpBtn = document.createElement("button");
      moveUpBtn.type = "button";
      moveUpBtn.className = "btn-icon";
      moveUpBtn.setAttribute("data-action", "move-up");
      moveUpBtn.textContent = "▲";
      moveUpBtn.title = "위로 이동";
      if (i === 0) moveUpBtn.disabled = true;
      moveUpBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentPlan = store.getPlan();
        const stops = currentPlan.stops || [];
        const idx = stops.findIndex((s) => s.key === stopKey);
        if (idx > 0) {
          const [item] = stops.splice(idx, 1);
          stops.splice(idx - 1, 0, item);
          await store.setPlan(currentPlan);
        }
      });

      const moveDownBtn = document.createElement("button");
      moveDownBtn.type = "button";
      moveDownBtn.className = "btn-icon";
      moveDownBtn.setAttribute("data-action", "move-down");
      moveDownBtn.textContent = "▼";
      moveDownBtn.title = "아래로 이동";
      if (i === plan.stops.length - 1) moveDownBtn.disabled = true;
      moveDownBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentPlan = store.getPlan();
        const stops = currentPlan.stops || [];
        const idx = stops.findIndex((s) => s.key === stopKey);
        if (idx >= 0 && idx < stops.length - 1) {
          const [item] = stops.splice(idx, 1);
          stops.splice(idx + 1, 0, item);
          await store.setPlan(currentPlan);
        }
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-icon btn-del";
      delBtn.setAttribute("data-action", "delete");
      delBtn.textContent = "삭제";
      delBtn.title = "정류장 삭제";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentPlan = store.getPlan();
        const stops = currentPlan.stops || [];
        const idx = stops.findIndex((s) => s.key === stopKey);
        if (idx >= 0) {
          stops.splice(idx, 1);
          await store.setPlan(currentPlan);
        }
      });

      actions.appendChild(moveUpBtn);
      actions.appendChild(moveDownBtn);
      actions.appendChild(delBtn);
      head.appendChild(actions);

      stopRow.appendChild(head);

      // Stop details: arrival, departure, nights stepper
      const details = document.createElement("div");
      details.className = "stop-details";

      const datesWrapper = document.createElement("div");
      datesWrapper.className = "stop-dates";

      const arriveEl = document.createElement("span");
      arriveEl.className = "stop-arrive";
      arriveEl.textContent = formatMD(dateInfo.arrive);

      const dateArrow = document.createElement("span");
      dateArrow.className = "date-sep";
      dateArrow.textContent = "→";

      const departEl = document.createElement("span");
      departEl.className = "stop-depart";
      departEl.textContent = formatMD(dateInfo.depart);

      datesWrapper.appendChild(arriveEl);
      datesWrapper.appendChild(dateArrow);
      datesWrapper.appendChild(departEl);
      details.appendChild(datesWrapper);

      // Nights stepper (0 to 30)
      const stepper = document.createElement("div");
      stepper.className = "nights-stepper";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.className = "stepper-btn";
      minusBtn.textContent = "-";
      minusBtn.setAttribute("aria-label", "1박 감소");
      minusBtn.addEventListener("click", async () => {
        const currentPlan = store.getPlan();
        const currentStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
        if (currentStop) {
          currentStop.nights = Math.max(0, Math.min(30, (Number(currentStop.nights) || 0) - 1));
          await store.setPlan(currentPlan);
        }
      });

      const nightsInput = document.createElement("input");
      nightsInput.type = "number";
      nightsInput.className = "nights-input";
      nightsInput.min = "0";
      nightsInput.max = "30";
      nightsInput.value = String(stop.nights ?? 1);
      nightsInput.addEventListener("change", async () => {
        const val = Math.max(0, Math.min(30, parseInt(nightsInput.value, 10) || 0));
        const currentPlan = store.getPlan();
        const currentStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
        if (currentStop) {
          currentStop.nights = val;
          await store.setPlan(currentPlan);
        }
      });

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "stepper-btn";
      plusBtn.textContent = "+";
      plusBtn.setAttribute("aria-label", "1박 증가");
      plusBtn.addEventListener("click", async () => {
        const currentPlan = store.getPlan();
        const currentStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
        if (currentStop) {
          currentStop.nights = Math.max(0, Math.min(30, (Number(currentStop.nights) || 0) + 1));
          await store.setPlan(currentPlan);
        }
      });

      const nightsUnit = document.createElement("span");
      nightsUnit.className = "nights-unit";
      nightsUnit.textContent = "박";

      stepper.appendChild(minusBtn);
      stepper.appendChild(nightsInput);
      stepper.appendChild(nightsUnit);
      stepper.appendChild(plusBtn);

      details.appendChild(stepper);

      // Stop note input (B5-13)
      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.className = "stop-note-input";
      noteInput.placeholder = "메모 (숙소, 특이사항)...";
      noteInput.value = stop.note || "";
      noteInput.addEventListener("change", async () => {
        const curPlan = store.getPlan();
        const curStop = (curPlan.stops || []).find((s) => s.key === stopKey);
        if (curStop) {
          curStop.note = noteInput.value;
          await store.setPlan(curPlan);
        }
      });
      details.appendChild(noteInput);

      stopRow.appendChild(details);

      // Liked spots under each stop (D6, D7)
      const citySpots = (data.spotsOfCity ? data.spotsOfCity(stop.cityId) : []) || [];
      const likedSpots = citySpots.filter((s) => store.getPick(s.id) === "like");

      if (likedSpots.length > 0) {
        const stopSpotsListEl = document.createElement("div");
        stopSpotsListEl.className = "stop-spots-list";

        const displayItems = [];
        if (Array.isArray(stop.spots)) {
          const likedMap = new Map(likedSpots.map((s) => [s.id, s]));
          for (const spotId of stop.spots) {
            if (likedMap.has(spotId)) {
              displayItems.push({
                spot: likedMap.get(spotId),
                hasNumber: true,
                orderNum: displayItems.length + 1
              });
              likedMap.delete(spotId);
            }
          }
          // Add liked spots that are not in stop.spots at the end
          for (const s of likedMap.values()) {
            displayItems.push({
              spot: s,
              hasNumber: false
            });
          }
        } else {
          // If stop.spots does not exist
          for (const s of likedSpots) {
            displayItems.push({
              spot: s,
              hasNumber: false
            });
          }
        }

        displayItems.forEach(({ spot, hasNumber, orderNum }) => {
          const itemRow = document.createElement("div");
          itemRow.className = "stop-spot-row";
          itemRow.setAttribute("data-spot-id", spot.id);

          if (hasNumber) {
            const numSpan = document.createElement("span");
            numSpan.className = "stop-spot-num";
            numSpan.textContent = String(orderNum);
            itemRow.appendChild(numSpan);
          }

          const nameSpan = document.createElement("span");
          nameSpan.className = "stop-spot-name";
          nameSpan.textContent = spot.name || spot.id;
          itemRow.appendChild(nameSpan);

          if (!hasNumber) {
            const pendingSpan = document.createElement("span");
            pendingSpan.className = "stop-spot-pending";
            pendingSpan.textContent = "순서 요청 전";
            itemRow.appendChild(pendingSpan);
          }

          stopSpotsListEl.appendChild(itemRow);
        });

        stopRow.appendChild(stopSpotsListEl);
      }

      stopsListEl.appendChild(stopRow);

      // Between stops: Leg editor
      if (i < plan.stops.length - 1) {
        const nextStop = plan.stops[i + 1];
        const nextCity = data.cityById ? data.cityById(nextStop.cityId) : null;
        let distKm = 0;
        if (city?.lat != null && city?.lng != null && nextCity?.lat != null && nextCity?.lng != null) {
          distKm = Math.round(util.distanceKm(city.lat, city.lng, nextCity.lat, nextCity.lng));
        }

        const leg = stop.leg || {
          mode: null,
          hours: null,
          cost: null,
          currency: null,
          overnight: false
        };

        const legEl = document.createElement("div");
        legEl.className = "plan-leg-editor";

        const legTop = document.createElement("div");
        legTop.className = "leg-top-row";

        const lineDeco = document.createElement("div");
        lineDeco.className = "leg-line-indicator";

        const distSpan = document.createElement("span");
        distSpan.className = "leg-dist-text";
        distSpan.textContent = distKm > 0 ? `직선 ${distKm}km` : "";

        legTop.appendChild(lineDeco);
        if (distKm > 0) legTop.appendChild(distSpan);
        legEl.appendChild(legTop);

        const legInputs = document.createElement("div");
        legInputs.className = "leg-inputs-grid";

        // Mode select: 기차, 침대열차, 버스, 야간버스, 배, 도보, 기타
        const modeSelect = document.createElement("select");
        modeSelect.className = "leg-mode-select";
        const modeOptions = [
          { val: "", label: "이동 수단" },
          { val: "train", label: "기차" },
          { val: "sleeper", label: "침대열차" },
          { val: "bus", label: "버스" },
          { val: "night-bus", label: "야간버스" },
          { val: "boat", label: "배" },
          { val: "walk", label: "도보" },
          { val: "other", label: "기타" }
        ];
        for (const opt of modeOptions) {
          const o = document.createElement("option");
          o.value = opt.val;
          o.textContent = opt.label;
          if (leg.mode === opt.val || leg.mode === opt.label) {
            o.selected = true;
          }
        }
        modeSelect.addEventListener("change", async () => {
          const currentPlan = store.getPlan();
          const targetStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
          if (targetStop) {
            targetStop.leg = targetStop.leg || {};
            targetStop.leg.mode = modeSelect.value || null;
            targetStop.leg.fromCityId = targetStop.cityId;
            targetStop.leg.toCityId = nextStop.cityId;
            await store.setPlan(currentPlan);
          }
        });
        legInputs.appendChild(modeSelect);

        // Hours input
        const hoursInput = document.createElement("input");
        hoursInput.type = "number";
        hoursInput.className = "leg-hours-input";
        hoursInput.min = "0";
        hoursInput.step = "0.5";
        hoursInput.placeholder = "시간(h)";
        hoursInput.value = leg.hours != null ? String(leg.hours) : "";
        hoursInput.addEventListener("change", async () => {
          const currentPlan = store.getPlan();
          const targetStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
          if (targetStop) {
            targetStop.leg = targetStop.leg || {};
            targetStop.leg.hours = hoursInput.value !== "" ? Number(hoursInput.value) : null;
            targetStop.leg.fromCityId = targetStop.cityId;
            targetStop.leg.toCityId = nextStop.cityId;
            await store.setPlan(currentPlan);
          }
        });
        legInputs.appendChild(hoursInput);

        // Cost input
        const costInput = document.createElement("input");
        costInput.type = "number";
        costInput.className = "leg-cost-input";
        costInput.min = "0";
        costInput.placeholder = "비용";
        costInput.value = leg.cost != null ? String(leg.cost) : "";
        costInput.addEventListener("change", async () => {
          const currentPlan = store.getPlan();
          const targetStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
          if (targetStop) {
            targetStop.leg = targetStop.leg || {};
            targetStop.leg.cost = costInput.value !== "" ? Number(costInput.value) : null;
            targetStop.leg.fromCityId = targetStop.cityId;
            targetStop.leg.toCityId = nextStop.cityId;
            await store.setPlan(currentPlan);
          }
        });
        legInputs.appendChild(costInput);

        // Currency select
        const currSelect = document.createElement("select");
        currSelect.className = "leg-curr-select";
        const currencies = ["KRW", "HKD", "CNY", "VND", "LAK", "KHR", "THB", "MYR", "SGD", "USD"];
        for (const c of currencies) {
          const o = document.createElement("option");
          o.value = c;
          o.textContent = c;
          if ((leg.currency || "KRW") === c) {
            o.selected = true;
          }
        }
        currSelect.addEventListener("change", async () => {
          const currentPlan = store.getPlan();
          const targetStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
          if (targetStop) {
            targetStop.leg = targetStop.leg || {};
            targetStop.leg.currency = currSelect.value || null;
            targetStop.leg.fromCityId = targetStop.cityId;
            targetStop.leg.toCityId = nextStop.cityId;
            await store.setPlan(currentPlan);
          }
        });
        legInputs.appendChild(currSelect);

        // Overnight checkbox
        const overnightLabel = document.createElement("label");
        overnightLabel.className = "leg-overnight-label";
        const overnightCheckbox = document.createElement("input");
        overnightCheckbox.type = "checkbox";
        overnightCheckbox.className = "leg-overnight-checkbox";
        overnightCheckbox.checked = Boolean(leg.overnight);
        overnightCheckbox.addEventListener("change", async () => {
          const currentPlan = store.getPlan();
          const targetStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
          if (targetStop) {
            targetStop.leg = targetStop.leg || {};
            targetStop.leg.overnight = overnightCheckbox.checked;
            targetStop.leg.fromCityId = targetStop.cityId;
            targetStop.leg.toCityId = nextStop.cityId;
            await store.setPlan(currentPlan);
          }
        });
        overnightLabel.appendChild(overnightCheckbox);
        overnightLabel.appendChild(document.createTextNode(" 야간 이동"));
        legInputs.appendChild(overnightLabel);

        legEl.appendChild(legInputs);

        // Researched options (D5, D7, B5-10)
        const legOptions = (stop.leg && Array.isArray(stop.leg.options) && stop.leg.options.length > 0)
          ? stop.leg.options
          : ((plan.legs || []).find((l) =>
              (l.fromCityId === stop.cityId || l.fromCityId === stop.cityId.replace(/^city:/, "")) &&
              (l.toCityId === nextStop.cityId || l.toCityId === nextStop.cityId.replace(/^city:/, ""))
            )?.options || []);

        if (legOptions && legOptions.length > 0) {
          const optionsContainer = document.createElement("div");
          optionsContainer.className = "leg-options";

          const optTitle = document.createElement("div");
          optTitle.className = "leg-options-title";
          optTitle.textContent = "조사된 교통편 옵션:";
          optionsContainer.appendChild(optTitle);

          legOptions.forEach((opt, optIdx) => {
            const optEl = document.createElement("div");
            optEl.className = "leg-option";
            optEl.setAttribute("data-leg-option", String(optIdx));

            const optText = document.createElement("span");
            optText.className = "leg-option-text";
            const sourceStr = opt.source ? `[${opt.source}] ` : "";
            const overStr = opt.overnight ? " · 야간" : "";
            const hoursStr = opt.hours != null ? `${opt.hours}시간` : "";
            const costStr = opt.cost != null ? `${opt.cost} ${opt.currency || ""}` : "";
            const modeStr = opt.mode || "";
            const parts = [modeStr, hoursStr, costStr].filter(Boolean).join(" · ");
            optText.textContent = `${sourceStr}${parts}${overStr}`.trim();

            const chooseBtn = document.createElement("button");
            chooseBtn.type = "button";
            chooseBtn.className = "btn-choose-option";
            chooseBtn.textContent = "선택";
            chooseBtn.addEventListener("click", async () => {
              const currentPlan = store.getPlan();
              const curStop = (currentPlan.stops || []).find((s) => s.key === stopKey);
              if (curStop) {
                curStop.leg = curStop.leg || {};
                if (opt.mode != null) curStop.leg.mode = opt.mode;
                if (opt.hours != null) curStop.leg.hours = opt.hours;
                if (opt.cost != null) curStop.leg.cost = opt.cost;
                if (opt.currency != null) curStop.leg.currency = opt.currency;
                if (opt.overnight != null) curStop.leg.overnight = opt.overnight;
                curStop.leg.fromCityId = curStop.cityId;
                curStop.leg.toCityId = nextStop.cityId;
              }
              const legItem = (currentPlan.legs || []).find((l) =>
                (l.fromCityId === stop.cityId || l.fromCityId === stop.cityId.replace(/^city:/, "")) &&
                (l.toCityId === nextStop.cityId || l.toCityId === nextStop.cityId.replace(/^city:/, ""))
              );
              if (legItem) {
                legItem.chosen = optIdx;
              }
              await store.setPlan(currentPlan);
            });

            optEl.appendChild(optText);
            optEl.appendChild(chooseBtn);
            optionsContainer.appendChild(optEl);
          });

          legEl.appendChild(optionsContainer);
        }

        stopsListEl.appendChild(legEl);
      }
    });
  }

  container.appendChild(stopsListEl);

  // 3. Budget section
  const budgetSection = document.createElement("section");
  budgetSection.className = "plan-budget-section";

  const { grandTotal } = computeBudgetBreakdown(plan, ctx);
  const budgetLimit = plan.budget?.limitKRW || (data.constraints && data.constraints.budgetKRW) || 4000000;

  const budgetTotalEl = document.createElement("div");
  budgetTotalEl.className = "budget-total";
  budgetTotalEl.setAttribute("data-budget-total", "");
  budgetTotalEl.setAttribute("data-value", String(grandTotal));
  budgetTotalEl.innerHTML = `<span class="budget-total-val">예산 ${util.formatKRW(grandTotal)}</span> <span class="budget-limit">/ ${util.formatKRW(budgetLimit)}</span>`;
  budgetSection.appendChild(budgetTotalEl);

  // Budget settings inside closed <details> titled "설정"
  const budgetDetails = document.createElement("details");
  budgetDetails.className = "budget-settings-details";

  const budgetSummary = document.createElement("summary");
  budgetSummary.textContent = "설정";
  budgetDetails.appendChild(budgetSummary);

  const budgetSettings = document.createElement("div");
  budgetSettings.className = "budget-settings";

  const miscLabel = document.createElement("label");
  miscLabel.className = "setting-label";
  miscLabel.textContent = "하루 기타 경비 ";
  const miscInput = document.createElement("input");
  miscInput.type = "number";
  miscInput.className = "budget-input daily-misc";
  miscInput.min = "0";
  miscInput.step = "1000";
  miscInput.value = String(plan.budget?.dailyMiscKRW ?? 5000);
  miscInput.addEventListener("change", async () => {
    const currentPlan = store.getPlan();
    currentPlan.budget = currentPlan.budget || {};
    currentPlan.budget.dailyMiscKRW = Math.max(0, parseInt(miscInput.value, 10) || 0);
    await store.setPlan(currentPlan);
  });
  miscLabel.appendChild(miscInput);
  miscLabel.appendChild(document.createTextNode(" 원"));

  const mealsLabel = document.createElement("label");
  mealsLabel.className = "setting-label";
  mealsLabel.textContent = "하루 식사 ";
  const mealsInput = document.createElement("input");
  mealsInput.type = "number";
  mealsInput.className = "budget-input meals-per-day";
  mealsInput.min = "1";
  mealsInput.max = "10";
  mealsInput.value = String(plan.budget?.mealsPerDay ?? 3);
  mealsInput.addEventListener("change", async () => {
    const currentPlan = store.getPlan();
    currentPlan.budget = currentPlan.budget || {};
    currentPlan.budget.mealsPerDay = Math.max(1, parseInt(mealsInput.value, 10) || 1);
    await store.setPlan(currentPlan);
  });
  mealsLabel.appendChild(mealsInput);
  mealsLabel.appendChild(document.createTextNode(" 끼"));

  const limitLabel = document.createElement("label");
  limitLabel.className = "setting-label";
  limitLabel.textContent = "총 예산 한도 ";
  const limitInput = document.createElement("input");
  limitInput.type = "number";
  limitInput.className = "budget-input budget-limit-input";
  limitInput.min = "1000000";
  limitInput.step = "100000";
  limitInput.value = String(plan.budget?.limitKRW ?? budgetLimit);
  limitInput.addEventListener("change", async () => {
    const currentPlan = store.getPlan();
    currentPlan.budget = currentPlan.budget || {};
    currentPlan.budget.limitKRW = Math.max(0, parseInt(limitInput.value, 10) || 4000000);
    await store.setPlan(currentPlan);
  });
  limitLabel.appendChild(limitInput);
  limitLabel.appendChild(document.createTextNode(" 원"));

  budgetSettings.appendChild(miscLabel);
  budgetSettings.appendChild(mealsLabel);
  budgetSettings.appendChild(limitLabel);
  budgetDetails.appendChild(budgetSettings);
  budgetSection.appendChild(budgetDetails);

  container.appendChild(budgetSection);

  // 4. Export section
  const exportSection = document.createElement("section");
  exportSection.className = "plan-export-section";

  const exportDetails = document.createElement("details");
  exportDetails.className = "plan-export-details";

  const exportSummary = document.createElement("summary");
  exportSummary.textContent = "내보내기";
  exportDetails.appendChild(exportSummary);

  const exportGrid = document.createElement("div");
  exportGrid.className = "export-buttons-grid";

  // 4-1. 내 데이터 내보내기 (D6)
  const exportDataBtn = document.createElement("button");
  exportDataBtn.type = "button";
  exportDataBtn.className = "btn";
  exportDataBtn.textContent = "내 데이터 내보내기";
  exportDataBtn.addEventListener("click", () => {
    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plan: store.getPlan(),
      picks: store.picks ? store.picks() : {}
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  exportGrid.appendChild(exportDataBtn);

  // 4-2. 가져오기 (D6)
  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "btn";
  importBtn.textContent = "가져오기";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const dataObj = JSON.parse(text);
      const targetPlan = dataObj.plan || (dataObj.stops ? dataObj : null);
      if (!targetPlan || (targetPlan.version !== 1 && dataObj.version !== 1)) {
        alert("유효하지 않은 데이터 파일입니다 (version 1 필요).");
        return;
      }
      if (confirm("데이터를 가져오시겠습니까? 현재 선택과 계획이 대체됩니다.")) {
        await store.setPlan(targetPlan);
        if (dataObj.picks) {
          if (store.picksMap) {
            for (const key of Object.keys(store.picksMap)) {
              delete store.picksMap[key];
            }
          }
          if (store.setPick) {
            for (const [k, v] of Object.entries(dataObj.picks)) {
              const val = v && typeof v === "object" ? v.v : v;
              await store.setPick(k, val);
              if (v && typeof v === "object" && v.note && store.setNote) {
                await store.setNote(k, v.note);
              }
            }
          }
        }
        alert(`가져왔습니다: 선택 ${Object.keys(dataObj.picks || {}).length}개, 일정 ${(targetPlan.stops || []).length}곳`);
      }
    } catch (err) {
      alert("파일을 불러오는 중 오류가 발생했습니다: " + (err.message || String(err)));
    } finally {
      fileInput.value = "";
    }
  });
  exportGrid.appendChild(importBtn);
  exportGrid.appendChild(fileInput);

  // 4-3. 텍스트 복사
  const textCopyBtn = document.createElement("button");
  textCopyBtn.type = "button";
  textCopyBtn.className = "btn";
  textCopyBtn.textContent = "텍스트 복사";
  textCopyBtn.addEventListener("click", async () => {
    const currentPlan = store.getPlan();
    const currentDates = util.planDates(currentPlan);
    const dMap = new Map();
    for (const d of currentDates) dMap.set(d.key, d);

    const picks = store.picks ? store.picks() : {};
    const lines = (currentPlan.stops || []).map((s, idx) => {
      const c = data.cityById ? data.cityById(s.cityId) : null;
      const cName = c?.city || (s.cityId || "").replace(/^city:/, "");
      const d = dMap.get(s.key) || { arrive: "", depart: "" };
      let legDetails = "";
      if (s.leg?.mode) {
        const hStr = s.leg.hours != null ? ` ${s.leg.hours}h` : "";
        const cStr = s.leg.cost != null ? ` ${s.leg.cost}${s.leg.currency || ""}` : "";
        const onStr = s.leg.overnight ? " (야간)" : "";
        legDetails = ` | 이동: ${s.leg.mode}${hStr}${cStr}${onStr}`;
      }
      const noteStr = s.note ? ` [메모: ${s.note}]` : "";
      const likedSpots = (data.spotsOfCity ? data.spotsOfCity(s.cityId) : [])
        .filter((sp) => picks[sp.id]?.v === "like" || picks[sp.id] === "like")
        .map((sp) => sp.name);
      const spotsStr = likedSpots.length > 0 ? ` (끌림: ${likedSpots.join(", ")})` : "";
      return `${idx + 1}. ${d.arrive} ~ ${d.depart} | ${cName} (${s.nights}박)${legDetails}${spotsStr}${noteStr}`;
    });
    const { grandTotal: textTotal } = computeBudgetBreakdown(currentPlan, ctx);
    lines.push(`\n총 예상 경비: ${util.formatKRW(textTotal)}`);

    const fullText = lines.join("\n");
    try {
      await navigator.clipboard.writeText(fullText);
      const orig = textCopyBtn.textContent;
      textCopyBtn.textContent = "복사 완료!";
      setTimeout(() => {
        textCopyBtn.textContent = orig;
      }, 2000);
    } catch (e) {
      prompt("아래 텍스트를 복사하세요:", fullText);
    }
  });
  exportGrid.appendChild(textCopyBtn);

  // 4-4. GeoJSON 저장
  const geoJsonBtn = document.createElement("button");
  geoJsonBtn.type = "button";
  geoJsonBtn.className = "btn";
  geoJsonBtn.textContent = "GeoJSON 저장";
  geoJsonBtn.addEventListener("click", () => {
    const currentPlan = store.getPlan();
    const currentDates = util.planDates(currentPlan);
    const dMap = new Map();
    for (const d of currentDates) dMap.set(d.key, d);

    const features = [];
    const coords = [];

    (currentPlan.stops || []).forEach((s, idx) => {
      const c = data.cityById ? data.cityById(s.cityId) : null;
      const d = dMap.get(s.key) || { arrive: "", depart: "" };
      if (c && c.lng != null && c.lat != null) {
        coords.push([Number(c.lng), Number(c.lat)]);
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [Number(c.lng), Number(c.lat)]
          },
          properties: {
            index: idx + 1,
            cityId: s.cityId,
            city: c.city,
            country: c.country,
            nights: s.nights,
            arrive: d.arrive,
            depart: d.depart,
            leg: s.leg || null
          }
        });
      }
    });

    if (coords.length > 1) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: coords
        },
        properties: {
          name: "전체 경로"
        }
      });

      // Segment LineStrings with leg info (B5-12)
      for (let i = 0; i < (currentPlan.stops || []).length - 1; i++) {
        const s1 = currentPlan.stops[i];
        const s2 = currentPlan.stops[i + 1];
        const c1 = data.cityById ? data.cityById(s1.cityId) : null;
        const c2 = data.cityById ? data.cityById(s2.cityId) : null;
        if (c1?.lng != null && c1?.lat != null && c2?.lng != null && c2?.lat != null) {
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [Number(c1.lng), Number(c1.lat)],
                [Number(c2.lng), Number(c2.lat)]
              ]
            },
            properties: {
              type: "leg",
              fromCityId: s1.cityId,
              fromCity: c1.city,
              toCityId: s2.cityId,
              toCity: c2.city,
              mode: s1.leg?.mode || null,
              hours: s1.leg?.hours ?? null,
              cost: s1.leg?.cost ?? null,
              currency: s1.leg?.currency || null,
              overnight: Boolean(s1.leg?.overnight)
            }
          });
        }
      }
    }

    const geojson = {
      type: "FeatureCollection",
      features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-route-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  });
  exportGrid.appendChild(geoJsonBtn);

  // 4-5. 일정 이미지 저장
  const imgExportBtn = document.createElement("button");
  imgExportBtn.type = "button";
  imgExportBtn.className = "btn";
  imgExportBtn.textContent = "일정 이미지 저장";
  imgExportBtn.addEventListener("click", () => {
    const currentPlan = store.getPlan();
    const currentDates = util.planDates(currentPlan);
    const dMap = new Map();
    for (const d of currentDates) dMap.set(d.key, d);

    const stops = currentPlan.stops || [];
    const rowHeight = 72;
    const canvasWidth = 1080;
    const canvasHeight = Math.max(500, 180 + stops.length * rowHeight + 60);

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const g = canvas.getContext("2d");

    // Background
    g.fillStyle = "#1C1C1E";
    g.fillRect(0, 0, canvasWidth, canvasHeight);

    // Title
    g.fillStyle = "#EDEDED";
    g.font = "bold 32px sans-serif";
    g.fillText("육로 아시아 일주 일정표", 48, 64);

    // Subtitle
    const { grandTotal: currentTotal } = computeBudgetBreakdown(currentPlan, ctx);
    let totalDaysCount = 0;
    if (stops.length > 0 && currentDates.length > 0) {
      totalDaysCount = util.daysBetween(currentPlan.startDate || "2026-12-13", currentDates[currentDates.length - 1].depart) + 1;
    }
    g.fillStyle = "#A0A0A0";
    g.font = "18px sans-serif";
    g.fillText(
      `출발: ${currentPlan.startDate || "2026-12-13"} · 총 ${totalDaysCount}일 · ${stops.length}개 도시 · 예산 ${util.formatKRW(currentTotal)}`,
      48,
      106
    );

    // Header line
    g.strokeStyle = "#3A3A3C";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(48, 136);
    g.lineTo(1032, 136);
    g.stroke();

    let y = 176;
    stops.forEach((s, idx) => {
      const c = data.cityById ? data.cityById(s.cityId) : null;
      const cityName = c?.city || (s.cityId || "").replace(/^city:/, "");
      const d = dMap.get(s.key) || { arrive: "", depart: "" };

      // Number circle
      g.fillStyle = "#2F6FDB";
      g.beginPath();
      g.arc(68, y + 16, 16, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = "#FFFFFF";
      g.font = "bold 15px sans-serif";
      g.textAlign = "center";
      g.fillText(String(idx + 1), 68, y + 22);
      g.textAlign = "left";

      // City name
      g.fillStyle = "#EDEDED";
      g.font = "bold 20px sans-serif";
      g.fillText(cityName, 104, y + 23);

      // Dates & nights
      g.fillStyle = "#A0A0A0";
      g.font = "16px sans-serif";
      g.fillText(`${formatMD(d.arrive)} ~ ${formatMD(d.depart)} (${s.nights}박)`, 320, y + 23);

      // Leg info
      if (s.leg && s.leg.mode) {
        g.fillStyle = "#6E9EF5";
        g.font = "15px sans-serif";
        const legDesc = `이동: ${s.leg.mode}${s.leg.hours ? ` ${s.leg.hours}h` : ""}${s.leg.cost ? ` ${s.leg.cost}${s.leg.currency || ""}` : ""}${s.leg.overnight ? " (야간)" : ""}`;
        g.fillText(legDesc, 640, y + 23, 380);
      }

      // Row divider
      g.strokeStyle = "#2C2C2E";
      g.beginPath();
      g.moveTo(104, y + 48);
      g.lineTo(1032, y + 48);
      g.stroke();

      y += rowHeight;
    });

    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `trip-itinerary-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  });
  exportGrid.appendChild(imgExportBtn);

  exportDetails.appendChild(exportGrid);
  exportSection.appendChild(exportDetails);
  container.appendChild(exportSection);
  if (store.syncInfo) container.appendChild(syncSection());
    el.appendChild(container);
    } finally {
      isRendering = false;
    }
  }

  // Close search dropdown on click outside
  document.addEventListener("click", (e) => {
    const dropdown = el.querySelector(".plan-search-dropdown");
    const wrapper = el.querySelector(".plan-add-city-wrapper");
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  // Subscribe to store plan changes
  bus.on("plan:changed", () => {
    render();
  });

  bus.on("pick:changed", () => {
    render();
  });

  // Focus highlight
  bus.on("city:focus", ({ cityId }) => {
    const rows = el.querySelectorAll("[data-stop-key]");
    rows.forEach((r) => r.classList.remove("is-focused"));
    const plan = store.getPlan();
    if (!plan.stops) return;
    plan.stops.forEach((s) => {
      if (s.cityId === cityId) {
        const row = el.querySelector(`[data-stop-key="${s.key}"]`);
        if (row) {
          row.classList.add("is-focused");
        }
      }
    });
  });

  render();
  return { render };
}
