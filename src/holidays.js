// 한국 공휴일 — Vercel 함수(/api/holidays)에서 받아오고
// 같은 달은 24시간 로컬 캐시.

const CACHE_KEY_PREFIX = "holidays:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

async function fetchMonth(year, month) {
  // 미리보기/로컬에서는 함수가 없으므로 빈 배열 반환
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return [];
  }
  try {
    const r = await fetch(`/api/holidays?year=${year}&month=${month}`);
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

// 캐시에 같은 달이 있으면 그걸 쓰고, 없으면 받아와서 저장
async function getMonth(year, month) {
  const key = `${CACHE_KEY_PREFIX}${year}-${month}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < CACHE_TTL_MS) return data;
    }
  } catch {}
  const data = await fetchMonth(year, month);
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {}
  return data;
}

// 여러 달을 한꺼번에 받아 { "2026-05-05": "어린이날", ... } 모양으로 합쳐 반환
export async function loadHolidays(yearMonths) {
  const map = {};
  await Promise.all(
    yearMonths.map(async ({ year, month }) => {
      const items = await getMonth(year, month);
      items.forEach((h) => { map[h.date] = h.name; });
    })
  );
  return map;
}
