// scripts/stats.ts — 全駅のタグ分布を集計（patterns.md 更新用）。 pnpm run stats
import { Client } from "@notionhq/client";
const DATABASE_ID = process.env.NOTION_DB_ID ?? ""; // .env から。リポジトリに識別子を載せない
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const multi = (p: any) => (p?.type === "multi_select" ? p.multi_select.map((o: any) => o.name) : []);
const title = (p: any) => (p?.type === "title" ? p.title.map((t: any) => t.plain_text).join("") : "");

async function main() {
  const rows: any[] = []; let c: string | undefined;
  do { const r: any = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: c, page_size: 100 });
    rows.push(...r.results); c = r.has_more ? r.next_cursor : undefined; } while (c);
  const name = (p: any) => title(p.properties["駅名"]);

  function tally(field: string, withStations = false) {
    const m = new Map<string, string[]>();
    for (const p of rows) for (const v of multi(p.properties[field])) {
      if (!m.has(v)) m.set(v, []); m.get(v)!.push(name(p));
    }
    const sorted = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    console.log(`\n=== ${field} (${sorted.length}種) ===`);
    for (const [k, v] of sorted) console.log(`  ${String(v.length).padStart(3)}  ${k}` + (withStations ? `  … ${v.slice(0,8).join("、")}${v.length>8?"…":""}` : ""));
  }
  console.log(`総駅 ${rows.length}`);
  tally("ズレ類型", true);
  tally("類型");
  tally("アンカー");
  tally("需要");
}
main().catch(e => { console.error(e); process.exit(1); });
