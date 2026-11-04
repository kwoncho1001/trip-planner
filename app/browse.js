/**
 * Browse pane and header search
 * docs/plans/completed/2026-11-01_ui-i2-browse.md
 */

// Polyfill leading combinators in querySelectorAll for older browser engines
if (typeof Element !== "undefined" && Element.prototype.querySelectorAll) {
  const origQSA = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function (selector) {
    try {
      return origQSA.call(this, selector);
    } catch (err) {
      if (typeof selector === "string" && selector.includes(">")) {
        const fixed = selector
          .split(",")
          .map((p) => {
            const t = p.trim();
            return t.startsWith(">") ? `:scope ${t}` : p;
          })
          .join(",");
        try {
          return origQSA.call(this, fixed);
        } catch {}
      }
      throw err;
    }
  };
}

// --- Photo helpers (ported from legacy.html, S-86 placeholder) ---
let adminData = null;
let adminDataPromise = null;
function loadAdminData() {
  if (!adminDataPromise) {
    adminDataPromise = Promise.all([
      fetch("geo/admin/city-admin.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("geo/admin/names-ko.json").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ]).then(([cityAdmin, namesKo]) => {
      adminData = { cityAdmin, namesKo };
      return adminData;
    });
  }
  return adminDataPromise;
}
loadAdminData();

const cityMediaMap = new Map();
let cityMediaPromise = null;
function loadCityMedia() {
  if (!cityMediaPromise) {
    cityMediaPromise = fetch("cities/index.json")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((files) => {
        const promises = (Array.isArray(files) ? files : []).map((f) => {
          const stem = f.replace(/^cities\//, "").replace(/\.json$/, "");
          return fetch(`cities/media/${stem}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        });
        return Promise.all(promises);
      })
      .then((mediaList) => {
        for (const m of mediaList) {
          if (m && typeof m === "object" && !Array.isArray(m)) {
            for (const [cId, items] of Object.entries(m)) {
              cityMediaMap.set(cId, items);
            }
          }
        }
        return cityMediaMap;
      })
      .catch(() => cityMediaMap);
  }
  return cityMediaPromise;
}
loadCityMedia();

const packFrames = new Map();
function loadPackFrames(src) {
  if (!packFrames.has(src)) {
    packFrames.set(src, new Promise((resolve) => {
        const im = new Image();
        im.onload = () => {
          const fw = im.naturalWidth;
          const fh = (fw * 3) / 4;
          const n = Math.round(im.naturalHeight / fh);
          const urls = [];
          let done = 0;
          for (let i = 0; i < n; i++) {
            const c = document.createElement("canvas");
            c.width = fw;
            c.height = fh;
            c.getContext("2d").drawImage(im, 0, i * fh, fw, fh, 0, 0, fw, fh);
            c.toBlob(
              (b) => {
                urls[i] = b ? URL.createObjectURL(b) : "";
                if (++done === n) resolve(urls);
              },
              "image/jpeg",
              0.85
            );
          }
        };
        im.onerror = () => resolve([]);
        im.src = src;
      })
    );
  }
  return packFrames.get(src);
}

const placeholderSvg =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22150%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232A2A2D%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%236B6B6B%22%20font-size%3D%2213%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3E%EC%82%AC%EC%A7%84%20%EC%97%86%EC%9D%8C%3C%2Ftext%3E%3C%2Fsvg%3E";

function setPhoto(img, ref) {
  if (!ref) {
    img.src = placeholderSvg;
    return;
  }
  img.onerror = () => {
    img.onerror = null;
    img.src = placeholderSvg;
  };
  const hash = typeof ref === "string" ? ref.lastIndexOf("#") : -1;
  if (hash < 0) {
    img.src = ref;
    return;
  }
  const src = ref.slice(0, hash);
  const [nStr] = ref.slice(hash + 1).split("/");
  const idx = parseInt(nStr, 10) || 0;
  loadPackFrames(src).then((urls) => {
    if (urls && urls[idx]) {
      img.src = urls[idx];
    } else {
      img.dispatchEvent(new Event("error"));
    }
  });
}

export function init(ctx) {
  if (!ctx || !ctx.el) return {};

  const { bus, store, data, util, el } = ctx;
  // Tests may pass a ctx without nav: then screens open and close without history
  const nav = ctx.nav || { open() {}, close(key, fn) { fn(); }, isOpen() { return false; } };

  let currentView = "cities"; // "cities" | "liked" | "passed" | "detail"
  let activeCityId = null;
  let currentFilter = "전체";
  let currentSort = "default";
  let lastPickAction = null; // { id, prevVal }
  const openGroups = new Set(["중국"]);
  const expandedMoreGroups = new Set();

  loadCityMedia().then(() => {
    if (currentView === "cities") {
      renderCityList();
    } else if (currentView === "detail" && activeCityId) {
      openCityDetail(activeCityId);
    }
  });

  // --- Photo Modal State ---
  let modalSpot = null;
  let modalPhotos = [];
  let modalSources = [];
  let modalIndex = 0;

  // Create Photo Modal Overlay
  let photoOverlay = document.getElementById("photo-modal-overlay");
  if (!photoOverlay) {
    photoOverlay = document.createElement("div");
    photoOverlay.id = "photo-modal-overlay";
    photoOverlay.className = "photo-modal-overlay";
    photoOverlay.hidden = true;
    photoOverlay.innerHTML = `
      <div class="photo-modal-backdrop"></div>
      <div class="photo-modal-content">
        <button type="button" id="photo-modal-close" class="photo-modal-close" aria-label="닫기">✕</button>
        <button type="button" id="photo-modal-prev" class="photo-modal-nav prev" aria-label="이전 사진">‹</button>
        <div class="photo-modal-stage">
          <div class="photo-modal-header">
            <span id="photo-modal-spot-name" class="photo-modal-spot-name"></span>
            <a id="photo-modal-source-link" class="photo-modal-source-link" target="_blank" rel="noopener">출처 ↗</a>
          </div>
          <img id="photo-modal-img" src="" alt="사진 확대">
          <div class="photo-modal-footer">
            <div id="photo-modal-counter" class="photo-modal-counter"></div>
            <div class="photo-modal-actions">
              <button type="button" class="btn btn-spot-pick like" id="photo-modal-like" data-pick="like">♥ 끌림</button>
              <button type="button" class="btn btn-spot-pick pass" id="photo-modal-pass" data-pick="pass">✕ 패스</button>
            </div>
          </div>
        </div>
        <button type="button" id="photo-modal-next" class="photo-modal-nav next" aria-label="다음 사진">›</button>
      </div>
    `;
    document.body.appendChild(photoOverlay);

    photoOverlay.querySelector(".photo-modal-backdrop").addEventListener("click", closePhotoModal);
    photoOverlay.querySelector("#photo-modal-close").addEventListener("click", closePhotoModal);
    photoOverlay.querySelector("#photo-modal-prev").addEventListener("click", prevPhoto);
    photoOverlay.querySelector("#photo-modal-next").addEventListener("click", nextPhoto);

    photoOverlay.querySelector("#photo-modal-like").addEventListener("click", () => {
      if (!modalSpot || !modalSpot.id || modalSpot.id.startsWith("dish-") || modalSpot.kind === "food") return;
      const cur = store.getPick(modalSpot.id);
      lastPickAction = { id: modalSpot.id, prevVal: cur };
      const next = cur === "like" ? "none" : "like";
      store.setPick(modalSpot.id, next);
    });

    photoOverlay.querySelector("#photo-modal-pass").addEventListener("click", () => {
      if (!modalSpot || !modalSpot.id || modalSpot.id.startsWith("dish-") || modalSpot.kind === "food") return;
      const cur = store.getPick(modalSpot.id);
      lastPickAction = { id: modalSpot.id, prevVal: cur };
      const next = cur === "pass" ? "none" : "pass";
      store.setPick(modalSpot.id, next);
    });
  }

  function openPhotoModal(spot, index) {
    if (!spot) return;
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    modalSpot = spot;
    modalPhotos = spot.photos || [];
    modalSources = spot.photo_src || [];
    modalIndex = Math.max(0, Math.min(index || 0, modalPhotos.length - 1));

    photoOverlay.hidden = false;
    nav.open("photo", hidePhotoModal);
    updatePhotoModal();
  }

  function hidePhotoModal() {
    photoOverlay.hidden = true;
  }

  function closePhotoModal() {
    if (photoOverlay.hidden) return;
    nav.close("photo", hidePhotoModal);
  }

  function updatePhotoModal() {
    if (!modalSpot) return;
    const nameEl = photoOverlay.querySelector("#photo-modal-spot-name");
    const sourceLinkEl = photoOverlay.querySelector("#photo-modal-source-link");
    let imgEl = photoOverlay.querySelector("#photo-modal-img");
    const counterEl = photoOverlay.querySelector("#photo-modal-counter");
    const likeBtn = photoOverlay.querySelector("#photo-modal-like");
    const passBtn = photoOverlay.querySelector("#photo-modal-pass");
    const prevBtn = photoOverlay.querySelector("#photo-modal-prev");
    const nextBtn = photoOverlay.querySelector("#photo-modal-next");

    if (prevBtn) prevBtn.hidden = modalPhotos.length <= 1;
    if (nextBtn) nextBtn.hidden = modalPhotos.length <= 1;

    nameEl.textContent = modalSpot.name || "";

    const curPhoto = modalPhotos[modalIndex];
    if (curPhoto) {
      const count = typeof modalSpot.packCount === "number" ? modalSpot.packCount : (modalSpot.photos || []).length;
      const style = util.photoStyle ? util.photoStyle(curPhoto, count) : { src: curPhoto };
      if (style.backgroundImage) {
        if (!imgEl || imgEl.tagName.toLowerCase() !== "div") {
          const divEl = document.createElement("div");
          divEl.id = "photo-modal-img";
          if (imgEl) imgEl.replaceWith(divEl);
          imgEl = divEl;
        }
        imgEl.removeAttribute("src");
        imgEl.style.backgroundImage = style.backgroundImage;
        imgEl.style.backgroundSize = style.backgroundSize;
        imgEl.style.backgroundPosition = style.backgroundPosition;
        imgEl.style.backgroundRepeat = "no-repeat";
      } else {
        if (!imgEl || imgEl.tagName.toLowerCase() !== "img") {
          const newImg = document.createElement("img");
          newImg.id = "photo-modal-img";
          newImg.alt = "사진 확대";
          if (imgEl) imgEl.replaceWith(newImg);
          imgEl = newImg;
        }
        imgEl.style.backgroundImage = "";
        imgEl.style.backgroundSize = "";
        imgEl.style.backgroundPosition = "";
        imgEl.src = style.src || "";
        imgEl.onerror = () => {
          imgEl.onerror = null;
          imgEl.src = placeholderSvg;
        };
      }
    }

    const curSource = modalSources[modalIndex] || modalSources[0];
    if (curSource) {
      sourceLinkEl.href = curSource;
      sourceLinkEl.hidden = false;
    } else {
      sourceLinkEl.hidden = true;
    }

    if (counterEl) {
      counterEl.textContent = `${modalIndex + 1} / ${Math.max(1, modalPhotos.length)}`;
    }

    // Only actual spots (not food dishes or media without id) have pick buttons
    const isPickableSpot = Boolean(
      modalSpot && modalSpot.id && !modalSpot.id.startsWith("dish-") && modalSpot.kind !== "food"
    );
    likeBtn.hidden = passBtn.hidden = !isPickableSpot;
    if (isPickableSpot) {
      const curPick = store.getPick(modalSpot.id);
      likeBtn.classList.toggle("is-active", curPick === "like");
      passBtn.classList.toggle("is-active", curPick === "pass");
    }
  }

  function prevPhoto() {
    if (modalPhotos.length > 1) {
      modalIndex = (modalIndex - 1 + modalPhotos.length) % modalPhotos.length;
      updatePhotoModal();
    }
  }

  function nextPhoto() {
    if (modalPhotos.length > 1) {
      modalIndex = (modalIndex + 1) % modalPhotos.length;
      updatePhotoModal();
    }
  }

  // --- 1. Global Search (in #global-search) ---
  const searchSlot = document.getElementById("global-search");
  if (searchSlot) {
    searchSlot.innerHTML = "";
    const searchWrapper = document.createElement("div");
    searchWrapper.className = "search-wrapper";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "search-input";
    searchInput.placeholder = "도시·장소 검색 (모든 나라)";
    searchInput.autocomplete = "off";

    const dropdown = document.createElement("div");
    dropdown.className = "search-dropdown";
    dropdown.hidden = true;

    searchWrapper.appendChild(searchInput);
    searchWrapper.appendChild(dropdown);
    searchSlot.appendChild(searchWrapper);

    let debounceTimer = null;
    let selectedIndex = -1;
    let currentResults = [];

    function renderResults(results) {
      currentResults = results;
      selectedIndex = -1;
      dropdown.innerHTML = "";
      if (results.length === 0) {
        dropdown.hidden = true;
        return;
      }

      results.forEach((r, idx) => {
        const itemEl = document.createElement("div");
        itemEl.className = "search-result-item";
        itemEl.setAttribute("data-result-id", r.id);

        if (r.type === "city") {
          itemEl.innerHTML = `
            <div class="result-main">
              <span class="result-title">${r.item.city}</span>
              ${r.item.local ? `<span class="result-local">${r.item.local}</span>` : ""}
            </div>
            <div class="result-meta">
              <span class="badge">${r.item.country || ""}</span>
              <span class="badge">${r.item.kind || ""}</span>
            </div>
          `;
        } else {
          itemEl.innerHTML = `
            <div class="result-main">
              <span class="result-title">${r.item.name}</span>
              ${r.item.local ? `<span class="result-local">${r.item.local}</span>` : ""}
            </div>
            <div class="result-meta">
              <span class="badge">${r.item.city || ""}</span>
              <span class="badge">${r.item.cat || r.item.category_std || ""}</span>
            </div>
          `;
        }

        itemEl.addEventListener("click", () => {
          selectResult(r);
        });

        dropdown.appendChild(itemEl);
      });

      dropdown.hidden = false;
    }

    function selectResult(r) {
      dropdown.hidden = true;
      selectedIndex = -1;
      searchInput.value = "";
      bus.emit("pane:show", { pane: "browse" });
      if (r.type === "city") {
        bus.emit("city:focus", { cityId: r.id, source: "search" });
        openCityDetail(r.id);
      } else {
        if (r.item?.cityId) {
          openCityDetail(r.item.cityId);
        }
        bus.emit("spot:focus", { spotId: r.id, source: "search" });
      }
    }

    function performSearch(rawQuery) {
      const q = (rawQuery || "").trim().toLowerCase();
      if (!q) {
        renderResults([]);
        return;
      }

      const matchedCities = (data.cities || []).filter((c) => {
        const city = (c.city || "").toLowerCase();
        const local = (c.local || "").toLowerCase();
        const country = (c.country || "").toLowerCase();
        const known = Array.isArray(c.known_for)
          ? c.known_for.join(" ").toLowerCase()
          : (c.known_for || "").toLowerCase();
        return city.includes(q) || local.includes(q) || country.includes(q) || known.includes(q);
      });

      const matchedSpots = (data.spots || []).filter((s) => {
        const name = (s.name || "").toLowerCase();
        const local = (s.local || "").toLowerCase();
        const spotCity = (s.city || "").toLowerCase();
        const cat = (s.cat || s.category_std || "").toLowerCase();
        const tags = Array.isArray(s.tags)
          ? s.tags.join(" ").toLowerCase()
          : (s.tags || "").toLowerCase();
        return (
          name.includes(q) ||
          local.includes(q) ||
          spotCity.includes(q) ||
          cat.includes(q) ||
          tags.includes(q)
        );
      });

      const results = [];
      const cityLimit = matchedSpots.length > 0 ? Math.min(6, matchedCities.length) : Math.min(12, matchedCities.length);
      for (let i = 0; i < cityLimit; i++) {
        results.push({ type: "city", item: matchedCities[i], id: matchedCities[i].id });
      }
      for (const s of matchedSpots) {
        if (results.length >= 12) break;
        results.push({ type: "spot", item: s, id: s.id });
      }
      if (results.length < 12 && matchedCities.length > cityLimit) {
        for (let i = cityLimit; i < matchedCities.length && results.length < 12; i++) {
          results.push({ type: "city", item: matchedCities[i], id: matchedCities[i].id });
        }
      }

      renderResults(results);
    }

    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        performSearch(searchInput.value);
      }, 200);
    });

    searchInput.addEventListener("keydown", (e) => {
      const items = dropdown.querySelectorAll(".search-result-item");
      if (!items.length || dropdown.hidden) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelectedHighlight(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelectedHighlight(items);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const targetIdx = selectedIndex >= 0 ? selectedIndex : 0;
        if (currentResults[targetIdx]) {
          selectResult(currentResults[targetIdx]);
        }
      } else if (e.key === "Escape") {
        dropdown.hidden = true;
        selectedIndex = -1;
      }
    });

    function updateSelectedHighlight(items) {
      items.forEach((item, idx) => {
        if (idx === selectedIndex) {
          item.classList.add("is-selected");
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.classList.remove("is-selected");
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (!searchWrapper.contains(e.target)) {
        dropdown.hidden = true;
        selectedIndex = -1;
      }
    });
  }

  // --- 2. Browse Pane DOM Structure ---
  el.innerHTML = "";
  el.className = "pane-browse-container";

  const viewCities = document.createElement("div");
  viewCities.className = "browse-view browse-view-cities";

  const viewDetail = document.createElement("div");
  viewDetail.className = "browse-view browse-view-detail";
  viewDetail.hidden = true;

  const viewLiked = document.createElement("div");
  viewLiked.className = "browse-view browse-view-liked";
  viewLiked.hidden = true;

  const viewPassed = document.createElement("div");
  viewPassed.className = "browse-view browse-view-passed";
  viewPassed.hidden = true;

  el.appendChild(viewCities);
  el.appendChild(viewDetail);
  el.appendChild(viewLiked);
  el.appendChild(viewPassed);

  let citiesScrollTop = 0;

  function switchView(view) {
    if (currentView === "cities" && view !== "cities") {
      citiesScrollTop = viewCities.scrollTop || el.scrollTop || 0;
    }
    currentView = view;
    viewCities.hidden = view !== "cities";
    viewDetail.hidden = view !== "detail";
    viewLiked.hidden = view !== "liked";
    viewPassed.hidden = view !== "passed";

    if (view === "cities") {
      if (!cityGroupsContainer.hasChildNodes()) {
        renderCityList();
      }
      if (citiesScrollTop > 0) {
        requestAnimationFrame(() => {
          if (viewCities.scrollTop !== undefined) viewCities.scrollTop = citiesScrollTop;
          if (el.scrollTop !== undefined) el.scrollTop = citiesScrollTop;
        });
      }
    } else if (view === "liked") {
      renderLikedView();
    } else if (view === "passed") {
      renderPassedView();
    }
  }

  // --- 3. Cities View (Filters, Grouped List) ---
  const controlsEl = document.createElement("div");
  controlsEl.className = "cities-controls";
  controlsEl.innerHTML = `
    <div class="filter-chips-bar">
      <button type="button" class="chip is-active" data-filter="전체">전체</button>
      <button type="button" class="chip" data-filter="끌림">끌림</button>
      <button type="button" class="chip" data-filter="미정">미정</button>
      <button type="button" class="chip" data-filter="패스">패스</button>
    </div>
  `;
  viewCities.appendChild(controlsEl);
  // The filter bar and the open country header stay at the top while the list scrolls (user, 2026-11-04)
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      viewCities.style.setProperty("--controls-h", `${controlsEl.offsetHeight}px`);
    }).observe(controlsEl);
  }

  const cityGroupsContainer = document.createElement("div");
  cityGroupsContainer.className = "city-groups-container";
  viewCities.appendChild(cityGroupsContainer);

  // Filter click handler
  controlsEl.querySelector(".filter-chips-bar").addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-filter]");
    if (!chip) return;
    currentFilter = chip.getAttribute("data-filter");
    controlsEl.querySelectorAll(".filter-chips-bar .chip").forEach((c) => {
      c.classList.toggle("is-active", c === chip);
    });
    bus.emit("filter:changed", { country: "all", status: currentFilter, query: "" });
    renderCityList();
  });

  function cityMatchesFilter(c, filter) {
    const pick = store.getPick(c.id);
    if (filter === "끌림") return pick === "like";
    if (filter === "미정") return pick === "none";
    if (filter === "패스") return pick === "pass";
    return true; // "전체"
  }

  const KIND_ORDER = {
    "대도시": 1,
    "중소도시": 2,
    "소도시": 3,
    "섬": 4,
    "자연지역": 5,
    "마을": 6
  };
  function getKindOrder(k) {
    return KIND_ORDER[k] ?? 99;
  }

  function sortCities(cities, sort) {
    const list = [...cities];
    if (sort === "name") {
      list.sort((a, b) => (a.city || "").localeCompare(b.city || "", "ko"));
    } else if (sort === "spots") {
      list.sort((a, b) => data.spotsOfCity(b.id).length - data.spotsOfCity(a.id).length);
    } else if (sort === "price") {
      list.sort((a, b) => {
        const pa = a.info?.lodging?.krw ?? 99999999;
        const pb = b.info?.lodging?.krw ?? 99999999;
        return pa - pb;
      });
    } else {
      list.sort((a, b) => getKindOrder(a.kind) - getKindOrder(b.kind));
    }
    return list;
  }

  function renderCityList() {
    cityGroupsContainer.innerHTML = "";

    const countryOrder = [];
    const countryMap = new Map();
    for (const c of data.cities || []) {
      const country = c.country || "기타";
      if (!countryMap.has(country)) {
        countryMap.set(country, []);
        countryOrder.push(country);
      }
      countryMap.get(country).push(c);
    }

    function renderGroupRows(rowsContainer, country, filtered) {
      rowsContainer.innerHTML = "";
      const sorted = sortCities(filtered, currentSort);
      if (currentFilter !== "전체" && currentFilter !== "미정") {
        sorted.forEach((city) => {
          const row = renderCityRow(city);
          rowsContainer.appendChild(row);
        });
      } else {
        let p1Cities = sorted.filter((c) => c.kind === "대도시" || c.kind === "중소도시");
        let p2Cities = sorted.filter((c) => c.kind !== "대도시" && c.kind !== "중소도시");

        if (p1Cities.length === 0) {
          p1Cities = sorted;
          p2Cities = [];
        }

        p1Cities.forEach((city) => {
          const row = renderCityRow(city);
          rowsContainer.appendChild(row);
        });

        if (p2Cities.length > 0) {
          const isExpanded = expandedMoreGroups.has(country);
          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "city-more-btn";
          moreBtn.textContent = isExpanded
            ? "작은 도시·마을 접기"
            : `작은 도시·마을 ${p2Cities.length}곳 더 보기`;

          const moreRowsContainer = document.createElement("div");
          moreRowsContainer.className = "city-more-rows";
          moreRowsContainer.style.display = isExpanded ? "block" : "none";

          p2Cities.forEach((city) => {
            const row = renderCityRow(city);
            moreRowsContainer.appendChild(row);
          });

          moreBtn.addEventListener("click", () => {
            const nowExpanded = expandedMoreGroups.has(country);
            if (nowExpanded) {
              expandedMoreGroups.delete(country);
              moreRowsContainer.style.display = "none";
              moreBtn.textContent = `작은 도시·마을 ${p2Cities.length}곳 더 보기`;
            } else {
              expandedMoreGroups.add(country);
              moreRowsContainer.style.display = "block";
              moreBtn.textContent = "작은 도시·마을 접기";
            }
          });

          rowsContainer.appendChild(moreBtn);
          rowsContainer.appendChild(moreRowsContainer);
        }
      }
    }

    countryOrder.forEach((country) => {
      const allInCountry = countryMap.get(country) || [];
      const filtered = allInCountry.filter((c) => cityMatchesFilter(c, currentFilter));
      const likedCount = allInCountry.filter((c) => store.getPick(c.id) === "like").length;

      const groupEl = document.createElement("div");
      groupEl.className = "country-group";
      groupEl.setAttribute("data-country", country);

      const isOpen = openGroups.has(country);
      if (isOpen) groupEl.classList.add("is-open");

      const header = document.createElement("div");
      header.className = "country-group-header";
      header.innerHTML = `
        <span class="country-title">${country}</span>
        <span class="country-count">${likedCount} / ${allInCountry.length}</span>
        <span class="group-toggle-icon">${isOpen ? "▲" : "▼"}</span>
      `;

      header.addEventListener("click", () => {
        if (openGroups.has(country)) {
          openGroups.delete(country);
          groupEl.classList.remove("is-open");
          const icon = header.querySelector(".group-toggle-icon");
          if (icon) icon.textContent = "▼";
          const rc = groupEl.querySelector(".country-group-rows");
          if (rc) rc.remove();
        } else {
          openGroups.add(country);
          groupEl.classList.add("is-open");
          const icon = header.querySelector(".group-toggle-icon");
          if (icon) icon.textContent = "▲";
          let rc = groupEl.querySelector(".country-group-rows");
          if (!rc) {
            rc = document.createElement("div");
            rc.className = "country-group-rows";
            groupEl.appendChild(rc);
          }
          renderGroupRows(rc, country, filtered);
        }
      });

      groupEl.appendChild(header);

      if (isOpen) {
        const rowsContainer = document.createElement("div");
        rowsContainer.className = "country-group-rows";
        renderGroupRows(rowsContainer, country, filtered);
        groupEl.appendChild(rowsContainer);
      }

      cityGroupsContainer.appendChild(groupEl);
    });
  }

  function updateCityGroupCounts() {
    const countryMap = new Map();
    for (const c of data.cities || []) {
      const country = c.country || "기타";
      if (!countryMap.has(country)) {
        countryMap.set(country, []);
      }
      countryMap.get(country).push(c);
    }

    cityGroupsContainer.querySelectorAll(".country-group").forEach((groupEl) => {
      const country = groupEl.getAttribute("data-country");
      const allInCountry = countryMap.get(country) || [];
      const filtered = allInCountry.filter((c) => cityMatchesFilter(c, currentFilter));
      const likedCount = allInCountry.filter((c) => store.getPick(c.id) === "like").length;
      const countEl = groupEl.querySelector(".country-count");
      if (countEl) {
        countEl.textContent = `${likedCount} / ${allInCountry.length}`;
      }
    });
  }

  function renderCityRow(city) {
    const row = document.createElement("div");
    row.className = "city-row";
    row.setAttribute("data-city-id", city.id);

    const pick = store.getPick(city.id);
    if (pick === "like") row.classList.add("is-like");
    if (pick === "pass") row.classList.add("is-pass");

    const heroPhotos = city.info?.hero?.photos;
    const heroFirstPhoto = Array.isArray(heroPhotos) && heroPhotos.length > 0 ? heroPhotos[0] : null;

    const mediaItems = cityMediaMap.get(city.id) || [];
    let mediaHtml = "";
    if (mediaItems.length > 0) {
      const heroThumbHtml = heroFirstPhoto
        ? (() => {
            const hStyle = util.photoStyle ? util.photoStyle(heroFirstPhoto, 1) : { src: heroFirstPhoto };
            return hStyle.backgroundImage
              ? `<div class="city-row-thumb" style="background-image: ${hStyle.backgroundImage}; background-size: ${hStyle.backgroundSize}; background-position: ${hStyle.backgroundPosition}; background-repeat: no-repeat;"></div>`
              : `<img class="city-row-thumb" src="${hStyle.src || ""}" alt="${city.info?.hero?.caption || city.city}" onerror="this.onerror=null;this.src='${placeholderSvg}'">`;
          })()
        : "";
      const thumbs = heroFirstPhoto ? mediaItems.slice(0, 3) : mediaItems.slice(0, 4);
      const thumbsHtml = (heroThumbHtml || "") + thumbs
        .map((item) => {
          const photo = item.photos && item.photos[0];
          if (!photo) return "";
          const count = item.photos.length;
          const style = util.photoStyle ? util.photoStyle(photo, count) : { src: photo };
          if (style.backgroundImage) {
            return `<div class="city-row-thumb" style="background-image: ${style.backgroundImage}; background-size: ${style.backgroundSize}; background-position: ${style.backgroundPosition}; background-repeat: no-repeat;"></div>`;
          }
          return `<img class="city-row-thumb" src="${style.src || ""}" alt="${item.label || ""}" onerror="this.onerror=null;this.src='${placeholderSvg}'">`;
        })
        .join("");
      if (thumbsHtml) {
        mediaHtml = `<div class="city-row-media">${thumbsHtml}</div>`;
      }
    }

    if (!mediaHtml && heroFirstPhoto) {
      const hStyle = util.photoStyle ? util.photoStyle(heroFirstPhoto, 1) : { src: heroFirstPhoto };
      const heroThumb = hStyle.backgroundImage
        ? `<div class="city-row-thumb" style="background-image: ${hStyle.backgroundImage}; background-size: ${hStyle.backgroundSize}; background-position: ${hStyle.backgroundPosition}; background-repeat: no-repeat;"></div>`
        : `<img class="city-row-thumb" src="${hStyle.src || ""}" alt="${city.info?.hero?.caption || city.city}" onerror="this.onerror=null;this.src='${placeholderSvg}'">`;
      mediaHtml = `<div class="city-row-media">${heroThumb}</div>`;
    }

    const desc = city.desc || "";

    row.innerHTML = `
      <div class="city-row-main">
        <div class="city-row-header">
          <span class="city-name">${city.city}</span>
          ${city.local ? `<span class="city-local">${city.local}</span>` : ""}
          ${city.kind ? `<span class="badge">${city.kind}</span>` : ""}
          ${(() => {
            const r = city.info?.rail;
            if (!r) return "";
            if (r.hsr) return `<span class="badge rail-badge rail-hsr">고속철</span>`;
            if (r.station) return `<span class="badge rail-badge rail-train">기차</span>`;
            if (r.station === false) return `<span class="badge rail-badge rail-none">역 없음</span>`;
            return "";
          })()}
        </div>
        <div class="city-row-desc">${desc}</div>
        ${mediaHtml}
      </div>
      <div class="city-row-actions">
        <button type="button" class="btn-pick like ${pick === "like" ? "is-active" : ""}" data-pick="like" title="끌림">♥</button>
        <button type="button" class="btn-pick pass ${pick === "pass" ? "is-active" : ""}" data-pick="pass" title="패스">✕</button>
      </div>
    `;

    // Row click -> city:focus and open detail
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-pick]")) return;
      bus.emit("city:focus", { cityId: city.id, source: "browse" });
      openCityDetail(city.id);
    });

    // Pick buttons
    row.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pickType = btn.getAttribute("data-pick");
        const curPick = store.getPick(city.id);
        lastPickAction = { id: city.id, prevVal: curPick };
        const nextPick = curPick === pickType ? "none" : pickType;
        store.setPick(city.id, nextPick);
      });
    });

    return row;
  }

  // --- 3.1 Liked and Passed Views (M1-3) ---
  function renderLikedView() {
    viewLiked.innerHTML = "";

    const container = document.createElement("div");
    container.className = "triage-view-container";

    // 1. Liked cities
    const likedCities = (data.cities || []).filter((c) => store.getPick(c.id) === "like");
    const citiesSection = document.createElement("div");
    citiesSection.className = "triage-section";
    citiesSection.innerHTML = `<h3 class="triage-section-title">끌린 도시 (${likedCities.length})</h3>`;

    if (likedCities.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "끌린 도시가 없습니다";
      citiesSection.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "triage-list";
      likedCities.forEach((c) => {
        const item = document.createElement("div");
        item.className = "triage-item-card is-like";
        item.setAttribute("data-city-id", c.id);
        item.innerHTML = `
          <div class="triage-item-main">
            <span class="triage-item-title">${c.city}</span>
            ${c.local ? `<span class="triage-item-local">${c.local}</span>` : ""}
            <span class="badge">${c.country || ""}</span>
          </div>
          <div class="triage-item-actions">
            <button type="button" class="btn btn-triage-pass" data-action="pass">패스</button>
            <button type="button" class="btn btn-triage-cancel" data-action="cancel">취소</button>
          </div>
        `;

        item.querySelector(".triage-item-main").addEventListener("click", () => {
          bus.emit("city:focus", { cityId: c.id, source: "browse" });
          openCityDetail(c.id);
        });

        item.querySelector('[data-action="pass"]').addEventListener("click", (e) => {
          e.stopPropagation();
          lastPickAction = { id: c.id, prevVal: "like" };
          store.setPick(c.id, "pass");
        });

        item.querySelector('[data-action="cancel"]').addEventListener("click", (e) => {
          e.stopPropagation();
          lastPickAction = { id: c.id, prevVal: "like" };
          store.setPick(c.id, "none");
        });

        list.appendChild(item);
      });
      citiesSection.appendChild(list);
    }
    container.appendChild(citiesSection);

    // 2. Liked spots grouped by city
    const likedSpots = (data.spots || []).filter((s) => store.getPick(s.id) === "like");
    const spotsSection = document.createElement("div");
    spotsSection.className = "triage-section";
    spotsSection.innerHTML = `<h3 class="triage-section-title">끌린 장소 (${likedSpots.length})</h3>`;

    if (likedSpots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "끌린 장소가 없습니다";
      spotsSection.appendChild(empty);
    } else {
      const spotsByCity = new Map();
      likedSpots.forEach((s) => {
        const cId = s.cityId || "기타";
        if (!spotsByCity.has(cId)) spotsByCity.set(cId, []);
        spotsByCity.get(cId).push(s);
      });

      spotsByCity.forEach((spotsInCity, cId) => {
        const groupEl = document.createElement("div");
        groupEl.className = "triage-group";
        const cityObj = data.cityById(cId);
        const cityName = cityObj ? cityObj.city : cId.replace(/^city:/, "");

        groupEl.innerHTML = `<h4 class="triage-group-title">${cityName} (${spotsInCity.length})</h4>`;
        const list = document.createElement("div");
        list.className = "triage-list";

        spotsInCity.forEach((s) => {
          const item = document.createElement("div");
          item.className = "triage-item-card is-like";
          item.setAttribute("data-spot-id", s.id);
          item.innerHTML = `
            <div class="triage-item-main">
              <span class="triage-item-title">${s.name}</span>
              ${s.local ? `<span class="triage-item-local">${s.local}</span>` : ""}
              <span class="badge">${s.cat || s.category_std || ""}</span>
            </div>
            <div class="triage-item-actions">
              <button type="button" class="btn btn-triage-pass" data-action="pass">패스</button>
              <button type="button" class="btn btn-triage-cancel" data-action="cancel">취소</button>
            </div>
          `;

          item.querySelector(".triage-item-main").addEventListener("click", () => {
            if (s.cityId) {
              openCityDetail(s.cityId);
              setTimeout(() => {
                bus.emit("spot:focus", { spotId: s.id, source: "browse" });
              }, 50);
            }
          });

          item.querySelector('[data-action="pass"]').addEventListener("click", (e) => {
            e.stopPropagation();
            lastPickAction = { id: s.id, prevVal: "like" };
            store.setPick(s.id, "pass");
          });

          item.querySelector('[data-action="cancel"]').addEventListener("click", (e) => {
            e.stopPropagation();
            lastPickAction = { id: s.id, prevVal: "like" };
            store.setPick(s.id, "none");
          });

          list.appendChild(item);
        });

        groupEl.appendChild(list);
        spotsSection.appendChild(groupEl);
      });
    }
    container.appendChild(spotsSection);

    viewLiked.appendChild(container);
  }

  function renderPassedView() {
    viewPassed.innerHTML = "";

    const container = document.createElement("div");
    container.className = "triage-view-container";

    const passedCities = (data.cities || []).filter((c) => store.getPick(c.id) === "pass");
    const passedSpots = (data.spots || []).filter((s) => store.getPick(s.id) === "pass");

    // 1. Passed cities
    const citiesSection = document.createElement("div");
    citiesSection.className = "triage-section";
    citiesSection.innerHTML = `<h3 class="triage-section-title">패스한 도시 (${passedCities.length})</h3>`;

    if (passedCities.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "패스한 도시가 없습니다";
      citiesSection.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "triage-list";
      passedCities.forEach((c) => {
        const item = document.createElement("div");
        item.className = "triage-item-card is-pass";
        item.setAttribute("data-city-id", c.id);
        item.innerHTML = `
          <div class="triage-item-main">
            <span class="triage-item-title">${c.city}</span>
            ${c.local ? `<span class="triage-item-local">${c.local}</span>` : ""}
            <span class="badge">${c.country || ""}</span>
          </div>
          <div class="triage-item-actions">
            <button type="button" class="btn btn-triage-revert" data-action="revert">되돌리기</button>
          </div>
        `;

        item.querySelector('[data-action="revert"]').addEventListener("click", (e) => {
          e.stopPropagation();
          lastPickAction = { id: c.id, prevVal: "pass" };
          store.setPick(c.id, "none");
        });

        list.appendChild(item);
      });
      citiesSection.appendChild(list);
    }
    container.appendChild(citiesSection);

    // 2. Passed spots
    const spotsSection = document.createElement("div");
    spotsSection.className = "triage-section";
    spotsSection.innerHTML = `<h3 class="triage-section-title">패스한 장소 (${passedSpots.length})</h3>`;

    if (passedSpots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "패스한 장소가 없습니다";
      spotsSection.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "triage-list";
      passedSpots.forEach((s) => {
        const item = document.createElement("div");
        item.className = "triage-item-card is-pass";
        item.setAttribute("data-spot-id", s.id);
        item.innerHTML = `
          <div class="triage-item-main">
            <span class="triage-item-title">${s.name}</span>
            ${s.local ? `<span class="triage-item-local">${s.local}</span>` : ""}
            <span class="badge">${s.city || ""}</span>
          </div>
          <div class="triage-item-actions">
            <button type="button" class="btn btn-triage-revert" data-action="revert">되돌리기</button>
          </div>
        `;

        item.querySelector('[data-action="revert"]').addEventListener("click", (e) => {
          e.stopPropagation();
          lastPickAction = { id: s.id, prevVal: "pass" };
          store.setPick(s.id, "none");
        });

        list.appendChild(item);
      });
      spotsSection.appendChild(list);
    }
    container.appendChild(spotsSection);

    viewPassed.appendChild(container);
  }

  // --- 4. City Detail View ---
  function openCityDetail(cityId) {
    activeCityId = cityId;
    const city = data.cityById(cityId);
    if (!city) return;

    if (currentView !== "detail") {
      const back = currentView;
      nav.open("detail", () => switchView(back));
    }
    currentView = "detail";
    viewCities.hidden = true;
    viewDetail.hidden = false;

    renderCityDetailView(city);
  }

  function updateBreadcrumb(city, breadcrumbEl) {
    const entry = adminData?.cityAdmin?.[city.id];
    const namesKo = adminData?.namesKo;
    const country = city.country || entry?.cc || "";
    const l1Name = (entry?.adm1 && namesKo?.[entry.adm1]) || city.region || "";
    const l2Name = (entry?.adm2 && namesKo?.[entry.adm2]) || "";
    const cityName = city.city || "";

    const parts = [];
    if (l1Name) parts.push({ text: l1Name, cls: "crumb-level1" });
    if (l2Name && l2Name !== l1Name) parts.push({ text: l2Name, cls: "crumb-level2" });

    const adminHtml = parts
      .map((p) => `<span class="crumb-separator">/</span><span class="${p.cls}">${p.text}</span>`)
      .join("");

    breadcrumbEl.innerHTML = `
      <button type="button" class="btn-back">← 목록</button>
      <span class="crumb-separator">/</span>
      <span class="crumb-country">${country}</span>
      ${adminHtml}
      <span class="crumb-separator">/</span>
      <span class="crumb-city">${cityName}</span>
    `;

    breadcrumbEl.querySelector(".btn-back").addEventListener("click", () => {
      nav.close("detail", () => switchView("cities"));
    });

    // 개요 / 장소 tabs on the right of the bar (user, 2026-11-05)
    const nSpots = (data.spotsOfCity(city.id) || []).length;
    const tabs = document.createElement("span");
    tabs.className = "detail-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = `
      <button type="button" class="detail-tab" data-tab="overview" role="tab">개요</button>
      <button type="button" class="detail-tab" data-tab="spots" role="tab">장소 ${nSpots}</button>
    `;
    for (const btn of tabs.querySelectorAll(".detail-tab")) {
      btn.addEventListener("click", () => setDetailTab(btn.dataset.tab, true));
    }
    breadcrumbEl.appendChild(tabs);
    syncDetailTabs();
  }

  function syncDetailTabs() {
    const cur = viewDetail.dataset.tab || "overview";
    for (const btn of viewDetail.querySelectorAll(".detail-tab")) {
      const on = btn.dataset.tab === cur;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function setDetailTab(tab, scrollTop) {
    viewDetail.dataset.tab = tab === "spots" ? "spots" : "overview";
    syncDetailTabs();
    if (scrollTop) {
      const bar = viewDetail.querySelector(".detail-breadcrumb");
      if (bar) bar.scrollIntoView({ block: "start" });
      viewDetail.scrollTop = 0;
    }
  }

  function renderCityDetailView(city) {
    viewDetail.innerHTML = "";
    viewDetail.dataset.tab = "overview";

    // 1. Breadcrumb
    const breadcrumb = document.createElement("div");
    breadcrumb.className = "detail-breadcrumb";
    updateBreadcrumb(city, breadcrumb);
    if (!adminData) {
      loadAdminData().then(() => {
        if (currentView === "detail" && activeCityId === city.id) {
          updateBreadcrumb(city, breadcrumb);
        }
      });
    }
    viewDetail.appendChild(breadcrumb);

    // D5: Large cover image (info.hero.photos[0], 16:9, full width of pane)
    const detailHeroPhotos = city.info?.hero?.photos;
    if (Array.isArray(detailHeroPhotos) && detailHeroPhotos.length > 0 && detailHeroPhotos[0]) {
      const coverPhoto = detailHeroPhotos[0];
      const captionText = city.info.hero.caption || "";
      const coverBox = document.createElement("div");
      coverBox.className = "detail-hero-cover";
      const cStyle = util.photoStyle ? util.photoStyle(coverPhoto, 1) : { src: coverPhoto };
      if (cStyle.backgroundImage) {
        coverBox.innerHTML = `
          <div class="hero-cover detail-cover-img" style="background-image: ${cStyle.backgroundImage}; background-size: ${cStyle.backgroundSize}; background-position: ${cStyle.backgroundPosition}; background-repeat: no-repeat;"></div>
          ${captionText ? `<div class="hero-caption detail-hero-caption">${captionText}</div>` : ""}
        `;
      } else {
        const img = document.createElement("img");
        img.className = "hero-cover detail-cover-img";
        img.src = cStyle.src || "";
        img.alt = captionText || city.city;
        img.onerror = () => { img.onerror = null; img.src = placeholderSvg; };
        coverBox.appendChild(img);
        if (captionText) {
          const cap = document.createElement("div");
          cap.className = "hero-caption detail-hero-caption";
          cap.textContent = captionText;
          coverBox.appendChild(cap);
        }
      }
      viewDetail.appendChild(coverBox);
    }

    const body = document.createElement("div");
    body.className = "detail-body";

    // 2. City Header & Action Buttons
    const header = document.createElement("div");
    header.className = "detail-header";

    const pick = store.getPick(city.id);
    const researchPick = store.getPick("research:" + city.id);

    const knownList = Array.isArray(city.known_for)
      ? city.known_for.slice(0, 3)
      : (city.known_for ? [city.known_for] : []);
    const knownChipsHtml = knownList.map((k) => `<span class="chip">${k}</span>`).join("");

    const mediaItems = cityMediaMap.get(city.id) || [];
    let mediaSectionHtml = "";
    if (mediaItems.length > 0) {
      const cardsHtml = mediaItems
        .map((item, idx) => {
          const photo = item.photos && item.photos[0];
          const count = item.photos ? item.photos.length : 1;
          const style = util.photoStyle ? util.photoStyle(photo, count) : { src: photo };
          let photoHtml = "";
          if (style.backgroundImage) {
            photoHtml = `<div class="city-media-photo" style="background-image: ${style.backgroundImage}; background-size: ${style.backgroundSize}; background-position: ${style.backgroundPosition}; background-repeat: no-repeat;"></div>`;
          } else {
            photoHtml = `<img class="city-media-photo" src="${style.src || ""}" alt="${item.label || ""}" onerror="this.onerror=null;this.src='${placeholderSvg}'">`;
          }
          return `
            <div class="city-media-card" data-media-idx="${idx}" title="${item.label || ""}">
              ${photoHtml}
              <div class="city-media-label">${item.label || ""}</div>
            </div>
          `;
        })
        .join("");
      mediaSectionHtml = `<div class="city-media">${cardsHtml}</div>`;
    } else if (knownChipsHtml) {
      mediaSectionHtml = `<div class="detail-known-chips">${knownChipsHtml}</div>`;
      //
    }

    let railBoxHtml = "";
    const rail = city.info?.rail;
    if (rail) {
      if (rail.station === false) {
        const nr = rail.nearest;
        const nearestText = nr
          ? `기차역 없음 — 가장 가까운 역: ${nr.name || ""}${nr.city ? ` (${nr.city}, ${nr.km ?? ""}km)` : ""}`
          : "기차역 없음";
        const noteHtml = rail.note ? `<div class="station-note">${rail.note}</div>` : "";
        const sourceHtml = rail.source
          ? `<a class="station-source-link" href="${rail.source}" target="_blank" rel="noopener">출처 ↗</a>`
          : "";
        railBoxHtml = `
          <div class="station-box rail-station-box detail-station-box">
            <div class="station-box-title"><span class="section-subtitle">기차역</span></div>
            <div class="station-none-text">${nearestText}</div>
            ${noteHtml}
            ${sourceHtml}
          </div>
        `;
      } else if (Array.isArray(rail.stations) && rail.stations.length > 0) {
        // One fold per station with its own fares; the whole box folds too (user, 2026-11-05)
        const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
        const norm = (t) => String(t || "").replace(/\s+/g, "");
        const fares = Array.isArray(city.info?.fares) ? city.info.fares : [];
        const stations = rail.stations;
        const byStation = stations.map(() => []);
        for (const fr of fares) {
          let i = stations.findIndex((st) => norm(st.name) === norm(fr.from_station));
          if (i < 0) i = stations.findIndex((st) => norm(fr.from_station).includes(norm(st.name)) || norm(st.name).includes(norm(fr.from_station)));
          byStation[i < 0 ? 0 : i].push(fr);
        }
        const fareRow = (fr) => {
          const p = fr.price && typeof fr.price.amount === "number"
            ? `${fr.price_note === "약" ? "약 " : ""}${fr.price.amount.toLocaleString()} ${fr.price.currency}`
            : esc(fr.price_note || "미확인");
          const krw = fr.price && util.toKRW ? util.toKRW(fr.price.amount, fr.price.currency) : null;
          const krwText = krw ? ` <span class="fare-krw">(${util.formatKRW ? util.formatKRW(krw) : krw + "원"})</span>` : "";
          const src = fr.source ? ` <a class="fare-src" href="${esc(fr.source)}" target="_blank" rel="noopener">↗</a>` : "";
          return `<div class="fare-row">
            <span class="fare-to">→ ${esc(fr.to_city)}</span>
            <span class="fare-train">${esc(fr.train)} · ${fr.hours}시간</span>
            <span class="fare-price">${p}${krwText}${src}</span>
          </div>`;
        };
        // The station with the most fares opens first
        let openIdx = 0;
        byStation.forEach((list, i) => { if (list.length > byStation[openIdx].length) openIdx = i; });
        // Station: Korean name, local name, 고속철/일반, its fares. Nothing else (user, 2026-11-05)
        const stationsHtml = stations
          .map((st, i) => {
            const localName = st.local ? String(st.local).split(" / ")[0] : "";
            const typeBadge = st.type ? `<span class="station-type-badge">${esc(st.type)}</span>` : "";
            const list = byStation[i];
            const head = `
                  <span class="station-name">${esc(st.name)}</span>
                  ${localName ? `<span class="station-local">${esc(localName)}</span>` : ""}
                  ${typeBadge}`;
            if (!list.length) return `<div class="station-item station-item-plain"><div class="station-item-header">${head}</div></div>`;
            return `
              <details class="station-item"${i === openIdx ? " open" : ""}>
                <summary class="station-item-header">${head}</summary>
                <div class="station-item-body station-fares">${list.map(fareRow).join("")}</div>
              </details>
            `;
          })
          .join("");
        railBoxHtml = `
          <details class="station-box rail-station-box detail-station-box" open>
            <summary class="station-box-title"><span class="section-subtitle">기차역</span> <span class="station-count">${stations.length}곳</span></summary>
            <div class="station-list">
              ${stationsHtml}
            </div>
          </details>
        `;
      }
    }
    if (false) {
      //
    }

    // Order (user, 2026-11-05): cover photo, more photos, name, buttons, intro
    header.innerHTML = `
      ${mediaSectionHtml}
      <div class="detail-title-line">
        <h2 class="detail-title">${city.city}</h2>
        ${city.local ? `<span class="detail-local">${city.local}</span>` : ""}
        <span class="badge">${city.kind || ""}</span>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn btn-pick-city like ${pick === "like" ? "is-active" : ""}" data-pick="like">♥ 끌림</button>
        <button type="button" class="btn btn-pick-city pass ${pick === "pass" ? "is-active" : ""}" data-pick="pass">✕ 패스</button>
        <button type="button" class="btn btn-add-stop" data-action="add-stop">경로에 추가</button>
        ${researchReqHtml(city)}
      </div>
      ${city.desc ? `<p class="detail-desc">${city.desc}</p>` : ""}
    `;
    // Order (user, 2026-11-05): name, buttons, intro, photos, evaluation, train stations, food, spots
    let railEl = null;
    if (railBoxHtml) {
      const tmpRail = document.createElement("div");
      tmpRail.innerHTML = railBoxHtml.trim();
      railEl = tmpRail.firstElementChild;
    }

    header.querySelectorAll(".city-media-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.getAttribute("data-media-idx"), 10);
        const item = mediaItems[idx];
        if (item && typeof openPhotoModal === "function") {
          openPhotoModal({
            name: item.label,
            photos: item.photos || [],
            photo_src: item.photo_src || []
          }, 0);
        }
      });
    });

    header.querySelectorAll(".btn-pick-city").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pickType = btn.getAttribute("data-pick");
        const curPick = store.getPick(city.id);
        lastPickAction = { id: city.id, prevVal: curPick };
        const nextPick = curPick === pickType ? "none" : pickType;
        store.setPick(city.id, nextPick);
      });
    });

    const addStopBtn = header.querySelector('[data-action="add-stop"]');
    if (addStopBtn) {
      addStopBtn.addEventListener("click", () => {
        store.addStop(city.id);
        addStopBtn.textContent = "추가됨 ✓";
        setTimeout(() => {
          if (addStopBtn) addStopBtn.textContent = "경로에 추가";
        }, 1200);
      });
    }

    bindResearchReq(header, city.id);


    body.appendChild(header);

    // 3. Costs & Specialties (if city.info exists)
    if (city.info) {
      const infoSection = document.createElement("div");
      infoSection.className = "detail-info-section";

      let lodgingText = "비용 정보 없음";
      if (city.info.lodging) {
        const dorm = city.info.lodging.dorm_median;
        const krw = city.info.lodging.krw;
        const dormPart = dorm && dorm.amount ? `${dorm.amount} ${dorm.currency}` : "";
        const krwPart = krw ? ` (${util.formatKRW(krw)})` : "";
        lodgingText = dormPart || krwPart ? `${dormPart}${krwPart}` : "비용 정보 없음";
      }

      let cheapMealText = "비용 정보 없음";
      if (city.info.food?.cheap_meal) {
        const cm = city.info.food.cheap_meal;
        const krw = city.info.food.cheap_meal_krw;
        const cmPart = cm.amount ? `${cm.amount} ${cm.currency}` : "";
        const krwPart = krw ? ` (${util.formatKRW(krw)})` : "";
        cheapMealText = cmPart || krwPart ? `${cmPart}${krwPart}` : "비용 정보 없음";
      }

      let localMealText = "비용 정보 없음";
      if (city.info.food?.local_meal) {
        const lm = city.info.food.local_meal;
        const krw = city.info.food.local_meal_krw;
        const lmPart = lm.amount ? `${lm.amount} ${lm.currency}` : "";
        const krwPart = krw ? ` (${util.formatKRW(krw)})` : "";
        localMealText = lmPart || krwPart ? `${lmPart}${krwPart}` : "비용 정보 없음";
      }

      let foodSectionHtml = "";
      const dishes = Array.isArray(city.info?.dishes) && city.info.dishes.length > 0 ? city.info.dishes : null;
      const specialties = Array.isArray(city.info?.specialties)
        ? city.info.specialties.filter((s) => s.kind !== "product")
        : null;
      const foodItems = dishes || specialties;

      if (Array.isArray(foodItems) && foodItems.length > 0) {
        const totalFoodPhotos = dishes
          ? dishes.reduce((acc, d) => acc + (Array.isArray(d.photos) ? d.photos.length : 0), 0)
          : 0;

        foodSectionHtml = `
          <div class="food-section">
            <h4 class="section-subtitle">음식</h4>
            <div class="food-list">
              ${foodItems
                .map((item) => {
                  let photoHtml = "";
                  if (Array.isArray(item.photos) && item.photos.length > 0) {
                    const pUrl = item.photos[0];
                    const count = totalFoodPhotos || item.photos.length;
                    const style = util.photoStyle ? util.photoStyle(pUrl, count) : { src: pUrl };
                    if (style.backgroundImage) {
                      photoHtml = `<div class="dish-photo" data-dish-id="${item.id}" style="background-image: ${style.backgroundImage}; background-size: ${style.backgroundSize}; background-position: ${style.backgroundPosition}; background-repeat: no-repeat; cursor: pointer;"></div>`;
                    } else {
                      photoHtml = `<img class="dish-photo" data-dish-id="${item.id}" src="${style.src || ""}" alt="${item.name || ""}" onerror="this.onerror=null;this.src='${placeholderSvg}'" style="cursor: pointer;">`;
                    }
                  }

                  let priceHtml = "";
                  if (item.price === null) {
                    priceHtml = `<div class="dish-price">가격 미확인</div>`;
                  } else if (item.price && typeof item.price === "object") {
                    const min = item.price.min;
                    const max = item.price.max;
                    const curr = item.price.currency || "";
                    const numPart =
                      min === max
                        ? `${min.toLocaleString("ko-KR")} ${curr}`
                        : `${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")} ${curr}`;

                    let krwPart = "";
                    if (!item.price_krw && item.price && item.price.min != null && item.price.max != null && util.toKRW) {
                      const km1 = util.toKRW(item.price.min, item.price.currency);
                      const km2 = util.toKRW(item.price.max, item.price.currency);
                      if (km1 != null && km2 != null) {
                        item.price_krw = [km1, km2];
                      }
                    }
                    if (Array.isArray(item.price_krw) && item.price_krw.length === 2) {
                      const kMin = item.price_krw[0];
                      const kMax = item.price_krw[1];
                      let kStr = "";
                      if (kMin === kMax) {
                        kStr = util.formatKRW(kMin);
                      } else {
                        const fMin = util.formatKRW(kMin);
                        const fMax = util.formatKRW(kMax);
                        if (fMin.endsWith("원") && !fMin.endsWith("만원") && fMax.endsWith("원") && !fMax.endsWith("만원")) {
                          kStr = `${fMin.slice(0, -1)}~${fMax}`;
                        } else {
                          kStr = `${fMin}~${fMax}`;
                        }
                      }
                      const notePrefix = item.price_note === "약" ? "약 " : "";
                      krwPart = ` (${notePrefix}${kStr})`;
                    }
                    priceHtml = `<div class="dish-price">가격: ${numPart}${krwPart}</div>`;
                  }

                  return `
                    <div class="dish-card">
                      ${photoHtml}
                      <div class="dish-body">
                        <div class="dish-header">
                          <span class="dish-name">${item.name || ""}</span>
                          ${item.local_name ? `<span class="dish-local">${item.local_name}</span>` : ""}
                        </div>
                        ${priceHtml}
                        ${item.why ? `<div class="dish-why">${item.why}</div>` : ""}
                        ${item.where ? `<div class="dish-where"><span class="dish-label">장소:</span> ${item.where}</div>` : ""}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      }

      const hasCostData = Boolean(city.info.lodging || city.info.food?.cheap_meal || city.info.food?.local_meal);
      const costBoxHtml = hasCostData
        ? `
        <div class="cost-box">
          <h4 class="section-subtitle">물가 정보</h4>
          <div class="cost-grid">
            <div class="cost-item">
              <span class="cost-label">호스텔 2~4인실 1박 중간값</span>
              <span class="cost-val">${lodgingText}</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">저가 한 끼</span>
              <span class="cost-val">${cheapMealText}</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">로컬 식당 한 끼</span>
              <span class="cost-val">${localMealText}</span>
            </div>
          </div>
        </div>
        `
        : "";
      infoSection.innerHTML = `${costBoxHtml}${foodSectionHtml}`;
      if (false) infoSection.innerHTML = `
        <div class="cost-box">
          <h4 class="section-subtitle">물가 정보</h4>
          <div class="cost-grid">
            <div class="cost-item">
              <span class="cost-label">호스텔 2~4인실 1박 중간값</span>
              <span class="cost-val">${lodgingText}</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">저가 한 끼</span>
              <span class="cost-val">${cheapMealText}</span>
            </div>
            <div class="cost-item">
              <span class="cost-label">로컬 식당 한 끼</span>
              <span class="cost-val">${localMealText}</span>
            </div>
          </div>
        </div>
        // superseded by costBoxHtml + foodSectionHtml above
      `;

      if (foodItems) {
        const totalFoodPhotos = dishes
          ? dishes.reduce((acc, d) => acc + (Array.isArray(d.photos) ? d.photos.length : 0), 0)
          : 0;
        infoSection.querySelectorAll(".dish-photo[data-dish-id]").forEach((el) => {
          const dishId = el.getAttribute("data-dish-id");
          const dish = foodItems.find((d) => d.id === dishId);
          if (dish && typeof openPhotoModal === "function") {
            el.addEventListener("click", (e) => {
              e.stopPropagation();
              dish.packCount = totalFoodPhotos;
              openPhotoModal(dish, 0);
            });
          }
        });
      }

      body.appendChild(infoSection);

      // D7: City evaluation or reviews section
      const evaluation = city.info?.eval;
      const reviews = city.info?.reviews;

      if (evaluation) {
        const evalSection = document.createElement("div");
        evalSection.className = "city-eval-section detail-eval-section";

        const eTitle = document.createElement("h4");
        eTitle.className = "section-subtitle";
        eTitle.textContent = "도시 평가";
        evalSection.appendChild(eTitle);

        if (evaluation.summary) {
          const summaryP = document.createElement("p");
          summaryP.className = "eval-summary";
          summaryP.textContent = evaluation.summary;
          evalSection.appendChild(summaryP);
        }

        const prosConsGrid = document.createElement("div");
        prosConsGrid.className = "eval-pros-cons-grid";

        if (Array.isArray(evaluation.pros) && evaluation.pros.length > 0) {
          const prosBox = document.createElement("div");
          prosBox.className = "eval-box eval-pros-box";
          const prosTitle = document.createElement("div");
          prosTitle.className = "eval-box-title eval-pros-title";
          prosTitle.textContent = "좋은 점";
          prosBox.appendChild(prosTitle);

          const prosList = document.createElement("ul");
          prosList.className = "eval-list eval-pros";
          for (const pro of evaluation.pros) {
            const li = document.createElement("li");
            li.className = "eval-pro pro-item";
            const icon = document.createElement("span");
            icon.className = "eval-icon pro-icon";
            icon.textContent = "✓";
            li.appendChild(icon);
            const text = document.createElement("span");
            text.className = "eval-text";
            text.textContent = pro;
            li.appendChild(text);
            prosList.appendChild(li);
          }
          prosBox.appendChild(prosList);
          prosConsGrid.appendChild(prosBox);
        }

        if (Array.isArray(evaluation.cons) && evaluation.cons.length > 0) {
          const consBox = document.createElement("div");
          consBox.className = "eval-box eval-cons-box";
          const consTitle = document.createElement("div");
          consTitle.className = "eval-box-title eval-cons-title";
          consTitle.textContent = "아쉬운 점";
          consBox.appendChild(consTitle);

          const consList = document.createElement("ul");
          consList.className = "eval-list eval-cons";
          for (const con of evaluation.cons) {
            const li = document.createElement("li");
            li.className = "eval-con con-item";
            const icon = document.createElement("span");
            icon.className = "eval-icon con-icon";
            icon.textContent = "!";
            li.appendChild(icon);
            const text = document.createElement("span");
            text.className = "eval-text";
            text.textContent = con;
            li.appendChild(text);
            consList.appendChild(li);
          }
          consBox.appendChild(consList);
          prosConsGrid.appendChild(consBox);
        }

        evalSection.appendChild(prosConsGrid);


        if (Array.isArray(evaluation.sources) && evaluation.sources.length > 0) {
          const details = document.createElement("details");
          details.className = "eval-sources-details";
          const summary = document.createElement("summary");
          summary.className = "eval-sources-summary";
          summary.textContent = `출처 ${evaluation.sources.length}곳`;
          details.appendChild(summary);

          const sourcesList = document.createElement("ul");
          sourcesList.className = "eval-sources-list";
          for (const src of evaluation.sources) {
            const sLi = document.createElement("li");
            const a = document.createElement("a");
            a.href = src;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = src;
            sLi.appendChild(a);
            sourcesList.appendChild(sLi);
          }
          details.appendChild(sourcesList);
          evalSection.appendChild(details);
        }

        body.appendChild(evalSection);
      } else if (Array.isArray(reviews) && reviews.length > 0) {
        const reviewSection = document.createElement("div");
        reviewSection.className = "review-section detail-reviews-section";

        const rTitle = document.createElement("h4");
        rTitle.className = "section-subtitle";
        rTitle.textContent = "여행 후기";
        reviewSection.appendChild(rTitle);

        const rList = document.createElement("div");
        rList.className = "review-list";

        for (const rev of reviews) {
          const rItem = document.createElement("div");
          rItem.className = "review-item";

          const rHeader = document.createElement("div");
          rHeader.className = "review-header";

          if (rev.site) {
            const siteBadge = document.createElement("span");
            siteBadge.className = "badge review-site-badge";
            siteBadge.textContent = rev.site;
            rHeader.appendChild(siteBadge);
          }

          if (rev.year) {
            const yearEl = document.createElement("span");
            yearEl.className = "review-year";
            yearEl.textContent = String(rev.year);
            rHeader.appendChild(yearEl);
          }

          const link = document.createElement("a");
          link.className = "review-title-link";
          link.href = rev.url || "#";
          link.target = "_blank";
          link.rel = "noopener";
          link.textContent = rev.title || "후기 보기";
          rHeader.appendChild(link);

          rItem.appendChild(rHeader);

          if (rev.summary_ko) {
            const summary = document.createElement("div");
            summary.className = "review-summary";
            summary.textContent = rev.summary_ko;
            rItem.appendChild(summary);
          }

          rList.appendChild(rItem);
        }
        reviewSection.appendChild(rList);
        body.appendChild(reviewSection);
      }
    }

    // 4. Spots Section
    const allSpots = data.spotsOfCity(city.id) || [];
    const spotsSection = document.createElement("div");
    spotsSection.className = "detail-spots-section";

    if (allSpots.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state city-spots-empty";
      emptyState.innerHTML = `
        <p>아직 장소 조사 전입니다</p>
      `;
      spotsSection.appendChild(emptyState);
    } else {
      // Filter chips: categories and "무료만"
      const cats = Array.from(
        new Set(allSpots.map((s) => s.cat || s.category_std).filter(Boolean))
      );
      let selectedCat = "all";
      let freeOnly = false;

      const spotFilterBar = document.createElement("div");
      spotFilterBar.className = "spot-filter-bar";

      let catChipsHtml = `<button type="button" class="chip is-active" data-cat="all">전체 (${allSpots.length})</button>`;
      cats.forEach((cat) => {
        const count = allSpots.filter((s) => (s.cat || s.category_std) === cat).length;
        catChipsHtml += `<button type="button" class="chip" data-cat="${cat}">${cat} (${count})</button>`;
      });
      catChipsHtml += `<button type="button" class="chip chip-free" data-filter-free="true">무료만</button>`;

      spotFilterBar.innerHTML = catChipsHtml;
      spotsSection.appendChild(spotFilterBar);

      const spotsContainer = document.createElement("div");
      spotsContainer.className = "spots-container";

      // Render all spot cards
      allSpots.forEach((spot) => {
        const card = renderSpotCard(spot);
        spotsContainer.appendChild(card);
      });
      spotsSection.appendChild(spotsContainer);

      function updateSpotVisibility() {
        spotsContainer.querySelectorAll(".spot-card").forEach((card) => {
          const sId = card.getAttribute("data-spot-id");
          const s = allSpots.find((item) => item.id === sId);
          if (!s) return;

          let catMatch = selectedCat === "all" || (s.cat || s.category_std) === selectedCat;
          let freeMatch = true;
          if (freeOnly) {
            if (!s.fee || (!s.fee.amount && !s.fee.free && !s.fee.text && s.fee !== "무료" && s.fee.krw == null)) {
              freeMatch = true;
            } else {
              const isFree =
                s.fee?.free === true ||
                s.fee === "무료" ||
                s.fee?.amount === 0 ||
                s.fee?.krw === 0;
              freeMatch = Boolean(isFree);
            }
          }
          card.hidden = !(catMatch && freeMatch);
        });
      }

      spotFilterBar.addEventListener("click", (e) => {
        const chip = e.target.closest("button.chip");
        if (!chip) return;

        if (chip.hasAttribute("data-filter-free")) {
          freeOnly = !freeOnly;
          chip.classList.toggle("is-active", freeOnly);
          updateSpotVisibility();
          return;
        }

        const cat = chip.getAttribute("data-cat");
        if (cat) {
          selectedCat = cat;
          spotFilterBar.querySelectorAll("button[data-cat]").forEach((b) => {
            b.classList.toggle("is-active", b === chip);
          });
          updateSpotVisibility();
        }
      });
    }

    {
      const evalNode = body.querySelector(".detail-eval-section, .detail-reviews-section");
      const infoNode = body.querySelector(".detail-info-section");
      if (railEl) body.insertBefore(railEl, infoNode);
      if (evalNode) body.insertBefore(evalNode, railEl || infoNode);
    }
    body.appendChild(spotsSection);

    // D10: research request moved to detail-actions
    if (false) {
      const researchFooter = document.createElement("div");
    researchFooter.className = "detail-research-footer";
    researchFooter.innerHTML = `
      ${
        researchPick === "request"
          ? `<span class="research-status">조사 요청됨 — Claude가 다음 조사 때 확인합니다</span>`
          : `<button type="button" class="link-research" data-action="request-research">이 도시 조사 요청</button>`
      }
    `;
    const bottomReqBtn = researchFooter.querySelector('[data-action="request-research"]');
    if (bottomReqBtn) {
      bottomReqBtn.addEventListener("click", () => {
        store.setPick("research:" + city.id, "request");
      });
    }
      body.appendChild(researchFooter);
    }

    viewDetail.appendChild(body);
  }

  // Research tiers (user, 2026-11-05): 1 = basic (about 10 spots, 3+ dishes, intro), 2 = 20 to 50 spots, 3 = 50 to 100+ spots with restaurants
  function researchLevel(cityId) {
    const n = (data.spotsOfCity(cityId) || []).length;
    return n >= 50 ? 3 : n >= 20 ? 2 : 1;
  }
  function researchReqHtml(city) {
    const key = "research:" + city.id;
    const tier = store.getResearchTier ? store.getResearchTier(key) : (store.getPick(key) === "request" ? 2 : 0);
    const level = researchLevel(city.id);
    const btn = (n) => {
      const on = tier === n;
      const done = level >= n;
      return `<button type="button" class="btn btn-research-req ${on ? "is-active" : ""}" data-action="request-research" data-tier="${n}"${done ? " disabled" : ""}>${done ? `${n}단계 완료` : on ? `${n}단계 요청됨` : `${n}단계 조사`}</button>`;
    };
    return `<span class="research-req" role="group" aria-label="조사 요청"><span class="research-level" title="2단계: 장소 20~50곳 · 3단계: 장소 50~100곳 이상과 음식별 대표 식당">지금 ${level}단계</span>${btn(2)}${btn(3)}</span>`;
  }
  function bindResearchReq(root, cityId) {
    if (!root) return;
    for (const b of root.querySelectorAll('.research-req [data-action="request-research"]')) {
      b.addEventListener("click", () => {
        const key = "research:" + cityId;
        const n = Number(b.dataset.tier);
        const cur = store.getResearchTier ? store.getResearchTier(key) : 0;
        if (store.setResearch) store.setResearch(key, cur === n ? 0 : n);
        else store.setPick(key, "request");
      });
    }
  }

  function renderSpotCard(spot) {
    const card = document.createElement("div");
    card.className = "spot-card";
    card.setAttribute("data-spot-id", spot.id);
    card.tabIndex = 0;

    const pick = store.getPick(spot.id);
    if (pick === "like") card.classList.add("is-like");
    if (pick === "pass") card.classList.add("is-pass");

    // Photos: 3 photos in a row
    const photosRow = document.createElement("div");
    photosRow.className = "spot-photos-row";
    const photosToShow = (spot.photos || []).slice(0, 3);
    const count = (spot.photos || []).length;
    if (photosToShow.length > 0) {
      photosToShow.forEach((pUrl, pIdx) => {
        const style = util.photoStyle ? util.photoStyle(pUrl, count) : { src: pUrl };
        let photoEl;
        if (style.backgroundImage) {
          photoEl = document.createElement("div");
          photoEl.className = "spot-photo-thumb";
          photoEl.style.backgroundImage = style.backgroundImage;
          photoEl.style.backgroundSize = style.backgroundSize;
          photoEl.style.backgroundPosition = style.backgroundPosition;
          photoEl.style.backgroundRepeat = "no-repeat";
        } else {
          photoEl = document.createElement("img");
          photoEl.className = "spot-photo-thumb";
          photoEl.alt = `${spot.name} 사진 ${pIdx + 1}`;
          photoEl.src = style.src || "";
          photoEl.onerror = () => {
            photoEl.onerror = null;
            photoEl.src = placeholderSvg;
          };
        }
        photoEl.addEventListener("click", (e) => {
          e.stopPropagation();
          openPhotoModal(spot, pIdx);
        });

        if (pIdx === 2 && count > 3) {
          const wrap = document.createElement("div");
          wrap.className = "spot-photo-wrap";
          wrap.style.position = "relative";
          const badge = document.createElement("span");
          badge.className = "spot-photo-more-badge";
          badge.textContent = `+${count - 3}`;
          badge.style.cssText =
            "position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;font-size:11px;padding:2px 5px;border-radius:4px;pointer-events:none;";
          wrap.appendChild(photoEl);
          wrap.appendChild(badge);
          photosRow.appendChild(wrap);
        } else {
          photosRow.appendChild(photoEl);
        }
      });
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "spot-photo-empty";
      placeholder.textContent = "사진 없음";
      photosRow.appendChild(placeholder);
    }
    card.appendChild(photosRow);

    // Header info: name, local, category
    const head = document.createElement("div");
    head.className = "spot-head";
    head.innerHTML = `
      <div class="spot-title-line">
        <h4 class="spot-name">${spot.name}</h4>
        ${spot.local ? `<span class="spot-local">${spot.local}</span>` : ""}
        <span class="badge spot-cat">${spot.cat || spot.category_std || ""}</span>
      </div>
    `;
    card.appendChild(head);
    // Name shows the place on the map (user, 2026-11-05)
    const nameEl = head.querySelector(".spot-name");
    if (nameEl && typeof spot.lat === "number") {
      nameEl.classList.add("is-map-link");
      nameEl.title = "지도에서 보기";
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        bus.emit("spot:focus", { spotId: spot.id, source: "card" });
        if (window.matchMedia("(max-width: 899px)").matches) {
          bus.emit("pane:show", { pane: "map" });
          document.querySelector('#mobile-tabs button[data-pane="map"]')?.click();
        }
      });
    }

    // Desc
    if (spot.desc) {
      const descEl = document.createElement("p");
      descEl.className = "spot-desc";
      descEl.textContent = spot.desc;
      card.appendChild(descEl);
    }

    // Facts: fee, transport, duration
    const factsEl = document.createElement("div");
    factsEl.className = "spot-facts";

    let feeText = "";
    if (spot.fee) {
      if (spot.fee.text) {
        if (spot.fee.amount != null && !spot.fee.text.includes(String(spot.fee.amount))) {
          feeText = `${spot.fee.amount} ${spot.fee.currency || ""} (${spot.fee.text})`;
        } else {
          feeText = spot.fee.text;
        }
      } else if (spot.fee.free || spot.fee === "무료" || spot.fee.amount === 0) {
        feeText = "무료";
      } else if (typeof spot.fee === "string") {
        feeText = spot.fee;
      } else if (spot.fee.amount != null) {
        feeText = `${spot.fee.amount} ${spot.fee.currency || ""}`;
        if (spot.fee.krw != null) feeText += ` (${util.formatKRW(spot.fee.krw)})`;
      } else {
        feeText = "입장료 미확인";
      }
    } else {
      feeText = "입장료 미확인";
    }

    let hoursText = spot.hours ? String(spot.hours) : "";
    let closedText = spot.closed ? String(spot.closed) : "";

    let transportText = "";
    if (spot.transport) {
      if (typeof spot.transport === "string") {
        transportText = spot.transport;
      } else {
        const how = spot.transport.how || "";
        let costPart = "";
        if (spot.transport.cost && spot.transport.cost.amount != null) {
          costPart = `${spot.transport.cost.amount} ${spot.transport.cost.currency || ""}`;
          if (spot.transport.krw != null) costPart += ` (${util.formatKRW(spot.transport.krw)})`;
        }
        transportText = [how, costPart].filter(Boolean).join(" · ");
      }
    }

    let durationText = "";
    if (spot.duration_min) {
      durationText = `${spot.duration_min}분`;
    } else if (spot.duration) {
      durationText = String(spot.duration);
    }

    let factsHtml = "";
    if (feeText) {
      factsHtml += `<div class="spot-fact"><span class="fact-label">입장료</span><span class="fact-val">${feeText}</span></div>`;
    }
    if (hoursText) {
      factsHtml += `<div class="spot-fact"><span class="fact-label">운영시간</span><span class="fact-val">${hoursText}</span></div>`;
    }
    if (closedText) {
      factsHtml += `<div class="spot-fact"><span class="fact-label">휴무일</span><span class="fact-val">${closedText}</span></div>`;
    }
    if (transportText) {
      factsHtml += `<div class="spot-fact"><span class="fact-label">교통</span><span class="fact-val">${transportText}</span></div>`;
    }
    if (durationText) {
      factsHtml += `<div class="spot-fact"><span class="fact-label">소요시간</span><span class="fact-val">${durationText}</span></div>`;
    }
    if (factsHtml) {
      factsEl.innerHTML = factsHtml;
      card.appendChild(factsEl);
    }

    // Pick Actions
    const actions = document.createElement("div");
    actions.className = "spot-actions";
    actions.innerHTML = `
      <button type="button" class="btn btn-spot-pick like ${pick === "like" ? "is-active" : ""}" data-pick="like">♥ 끌림</button>
      <button type="button" class="btn btn-spot-pick pass ${pick === "pass" ? "is-active" : ""}" data-pick="pass">✕ 패스</button>
    `;

    actions.querySelectorAll(".btn-spot-pick").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pickType = btn.getAttribute("data-pick");
        const curPick = store.getPick(spot.id);
        const nextPick = curPick === pickType ? "none" : pickType;
        lastPickAction = { id: spot.id, prevVal: curPick };
        store.setPick(spot.id, nextPick);
      });
    });
    card.appendChild(actions);

    return card;
  }

  // --- 5. Event Listeners ---
  bus.on("city:focus", ({ cityId, source }) => {
    if (source === "browse") return; // contract: ignore self
    openCityDetail(cityId);
    if (source === "map") {
      bus.emit("pane:show", { pane: "browse" });
      const browseTab = document.querySelector('#mobile-tabs button[data-pane="browse"]');
      if (browseTab) {
        browseTab.click();
      }
    }
  });

  bus.on("spot:focus", ({ spotId, source }) => {
    if (source === "map") {
      bus.emit("pane:show", { pane: "browse" });
      const browseTab = document.querySelector('#mobile-tabs button[data-pane="browse"]');
      if (browseTab) {
        browseTab.click();
      }
    }
    // If we're not in the city detail of this spot, switch to it
    const spot = (data.spots || []).find((s) => s.id === spotId);
    if (spot && activeCityId !== spot.cityId) {
      openCityDetail(spot.cityId);
    }

    if (source !== "card") setDetailTab("spots", false);
    setTimeout(() => {
      const card = viewDetail.querySelector(`[data-spot-id="${spotId}"]`);
      if (card) {
        card.scrollIntoView({ block: "center" });
        card.classList.add("is-flashing");
        setTimeout(() => {
          card.classList.remove("is-flashing");
        }, 1200);
      }
    }, 50);
  });

  bus.on("pick:changed", ({ id, v }) => {
    // 1. Update city row in cities view
    const cityRow = viewCities.querySelector(`[data-city-id="${id}"]`);
    if (cityRow) {
      cityRow.classList.toggle("is-like", v === "like");
      cityRow.classList.toggle("is-pass", v === "pass");
      const likeBtn = cityRow.querySelector('[data-pick="like"]');
      if (likeBtn) likeBtn.classList.toggle("is-active", v === "like");
      const passBtn = cityRow.querySelector('[data-pick="pass"]');
      if (passBtn) passBtn.classList.toggle("is-active", v === "pass");
    }

    // 2. If it's a city and detail view is showing it
    if (id === activeCityId) {
      const likeBtn = viewDetail.querySelector('.btn-pick-city[data-pick="like"]');
      if (likeBtn) likeBtn.classList.toggle("is-active", v === "like");
      const passBtn = viewDetail.querySelector('.btn-pick-city[data-pick="pass"]');
      if (passBtn) passBtn.classList.toggle("is-active", v === "pass");
    }

    // 3. If it's a research request for the active city
    if (id === `research:${activeCityId}`) {
      const wrap = viewDetail.querySelector(".research-req");
      if (wrap) {
        const city = data.cities.find((c) => c.id === activeCityId);
        if (city) {
          const tmp = document.createElement("div");
          tmp.innerHTML = researchReqHtml(city);
          const fresh = tmp.firstElementChild;
          wrap.replaceWith(fresh);
          bindResearchReq(fresh.parentElement, activeCityId);
        }
      }
      const researchWrap = viewDetail.querySelector(".detail-research-footer");
      if (researchWrap) {
        researchWrap.innerHTML =
          v === "request"
            ? `<span class="research-status">조사 요청됨 — Claude가 다음 조사 때 확인합니다</span>`
            : `<button type="button" class="link-research" data-action="request-research">이 도시 조사 요청</button>`;
        const newReqBtn = researchWrap.querySelector('[data-action="request-research"]');
        if (newReqBtn) {
          newReqBtn.addEventListener("click", () => {
            store.setPick(`research:${activeCityId}`, "request");
          });
        }
      }
    }

    // 4. Update spot card if present (DO NOT re-render whole list!)
    const spotCard = viewDetail.querySelector(`[data-spot-id="${id}"]`);
    if (spotCard) {
      spotCard.classList.toggle("is-like", v === "like");
      spotCard.classList.toggle("is-pass", v === "pass");
      const likeBtn = spotCard.querySelector('[data-pick="like"]');
      if (likeBtn) likeBtn.classList.toggle("is-active", v === "like");
      const passBtn = spotCard.querySelector('[data-pick="pass"]');
      if (passBtn) passBtn.classList.toggle("is-active", v === "pass");
    }

    // 5. Update photo modal if open
    if (photoOverlay && !photoOverlay.hidden && modalSpot && id === modalSpot.id) {
      updatePhotoModal();
    }



    // 7. Update group counts in cities view
    if (id.startsWith("city:")) {
      if (["끌림", "미정", "패스"].includes(currentFilter)) {
        const prevScroll = viewCities.scrollTop || el.scrollTop || 0;
        renderCityList();
        if (prevScroll > 0) {
          requestAnimationFrame(() => {
            if (viewCities.scrollTop !== undefined) viewCities.scrollTop = prevScroll;
            if (el.scrollTop !== undefined) el.scrollTop = prevScroll;
          });
        }
      } else {
        updateCityGroupCounts();
      }
    }
  });

  // Keyboard navigation (M1-3): j/k move focus, l like, h pass, u undo
  window.addEventListener("keydown", (e) => {
    if (photoOverlay && !photoOverlay.hidden) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePhotoModal();
        return;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevPhoto();
        return;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextPhoto();
        return;
      }
    }

    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT")
    ) {
      return;
    }

    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      if (lastPickAction) {
        store.setPick(lastPickAction.id, lastPickAction.prevVal);
        lastPickAction = null;
      }
      return;
    }

    if (currentView === "detail" && !viewDetail.hidden) {
      const visibleCards = Array.from(
        viewDetail.querySelectorAll(".spot-card:not([hidden])")
      );
      if (visibleCards.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const currentIdx = visibleCards.indexOf(activeEl?.closest?.(".spot-card"));
        const nextIdx = currentIdx < 0 ? 0 : Math.min(visibleCards.length - 1, currentIdx + 1);
        visibleCards[nextIdx]?.focus();
        visibleCards[nextIdx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const currentIdx = visibleCards.indexOf(activeEl?.closest?.(".spot-card"));
        const prevIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
        visibleCards[prevIdx]?.focus();
        visibleCards[prevIdx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        const targetCard = activeEl?.closest?.(".spot-card") || visibleCards[0];
        if (targetCard) {
          const sId = targetCard.getAttribute("data-spot-id");
          if (sId) {
            const curPick = store.getPick(sId);
            lastPickAction = { id: sId, prevVal: curPick };
            const next = curPick === "like" ? "none" : "like";
            store.setPick(sId, next);
          }
        }
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        const targetCard = activeEl?.closest?.(".spot-card") || visibleCards[0];
        if (targetCard) {
          const sId = targetCard.getAttribute("data-spot-id");
          if (sId) {
            const curPick = store.getPick(sId);
            lastPickAction = { id: sId, prevVal: curPick };
            const next = curPick === "pass" ? "none" : "pass";
            store.setPick(sId, next);
          }
        }
      }
    }
  });

  // Initial render
  renderCityList();

  return {
    openCityDetail
  };
}


