// scripts/audit-stations.ts
// Notion DB の全ページを監査：本文6項目・タグ・基本情報の欠落、駅名重複を洗い出す。
// 使い方: NOTION_TOKEN を環境に入れて  pnpm run audit

import { Client } from "@notionhq/client";

const DATABASE_ID = process.env.NOTION_DB_ID ?? ""; // .env から。リポジトリに識別子を載せない
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const BODY = ["観察お題", "お題の解説", "供給の筋", "需要の筋", "ズレ", "未来の観点"] as const;
const TAGS = ["アンカー", "ショック", "需要", "類型", "ズレ類型", "路線"] as const;

function text(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title ?? []).map((t: any) => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((t: any) => t.plain_text).join("");
  return "";
}
function multi(prop: any): string[] {
  return prop?.type === "multi_select" ? prop.multi_select.map((o: any) => o.name) : [];
}

async function main() {
  if (!process.env.NOTION_TOKEN) { console.error("NOTION_TOKEN 未設定"); process.exit(1); }
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.databases.query({ database_id: DATABASE_ID, start_cursor: cursor, page_size: 100 });
    for (const p of res.results) rows.push({ id: p.id, props: p.properties, name: text(p.properties["駅名"]) });
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  // authored = 本文6項目のどれかが入っている駅
  const authored = rows.filter(r => BODY.some(f => text(r.props[f]).trim()));
  const stubRows = rows.filter(r => !BODY.some(f => text(r.props[f]).trim()));
  console.log(`総ページ ${rows.length} / authored ${authored.length} / 未着手スタブ ${stubRows.length}`);
  console.log(`\n=== 未着手スタブ駅 ===\n` + stubRows.map(r => r.name).filter(Boolean).join("、"));

  console.log(`\n=== authored の中で「欠けている項目がある駅」 ===`);
  let problems = 0;
  for (const r of authored) {
    const missingBody = BODY.filter(f => !text(r.props[f]).trim());
    const missingTags = TAGS.filter(f => multi(r.props[f]).length === 0);
    const noCat = r.props["カテゴリ"]?.select == null;
    const noKu = !text(r.props["区"]).trim();
    if (missingBody.length || missingTags.length || noCat || noKu) {
      problems++;
      const parts = [];
      if (missingBody.length) parts.push("本文:" + missingBody.join("/"));
      if (missingTags.length) parts.push("タグ:" + missingTags.join("/"));
      if (noCat) parts.push("カテゴリ");
      if (noKu) parts.push("区");
      console.log(`  ${r.name.padEnd(8)} 欠落→ ${parts.join("  ")}`);
    }
  }
  if (!problems) console.log("  なし（全 authored 駅が本文6項目＋主要タグ＋区/カテゴリ完備）");
}
main().catch(e => { console.error(e); process.exit(1); });
