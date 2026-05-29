import { useState, useEffect, useCallback } from "react";
import { Plus, X, Bell, Check, Settings, ArrowLeft } from "lucide-react";

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
  { id: "p", code: "p", name: "프로젝트 P", color: "#4a90e2" },
  { id: "g", code: "g", name: "프로젝트 G", color: "#9acd5b" },
  { id: "n", code: "n", name: "프로젝트 N", color: "#f0a08a" },
  { id: "wd", code: "wd", name: "프로젝트 WD", color: "#2e8b57" },
  { id: "e", code: "e", name: "프로젝트 E", color: "#a8d4f0" },
  { id: "pe", code: "폐", name: "폐기", color: "#2c3e6b" },
];
const PALETTE = ["#4a90e2", "#9acd5b", "#f0a08a", "#2e8b57", "#a8d4f0", "#2c3e6b",
  "#e2725b", "#d4a017", "#9b59b6", "#16a085", "#c0392b", "#34495e", "#e84393", "#7f8c8d"];

const isLight = (hex) => {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
};

const BORDER = "#dcdcdc";
const BLOCKS_AHEAD = 8;

export default function Scheduler() {
  const [baseAnchor] = useState(() => startOfWeekMon(new Date()));
  const [data, setData] = useState({});
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pickerFor, setPickerFor] = useState(null);
  const [showProj, setShowProj] = useState(false);
  const [dayView, setDayView] = useState(null);
  const [blocksBack, setBlocksBack] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const r = { value: localStorage.getItem("scheduler:data") };
        if (r && r.value) setData(JSON.parse(r.value));
      } catch (e) {}
      try {
        const p = { value: localStorage.getItem("scheduler:projects") };
        if (p && p.value) setProjects(JSON.parse(p.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { localStorage.setItem("scheduler:data", JSON.stringify(next)); } catch (e) {}
  }, []);
  const persistProj = useCallback(async (next) => {
    setProjects(next);
    try { localStorage.setItem("scheduler:projects", JSON.stringify(next)); } catch (e) {}
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

  const todayKey = fmtKey(new Date());
  const projOf = (pid) => projects.find((p) => p.id === pid);

  const update = (key, items) => persist({ ...data, [key]: items });
  const addRow = (key) => update(key, [...(data[key] || []), { id: uid(), text: "", done: false, alarm: "", proj: "" }]);
  const editRow = (key, id, patch) => update(key, (data[key] || []).map((it) => (it.id === id ? { ...it, ...patch, _fired: false } : it)));
  const delRow = (key, id) => update(key, (data[key] || []).filter((it) => it.id !== id));

  const askNotif = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  };

  if (!loaded) {
    return <div style={{ padding: 40, fontFamily: "monospace", color: "#888" }}>불러오는 중…</div>;
  }

  const blocks = [];
  for (let i = -blocksBack; i < BLOCKS_AHEAD; i++) {
    blocks.push(addDays(baseAnchor, i * 14));
  }

  return (
    <div style={S.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
        * { box-sizing: border-box; }
        .scroll::-webkit-scrollbar { height: 9px; }
        .scroll::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 5px; }
        .row-in { animation: ri .18s ease; }
        @keyframes ri { from {opacity:0;} to {opacity:1;} }
        input::placeholder, textarea::placeholder { color: #bbb; }
        .dnum-btn:hover { background:#f2f2f2; }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.kicker}>TWO·WEEK</div>
          <h1 style={S.title}>스케줄러</h1>
        </div>
        <div style={S.nav}>
          <button style={S.navBtn} onClick={() => setShowProj(true)} title="프로젝트 관리">
            <Settings size={17} />
          </button>
        </div>
      </header>

      <div style={S.legend}>
        {projects.map((p) => (
          <span key={p.id} style={S.legendItem}>
            <span style={{ ...S.legendChip, background: p.color, color: isLight(p.color) ? "#333" : "#fff" }}>{p.code}</span>
            <span style={S.legendName}>{p.name}</span>
          </span>
        ))}
      </div>

      <button style={S.loadMore} onClick={() => setBlocksBack(blocksBack + 1)}>↑ 지난 2주 더 보기</button>

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
                  return (
                    <div key={k} style={{ ...S.col, ...(isToday ? S.colToday : {}) }}>
                      <button className="dnum-btn" style={S.colHead} onClick={() => setDayView(k)} title="이 날 하루만 보기">
                        <span style={{ ...S.dow, color: wend ? "#c0613f" : "#999" }}>{DOW[d.getDay()]}</span>
                        <span style={{ ...S.dnum, ...(isToday ? { color: "#c0613f" } : {}) }}>{d.getDate()}</span>
                        <span style={S.mon}>{d.getMonth() + 1}월</span>
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

      <p style={S.foot}>아래로 스크롤하면 다음 2주가 이어집니다. 각 2주 안에서는 좌우로 넘겨보세요. 날짜 숫자를 누르면 그 하루만 크게 볼 수 있어요.</p>

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
                    style={{ ...MS.sw, background: c, outline: p.color === c ? "2px solid #555" : "none", outlineOffset: 1 }} />
                ))}
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
  wrap: { maxWidth: 1100, margin: "0 auto", padding: "26px 18px 44px", fontFamily: "'Gowun Dodum', sans-serif", color: "#3a3a3a", background: "#fff", minHeight: "100%" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  kicker: { fontSize: 12, letterSpacing: 4, color: "#999", fontWeight: 600 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 34, margin: "2px 0 0", color: "#2a2a2a", fontWeight: 600 },
  nav: { display: "flex", alignItems: "center", gap: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: "#666", cursor: "pointer", display: "grid", placeItems: "center" },
  legend: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, padding: "10px 12px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12 },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendChip: { minWidth: 22, height: 20, padding: "0 5px", borderRadius: 5, fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" },
  legendName: { fontSize: 12, color: "#666" },
  loadMore: { display: "block", margin: "0 auto 14px", padding: "7px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: "#888", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit" },
  block: { marginBottom: 26 },
  blockHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` },
  blockLabel: { fontFamily: "'Fraunces', serif", fontSize: 16, color: "#555" },
  nowTag: { fontSize: 11, background: "#2a2a2a", color: "#fff", padding: "3px 9px", borderRadius: 7 },
  scroll: { overflowX: "auto", paddingBottom: 8 },
  cols: { display: "flex", gap: 9, minWidth: "min-content" },
  col: { width: 180, flexShrink: 0, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 13, overflow: "hidden", display: "flex", flexDirection: "column" },
  colToday: { border: "1.5px solid #c0613f" },
  colHead: { display: "flex", alignItems: "baseline", gap: 5, padding: "8px 10px", background: "#fff", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER, borderTop: "none", borderLeft: "none", borderRight: "none", cursor: "pointer", width: "100%", fontFamily: "inherit", textAlign: "left" },
  dow: { fontSize: 11.5 },
  dnum: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: "#2a2a2a" },
  mon: { fontSize: 10, color: "#aaa" },
  colBody: { padding: 8, display: "flex", flexDirection: "column", gap: 7, minHeight: 110 },
  task: { position: "relative", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "6px 7px" },
  taskBig: { padding: "10px 12px", borderRadius: 11 },
  taskTop: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 },
  projChip: { minWidth: 22, height: 20, padding: "0 5px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 },
  check: { width: 20, height: 20, borderRadius: 5, border: `2px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#fff", flexShrink: 0 },
  checkOn: { background: "#7a9a5b", border: "2px solid #7a9a5b" },
  alarm: { display: "inline-flex", alignItems: "center", gap: 2, marginLeft: "auto", padding: "2px 5px", borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: "#bbb", flexShrink: 0 },
  alarmOn: { color: "#c0613f", borderColor: "#e7b79c", background: "#fff" },
  time: { border: "none", background: "transparent", fontSize: 11, color: "inherit", outline: "none", width: 52, fontFamily: "inherit" },
  del: { width: 20, height: 20, borderRadius: 5, border: "none", background: "transparent", color: "#ccc", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 },
  picker: { position: "absolute", zIndex: 20, top: 30, left: 6, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 9, padding: 7, display: "flex", flexWrap: "wrap", gap: 5, width: 150, boxShadow: "0 8px 22px rgba(0,0,0,.12)" },
  pickItem: { minWidth: 26, height: 24, padding: "0 6px", borderRadius: 5, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer" },
  pickClear: { width: "100%", padding: "5px", borderRadius: 5, border: `1px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", fontSize: 11, fontFamily: "inherit" },
  text: { width: "100%", border: "none", background: "transparent", fontSize: 13.5, color: "#3a3a3a", outline: "none", fontFamily: "inherit", resize: "none", lineHeight: 1.35, overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  textDone: { textDecoration: "line-through", color: "#bbb" },
  add: { alignSelf: "stretch", padding: "5px", borderRadius: 8, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontFamily: "inherit" },
  foot: { marginTop: 16, fontSize: 12.5, color: "#aaa", lineHeight: 1.6, textAlign: "center" },
};

const DV = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 90, padding: 16 },
  panel: { width: "100%", maxWidth: 540, maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 18, border: `1px solid ${BORDER}`, fontFamily: "'Gowun Dodum', sans-serif" },
  head: { display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#fff", zIndex: 2 },
  back: { display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: `1px solid ${BORDER}`, background: "#fff", color: "#555", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flexShrink: 0 },
  dateBig: { display: "flex", alignItems: "baseline", gap: 8 },
  dvNum: { fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#2a2a2a" },
  dvDow: { fontSize: 14, color: "#999" },
  body: { padding: "16px 20px 22px", display: "flex", flexDirection: "column", gap: 9 },
  empty: { textAlign: "center", color: "#bbb", padding: "20px 0", fontSize: 14 },
  add: { marginTop: 4, padding: "11px", borderRadius: 11, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, fontFamily: "inherit" },
};

const MS = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 100, padding: 16 },
  modal: { width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", background: "#fff", borderRadius: 18, padding: "22px 22px 18px", fontFamily: "'Gowun Dodum', sans-serif", border: `1px solid ${BORDER}` },
  headM: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "'Fraunces', serif", fontSize: 22, margin: 0, color: "#2a2a2a" },
  x: { border: "none", background: "transparent", color: "#999", cursor: "pointer" },
  hint: { fontSize: 12.5, color: "#aaa", margin: "0 0 16px", lineHeight: 1.5 },
  rows: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  codeIn: { width: 52, height: 34, borderRadius: 8, border: "none", textAlign: "center", fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none" },
  nameIn: { flex: 1, minWidth: 110, height: 34, borderRadius: 8, border: `1px solid ${BORDER}`, padding: "0 10px", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff" },
  swatches: { display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 200 },
  sw: { width: 18, height: 18, borderRadius: 4, border: "none", cursor: "pointer", padding: 0 },
  del: { width: 30, height: 30, borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", color: "#999", cursor: "pointer", display: "grid", placeItems: "center" },
  addP: { marginTop: 14, width: "100%", padding: "10px", borderRadius: 10, border: `1.5px dashed ${BORDER}`, background: "transparent", color: "#999", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13.5, fontFamily: "inherit" },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  cancel: { padding: "9px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: "#444", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
  save: { padding: "9px 20px", borderRadius: 10, border: "none", background: "#2a2a2a", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 14 },
};
