// data/vocab.ts
// 語彙（タグ）の単一ソース・オブ・トゥルース。
// Notion DB「東京100駅経済観察マップ」(data source e066cd64-d94f-44f1-acc5-e284ca84eec3)
// の multi_select / select オプションと一致させる。
//
// 運用ルール:
// - 新しいタグが要るときは、まずここに足す（ボトムアップで増やしてよい）。
// - import スクリプトは、駅データで使われたタグがここに無ければ警告を出す
//   （Notion 側はインポート時に自動でオプション生成されるが、ここへの追記が一貫性の担保）。
// - 類型は ADR-0010 で 15→11 種に統合済み（特定産業の集積は「専門集積型」＋需要/アンカーで表す）。

export const ANCHORS = [
  "寺社", "宿場・街道", "城・武家地", "港・河岸・物流結節", "大学・学校", "官庁",
  "鉄道ターミナル", "工場・産業立地", "軍・基地跡", "卸・問屋街", "計画型(財閥/地主開発)",
  "火除地", "出版・印刷", "病院・医療機関", "鉄道用地・車両基地", "埋立・干拓地",
  "撮影所・スタジオ", "闇市・マーケット起源", "上水・インフラ跡地", "花街・歓楽起源", "証券・金融街",
  "公園・大規模緑地", "近郊農地・畑作", "空港", "郊外住宅地開発",
] as const;

export const SHOCKS = [
  "関東大震災", "戦災+闇市", "鉄道・地下鉄開通", "区画整理・用途地域", "バブルと崩壊",
  "大規模再開発", "オリンピック", "脱工業化・工場移転", "EC化・ネット", "インバウンド",
  "新幹線・リニア開業", "鉄道貨物・物流機能の縮小", "金融のIT化・電子化", "リノベーション・床の再活用",
  "移民・多文化化", "ジェントリフィケーション・高級化",
] as const;

export const DEMANDS = [
  "部品・自作", "家電", "PC", "サブカル", "観光", "食", "買い物", "住む", "学ぶ", "働く",
  "本・知識", "楽器・音楽", "医療", "繊維・手芸", "ものづくり発注", "宝飾・貴金属",
  "アニメ・映像", "行楽・レジャー", "文化・芸術", "演劇・舞台", "古着",
  "IT・スタートアップ", "信仰・参詣", "シニア・高齢者", "祭り・地域イベント", "飲み・酒場",
  "カフェ・コーヒー", "高級ブランド・百貨店", "ファッション・若者文化", "宿泊・滞在", "多文化・移民コミュニティ",
  "金融・取引", "スポーツ・興行観戦", "物流・倉庫業務", "メディア・放送",
] as const;

export const ARCHETYPES = [
  "門前町型", "大学集積型", "闇市あがり型", "ターミナル商業型", "住宅地型", "官庁街型",
  "興行・歓楽街型", "オフィス街型", "ブランド商店街型", "クリエイティブ転換型",
  // 特定産業の面的集積は「専門集積型」に統合（ADR-0010）。どの産業かは 需要/アンカー で表す。
  // 旧: サブカル集積型 / 古書店街型 / 専門卸街型 / 町工場集積型 / 大工場・産業発祥型
  "専門集積型",
] as const;

export const GAP_TYPES = [
  "供給先行", "需要先行", "供給の慣性で残った床に新需要", "需要が去って供給だけ残存", "外来需要の再来型",
  "稼働時間の偏り",
] as const;

export const LINES = [
  "JR山手線", "JR京浜東北線", "JR総武線", "東京メトロ日比谷線", "つくばエクスプレス", "都営線",
  "東京メトロ半蔵門線", "東京メトロ丸ノ内線", "東京メトロ千代田線", "東京メトロ東西線", "小田急線",
  "東京メトロ南北線", "東武スカイツリーライン", "東武大師線", "東急大井町線", "りんかい線",
  "西武池袋線", "JR常磐線", "東急東横線", "東急目黒線", "東急多摩川線", "東京メトロ銀座線",
  "京成本線", "東京メトロ有楽町線", "ゆりかもめ", "都電荒川線", "京王井の頭線",
  "東京メトロ副都心線", "東急田園都市線", "JR埼京線", "東武東上線", "JR中央線", "京王線",
  "東急池上線", "京成押上線", "東京モノレール", "東武亀戸線", "西武新宿線", "JR京葉線",
  "JR湘南新宿ライン", "JR南武線", "京成金町線", "京急本線", "京急空港線", "多摩モノレール",
] as const;

export const CATEGORIES = ["食市場", "金融商業", "IT", "観光文化", "物流", "住宅", "下町", "官公庁"] as const;
export const STATUSES = ["未訪問", "予定", "訪問済み"] as const;

export type AnchorType = (typeof ANCHORS)[number];
export type ShockType = (typeof SHOCKS)[number];
export type DemandType = (typeof DEMANDS)[number];
export type ArchetypeType = (typeof ARCHETYPES)[number];
export type GapType = (typeof GAP_TYPES)[number];
export type LineType = (typeof LINES)[number];
export type CategoryType = (typeof CATEGORIES)[number];
export type StatusType = (typeof STATUSES)[number];

/**
 * 駅データ（ローカルの単一レコード）。
 * data/stations/<駅名>.json はこの形（日本語キー＝Notion プロパティ名）で書く。
 * ループUI・ユーザーの仮説(②賭け)・歩行メモ(時系列)・AI分析は Notion/ここには持たず、アプリ側（ADR-0006/0007）。
 */
export interface StationRecord {
  駅名: string;
  区?: string;
  カテゴリ?: CategoryType;
  路線?: LineType[];
  アンカー: AnchorType[];
  ショック: ShockType[];
  需要: DemandType[];
  類型: ArchetypeType[];
  ズレ類型: GapType[];
  観察お題: string;   // ① 問い（答えは言わない）
  お題の解説: string; // ① の問いへの直接の答え
  供給の筋: string;   // ③
  需要の筋: string;   // ③
  ズレ: string;       // ④
  未来の観点: string; // ⑤（答えなし）
  おすすめルート?: string; // 任意：歩く順路「駅→A→B」。空なら import は既存値を上書きしない
  観察ポイント?: string;   // 任意：歩くとき何を見るか
  // --- 出発前プラン（ADR-0018。実用情報なので出発前に開示する） ---
  定番スポット?: string;   // 任意：1行1スポット「名前 — 一言説明」×3〜5
  さくっとコース?: string; // 任意：「約◯分｜駅◯◯口→A→B→…→駅」（30〜45分）
  しっかりコース?: string; // 任意：同フォーマット（90〜120分）
  /** 既存語彙に無い概念を提案する場合（import で警告として集計） */
  proposedNewOptions?: { field: string; name: string; reason: string }[];
}

export const ALLOWED = {
  アンカー: ANCHORS, ショック: SHOCKS, 需要: DEMANDS, 類型: ARCHETYPES,
  ズレ類型: GAP_TYPES, 路線: LINES, カテゴリ: CATEGORIES,
} as const;
