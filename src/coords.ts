// 駅名→座標の照合（表記ゆれ吸収）。地図画面・地図ピッカーで共有する。
import { STATION_COORDS } from "../data/stationCoords";

export type LatLng = [number, number];

// 「ケ/ヶ」「駅」サフィックス・空白・全半角を正規化。
export function normKey(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/駅$/, "")
    .replace(/ヶ/g, "ケ");
}

const NORM_COORDS: Record<string, LatLng> = Object.fromEntries(
  Object.entries(STATION_COORDS).map(([k, v]) => [normKey(k), v]),
);

export function lookupCoord(name: string): LatLng | null {
  return STATION_COORDS[name] ?? NORM_COORDS[normKey(name)] ?? null;
}

export { STATION_COORDS };
