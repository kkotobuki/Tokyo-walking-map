// 散歩記録のドメインロジック（距離計算・localStorage への保存/読み出し・表示フォーマット）。
// localStorage を使うため Web 専用（MapScreen.web.tsx から利用）。
import type { LatLng } from "./coords";

export type Walk = {
  id: string;
  station: string;
  startedAt: number;
  endedAt: number;
  path: LatLng[];
  distanceM: number;
};

// --- 距離計算（ハバサイン, メートル） ---
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLength(path: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += distanceM(path[i - 1], path[i]);
  return sum;
}

// --- localStorage（散歩記録の保存・読み出し） ---
export function saveWalk(w: Walk) {
  localStorage.setItem(`walk:${w.id}`, JSON.stringify(w));
  const idx: string[] = JSON.parse(localStorage.getItem("walks:index") ?? "[]");
  if (!idx.includes(w.id)) {
    idx.push(w.id);
    localStorage.setItem("walks:index", JSON.stringify(idx));
  }
}

export function loadWalks(station: string): Walk[] {
  const idx: string[] = JSON.parse(localStorage.getItem("walks:index") ?? "[]");
  const out: Walk[] = [];
  for (const id of idx) {
    const raw = localStorage.getItem(`walk:${id}`);
    if (!raw) continue;
    try {
      const w = JSON.parse(raw) as Walk;
      if (w.station === station && w.path?.length) out.push(w);
    } catch {
      /* 壊れたレコードは無視 */
    }
  }
  return out;
}

// --- 表示フォーマット ---
export function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
