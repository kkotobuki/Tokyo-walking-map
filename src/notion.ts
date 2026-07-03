// Notion REST API クライアント（fetch を直接使う）。
// 読み: 駅を1件取得。書き: 仮説 / 感想 / ステータス / 訪問日 を更新（ADR-0012/0013）。
// web は CORS 回避のため proxy 経由（ADR-0015）、ネイティブは api.notion.com を直叩き。
// Notion-Version ヘッダは必須。

import { Platform } from "react-native";
import { NOTION_TOKEN, DATABASE_ID, NOTION_PROXY } from "./config";

// proxy は web 専用（CORS 回避用）。ネイティブは CORS が無いので常に直叩きする。
// 同じ .env を共有していてもネイティブが proxy を踏まないよう Platform で確実に出し分ける（ADR-0015）。
// （ネイティブが localhost の dev proxy を踏むと、Origin 無し→403 や localhost 不達で読み込みが落ちる）
const USE_PROXY = Platform.OS === "web" && !!NOTION_PROXY;
const BASE = USE_PROXY ? NOTION_PROXY.replace(/\/+$/, "") : "https://api.notion.com";
const API = `${BASE}/v1`;
const NOTION_VERSION = "2022-06-28";

function headers() {
  const h: Record<string, string> = {
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
  // proxy 経由時はトークンを proxy が付与する（web クライアントにトークンを置かない）。
  // 直叩き時（ネイティブ／proxy 未設定の web）はクライアントが Authorization を付ける。
  if (!USE_PROXY) h.Authorization = `Bearer ${NOTION_TOKEN}`;
  return h;
}

// --- プロパティ読み出しヘルパ ---
type AnyProp = any;
const readText = (p: AnyProp): string =>
  (p?.rich_text ?? p?.title ?? []).map((t: AnyProp) => t.plain_text ?? "").join("");
const readMulti = (p: AnyProp): string[] =>
  (p?.multi_select ?? []).map((o: AnyProp) => o.name as string);
const readSelect = (p: AnyProp): string | null => p?.select?.name ?? null;

// ステータス値（Notion の select と一致させる）。
export const STATUS_VISITED = "訪問済み";

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

export type Station = StationSummary & {
  anchors: string[]; // アンカー（街の核）
  shocks: string[]; // ショック（街を変えた出来事）
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
};

// Notion ページ → サマリ変換（一覧と1件取得で共有）。
function pageToSummary(page: AnyProp): StationSummary {
  const p = page.properties;
  return {
    id: page.id,
    name: readText(p["駅名"]),
    ward: readText(p["区"]),
    lines: readMulti(p["路線"]),
    category: readSelect(p["カテゴリ"]),
    demands: readMulti(p["需要"]),
    archetypes: readMulti(p["類型"]),
    status: readSelect(p["ステータス"]),
  };
}

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
    ...pageToSummary(page),
    anchors: readMulti(p["アンカー"]),
    shocks: readMulti(p["ショック"]),
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
  };
}

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
    for (const page of data.results ?? []) out.push(pageToSummary(page));
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
    ステータス: { select: { name: STATUS_VISITED } },
    訪問日: { date: { start: today } },
  });
}
