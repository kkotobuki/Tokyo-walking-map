// 駅名から緯度経度を一括取得し data/stationCoords.ts を生成する（ADR: Web版・地図）。
// データ源: OpenStreetMap Nominatim（無料・APIキー不要）。
// 利用規約に従い 1.1秒/件で直列実行し、User-Agent を明示する。
// 使い方: npm run geocode   （= tsx scripts/geocode-stations.ts）

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATIONS_DIR = join(__dirname, "..", "data", "stations");
const OUT = join(__dirname, "..", "data", "stationCoords.ts");
const UA = "walking-app/1.0 (personal hobby project)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stationNames(): string[] {
  return readdirSync(STATIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const data = JSON.parse(readFileSync(join(STATIONS_DIR, f), "utf8"));
      return (data["駅名"] as string) ?? f.replace(/\.json$/, "");
    });
}

async function geocode(name: string): Promise<[number, number] | null> {
  // 「○○駅 東京都」で引くと同名駅の取り違えを減らせる。
  const q = `${name}駅 東京都`;
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.warn(`  ! ${name}: HTTP ${res.status}`);
    return null;
  }
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!arr.length) return null;
  return [Number(arr[0].lat), Number(arr[0].lon)];
}

async function main() {
  const names = stationNames();
  console.log(`${names.length} 駅をジオコーディングします（約 ${Math.ceil(names.length * 1.1)} 秒）`);
  const coords: Record<string, [number, number]> = {};
  const missing: string[] = [];

  for (const name of names) {
    try {
      const c = await geocode(name);
      if (c) {
        coords[name] = [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))];
        console.log(`  ✓ ${name} -> ${coords[name].join(", ")}`);
      } else {
        missing.push(name);
        console.log(`  - ${name}: 見つからず`);
      }
    } catch (e) {
      missing.push(name);
      console.warn(`  ! ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(1100); // Nominatim 利用規約: 最大 1req/秒
  }

  const sorted = Object.keys(coords).sort((a, b) => a.localeCompare(b, "ja"));
  const body = sorted.map((k) => `  ${JSON.stringify(k)}: [${coords[k][0]}, ${coords[k][1]}],`).join("\n");
  const out =
    `// 自動生成: scripts/geocode-stations.ts（OpenStreetMap Nominatim）。\n` +
    `// 駅名 -> [緯度, 経度]。精度が甘い駅は手修正してよい。\n` +
    `export const STATION_COORDS: Record<string, [number, number]> = {\n${body}\n};\n`;
  writeFileSync(OUT, out, "utf8");

  console.log(`\n生成: data/stationCoords.ts（${sorted.length} 駅）`);
  if (missing.length) console.log(`未取得 ${missing.length} 駅: ${missing.join(", ")}`);
}

void main();
