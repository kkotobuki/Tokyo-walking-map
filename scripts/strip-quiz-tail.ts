// scripts/strip-quiz-tail.ts — Notion の全駅の「観察お題」末尾から
// 「…成長/成熟/衰退/転換のどれだと思う？」の4択（ADR-0014で撤廃）を剥がす。
// ローカル data/stations/*.json には無い "Notion 専用駅"（例: 神保町）にも効く。
// 既に4択が無い駅は無変更（冪等）。観察お題はプレーンテキスト前提（rich_text の装飾は使っていない）。
//
// 使い方:  NOTION_TOKEN と NOTION_DB_ID を環境に入れて  npm run strip:quiz
//   ドライラン（書き込まず差分だけ表示）:  npm run strip:quiz -- --dry

import { Client } from "@notionhq/client";

const DATABASE_ID = process.env.NOTION_DB_ID ?? "";

// --- 4択末尾を剥がす（scripts 内の strip.py と同じ規則） ---
const TERM = new Set([..."。！？!?"]);
const DASH = new Set([..."—―"]);
const CONN = /^(最後に(一つ|ひとつ)(賭けてほしい)?|さて|そして今)[。、]?$/;

function trim(old: string): string {
  const p = old.lastIndexOf("転換");
  if (p < 0) return old; // 4択なし＝無変更
  let i = p;
  while (i >= 0 && !TERM.has(old[i]) && !DASH.has(old[i])) i--;
  if (i < 0) return old;

  let next: string;
  if (TERM.has(old[i])) {
    next = old.slice(0, i + 1);
  } else {
    let j = i;
    while (j >= 0 && DASH.has(old[j])) j--;
    next = old.slice(0, j + 1).replace(/\s+$/, "");
    if (next && !TERM.has(next[next.length - 1])) next += "。";
  }

  // 末尾に残ったつなぎ語だけの文（「さて。」等）を除去
  for (;;) {
    let k = -1;
    for (let x = next.length - 2; x >= 0; x--) {
      if (TERM.has(next[x])) { k = x; break; }
    }
    const last = next.slice(k + 1).trim();
    if (CONN.test(last)) next = next.slice(0, k + 1).replace(/\s+$/, "");
    else break;
  }
  return next;
}

const readText = (p: any): string =>
  (p?.rich_text ?? p?.title ?? []).map((t: any) => t.plain_text ?? "").join("");

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error("NOTION_TOKEN 未設定（環境変数 or .env を export）。"); process.exit(1); }
  if (!DATABASE_ID) { console.error("NOTION_DB_ID 未設定。"); process.exit(1); }
  const dry = process.argv.includes("--dry");
  const notion = new Client({ auth: token });

  // 全ページ取得
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  let changed = 0, skipped = 0;
  for (const page of pages) {
    const name = readText(page.properties?.["駅名"]) || page.id;
    const old = readText(page.properties?.["観察お題"]);
    if (!old) { skipped++; continue; }
    const next = trim(old);
    if (next === old) { skipped++; continue; }
    console.log(`\n● ${name}`);
    console.log(`  - 旧末尾: …${old.slice(-40)}`);
    console.log(`  + 新末尾: …${next.slice(-40)}`);
    if (!dry) {
      await notion.pages.update({
        page_id: page.id,
        properties: { 観察お題: { rich_text: next ? [{ type: "text", text: { content: next } }] : [] } },
      });
    }
    changed++;
  }
  console.log(`\n${dry ? "[dry] " : ""}変更 ${changed} 駅 / 無変更 ${skipped} 駅（全 ${pages.length} 駅）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
