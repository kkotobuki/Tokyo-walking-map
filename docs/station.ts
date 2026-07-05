// =============================================================================
// station.ts
//
// Notion DB「東京100駅経済観察マップ」
//   data source: e066cd64-d94f-44f1-acc5-e284ca84eec3
// に対応する TypeScript 型定義と、Notion API レスポンス → アプリ型のマッパー。
//
// Notion をバックエンド（CMS）として使い、アプリは API で駅データを「変数」として
// 読み出す。この型は Notion 側に「実在するプロパティ」だけを表現する。
//
// ⚠️ Notion に無い／アプリ側で別途持つもの（この型には含めない）:
//   - ループ UI（観察 → 賭け → 答え合わせ → 未来 の画面遷移そのもの）
//   - ユーザーの仮説（②賭け）: ユーザーごとの入力。Notion ではなくアプリ側 DB / ローカルに保存
//   - 歩行メモ（時系列）: 歩きながらの時系列ログ。アプリ側で別途保持
//   - AI 分析: 生成結果。Notion には書かず、アプリ側で生成・保持する
//   （ADR-0006 のループ骨格のうち、Notion が担うのは「お題・解説・供給/需要/ズレ/未来の観点」の
//     コンテンツ部分のみ。ユーザー固有の状態はすべてアプリ側）
//   - 表示用の任意プロパティ（おすすめルート・観察ポイント・定番スポット・さくっとコース・
//     しっかりコース）はこの型に未収載。data/vocab.ts の StationRecord と ADR-0018 を参照
// =============================================================================

// -----------------------------------------------------------------------------
// 1. multi_select / select の値（string literal union）
//    語彙の単一ソースは data/vocab.ts。型をそこから import し、ここでは再定義しない
//    （量産期に二重定義が乖離した反省。vocab.ts を更新すれば自動で追従する）。
// -----------------------------------------------------------------------------

export type {
  AnchorType,
  ShockType,
  DemandType,
  ArchetypeType,
  GapType,
  LineType,
  CategoryType,
  StatusType,
} from "../data/vocab";

import type {
  AnchorType,
  ShockType,
  DemandType,
  ArchetypeType,
  GapType,
  LineType,
  CategoryType,
  StatusType,
} from "../data/vocab";

// -----------------------------------------------------------------------------
// 2. Station 型（英語キー）
// -----------------------------------------------------------------------------

export interface Station {
  // --- 基本（text） ---
  /** 駅名（title） */
  name: string;
  /** 区 */
  ward: string;

  // --- tag 系（multi_select → 配列） ---
  anchors: AnchorType[];
  shocks: ShockType[];
  demands: DemandType[];
  archetypes: ArchetypeType[];
  gapTypes: GapType[];
  lines: LineType[];

  // --- select（任意） ---
  status?: StatusType;
  category?: CategoryType;

  // --- 本文 6 項目（rich_text、ループ骨格 ADR-0006） ---
  /** 観察お題（①の問い。答えは言わない） */
  observationPrompt: string;
  /** お題の解説（①への直接の答え） */
  observationAnswer: string;
  /** 供給の筋（③） */
  supplyThread: string;
  /** 需要の筋（③） */
  demandThread: string;
  /** ズレ（④） */
  gap: string;
  /** 未来の観点（⑤・答えなし） */
  futureLenses: string;
}

// -----------------------------------------------------------------------------
// 3. Notion プロパティ名（日本語）→ アクセス用キー定数
//    Notion 上のプロパティは日本語名なので、props[NOTION_PROP.xxx] でアクセスする。
// -----------------------------------------------------------------------------

export const NOTION_PROP = {
  // title / text
  name: "駅名",
  ward: "区",
  // multi_select
  anchors: "アンカー",
  shocks: "ショック",
  demands: "需要",
  archetypes: "類型",
  gapTypes: "ズレ類型",
  lines: "路線",
  // select
  status: "ステータス",
  category: "カテゴリ",
  // 本文（rich_text）
  observationPrompt: "観察お題",
  observationAnswer: "お題の解説",
  supplyThread: "供給の筋",
  demandThread: "需要の筋",
  gap: "ズレ",
  futureLenses: "未来の観点",
} as const;

// -----------------------------------------------------------------------------
// 4. Notion レスポンス → Station マッパー
//    厳密な Notion SDK 型には依存せず、入力は any で受ける。
// -----------------------------------------------------------------------------

/** Notion の最小限のプロパティ構造（読み出しに必要な部分だけ） */
type NotionRichTextItem = { plain_text?: string };
type NotionSelectOption = { name?: string };
type NotionProperty = {
  title?: NotionRichTextItem[];
  rich_text?: NotionRichTextItem[];
  multi_select?: NotionSelectOption[];
  select?: NotionSelectOption | null;
};

/** title / rich_text 配列を 1 本の文字列に結合する */
function readText(prop: NotionProperty | undefined): string {
  const items = prop?.title ?? prop?.rich_text ?? [];
  return items.map((t) => t.plain_text ?? "").join("");
}

/** multi_select を文字列配列にする。リテラル union 側へは as で寄せる（CMS 側の値を信頼） */
function readMultiSelect<T extends string>(prop: NotionProperty | undefined): T[] {
  const options = prop?.multi_select ?? [];
  return options
    .map((o) => o.name)
    .filter((name): name is string => Boolean(name)) as T[];
}

/** select を任意の文字列にする（未設定なら undefined） */
function readSelect<T extends string>(prop: NotionProperty | undefined): T | undefined {
  const name = prop?.select?.name;
  return name ? (name as T) : undefined;
}

/**
 * Notion API のページ取得結果（page.properties）から Station へ変換する雛形。
 *
 * @param page Notion の page オブジェクト（retrieve / query の results 要素）。
 *             page.properties が { [日本語プロパティ名]: { 型ごとの構造 } } を持つ。
 */
export function mapNotionPageToStation(page: any): Station {
  const props: Record<string, NotionProperty> = page?.properties ?? {};

  return {
    name: readText(props[NOTION_PROP.name]),
    ward: readText(props[NOTION_PROP.ward]),

    anchors: readMultiSelect<AnchorType>(props[NOTION_PROP.anchors]),
    shocks: readMultiSelect<ShockType>(props[NOTION_PROP.shocks]),
    demands: readMultiSelect<DemandType>(props[NOTION_PROP.demands]),
    archetypes: readMultiSelect<ArchetypeType>(props[NOTION_PROP.archetypes]),
    gapTypes: readMultiSelect<GapType>(props[NOTION_PROP.gapTypes]),
    lines: readMultiSelect<LineType>(props[NOTION_PROP.lines]),

    status: readSelect<StatusType>(props[NOTION_PROP.status]),
    category: readSelect<CategoryType>(props[NOTION_PROP.category]),

    observationPrompt: readText(props[NOTION_PROP.observationPrompt]),
    observationAnswer: readText(props[NOTION_PROP.observationAnswer]),
    supplyThread: readText(props[NOTION_PROP.supplyThread]),
    demandThread: readText(props[NOTION_PROP.demandThread]),
    gap: readText(props[NOTION_PROP.gap]),
    futureLenses: readText(props[NOTION_PROP.futureLenses]),
  };
}
