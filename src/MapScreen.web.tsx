// 地図画面（Web / Leaflet）。
// ・現在地（ブラウザGPS・前面のみ。タブが前面の間だけ動く）
// ・歩いた軌跡を Polyline で記録（開始/停止）し localStorage に保存
// ・過去の散歩も薄い線で重ね描き（記録が残るのを可視化）
// ・くじで当たった駅を大きいピンで表示（座標は data/stationCoords.ts）
// Leaflet は DOM ライブラリなので Web 専用。ネイティブは MapScreen.tsx（スタブ）。

import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { lookupCoord, type LatLng } from "./coords";

const TOKYO: LatLng = [35.681236, 139.767125]; // 東京駅（座標不明時の既定中心）

// --- 距離計算（ハバサイン, メートル） ---
function distanceM(a: LatLng, b: LatLng): number {
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
function pathLength(path: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += distanceM(path[i - 1], path[i]);
  return sum;
}

// --- localStorage（散歩記録の保存・読み出し） ---
type Walk = { id: string; station: string; startedAt: number; endedAt: number; path: LatLng[]; distanceM: number };

function saveWalk(w: Walk) {
  localStorage.setItem(`walk:${w.id}`, JSON.stringify(w));
  const idx: string[] = JSON.parse(localStorage.getItem("walks:index") ?? "[]");
  if (!idx.includes(w.id)) {
    idx.push(w.id);
    localStorage.setItem("walks:index", JSON.stringify(idx));
  }
}
function loadWalks(station: string): Walk[] {
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

// 駅の大きいピン（絵文字 + 駅名ラベルの DivIcon）。
function stationIcon(name: string) {
  return L.divIcon({
    className: "",
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">` +
      `<div style="font-size:38px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">📍</div>` +
      `<div style="margin-top:2px;padding:2px 8px;border-radius:999px;background:#5b21b6;color:#fff;` +
      `font-size:13px;font-weight:800;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">${name}</div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 44],
  });
}

function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function MapScreen({
  stationName,
  onBack,
  embedded = false,
}: {
  stationName: string;
  onBack?: () => void;
  embedded?: boolean;
}) {
  const stationCoord = lookupCoord(stationName);
  const mapRef = useRef<L.Map | null>(null);

  const [pos, setPos] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [geoErr, setGeoErr] = useState<string>("");
  const [layer, setLayer] = useState<"voyager" | "sat">("voyager"); // 地図 / 航空写真

  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const [path, setPath] = useState<LatLng[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const pastWalks = useMemo(() => loadWalks(stationName), [stationName]);

  // 現在地の監視（前面のみ）。
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoErr("この端末/ブラウザは位置情報に対応していません");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const c: LatLng = [p.coords.latitude, p.coords.longitude];
        setPos(c);
        setAccuracy(p.coords.accuracy);
        setGeoErr("");
        if (recordingRef.current) {
          setPath((prev) => {
            const last = prev[prev.length - 1];
            if (last && distanceM(last, c) < 5) return prev; // ジッタ除去（5m未満は無視）
            return [...prev, c];
          });
        }
      },
      (e) => setGeoErr(e.message || "現在地を取得できませんでした（許可を確認）"),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // 記録中の経過時間タイマ。
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // 記録中は現在地に追従。
  useEffect(() => {
    if (recording && pos) mapRef.current?.panTo(pos);
  }, [pos, recording]);

  function startRec() {
    recordingRef.current = true;
    setRecording(true);
    setStartedAt(Date.now());
    setNow(Date.now());
    setPath(pos ? [pos] : []);
  }
  function stopRec() {
    recordingRef.current = false;
    setRecording(false);
    if (startedAt && path.length >= 2) {
      const id = `${stationName}-${startedAt}`;
      saveWalk({
        id,
        station: stationName,
        startedAt,
        endedAt: Date.now(),
        path,
        distanceM: pathLength(path),
      });
    }
  }
  function recenter(target: LatLng | null) {
    if (target) mapRef.current?.setView(target, 16);
  }

  const liveDist = pathLength(path);
  const center = stationCoord ?? pos ?? TOKYO;

  const statusText = recording
    ? `記録中 ${fmtDist(liveDist)} / ${fmtDur((now || Date.now()) - (startedAt ?? Date.now()))}`
    : stationCoord
      ? "現在地と軌跡を記録できます"
      : "この駅は座標未取得";

  return (
    <View style={embedded ? styles.embed : styles.flex}>
      {/* 上部バー（全画面時のみ） */}
      {!embedded && (
        <View style={styles.topbar}>
          {onBack && (
            <Pressable onPress={onBack} hitSlop={10}>
              <Text style={styles.link}>← 戻る</Text>
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {stationName}
          </Text>
          <Text style={styles.status}>{statusText}</Text>
        </View>
      )}

      {/* 地図 */}
      <View style={embedded ? styles.mapWrapEmbed : styles.mapWrap}>
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          ref={(m) => {
            mapRef.current = m;
          }}
        >
          {layer === "sat" ? (
            <>
              {/* 航空写真（Esri World Imagery）＋ 地名・道路ラベル（CARTO） */}
              <TileLayer
                key="sat"
                attribution="Tiles &copy; Esri, Maxar, Earthstar Geographics"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer
                key="sat-labels"
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png"
                subdomains="abcd"
                maxZoom={20}
              />
            </>
          ) : (
            /* Google Map に近い明るい道路地図（CARTO Voyager） */
            <TileLayer
              key="voyager"
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
              subdomains="abcd"
              maxZoom={20}
            />
          )}

          {/* 駅の大きいピン */}
          {stationCoord && (
            <Marker position={stationCoord} icon={stationIcon(stationName)} />
          )}

          {/* 過去の散歩（薄い線） */}
          {pastWalks.map((w) => (
            <Polyline key={w.id} positions={w.path} pathOptions={{ color: "#9ca3af", weight: 4, opacity: 0.6 }} />
          ))}

          {/* 今回の軌跡 */}
          {path.length >= 2 && (
            <Polyline positions={path} pathOptions={{ color: "#ef4444", weight: 6, opacity: 0.9 }} />
          )}

          {/* 現在地 */}
          {pos && (
            <>
              {accuracy && accuracy < 200 && (
                <CircleMarker
                  center={pos}
                  radius={Math.max(6, accuracy / 5)}
                  pathOptions={{ color: "#1f6feb", fillColor: "#1f6feb", fillOpacity: 0.12, weight: 0 }}
                />
              )}
              <CircleMarker
                center={pos}
                radius={8}
                pathOptions={{ color: "#fff", weight: 2, fillColor: "#1f6feb", fillOpacity: 1 }}
              >
                <Tooltip direction="top">現在地</Tooltip>
              </CircleMarker>
            </>
          )}
        </MapContainer>
      </View>

      {/* 下部コントロール */}
      <View style={embedded ? styles.controlsEmbed : styles.controls}>
        {embedded && <Text style={styles.statusEmbed}>{statusText}</Text>}
        {!!geoErr && <Text style={styles.err}>{geoErr}</Text>}
        <View style={styles.btnRow}>
          <Pressable style={[styles.smallBtn]} onPress={() => recenter(pos)}>
            <Text style={styles.smallBtnText}>📍 現在地へ</Text>
          </Pressable>
          <Pressable
            style={[styles.smallBtn]}
            onPress={() => setLayer((l) => (l === "voyager" ? "sat" : "voyager"))}
          >
            <Text style={styles.smallBtnText}>{layer === "voyager" ? "🛰 航空写真" : "🗺 地図"}</Text>
          </Pressable>
          {stationCoord && (
            <Pressable style={[styles.smallBtn]} onPress={() => recenter(stationCoord)}>
              <Text style={styles.smallBtnText}>🚉 駅へ</Text>
            </Pressable>
          )}
        </View>
        {recording ? (
          <Pressable style={[styles.recBtn, styles.recBtnStop]} onPress={stopRec}>
            <Text style={styles.recBtnText}>■ 記録を止めて保存</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.recBtn} onPress={startRec}>
            <Text style={styles.recBtnText}>● 散歩を記録する</Text>
          </Pressable>
        )}
        <Text style={styles.note}>
          {Platform.OS === "web"
            ? "※ 画面を開いている間だけ記録します（ロック/別アプリで途切れます）"
            : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  embed: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    marginBottom: 16,
  },
  topbar: { paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#eee", gap: 2 },
  link: { color: "#1f6feb", fontSize: 15, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  status: { color: "#888", fontSize: 12 },
  statusEmbed: { color: "#888", fontSize: 12, marginBottom: 2 },
  mapWrap: { flex: 1, minHeight: 320 },
  mapWrapEmbed: { height: 260 },
  controls: { padding: 14, paddingBottom: 24, borderTopWidth: 1, borderTopColor: "#eee", gap: 10 },
  controlsEmbed: { padding: 12, gap: 10 },
  btnRow: { flexDirection: "row", gap: 8 },
  smallBtn: { backgroundColor: "#eef2f7", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  smallBtnText: { fontSize: 13, color: "#374151", fontWeight: "700" },
  recBtn: { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  recBtnStop: { backgroundColor: "#dc2626" },
  recBtnText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  err: { color: "#c00", fontSize: 12 },
  note: { color: "#9ca3af", fontSize: 11, textAlign: "center" },
});
