// Notion REST API クライアント（React Native の fetch を直接使う）。
// 読み: 駅を1件取得。書き: 仮説 / 感想 / ステータス / 訪問日 を更新（ADR-0012/0013）。
// ネイティブなので CORS の制約はない。Notion-Version ヘッダは必須。

import { NOTION_TOKEN, DATABASE_ID, NOTION_PROXY } from "./config";

// web は CORS で Notion を直叩きできない。EXPO_PUBLIC_NOTION_PROXY 設定時はそこを経由する（ADR-0015）。
const BASE = NOTION_PROXY ? NOTION_PROXY.replace(/\/+$/, "") : "https://api.notion.com";
const API = `${BASE}/v1`;
const NOTION_VERSION = "2022-06-28";

function headers() {
  const h: Record<string, string> = {
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
  // proxy 経由時はトークンを proxy が付与する（web クライアントにトークンを置かない）。
  if (!NOTION_PROXY) h.Authorization = `Bearer ${NOTION_TOKEN}`;
  return h;
}

// --- プロパティ読み出しヘルパ ---
type AnyProp = any;
const readText = (p: AnyProp): string =>
  (p?.rich_text ?? p?.title ?? []).map((t: AnyProp) => t.plain_text ?? "").join("");
const readMulti = (p: AnyProp): string[] =>
  (p?.multi_select ?? []).map((o: AnyProp) => o.name as string);
const readSelect = (p: AnyProp): string | null => p?.select?.name ?? null;

export type Station = {
  id: string;
  name: string;
  ward: string;
  lines: string[];
  category: string | null; // カテゴリ
  anchors: string[]; // アンカー（街の核）
  shocks: string[]; // ショック（街を変えた出来事）
  demands: string[]; // 需要（来る人が求めるもの）
  archetypes: string[]; // 類型（街の形）
  gapTypes: string[]; // ズレ類型（参考表示のみ・採点しない）
  prompt: string; // 観察お題（①の問い）
  answer: string; // お題の解説（①の答え）
  supply: string; // 供給の筋（③）
  demand: string; // 需要の筋（③）
  gap: string; // ズレ（④）
  future: string; // 未来の観点（⑤）
  observePoints: string; // 観察ポイント
  route: string; // おすすめルート
  hypothesis: string; // 自分の仮説（行きで記入）
  reflection: string; // 感想（帰りで記入）
  status: string | null; // 未訪問 / 予定 / 訪問済み
};

export async function fetchStation(name: string): Promise<Station> {
  const res = await fetch(`${API}/databases/${DATABASE_ID}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: { property: "駅名", title: { equals: name } },
      page_size: 1,
    }),
  });
  if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const page = data.results?.[0];
  if (!page) throw new Error(`駅が見つかりません: ${name}`);
  const p = page.properties;
  return {
    id: page.id,
    name: readText(p["駅名"]),
    ward: readText(p["区"]),
    lines: readMulti(p["路線"]),
    category: readSelect(p["カテゴリ"]),
    anchors: readMulti(p["アンカー"]),
    shocks: readMulti(p["ショック"]),
    demands: readMulti(p["需要"]),
    archetypes: readMulti(p["類型"]),
    gapTypes: readMulti(p["ズレ類型"]),
    prompt: readText(p["観察お題"]),
    answer: readText(p["お題の解説"]),
    supply: readText(p["供給の筋"]),
    demand: readText(p["需要の筋"]),
    gap: readText(p["ズレ"]),
    future: readText(p["未来の観点"]),
    observePoints: readText(p["観察ポイント"]),
    route: readText(p["おすすめルート"]),
    hypothesis: readText(p["仮説"]),
    reflection: readText(p["感想"]),
    status: readSelect(p["ステータス"]),
  };
}

// ホーム一覧用の軽量サマリ（一覧表示・絞り込み・訪問判定に必要な分だけ）。
export type StationSummary = {
  id: string;
  name: string;
  ward: string;
  lines: string[];
  category: string | null;
  demands: string[];
  archetypes: string[];
  status: string | null; // 未訪問 / 予定 / 訪問済み
};

export async function fetchAllStations(): Promise<StationSummary[]> {
  const out: StationSummary[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new Error(`Notion list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const page of data.results ?? []) {
      const p = page.properties;
      out.push({
        id: page.id,
        name: readText(p["駅名"]),
        ward: readText(p["区"]),
        lines: readMulti(p["路線"]),
        category: readSelect(p["カテゴリ"]),
        demands: readMulti(p["需要"]),
        archetypes: readMulti(p["類型"]),
        status: readSelect(p["ステータス"]),
      });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out.filter((st) => st.name);
}

function textProp(s: string) {
  return s ? [{ type: "text", text: { content: s } }] : [];
}

async function patchPage(pageId: string, properties: Record<string, unknown>) {
  const res = await fetch(`${API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update failed: ${res.status} ${await res.text()}`);
}

// 行き：仮説を保存。
export async function saveHypothesis(pageId: string, hypothesis: string) {
  await patchPage(pageId, { 仮説: { rich_text: textProp(hypothesis) } });
}

// 帰り：感想を保存し、訪問済みにする（＝訪問の確定トリガー）。
export async function saveReflection(pageId: string, reflection: string) {
  const today = new Date().toISOString().slice(0, 10);
  await patchPage(pageId, {
    感想: { rich_text: textProp(reflection) },
    ステータス: { select: { name: "訪問済み" } },
    訪問日: { date: { start: today } },
  });
}
