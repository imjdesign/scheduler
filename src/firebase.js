// Firebase 설정 — 본인 프로젝트 정보
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDcSL83nhUPNgB5Bk_-tSEpVzXyfOrRj9E",
  authDomain: "scheduler-8b7aa.firebaseapp.com",
  projectId: "scheduler-8b7aa",
  storageBucket: "scheduler-8b7aa.firebasestorage.app",
  messagingSenderId: "1017991240202",
  appId: "1:1017991240202:web:13f722c5053d0ff8e31df3",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 개인용 단일 사용자 모드: 모든 기기가 같은 문서를 본다
// (보안 규칙은 나중에 따로 잠가둘 예정)
const USER_ID = "me";

// 데이터 1회 읽기
export async function loadDoc(key) {
  const snap = await getDoc(doc(db, "users", USER_ID, "store", key));
  return snap.exists() ? snap.data().value : null;
}

// 데이터 저장 (덮어쓰기)
export async function saveDoc(key, value) {
  await setDoc(doc(db, "users", USER_ID, "store", key), { value, updatedAt: Date.now() });
}

// 실시간 구독 (다른 기기에서 바뀌면 자동 반영)
export function subscribeDoc(key, callback) {
  return onSnapshot(doc(db, "users", USER_ID, "store", key), (snap) => {
    if (snap.exists()) callback(snap.data().value);
  });
}
