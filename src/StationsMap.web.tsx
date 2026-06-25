// 全駅を地図にピン表示し、タップでその駅を選ぶ地図ピッカー（Web / Leaflet）。
// 訪問済み/未訪問を色分け。座標のある駅のみ表示する。

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { lookupCoord, type LatLng } from "./coords";

const TOKYO: LatLng = [35.681236, 139.767125];
const VISITED = "訪問済み";

export type PickStation = { name: string; status: string | null };

// 駅ピン（色付きドット＋駅名ラベル）。訪問済みは緑。
function pinIcon(name: string, visited: boolean) {
  const bg = visited ? "#16a34a" : "#1f6feb";
  return L.divIcon({
    className: "",
    html:
      `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">` +
      `<div style="width:12px;height:12px;border-radius:50%;background:${bg};` +
      `border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>` +
      `<div style="margin-top:2px;padding:1px 6px;border-radius:999px;background:${bg};color:#fff;` +
      `font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3)">` +
      `${visited ? "✓ " : ""}${name}</div>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 6],
  });
}

export default function StationsMap({
  stations,
  onPick,
  onClose,
}: {
  stations: PickStation[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  // 座標のある駅だけをピン化。
  const pins = useMemo(
    () =>
      stations
        .map((s) => ({ ...s, coord: lookupCoord(s.name) }))
        .filter((s): s is PickStation & { coord: LatLng } => s.coord != null),
    [stations],
  );
  const visitedCount = pins.filter((p) => p.status === VISITED).length;

  return (
    <View style={styles.flex}>
      <View style={styles.topbar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.link}>← 一覧へ</Text>
        </Pressable>
        <Text style={styles.title}>地図から駅を選ぶ</Text>
        <Text style={styles.status}>
          {pins.length}駅　•　🟢訪問済み {visitedCount}　🔵未訪問 {pins.length - visitedCount}（ピンをタップ）
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapContainer center={TOKYO} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          {pins.map((s) => (
            <Marker
              key={s.name}
              position={s.coord}
              icon={pinIcon(s.name, s.status === VISITED)}
              eventHandlers={{ click: () => onPick(s.name) }}
            />
          ))}
        </MapContainer>
      </View>

      <Text style={styles.hint}>※ ズームすると密集した駅が見分けやすくなります</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  topbar: { paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#eee", gap: 2 },
  link: { color: "#1f6feb", fontSize: 15, fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  status: { color: "#888", fontSize: 12 },
  mapWrap: { flex: 1, minHeight: 320 },
  hint: { color: "#9ca3af", fontSize: 11, textAlign: "center", paddingVertical: 8 },
});
