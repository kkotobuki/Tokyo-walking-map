// Notion の全駅を起点に座標表 data/stationCoords.ts を補完する。
// ・既存の座標（手修正含む）は温存
// ・座標が無い駅だけ OpenStreetMap Nominatim（無料・キー不要）で取得
// データ源の駅一覧は Notion（アプリが実際に読むのと同じ）。
// 使い方: npm run geocode

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@notionhq/client";
import { STATION_COORDS, lookupCoord, type LatLng } from "../src/coords";

const TOKEN = process.env.EXPO_PUBLIC_NOTION_TOKEN ?? process.env.NOTION_TOKEN ?? "";
const DB =
  process.env.EXPO_PUBLIC_NOTION_DB_ID ??
  process.env.NOTION_DB_ID ??
  "44fd390cb06349b3b788b29e7dd181bb";
const OUT = join(__dirname, "..", "data", "stationCoords.ts");
const UA = "walking-app/1.0 (personal hobby project)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const title = (p: any) => (p?.type === "title" ? p.title.map((t: any) => t.plain_text).join("") : "");

async function notionStationNames(): Promise<string[]> {
  const notion = new Client({ auth: TOKEN });
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const r: any = await notion.databases.query({ database_id: DB, start_cursor: cursor, page_size: 100 });
    rows.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return rows.map((p) => title(p.properties["駅名"])).filter(Boolean);
}

async function geocode(name: string): Promise<LatLng | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(`${name}駅 東京都`);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    console.warn(`  ! ${name}: HTTP ${res.status}`);
    return null;
  }
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!arr.length) return null;
  return [Number(Number(arr[0].lat).toFixed(5)), Number(Number(arr[0].lon).toFixed(5))];
}

async function main() {
  if (!TOKEN) {
    console.error("トークンが env にありません（EXPO_PUBLIC_NOTION_TOKEN / NOTION_TOKEN）。.env を確認してください。");
    process.exit(1);
  }

  const names = await notionStationNames();
  // 既存の座標は温存し、未取得の駅名だけ対象にする（表記ゆれ込みで判定）。
  const todo = names.filter((n) => lookupCoord(n) == null);
  console.log(`Notion 総駅: ${names.length} / 既に座標あり: ${names.length - todo.length} / 取得対象: ${todo.length}`);
  if (!todo.length) {
    console.log("補完不要。すべて座標があります。");
    return;
  }

  // 既存をコピーし、新規ぶんを追記する。
  const coords: Record<string, LatLng> = { ...STATION_COORDS };
  const missing: string[] = [];
  for (const name of todo) {
    try {
      const c = await geocode(name);
      if (c) {
        coords[name] = c;
        console.log(`  ✓ ${name} -> ${c.join(", ")}`);
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
    `// 自動生成: scripts/geocode-stations.ts（Notion起点 + OpenStreetMap Nominatim）。\n` +
    `// 駅名 -> [緯度, 経度]。精度が甘い駅は手修正してよい（再実行しても既存値は温存）。\n` +
    `export const STATION_COORDS: Record<string, [number, number]> = {\n${body}\n};\n`;
  writeFileSync(OUT, out, "utf8");

  console.log(`\n更新: data/stationCoords.ts（計 ${sorted.length} 駅 / 今回追加 ${todo.length - missing.length}）`);
  if (missing.length) console.log(`未取得 ${missing.length} 駅（手動追加が必要）: ${missing.join("、")}`);
}

void main();
