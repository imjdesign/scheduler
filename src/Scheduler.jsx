import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Bell, Check, Settings, ArrowLeft } from "lucide-react";
import { loadDoc, saveDoc, subscribeDoc } from "./firebase.js";
import { connect as gcalConnect, isConnected as gcalIsConnected, disconnect as gcalDisconnect, addEvent as gcalAdd, updateEvent as gcalUpdate, deleteEvent as gcalDelete } from "./gcal.js";
import { loadHolidays } from "./holidays.js";

const fmtKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const startOfWeekMon = (d) => {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_PROJECTS = [
  { id: "p", code: "p", name: "프로젝트 P", color: "#2DAEDC" },
  { id: "g", code: "g", name: "프로젝트 G", color: "#7BC53E" },
  { id: "n", code: "n", name: "프로젝트 N", color: "#F5A03C" },
  { id: "wd", code: "wd", name: "프로젝트 WD", color: "#1E9D5A" },
  { id: "e", code: "e", name: "프로젝트 E", color: "#A4DCEE" },
  { id: "pe", code: "폐", name: "폐기", color: "#1A1A1A" },
];
const PALETTE = [
  "#FFFFFF", "#1A1A1A", "#8B5A3C", "#F8D4DC", "#EE4D8E", "#D8298E",
  "#1E9D5A", "#1FAA9A", "#A4DCEE", "#2DAEDC", "#2257C4", "#9B6CD4",
  "#7BC53E", "#D5DC22", "#FFCC22", "#F5A03C", "#EE6755", "#E73828",
];

const isLight = (hex) => {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
};

const BORDER = "#dcdcdc";
const Calendar = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export default function Scheduler() {
  const [baseAnchor, setBaseAnchor] = useState(() => startOfWeekMon(new Date()));
  const [data, setData] = useState({});
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pickerFor, setPickerFor] = useState(null);
  const [showProj, setShowProj] = useState(false);
  const [dayView, setDayView] = useState(null);
  const [blocksBack, setBlocksBack] = useState(1);
  const [blocksAhead, setBlocksAhead] = useState(3);
  const [showJump, setShowJump] = useState(false);
  const [viewMode, setViewMode] = useState("biweekly"); // "biweekly" | "monthly"
  const [monthAnchor, setMonthAnchor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [gcalLinked, setGcalLinked] = useState(false);
  const [holidays, setHolidays] = useState({}); // { "2026-05-05": "어린이날", ... }
  const sentinelTopRef = useRef(null);
  const sentinelBottomRef = useRef(null);

  // 초기 캘린더 연결 상태 확인
  useEffect(() => { setGcalLinked(gcalIsConnected()); }, []);

  // 화면에 보이는 기간(2주 모드: blocks 범위 + 월 모드: monthAnchor 전후)의 공휴일을 받아옴
  useEffect(() => {
    const months = new Set();
    if (viewMode === "biweekly") {
      // 2주 모드: 표시된 모든 블록의 시작/끝 달
      for (let i = -blocksBack; i < blocksAhead; i++) {
        const s = addDays(baseAnchor, i * 14);
        const e = addDays(s, 13);
        months.add(`${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`);
        months.add(`${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`);
      }
    } else {
      // 월 모드: 현재 달 + 앞뒤 1달
      for (let off = -1; off <= 1; off++) {
        const d = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + off, 1);
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
    }
    const list = Array.from(months).map((s) => {
      const [y, m] = s.split("-");
      return { year: y, month: m };
    });
    loadHolidays(list).then((map) => setHolidays((prev) => ({ ...prev, ...map })));
  }, [viewMode, baseAnchor, blocksBack, blocksAhead, monthAnchor]);

  useEffect(() => {
    (async () => {
      try {
        const v = await loadDoc("data");
        if (v) setData(v);
      } catch (e) { console.error("data load failed", e); }
      try {
        const v = await loadDoc("projects");
        if (v) setProjects(v);
      } catch (e) { console.error("projects load failed", e); }
      setLoaded(true);
    })();
    // 다른 기기에서 변경되면 자동 반영
    const unsub1 = subscribeDoc("data", (v) => { if (v) setData(v); });
    const unsub2 = subscribeDoc("projects", (v) => { if (v) setProjects(v); });
    return () => { unsub1(); unsub2(); };
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await saveDoc("data", next); } catch (e) { console.error("save failed", e); }
  }, []);
  const persistProj = useCallback(async (next) => {
    setProjects(next);
    try { await saveDoc("projects", next); } catch (e) { console.error("save failed", e); }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) return;
    const key = fmtKey(now);
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    (data[key] || []).forEach((it) => {
      if (it.alarm === hm && !it.done && !it._fired) {
        if (Notification.permission === "granted") {
          new Notification("할 일 알림", { body: it.text || "(내용 없음)" });
        }
        it._fired = true;
      }
    });
  }, [now, data]);

  // 무한 스크롤: 위/아래 sentinel이 보이면 자동으로 블록 추가
  useEffect(() => {
    const top = sentinelTopRef.current;
    const bottom = sentinelBottomRef.current;
    if (!top || !bottom) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        if (e.target === top) setBlocksBack((b) => b + 1);
        if (e.target === bottom) setBlocksAhead((a) => a + 1);
      });
    }, { rootMargin: "200px" });
    obs.observe(top);
    obs.observe(bottom);
    return () => obs.disconnect();
  }, [loaded]);

  const todayKey = fmtKey(new Date());
  const projOf = (pid) => projects.find((p) => p.id === pid);

  const update = (key, items) => persist({ ...data, [key]: items });
  const addRow = (key) => update(key, [...(data[key] || []), { id: uid(), text: "", done: false, alarm: "", proj: "", gcalId: "" }]);

  // 캘린더 동기화 헬퍼 — 알림 시간/내용이 바뀐 줄에 대해 캘린더 일정을 자동 추가/수정/삭제
  const syncGcal = async (key, before, after) => {
    if (!gcalIsConnected()) return null; // 연결 안 됐으면 그냥 패스
    const hadAlarm = !!(before && before.alarm);
    const hasAlarm = !!(after.alarm);
    try {
      // 1) 새로 알림이 생긴 경우 → 추가
      if (!hadAlarm && hasAlarm) {
        const eventId = await gcalAdd({ dateKey: key, alarmHHMM: after.alarm, text: after.text });
        return eventId;
      }
      // 2) 알림이 사라진 경우 → 삭제
      if (hadAlarm && !hasAlarm && before.gcalId) {
        await gcalDelete(before.gcalId);
        return "";
      }
      // 3) 알림이 있고 내용/시간이 바뀐 경우 → 수정
      if (hadAlarm && hasAlarm && before.gcalId) {
        if (before.alarm !== after.alarm || before.text !== after.text) {
          await gcalUpdate(before.gcalId, { dateKey: key, alarmHHMM: after.alarm, text: after.text });
        }
        return before.gcalId;
      }
      // 4) 변화 없음 (기존 gcalId 유지)
      return before ? before.gcalId : "";
    } catch (e) {
      console.error("캘린더 동기화 실패", e);
      return before ? before.gcalId : "";
    }
  };

  const editRow = async (key, id, patch) => {
    const items = data[key] || [];
    const before = items.find((it) => it.id === id);
    if (!before) return;
    const after = { ...before, ...patch, _fired: false };
    // 캘린더에 미리 보내고 그 결과(gcalId)를 함께 저장
    const gcalId = await syncGcal(key, before, after);
    after.gcalId = gcalId || "";
    update(key, items.map((it) => (it.id === id ? after : it)));
  };

  const delRow = async (key, id) => {
    const items = data[key] || [];
    const before = items.find((it) => it.id === id);
    if (before && before.gcalId && gcalIsConnected()) {
      try { await gcalDelete(before.gcalId); } catch (e) { console.warn(e); }
    }
    update(key, items.filter((it) => it.id !== id));
  };

  // 캘린더 연결 / 해제
  const linkGcal = async () => {
    try {
      await gcalConnect();
      setGcalLinked(true);
      alert("구글 캘린더와 연결되었어요. 이제 알림 시간을 입력하면 자동으로 캘린더에 일정이 추가됩니다.");
    } catch (e) {
      alert("연결에 실패했어요. 다시 시도해 주세요.");
      console.error(e);
    }
  };
  const unlinkGcal = () => {
    if (!confirm("캘린더 연결을 해제할까요? 이미 추가된 일정은 캘린더에 남아있습니다.")) return;
    gcalDisconnect();
    setGcalLinked(false);
  };

  const askNotif = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  };

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: "monospace", color: "#888" }}>불러오는 중…</div>;
  }

  const blocks = [];
  for (let i = -blocksBack; i < blocksAhead; i++) {
    blocks.push(addDays(baseAnchor, i * 14));
  }

  return (
    <div style={S.wrap}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .scroll::-webkit-scrollbar { display: none; height: 0; width: 0; }
        .row-in { animation: ri .18s ease; }
        @keyframes ri { from {opacity:0;} to {opacity:1;} }
        input::placeholder, textarea::placeholder { color: #bbb; }
        .dnum-btn:hover { background:#f2f2f2; }
      `}</style>

      <header style={S.header}>
        <div>
          <h1 style={S.title}>Daily Prime</h1>
        </div>
        <div style={S.nav}>
          <div style={S.toggle}>
            <button style={{ ...S.toggleBtn, ...(viewMode === "biweekly" ? S.toggleOn : {}) }}
              onClick={() => setViewMode("biweekly")}>2주</button>
            <button style={{ ...S.toggleBtn, ...(viewMode === "monthly" ? S.toggleOn : {}) }}
              onClick={() => setViewMode("monthly")}>한 달</button>
          </div>
          {viewMode === "biweekly" ? (
            <button style={S.todayBtn} onClick={() => setBaseAnchor(startOfWeekMon(new Date()))}>오늘</button>
          ) : (
            <button style={S.todayBtn} onClick={() => { const d = new Date(); setMonthAnchor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>오늘</button>
          )}
          <button style={S.navBtn} onClick={() => setShowJump(true)} title="날짜로 점프"><Calendar size={17} /></button>
          <button style={{ ...S.navBtn, ...(gcalLinked ? S.navBtnOn : {}) }}
            onClick={gcalLinked ? unlinkGcal : linkGcal}
            title={gcalLinked ? "구글 캘린더 연결 해제" : "구글 캘린더 연결"}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="15" r="2.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button style={S.navBtn} onClick={() => setShowProj(true)} title="프로젝트 관리">
            <Settings size={17} />
          </button>
        </div>
      </header>

      {!gcalLinked && (
        <div style={S.banner}>
          알림 시간을 폰 알림으로 받으려면 <button style={S.bannerBtn} onClick={linkGcal}>구글 캘린더 연결</button> 한 번만 눌러주세요.
        </div>
      )}

      <div style={S.legend}>
        {projects.map((p) => (
          <span key={p.id} style={S.legendItem}>
            <span style={{ ...S.legendChip, background: p.color, color: isLight(p.color) ? "#333" : "#fff" }}>{p.code}</span>
            <span style={S.legendName}>{p.name}</span>
          </span>
        ))}
      </div>

      {viewMode === "biweekly" && (
        <>
          <div ref={sentinelTopRef} style={S.sentinel}>↑ 지난 일정 불러오는 중…</div>

          {blocks.map((blockStart) => {
            const days = Array.from({ length: 14 }, (_, i) => addDays(blockStart, i));
            const label = `${fmtKey(days[0]).replace(/-/g, ".").slice(2)} ~ ${fmtKey(days[13]).replace(/-/g, ".").slice(5)}`;
            const isCurrent = fmtKey(blockStart) === fmtKey(baseAnchor);
            return (
              <section key={fmtKey(blockStart)} style={S.block}>
                <div style={S.blockHead}>
                  <span style={S.blockLabel}>{label}</span>
                  {isCurrent && <span style={S.nowTag}>이번 2주</span>}
                </div>
                <div style={S.scroll} className="scroll">
                  <div style={S.cols}>
                    {days.map((d) => {
                      const k = fmtKey(d);
                      const items = data[k] || [];
                      const isToday = k === todayKey;
                      const wend = d.getDay() === 0 || d.getDay() === 6;
                      const holiday = holidays[k];
                      const isRed = wend || !!holiday;
                      return (
                        <div key={k} style={{ ...S.col, ...(isToday ? S.colToday : {}) }}>
                          <button className="dnum-btn" style={S.colHead} onClick={() => setDayView(k)} title={holiday || "이 날 하루만 보기"}>
                            <span style={{ ...S.dow, color: isRed ? "#c0392b" : "#999" }}>{DOW[d.getDay()]}</span>
                            <span style={{ ...S.dnum, ...(isToday ? { color: "#2563eb" } : (holiday ? { color: "#c0392b" } : {})) }}>{d.getDate()}</span>
                            <span style={S.mon}>{d.getMonth() + 1}월</span>
                            {holiday && <span style={S.holiday}>{holiday}</span>}
                          </button>
                          <div style={S.colBody}>
                            {items.map((it) => (
                              <TaskRow key={it.id} it={it} k={k} projOf={projOf} projects={projects}
                                pickerFor={pickerFor} setPickerFor={setPickerFor}
                                editRow={editRow} delRow={delRow} askNotif={askNotif} />
                            ))}
                            <button style={S.add} onClick={() => addRow(k)}><Plus size={13} /> 추가</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}

          <div ref={sentinelBottomRef} style={S.sentinel}>↓ 다음 일정 불러오는 중…</div>
        </>
      )}

      {viewMode === "monthly" && (
        <MonthView
          monthAnchor={monthAnchor}
          setMonthAnchor={setMonthAnchor}
          data={data}
          projOf={projOf}
          todayKey={todayKey}
          holidays={holidays}
          onDayClick={(k) => setDayView(k)}
        />
      )}

      <p style={S.foot}>{viewMode === "biweekly"
        ? "위/아래로 스크롤하면 자동으로 이어집니다. 각 2주 안에서는 좌우로 넘겨보세요. 날짜 숫자를 누르면 그 하루만 크게 볼 수 있어요."
        : "한 달이 한눈에 보입니다. 각 날짜를 누르면 그 하루만 크게 볼 수 있어요."}</p>

      {showJump && (
        <JumpModal currentAnchor={baseAnchor} onClose={() => setShowJump(false)}
          onJump={(target) => {
            const newAnchor = startOfWeekMon(target);
            setBaseAnchor(newAnchor);
            setBlocksBack(1);
            setBlocksAhead(3);
            setShowJump(false);
            setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
          }} />
      )}

      {showProj && <ProjectManager projects={projects} setProjects={persistProj} onClose={() => setShowProj(false)} />}

      {dayView && (
        <DayView dateKey={dayView} items={data[dayView] || []} projOf={projOf} projects={projects}
          addRow={addRow} editRow={editRow} delRow={delRow} askNotif={askNotif}
          pickerFor={pickerFor} setPickerFor={setPickerFor} onClose={() => setDayView(null)} />
      )}
    </div>
  );
}

function TaskRow({ it, k, projOf, projects, pickerFor, setPickerFor, editRow, delRow, askNotif, big }) {
  const p = projOf(it.proj);
  return (
    <div className="row-in" style={{ ...S.task, ...(big ? S.taskBig : {}) }}>
      <div style={S.taskTop}>
        <button
          style={{
            ...S.projChip,
            background: p ? p.color : "#fff",
            color: p ? (isLight(p.color) ? "#333" : "#fff") : "#bbb",
            border: p ? "none" : "1px solid #d8d8d8",
          }}
          onClick={() => setPickerFor(pickerFor && pickerFor.id === it.id ? null : { key: k, id: it.id })}
          title="프로젝트 선택"
        >
          {p ? p.code : "+"}
        </button>
        <button onClick={() => editRow(k, it.id, { done: !it.done })} style={{ ...S.check, ...(it.done ? S.checkOn : {}) }}>
          {it.done && <Check size={11} />}
        </button>
        <label style={{ ...S.alarm, ...(it.alarm ? S.alarmOn : {}) }}>
          <Bell size={11} />
          <input type="time" value={it.alarm} style={S.time}
            onChange={(e) => { editRow(k, it.id, { alarm: e.target.value }); askNotif(); }} />
        </label>
        <button style={S.del} onClick={() => delRow(k, it.id)}><X size={13} /></button>
      </div>

      {pickerFor && pickerFor.key === k && pickerFor.id === it.id && (
        <div style={S.picker}>
          {projects.map((pp) => (
            <button key={pp.id} style={{ ...S.pickItem, background: pp.color, color: isLight(pp.color) ? "#333" : "#fff" }}
              onClick={() => { editRow(k, it.id, { proj: pp.id }); setPickerFor(null); }}>
              {pp.code}
            </button>
          ))}
          <button style={S.pickClear} onClick={() => { editRow(k, it.id, { proj: "" }); setPickerFor(null); }}>없음</button>
        </div>
      )}

      <textarea
        rows={1}
        ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
        style={{ ...S.text, ...(it.done ? S.textDone : {}), ...(big ? { fontSize: 15.5 } : {}) }}
        value={it.text}
        placeholder="할 일…"
        onChange={(e) => {
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
          editRow(k, it.id, { text: e.target.value });
        }}
      />
    </div>
  );
}

function MonthView({ monthAnchor, setMonthAnchor, data, projOf, todayKey, holidays, onDayClick }) {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth(); // 0-11
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // 월요일 시작 그리드: 1일이 무슨 요일인지로 앞 빈칸 계산
  const startOffset = (firstDay.getDay() + 6) % 7; // 월=0, 화=1, ... 일=6
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      cells.push(new Date(year, month, dayNum));
    }
  }

  const goPrev = () => setMonthAnchor(new Date(year, month - 1, 1));
  const goNext = () => setMonthAnchor(new Date(year, month + 1, 1));

  return (
    <section style={MV.wrap}>
      <div style={MV.head}>
        <button style={MV.navBtn} onClick={goPrev}>‹</button>
        <h2 style={MV.title}>{year}년 {month + 1}월</h2>
        <button style={MV.navBtn} onClick={goNext}>›</button>
      </div>
      <div style={MV.dowRow}>
        {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
          <div key={d} style={{ ...MV.dowCell, color: i >= 5 ? "#c0392b" : "#999" }}>{d}</div>
        ))}
      </div>
      <div style={MV.grid}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} style={{ ...MV.cell, ...MV.cellEmpty }} />;
          const k = fmtKey(d);
          const items = (data[k] || []).filter((it) => it.text.trim());
          const isToday = k === todayKey;
          const wend = d.getDay() === 0 || d.getDay() === 6;
          const holiday = holidays && holidays[k];
          const isRed = wend || !!holiday;
          return (
            <button key={k} style={{ ...MV.cell, ...(isToday ? MV.cellToday : {}) }} onClick={() => onDayClick(k)}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ ...MV.cellNum, color: isToday ? "#2563eb" : isRed ? "#c0392b" : "#2a2a2a" }}>{d.getDate()}</span>
                {holiday && <span style={MV.cellHoliday}>{holiday}</span>}
              </div>
              <div style={MV.cellTasks}>
                {items.slice(0, 3).map((it) => {
                  const p = projOf(it.proj);
                  return (
                    <div key={it.id} style={MV.taskMini}>
                      {p && <span style={{ ...MV.miniChip, background: p.color, color: isLight(p.color) ? "#333" : "#fff" }}>{p.code}</span>}
                      <span style={{ ...MV.miniText, ...(it.done ? { textDecoration: "line-through", color: "#bbb" } : {}) }}>
                        {it.alarm ? `${it.alarm} ` : ""}{it.text}
                      </span>
                    </div>
                  );
                })}
                {items.length > 3 && <div style={MV.more}>+{items.length - 3}개 더</div>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DayView({ dateKey, items, projOf, projects, addRow, editRow, delRow, askNotif, pickerFor, setPickerFor, onClose }) {
  const d = new Date(dateKey);
  return (
    <div style={DV.overlay}>
      <div style={DV.panel}>
        <div style={DV.head}>
          <button style={DV.back} onClick={onClose}><ArrowLeft size={18} /> 달력으로</button>
          <div style={DV.dateBig}>
            <span style={DV.dvNum}>{d.getMonth() + 1}월 {d.getDate()}일</span>
            <span style={DV.dvDow}>{DOW[d.getDay()]}요일</span>
          </div>
        </div>
        <div style={DV.body}>
          {items.map((it) => (
            <TaskRow key={it.id} it={it} k={dateKey} projOf={projOf} projects={projects} big
              pickerFor={pickerFor} setPickerFor={setPickerFor}
              editRow={editRow} delRow={delRow} askNotif={askNotif} />
          ))}
          {items.length === 0 && <div style={DV.empty}>아직 할 일이 없어요.</div>}
          <button style={DV.add} onClick={() => addRow(dateKey)}><Plus size={16} /> 할 일 추가</button>
        </div>
      </div>
    </div>
  );
}

function JumpModal({ currentAnchor, onClose, onJump }) {
  const [year, setYear] = useState(currentAnchor.getFullYear());
  const [month, setMonth] = useState(currentAnchor.getMonth() + 1);
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear - 5; y <= thisYear + 15; y++) years.push(y);
  return (
    <div style={JM.overlay} onClick={onClose}>
      <div style={JM.modal} onClick={(e) => e.stopPropagation()}>
        <div style={JM.head}>
          <h2 style={JM.title}>날짜로 이동</h2>
          <button style={JM.x} onClick={onClose}><X size={20} /></button>
        </div>
        <div style={JM.row}>
          <label style={JM.label}>년도</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={JM.sel}>
            {years.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div style={JM.row}>
          <label style={JM.label}>월</label>
          <div style={JM.months}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} onClick={() => setMonth(m)}
                style={{ ...JM.mBtn, ...(month === m ? JM.mBtnOn : {}) }}>{m}월</button>
            ))}
          </div>
        </div>
        <div style={JM.footer}>
          <button style={JM.cancel} onClick={onClose}>취소</button>
          <button style={JM.go} onClick={() => onJump(new Date(year, month - 1, 1))}>이동</button>
        </div>
      </div>
    </div>
  );
}

function ProjectManager({ projects, setProjects, onClose }) {
  const [list, setList] = useState(projects);
  const save = () => { setProjects(list.filter((p) => p.code.trim())); onClose(); };
  const edit = (id, patch) => setList(list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addP = () => setList([...list, { id: uid(), code: "", name: "", color: PALETTE[list.length % PALETTE.length] }]);
  const del = (id) => setList(list.filter((p) => p.id !== id));

  return (
    <div style={MS.overlay}>
      <div style={MS.modal}>
        <div style={MS.headM}>
          <h2 style={MS.title}>프로젝트 관리</h2>
          <button style={MS.x} onClick={onClose}><X size={20} /></button>
        </div>
        <p style={MS.hint}>코드는 할 일 옆에 표시되는 약자예요. 색을 눌러 바꾸고, 프로젝트는 얼마든지 추가할 수 있어요.</p>
        <div style={MS.rows}>
          {list.map((p) => (
            <div key={p.id} style={MS.row}>
              <input style={{ ...MS.codeIn, background: p.color, color: isLight(p.color) ? "#333" : "#fff" }}
                value={p.code} maxLength={3} placeholder="약자" onChange={(e) => edit(p.id, { code: e.target.value })} />
              <input style={MS.nameIn} value={p.name} placeholder="프로젝트 이름" onChange={(e) => edit(p.id, { name: e.target.value })} />
              <div style={MS.swatches}>
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => edit(p.id, { color: c })}
                    style={{ ...MS.sw, background: c, outline: p.color === c ? "2px solid #555" : "none", outlineOffset: 1, border: c === "#FFFFFF" ? "0.5px solid #ddd" : "none" }} />
                ))}
                <label style={MS.picker} title="직접 색 고르기">
                  <input type="color" value={p.color} onChange={(e) => edit(p.id, { color: e.target.value })}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
                  <Plus size={11} />
                </label>
              </div>
              <button style={MS.del} onClick={() => del(p.id)}><X size={16} /></button>
            </div>
          ))}
        </div>
        <button style={MS.addP} onClick={addP}><Plus size={15} /> 프로젝트 추가</button>
        <div style={MS.footer}>
          <button style={MS.cancel} onClick={onClose}>취소</button>
          <button style={MS.save} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  wrap: { maxWidth: "none", margin: 0, padding: "26px 28px 44px", fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", color: "#3a3a3a", background: "#fff", minHeight: "100%" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  kicker: { fontSize: 12, letterSpacing: 4, color: "#999", fontWeight: 600 },
  title: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 34, margin: "2px 0 0", color: "#2a2a2a", fontWeight: 600 },
  nav: { display: "flex", alignItems: "center", gap: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#666", cursor: "pointer", display: "grid", placeItems: "center" },
  navBtnOn: { background: "#2a2a2a", color: "#fff", border: "1px solid #2a2a2a" },
  legend: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, padding: "10px 12px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 0 },
  banner: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 14px", background: "#fffaf2", border: "1px solid #f0d8b0", borderRadius: 0, marginBottom: 12, fontSize: 13, color: "#7a5a20" },
  bannerBtn: { padding: "5px 12px", borderRadius: 0, border: "none", background: "#3a2f1e", color: "#fff", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit" },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendChip: { minWidth: 22, height: 20, padding: "0 5px", borderRadius: 0, fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" },
  legendName: { fontSize: 12, color: "#666" },
  todayBtn: { padding: "7px 14px", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#444", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  sentinel: { textAlign: "center", padding: "12px 0", fontSize: 11.5, color: "#bbb", fontFamily: "inherit" },
  block: { marginBottom: 26 },
  blockHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` },
  blockLabel: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: "-0.01em" },
  nowTag: { fontSize: 11, background: "#2a2a2a", color: "#fff", padding: "3px 9px", borderRadius: 0 },
  scroll: { overflowX: "auto", paddingBottom: 0 },
  cols: { display: "flex", gap: 9, minWidth: "min-content" },
  col: { width: 230, flexShrink: 0, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 0, overflow: "hidden", display: "flex", flexDirection: "column" },
  colToday: { border: "1.5px solid #2563eb" },
  colHead: { display: "flex", alignItems: "baseline", gap: 5, padding: "8px 10px", background: "#fff", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER, borderTop: "none", borderLeft: "none", borderRight: "none", cursor: "pointer", width: "100%", fontFamily: "inherit", textAlign: "left" },
  dow: { fontSize: 11.5 },
  dnum: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", color: "#2a2a2a" },
  mon: { fontSize: 10, color: "#aaa" },
  holiday: { fontSize: 10, color: "#c0392b", marginLeft: 4, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 },
  colBody: { padding: 8, display: "flex", flexDirection: "column", gap: 7, minHeight: 110 },
  task: { position: "relative", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 0, padding: "6px 7px" },
  taskBig: { padding: "10px 12px", borderRadius: 0 },
  taskTop: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 },
  projChip: { minWidth: 22, height: 20, padding: "0 5px", borderRadius: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 },
  check: { width: 20, height: 20, borderRadius: 0, border: `2px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 },
  checkOn: { background: "#7a9a5b", border: "2px solid #7a9a5b" },
  alarm: { display: "inline-flex", alignItems: "center", gap: 2, marginLeft: "auto", padding: "2px 5px", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#bbb", flexShrink: 0 },
  alarmOn: { color: "#2563eb", borderColor: "#9bb6e8", background: "#fff" },
  time: { border: "none", background: "transparent", fontSize: 12, color: "inherit", outline: "none", width: 78, fontFamily: "inherit" },
  del: { width: 20, height: 20, borderRadius: 0, border: "none", background: "transparent", color: "#ccc", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 },
  picker: { position: "absolute", zIndex: 20, top: 30, left: 6, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 0, padding: 7, display: "flex", flexWrap: "wrap", gap: 5, width: 150, boxShadow: "0 8px 22px rgba(0,0,0,.12)" },
  pickItem: { minWidth: 26, height: 24, padding: "0 6px", borderRadius: 0, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer" },
  pickClear: { width: "100%", padding: "5px", borderRadius: 0, border: `1px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", fontSize: 11, fontFamily: "inherit" },
  text: { width: "100%", border: "none", background: "transparent", fontSize: 13.5, color: "#3a3a3a", outline: "none", fontFamily: "inherit", resize: "none", lineHeight: 1.35, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  textDone: { textDecoration: "line-through", color: "#bbb" },
  add: { alignSelf: "stretch", padding: "5px", borderRadius: 0, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontFamily: "inherit" },
  foot: { marginTop: 16, fontSize: 12.5, color: "#aaa", lineHeight: 1.6, textAlign: "center" },
};

const DV = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 90, padding: 16 },
  panel: { width: "100%", maxWidth: 540, maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 0, border: `1px solid ${BORDER}`, fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif" },
  head: { display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#fff", zIndex: 2 },
  back: { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flexShrink: 0 },
  dateBig: { display: "flex", alignItems: "baseline", gap: 8 },
  dvNum: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", color: "#2a2a2a" },
  dvDow: { fontSize: 14, color: "#999" },
  body: { padding: "16px 20px 22px", display: "flex", flexDirection: "column", gap: 9 },
  empty: { textAlign: "center", color: "#bbb", padding: "20px 0", fontSize: 14 },
  add: { marginTop: 4, padding: "11px", borderRadius: 0, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, fontFamily: "inherit" },
};

const MS = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 },
  modal: { width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", background: "#fff", borderRadius: 0, padding: "22px 22px 18px", fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", border: `1px solid ${BORDER}` },
  headM: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 22, margin: 0, color: "#2a2a2a" },
  x: { border: "none", background: "transparent", color: "#999", cursor: "pointer" },
  hint: { fontSize: 12.5, color: "#aaa", margin: "0 0 16px", lineHeight: 1.5 },
  rows: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  codeIn: { width: 52, height: 34, borderRadius: 0, border: "none", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none" },
  nameIn: { flex: 1, minWidth: 110, height: 34, borderRadius: 0, border: `1px solid ${BORDER}`, padding: "0 10px", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff" },
  swatches: { display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 },
  sw: { width: 20, height: 20, borderRadius: 0, border: "none", cursor: "pointer", padding: 0 },
  picker: { position: "relative", width: 20, height: 20, border: "1px dashed #bbb", display: "grid", placeItems: "center", color: "#888", cursor: "pointer", background: "#fff" },
  del: { width: 30, height: 30, borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#999", cursor: "pointer", display: "grid", placeItems: "center" },
  addP: { marginTop: 14, width: "100%", padding: "10px", borderRadius: 0, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13.5, fontFamily: "inherit" },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancel: { padding: "9px 18px", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#444", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
  save: { padding: "9px 20px", borderRadius: 0, border: "none", background: "#2a2a2a", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
};

const JM = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 95, padding: 16 },
  modal: { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 0, padding: "22px 22px 18px", fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif", border: `1px solid ${BORDER}` },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 20, margin: 0, color: "#2a2a2a" },
  x: { border: "none", background: "transparent", color: "#999", cursor: "pointer" },
  row: { marginBottom: 14 },
  label: { display: "block", fontSize: 12, color: "#888", marginBottom: 6 },
  sel: { width: "100%", height: 36, borderRadius: 0, border: `1px solid ${BORDER}`, padding: "0 10px", background: "#fff", fontFamily: "inherit", fontSize: 14, color: "#333" },
  months: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 },
  mBtn: { padding: "8px 0", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  mBtnOn: { background: "#2a2a2a", color: "#fff", border: "1px solid #2a2a2a" },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  cancel: { padding: "9px 18px", borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#444", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
  go: { padding: "9px 22px", borderRadius: 0, border: "none", background: "#2a2a2a", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
};

// 토글 + 월 보기 스타일
S.toggle = { display: "flex", border: `1px solid ${BORDER}`, borderRadius: 0, overflow: "hidden", marginRight: 4 };
S.toggleBtn = { padding: "6px 12px", border: "none", background: "#fff", color: "#666", cursor: "pointer", fontSize: 13, fontFamily: "inherit" };
S.toggleOn = { background: "#2a2a2a", color: "#fff" };

const MV = {
  wrap: { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 0, padding: "18px 18px 20px", marginBottom: 20 },
  head: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 },
  navBtn: { width: 32, height: 32, borderRadius: 0, border: `1px solid ${BORDER}`, background: "#fff", color: "#666", cursor: "pointer", fontSize: 18, fontFamily: "inherit" },
  title: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 22, margin: 0, color: "#2a2a2a", minWidth: 140, textAlign: "center" },
  dowRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 },
  dowCell: { textAlign: "center", fontSize: 11, padding: "4px 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  cell: { minHeight: 96, padding: "6px 7px", border: `1px solid ${BORDER}`, borderRadius: 0, background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" },
  cellEmpty: { background: "#fafafa", cursor: "default", border: "1px solid #eee" },
  cellToday: { border: "1.5px solid #2563eb", background: "#eff5ff" },
  cellNum: { fontFamily: "'Inter', 'Pretendard', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 },
  cellHoliday: { fontSize: 9.5, color: "#c0392b", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 },
  cellTasks: { display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" },
  taskMini: { display: "flex", alignItems: "center", gap: 3, fontSize: 11, lineHeight: 1.2, overflow: "hidden" },
  miniChip: { minWidth: 16, height: 14, padding: "0 3px", borderRadius: 0, fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0 },
  miniText: { color: "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  more: { fontSize: 10, color: "#999", marginTop: 1 },
};
