// Vercel Serverless Function
// 공공데이터포털 특일 정보 API를 호출하고
// 한 달치 공휴일 목록을 깔끔하게 정리해서 돌려준다.
//
// 요청: /api/holidays?year=2026&month=5
// 응답: [{ date: "2026-05-05", name: "어린이날" }, ...]

const SERVICE_KEY = "79603aa7239ae4e769d2ae59c1d49969fc7112f698966a5f889f33cec80ee0c2";

export default async function handler(req, res) {
  // 캐시 헤더: 같은 달 응답은 12시간 동안 재사용
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const year = String(req.query.year || new Date().getFullYear());
  const month = String(req.query.month || (new Date().getMonth() + 1)).padStart(2, "0");

  const url =
    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo" +
    `?serviceKey=${encodeURIComponent(SERVICE_KEY)}` +
    `&solYear=${year}&solMonth=${month}` +
    "&_type=json&numOfRows=50";

  try {
    const r = await fetch(url);
    if (!r.ok) {
      return res.status(502).json({ error: "api_failed", status: r.status });
    }
    const text = await r.text();
    // 가끔 XML로 떨어지는 경우가 있어 안전하게 처리
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(200).json([]); // 응답이 깨지면 빈 배열
    }

    const items = data?.response?.body?.items?.item;
    if (!items) return res.status(200).json([]);

    const arr = Array.isArray(items) ? items : [items];
    const holidays = arr
      .filter((it) => it.isHoliday === "Y" || it.isHoliday === "y")
      .map((it) => {
        const d = String(it.locdate); // 20260505
        const dateKey = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        return { date: dateKey, name: it.dateName };
      });

    return res.status(200).json(holidays);
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e) });
  }
}
