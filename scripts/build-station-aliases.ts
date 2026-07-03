// 都内の全駅（OSM Overpass）を収録駅に最寄り割り当てし、検索エイリアスの
// 自動生成層 data/stationAliasesAuto.ts を書き出す（ADR-0017）。
// ・手作業層 data/stationAliases.ts にある駅名は対象外（手作業が常に勝つ）
// ・収録駅から MAX_DIST_M より遠い駅は割り当てない（「圏内」と呼べないため）
// ・最寄りに拮抗する駅（最寄り距離の NEAR_RATIO 倍以内）へは複数割り当てする
// 使い方: npm run build:aliases
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { STATION_COORDS } from "../data/stationCoords";
import { STATION_ALIASES } from "../data/stationAliases";
import { normKey } from "../src/coords";

const OUT = join(__dirname, "..", "data", "stationAliasesAuto.ts");
const UA = "walking-app/1.0 (personal hobby project)";
const MAX_DIST_M = 4000; // これ以上遠い「最寄り」は圏内と呼ばない
const NEAR_RATIO = 1.25; // 最寄り距離の1.25倍以内なら同着として複数駅に載せる
const MAX_PRIMARIES = 3; // 1駅を載せる主体駅の上限

type OsmElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number }; // way/relation は out center で座標が入る
  tags?: Record<string, string>;
};

async function fetchTokyoStations(): Promise<Map<string, [number, number]>> {
  // nwr = node/way/relation。駅舎ポリゴン（way）等でマッピングされた駅も拾う。
  const query = `
    [out:json][timeout:90];
    area["name"="東京都"]["admin_level"="4"]["boundary"="administrative"]->.a;
    (
      nwr["railway"="station"](area.a);
      nwr["railway"="tram_stop"](area.a);
    );
    out center;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { elements: OsmElement[] };

  // 同名駅（路線・事業者ごとに別要素）は最初の1件に代表させる。
  const byName = new Map<string, [number, number]>();
  for (const el of data.elements) {
    const name = el.tags?.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat == null || lon == null || byName.has(name)) continue;
    byName.set(name, [lat, lon]);
  }
  return byName;
}

// 緯度経度2点間の距離（m）。ハバースイン。
function distM([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

async function main() {
  const covered = Object.entries(STATION_COORDS); // 収録駅（Notion由来）
  const coveredKeys = new Set(covered.map(([name]) => normKey(name)));
  const manualKeys = new Set(Object.values(STATION_ALIASES).flat().map(normKey));

  const all = await fetchTokyoStations();
  console.log(`OSM 駅ノード（同名まとめ後）: ${all.size}`);

  const auto: Record<string, string[]> = {};
  let assigned = 0;
  const skippedFar: string[] = [];
  for (const [name, coord] of all) {
    const key = normKey(name);
    if (coveredKeys.has(key) || manualKeys.has(key)) continue; // 収録済み・手作業済み
    const ranked = covered
      .map(([primary, c]) => ({ primary, d: distM(coord, c) }))
      .sort((a, b) => a.d - b.d);
    const nearest = ranked[0];
    if (nearest.d > MAX_DIST_M) {
      skippedFar.push(name);
      continue;
    }
    const primaries = ranked
      .filter((r) => r.d <= nearest.d * NEAR_RATIO)
      .slice(0, MAX_PRIMARIES);
    for (const { primary } of primaries) (auto[primary] ??= []).push(name);
    assigned++;
  }

  const ja = (a: string, b: string) => a.localeCompare(b, "ja");
  const body = Object.keys(auto)
    .sort(ja)
    .map((k) => `  ${JSON.stringify(k)}: [${auto[k].sort(ja).map((v) => JSON.stringify(v)).join(", ")}],`)
    .join("\n");
  const out =
    `// 自動生成: scripts/build-station-aliases.ts（OSM Overpass + stationCoords の最寄り割り当て）。\n` +
    `// 駅名データは OpenStreetMap 由来: Data © OpenStreetMap contributors, ODbL 1.0（osm.org/copyright）。\n` +
    `// 検索エイリアスの自動層（ADR-0017）。手で直したい割り当ては stationAliases.ts に移してから\n` +
    `// 再生成すること（このファイルへの手修正は再生成で消える。手作業層にある駅名は生成対象外）。\n` +
    `export const STATION_ALIASES_AUTO: Record<string, string[]> = {\n${body}\n};\n`;
  writeFileSync(OUT, out, "utf8");

  console.log(`更新: data/stationAliasesAuto.ts（割り当て ${assigned} 駅 / 主体駅 ${Object.keys(auto).length}）`);
  if (skippedFar.length) {
    console.log(`収録駅から ${MAX_DIST_M / 1000}km 超のため未割り当て ${skippedFar.length} 駅: ${skippedFar.join("、")}`);
  }
}

void main();
