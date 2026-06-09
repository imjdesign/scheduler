// 구글 캘린더 연동
// Google Identity Services (GIS)로 OAuth 토큰을 받고
// Calendar API로 일정을 추가/수정/삭제한다.
//
// 토큰은 1시간 만료지만, GIS의 silent 모드(prompt: "")로 자동 갱신을 시도한다.
// 사용자가 한 번이라도 권한을 동의한 적이 있다면 (CONSENTED_KEY=true) 사이트 열 때마다
// 백그라운드로 토큰 갱신을 시도해서 매끄럽게 연결 상태를 유지한다.

const CLIENT_ID = "1017991240202-q7otj2dngmgimc7efcqod97561l8amk5.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_KEY = "gcal:token";
const CONSENTED_KEY = "gcal:consented"; // 사용자가 한 번이라도 동의한 적 있는지

let gisLoaded = false;
let gisLoadPromise = null;
let refreshInflight = null; // 동시 갱신 요청 방지

// GIS 스크립트 로드
function loadGIS() {
  if (gisLoaded) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => { gisLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

// 저장된 토큰 읽기 (마진 1분)
function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (Date.now() > t.expiresAt - 60000) return null;
    return t;
  } catch { return null; }
}

function storeToken(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function setConsented(v) {
  if (v) localStorage.setItem(CONSENTED_KEY, "1");
  else localStorage.removeItem(CONSENTED_KEY);
}
function hasConsented() {
  return localStorage.getItem(CONSENTED_KEY) === "1";
}

// "연결됨" 의미를 바꿈: 유효한 토큰이 있거나, 동의해둔 상태(곧 자동 갱신될 수 있음)
export function isConnected() {
  return !!getStoredToken() || hasConsented();
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
  setConsented(false);
}

// 사용자가 처음 한 번 누르는 "연결" — 권한 동의 창이 뜸
export async function connect() {
  await loadGIS();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) return reject(resp);
        const token = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in * 1000),
        };
        storeToken(token);
        setConsented(true);
        resolve(token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// 조용한 갱신 (동의 창 안 뜸). 동의 안 한 적 없거나 구글 측에서 거부하면 실패
async function silentRefresh() {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    await loadGIS();
    return new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) return reject(resp);
          const token = {
            accessToken: resp.access_token,
            expiresAt: Date.now() + (resp.expires_in * 1000),
          };
          storeToken(token);
          setConsented(true);
          resolve(token);
        },
        error_callback: (err) => reject(err),
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  })().finally(() => { refreshInflight = null; });
  return refreshInflight;
}

// 사이트 시작 시 호출: 토큰 없으면 silent 갱신 시도
export async function tryRestoreConnection() {
  if (getStoredToken()) return true; // 이미 유효한 토큰 있음
  if (!hasConsented()) return false; // 한 번도 동의 안 함 — 가만히 둠
  try {
    await silentRefresh();
    return true;
  } catch (e) {
    console.warn("silent refresh failed", e);
    return false;
  }
}

async function getValidToken() {
  let t = getStoredToken();
  if (t) return t;
  return await silentRefresh();
}

// Calendar API 호출 헬퍼
async function calApi(path, method = "GET", body = null) {
  const t = await getValidToken();
  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${t.accessToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, opts);
  if (r.status === 401) {
    // 토큰 만료 → 갱신 후 재시도
    localStorage.removeItem(TOKEN_KEY);
    const nt = await silentRefresh();
    opts.headers.Authorization = `Bearer ${nt.accessToken}`;
    const r2 = await fetch(`https://www.googleapis.com/calendar/v3${path}`, opts);
    if (!r2.ok) throw new Error(`Calendar API ${r2.status}`);
    return r2.status === 204 ? null : await r2.json();
  }
  if (!r.ok) throw new Error(`Calendar API ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}

// 일정 추가
export async function addEvent({ dateKey, alarmHHMM, text }) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = alarmHHMM.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + 5 * 60 * 1000); // 5분 이벤트
  const event = {
    summary: text || "(스케줄러 알림)",
    description: "스케줄러에서 자동 추가됨",
    start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" },
    end:   { dateTime: end.toISOString(),   timeZone: "Asia/Seoul" },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 0 }],
    },
  };
  const r = await calApi("/calendars/primary/events", "POST", event);
  return r.id;
}

// 일정 수정
export async function updateEvent(eventId, { dateKey, alarmHHMM, text }) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = alarmHHMM.split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + 5 * 60 * 1000);
  const event = {
    summary: text || "(스케줄러 알림)",
    start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" },
    end:   { dateTime: end.toISOString(),   timeZone: "Asia/Seoul" },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 0 }],
    },
  };
  return await calApi(`/calendars/primary/events/${eventId}`, "PATCH", event);
}

// 일정 삭제
export async function deleteEvent(eventId) {
  try {
    await calApi(`/calendars/primary/events/${eventId}`, "DELETE");
  } catch (e) {
    console.warn("delete event failed", e);
  }
}
