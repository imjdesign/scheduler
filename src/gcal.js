// 구글 캘린더 연동
// Google Identity Services (GIS)로 OAuth 토큰을 받고
// Calendar API로 일정을 추가/수정/삭제한다.

const CLIENT_ID = "1017991240202-q7otj2dngmgimc7efcqod97561l8amk5.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_KEY = "gcal:token";

let tokenClient = null;
let gisLoaded = false;
let gisLoadPromise = null;

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

// 저장된 토큰 읽기
function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (Date.now() > t.expiresAt - 60000) return null; // 1분 마진
    return t;
  } catch { return null; }
}

function storeToken(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function isConnected() {
  return !!getStoredToken();
}

export function disconnect() {
  localStorage.removeItem(TOKEN_KEY);
}

// 사용자가 처음 한 번 누르는 "연결" — 권한 동의 창이 뜸
export async function connect() {
  await loadGIS();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) return reject(resp);
        const token = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in * 1000),
        };
        storeToken(token);
        resolve(token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// 만료된 토큰 갱신 (조용히)
async function refreshToken() {
  await loadGIS();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) return reject(resp);
        const token = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in * 1000),
        };
        storeToken(token);
        resolve(token);
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function getValidToken() {
  let t = getStoredToken();
  if (t) return t;
  return await refreshToken();
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
    disconnect();
    const nt = await refreshToken();
    opts.headers.Authorization = `Bearer ${nt.accessToken}`;
    const r2 = await fetch(`https://www.googleapis.com/calendar/v3${path}`, opts);
    if (!r2.ok) throw new Error(`Calendar API ${r2.status}`);
    return r2.status === 204 ? null : await r2.json();
  }
  if (!r.ok) throw new Error(`Calendar API ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : await r.json();
}

// 일정 추가
// dateKey: "2026-05-30", alarmHHMM: "15:00", text: "할 일 내용"
// 반환: 구글 이벤트 ID (스케줄러에 저장해두고 나중에 수정/삭제에 사용)
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
    // 이미 삭제된 경우 등은 무시
    console.warn("delete event failed", e);
  }
}
