// scripts/import-stations.ts
// data/stations/*.json をまとめて Notion DB「東京100駅経済観察マップ」へ投入（upsert）する。
//
// 使い方:
//   1. Notion で「内部インテグレーション」を作成しトークンを取得、対象DBに接続（共有）する。
//   2. NOTION_TOKEN を環境変数に設定。
//   3. pnpm i  （初回のみ）
//   4. pnpm run import         … 全駅を投入
//      pnpm run import 渋谷 上野 … 駅名を指定して一部だけ投入
//
// 特徴:
//   - 駅名(title)で既存ページを探して update（無ければ create）。
//   - multi_select の値は Notion API が自動でオプション生成する（事前のスキーマ変更は不要）。
//   - data/vocab.ts に無いタグが使われていたら警告（語彙の一貫性チェック。投入はする）。
//   - 本文は各パートを個別プロパティ（変数）に格納（ADR-0005/0008）。

import { Client } from "@notionhq/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED, type StationRecord } from "../data/vocab.ts";

const DATABASE_ID = process.env.NOTION_DB_ID ?? ""; // 東京100駅経済観察マップ（.env から。リポジトリに識別子を載せない）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIONS_DIR = path.join(__dirname, "..", "data", "stations");

const TEXT_FIELDS = ["観察お題", "お題の解説", "供給の筋", "需要の筋", "ズレ", "未来の観点", "区"] as const;
const MULTI_FIELDS = ["路線", "アンカー", "ショック", "需要", "類型", "ズレ類型"] as const;

function richText(s: string | undefined) {
  return { rich_text: s ? [{ type: "text" as const, text: { content: s } }] : [] };
}
function multiSelect(arr: string[] | undefined) {
  return { multi_select: (arr ?? []).map((name) => ({ name })) };
}

function buildProperties(r: StationRecord) {
  const props: Record<string, unknown> = {
    駅名: { title: [{ type: "text", text: { content: r.駅名 } }] },
  };
  for (const f of TEXT_FIELDS) props[f] = richText((r as any)[f]);
  for (const f of MULTI_FIELDS) props[f] = multiSelect((r as any)[f]);
  if (r.カテゴリ) props["カテゴリ"] = { select: { name: r.カテゴリ } };
  // 任意テキスト: 値がある時だけ設定（空で既存を上書きしない）
  for (const f of ["おすすめルート", "観察ポイント", "定番スポット", "さくっとコース", "しっかりコース"] as const) {
    const v = (r as any)[f];
    if (typeof v === "string" && v.trim()) props[f] = richText(v);
  }
  return props;
}

/** data/vocab.ts に無いタグを洗い出す（投入は止めない・警告のみ） */
function checkVocab(r: StationRecord): string[] {
  const warns: string[] = [];
  for (const [field, allowed] of Object.entries(ALLOWED)) {
    const used: string[] = field === "カテゴリ" ? (r.カテゴリ ? [r.カテゴリ] : []) : ((r as any)[field] ?? []);
    for (const v of used) {
      if (!(allowed as readonly string[]).includes(v)) warns.push(`${r.駅名}: ${field}="${v}" は data/vocab.ts に未登録`);
    }
  }
  return warns;
}

async function findPageByName(notion: Client, name: string): Promise<string | null> {
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: { property: "駅名", title: { equals: name } },
    page_size: 1,
  });
  return res.results[0]?.id ?? null;
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error("NOTION_TOKEN が未設定です。Notion インテグレーションのトークンを設定してください。");
    process.exit(1);
  }
  const notion = new Client({ auth: token });

  const only = process.argv.slice(2); // 駅名で絞り込み（任意）
  const files = fs.readdirSync(STATIONS_DIR).filter((f) => f.endsWith(".json"));
  const records: StationRecord[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(STATIONS_DIR, f), "utf8")));
  const targets = only.length ? records.filter((r) => only.includes(r.駅名)) : records;

  const allWarns: string[] = [];
  const allProposals: string[] = [];
  let created = 0, updated = 0;

  for (const r of targets) {
    allWarns.push(...checkVocab(r));
    for (const p of r.proposedNewOptions ?? []) allProposals.push(`${r.駅名}: ${p.field}="${p.name}" (${p.reason})`);

    const props = buildProperties(r);
    const pageId = await findPageByName(notion, r.駅名);
    if (pageId) {
      await notion.pages.update({ page_id: pageId, properties: props as any });
      updated++;
      console.log(`✓ updated  ${r.駅名}`);
    } else {
      await notion.pages.create({ parent: { database_id: DATABASE_ID }, properties: props as any });
      created++;
      console.log(`+ created  ${r.駅名}`);
    }
  }

  console.log(`\n=== 完了: ${updated} updated / ${created} created ===`);
  if (allWarns.length) {
    console.log(`\n⚠️ vocab 未登録タグ（data/vocab.ts に追記を検討）:`);
    for (const w of [...new Set(allWarns)]) console.log("  - " + w);
  }
  if (allProposals.length) {
    console.log(`\n💡 proposedNewOptions（語彙拡張の提案）:`);
    for (const p of [...new Set(allProposals)]) console.log("  - " + p);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
