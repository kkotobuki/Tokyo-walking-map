# ADR-0016: 本番の Notion プロキシを Vercel サーバーレス関数（/api/notion）として常設する

- ステータス: Accepted
- 日付: 2026-06-25
- 関連: ADR-0015（dev プロキシ `scripts/notion-proxy.ts`）の本番版。ADR-0012「配布時は要バックエンド」の具体化。ADR-0015(web-map) の弱点「`EXPO_PUBLIC_NOTION_TOKEN` が web バンドルに焼き込まれる」への恒久対策。

## コンテキスト

web 版を `expo start`（ブラウザ）で動かすと Notion 直叩きが CORS で全滅するため、ADR-0015 で **ローカル dev プロキシ**（`http://localhost:8787`）を導入した。これは動くが、

- web を触るたびに proxy プロセスを**別ターミナルで起動**する必要がある（2プロセス問題）。
- 「proxy を立てなくて済むようトークンをクライアントに焼く」と、公開URLのJSから**トークンが読めてしまう**（ADR-0015(web-map) の (−)）。

CORS はクライアント設定では消せず、回避には**画面と同一オリジンの中継**が要る。dev プロキシの常設版を、デプロイ先（Vercel）にサーバーレス関数として置けば、この2点が同時に片付く。

## 決定

**本番では Vercel サーバーレス関数 `api/notion/[...path].ts` を Notion プロキシとして使う。**

- 関数は `/api/notion/v1/*` を `https://api.notion.com/v1/*` へ転送し、トークンを **サーバ側の環境変数 `NOTION_TOKEN`**（`EXPO_PUBLIC_` を付けない＝バンドルに出さない）から注入する。転送パスは `/v1/` 始まりに限定。
- クライアントは **`EXPO_PUBLIC_NOTION_PROXY=/api/notion`**（相対パス＝同一オリジン）を見て叩く。同一オリジンなので **CORS が発生しない**。`src/notion.ts` は proxy 設定時に `Authorization` を送らない既存挙動のため、**トークンはクライアントに乗らない**。
- `vercel.json` の SPA rewrite は `/((?!api/).*)` とし、`/api/*` を関数へ通す。
- **デプロイ全体に Vercel Deployment Protection（オーナー認証 / パスワード）を必ず掛ける**。関数はトークンを注入するため、URL に到達できる者は誰でも Notion を読み書きできる。CORS はブラウザ越しの保護にすぎず、curl 等の直接アクセスは防げないため、保護はアプリ層ではなくデプロイ保護で担保する。
- **ローカル開発（ホットリロード）は従来どおり** `scripts/notion-proxy.ts`（localhost:8787）を使う。`.env` の `EXPO_PUBLIC_NOTION_PROXY=http://localhost:8787` はローカル用、Vercel 側の同名環境変数 `/api/notion` は本番用、と環境ごとに住み分ける。

### Vercel 環境変数（ダッシュボードで設定）

| 変数 | 値 | 露出 |
| --- | --- | --- |
| `NOTION_TOKEN` | Notion インテグレーションのトークン | サーバのみ（関数が読む） |
| `EXPO_PUBLIC_NOTION_PROXY` | `/api/notion` | バンドル（相対パスのみ・秘密でない） |
| `EXPO_PUBLIC_NOTION_DB_ID` | データベースID | バンドル（識別子・秘密でない） |

`EXPO_PUBLIC_NOTION_TOKEN` は Vercel の本番ビルドからは**外す**（焼き込まない）。

## 根拠

- 同一オリジン中継により CORS を根本から消す（ヘッダ細工も preflight 対応も不要）。
- トークンがサーバ側だけに存在し、公開バンドルから外れる（ADR-0015(web-map) の弱点を解消）。
- ローカル proxy は dev のホットリロード用に残すため、開発体験は不変。本番URLは1つで完結（歩きながら使うのは本番URL＝プロセス起動ゼロ）。

## 結果

- (+) 本番 web は1つのURLで動く。CORS 消滅・トークン非露出。
- (+) ネイティブ（iOS/Android）は無変更（`EXPO_PUBLIC_NOTION_PROXY` 空で直叩き）。
- (−) **デプロイ保護が前提**。保護を外すとトークン悪用の公開窓口になる。保護必須を本ADRに明記。
- (−) ローカル開発では引き続き dev proxy が要る（2プロセス）。本番運用とは別問題として許容。

## 検討した代替案

- **ローカルから本番関数を叩く（local→prod）**: ローカルでも proxy 不要にできるが、関数を cross-origin に開く必要があり、公開URL＋トークンの悪用面が増える。デプロイ保護との両立も面倒なため、ローカルは dev proxy 据え置き。
- **`vercel dev` で関数も含めローカル起動**: 1コマンド化できるが Expo の Metro ホットリロードと相性が悪い。開発体験を優先して却下。
- **Edge Function 化**: 低レイテンシだが、Node ランタイム前提の素直な fetch 転送で十分なため現状は Node 関数。
