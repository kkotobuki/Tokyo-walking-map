// アプリ設定。秘密は EXPO_PUBLIC_* 環境変数（.env, gitignore 済み）から読む。
// EXPO_PUBLIC_ 接頭辞の付いた変数だけがアプリのバンドルに露出する（ADR-0012）。
// 個人専用・自分の端末でのみ使う前提でトークンを同梱する。配布時は要バックエンド。

export const NOTION_TOKEN = process.env.EXPO_PUBLIC_NOTION_TOKEN ?? "";

// web（ブラウザ）は CORS で Notion を直叩きできない。dev 中は proxy を経由する（ADR-0015）。
// 設定時はトークンを proxy 側（サーバ）が持つので、web クライアントはトークン不要になる。
export const NOTION_PROXY = process.env.EXPO_PUBLIC_NOTION_PROXY ?? "";

// 既存DB「東京100駅経済観察マップ」の database id。
// リポジトリに識別子を載せないため、値は EXPO_PUBLIC_NOTION_DB_ID（.env, gitignore 済み）から読む。
export const DATABASE_ID = process.env.EXPO_PUBLIC_NOTION_DB_ID ?? "";
