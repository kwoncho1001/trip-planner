const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(ctx) {
  const errors = [];

  const testDishes = [
    {
      id: "dish-hoi-an-1",
      name: "까오러우",
      local_name: "Cao Lầu",
      why: "호이안 고유의 전통 비빔국수",
      where: "탄 까오러우",
      kind: "food",
      price: { min: 30000, max: 40000, currency: "VND" },
      price_krw: [1554, 2072],
      price_note: "약",
      price_source: "https://example.com/caolau",
      photo_query: "Cao Lầu Hội An",
      photos: ["photos/dish-hoi-an-1/1.jpg"],
      photo_src: ["https://example.com/1.jpg"]
    },
    {
      id: "dish-hoi-an-2",
      name: "화홍",
      local_name: "Bánh bao bánh vạc",
      why: "장미꽃 모양의 호이안 딤섬",
      where: "화홍 식당",
      kind: "food",
      price: { min: 50000, max: 70000, currency: "VND" },
      price_krw: [2590, 3626],
      price_note: "",
      price_source: "https://example.com/white-rose",
      photo_query: "White Rose Hội An",
      photos: ["photos/dish-hoi-an-2/1.jpg"],
      photo_src: ["https://example.com/2.jpg"]
    },
    {
      id: "dish-hoi-an-3",
      name: "호이안 반미",
      local_name: "Bánh mì Hội An",
      why: "바삭한 바게트 샌드위치",
      where: "반미프엉",
      kind: "snack",
      price: { min: 25000, max: 35000, currency: "VND" },
      price_krw: [1295, 1813],
      price_note: "약",
      price_source: "https://example.com/banhmi",
      photo_query: "Bánh Mì Hội An",
      photos: ["photos/dish-hoi-an-3/1.jpg"],
      photo_src: ["https://example.com/3.jpg"]
    },
    {
      id: "dish-hoi-an-4",
      name: "모트 허브차",
      local_name: "Nước Mót",
      why: "연꽃잎을 띄운 전통 허브차",
      where: "모트 호이안",
      kind: "drink",
      price: { min: 15000, max: 15000, currency: "VND" },
      price_krw: [777, 777],
      price_note: "",
      price_source: "https://example.com/mot",
      photo_query: "Nước Mót Hội An",
      photos: ["photos/dish-hoi-an-4/1.jpg"],
      photo_src: ["https://example.com/4.jpg"]
    },
    {
      id: "dish-hoi-an-5",
      name: "찌까오러우",
      local_name: "Chè Hội An",
      why: "달콤한 로컬 디저트",
      where: "야시장 노점",
      kind: "snack",
      price: null,
      price_krw: null,
      price_note: "미확인",
      price_source: "",
      photo_query: "Chè Hội An",
      photos: [],
      photo_src: []
    }
  ];

  // 7. In it, SET info.dishes of city:호이안 to 5 test dishes. One dish has price: null, price_note: "미확인" and no photos.
  const city = ctx?.data?.cityById ? ctx.data.cityById("city:호이안") : null;
  if (!city) {
    errors.push('city "city:호이안" not found');
    return { pass: false, detail: errors.join("; ") };
  }
  if (!city.info) {
    city.info = {};
  }
  city.info.dishes = testDishes;

  // 8. In it, open the detail of city:호이안.
  if (ctx?.bus?.emit) {
    ctx.bus.emit("city:focus", { cityId: "city:호이안", source: "map" });
  } else {
    errors.push("ctx.bus.emit is not available");
  }
  await sleep(1000);

  // 9. In it, MAKE SURE .food-section .section-subtitle text is 음식 and the .dish-card count is 5.
  const foodSection = document.querySelector(".food-section");
  if (!foodSection) {
    errors.push(".food-section not found");
  } else {
    const subtitle = foodSection.querySelector(".section-subtitle");
    if (!subtitle || subtitle.textContent.trim() !== "음식") {
      errors.push(`.food-section .section-subtitle expected "음식", got "${subtitle?.textContent?.trim()}"`);
    }
    const dishCards = foodSection.querySelectorAll(".dish-card");
    if (dishCards.length !== 5) {
      errors.push(`.dish-card count expected 5, got ${dishCards.length}`);
    }
  }

  // 10. In it, MAKE SURE one card text contains 가격 미확인. MAKE SURE no text 도시 명물 is on the page.
  const dishCards = document.querySelectorAll(".dish-card");
  const hasUnconfirmedPrice = Array.from(dishCards).some((card) =>
    card.textContent.includes("가격 미확인")
  );
  if (!hasUnconfirmedPrice) {
    errors.push('no .dish-card contains "가격 미확인"');
  }

  const allText = document.body.textContent || "";
  if (allText.includes("도시 명물")) {
    errors.push('text "도시 명물" found on the page');
  }

  const pass = errors.length === 0;
  const detail = pass ? "browse-food passed" : `errors: ${errors.join("; ")}`;
  return { pass, detail };
}
