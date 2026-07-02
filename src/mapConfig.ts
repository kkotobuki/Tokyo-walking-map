// 地図の共通設定（Web の Leaflet 画面 MapScreen.web / StationsMap.web で共有）。
import type { LatLng } from "./coords";

// 東京駅（座標不明時の既定中心）。
export const TOKYO: LatLng = [35.681236, 139.767125];

// Google Map に近い明るい道路地図（CARTO Voyager）。TileLayer にそのまま spread する。
export const VOYAGER_TILE = {
  attribution:
    '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  subdomains: "abcd",
  maxZoom: 20,
} as const;
