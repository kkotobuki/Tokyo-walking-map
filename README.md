# Tokyo-walking-map

知らない街を歩きながら「この街はなぜこうなったのか」を自分で考え、仮説を立てて残し、史実で答え合わせする思考装置。観光アプリでも歩数アプリでもなく「東京というシステムを理解するゲーム」を目指す。

- 設計判断は `docs/adr/`、次の作業は `docs/NEXT_STEPS.md`。
- 駅データは `data/stations/*.json`（77駅）。
- スタック: Expo (React Native) + Notion(CMS)。秘密は `.env`（gitignore済み）で管理。

## セットアップ
`.env.example` をコピーして `.env` を作り、Notion トークンと DB ID を設定する。

web 版を使う場合は次の2つも必要（詳細は `.env.example` のコメント参照）:

- `EXPO_PUBLIC_NOTION_PROXY=http://localhost:8787` — アプリが proxy を向くための設定
- `NOTION_TOKEN` — proxy がサーバ側で Notion に付与するトークン（未設定だと proxy が起動直後に終了する）

## 立ち上げ方

### web（ブラウザ）

```bash
npm run web
```

これ1つで **Notion proxy と Expo dev server が同時に起動**する（Ctrl-C で両方止まる。proxy が既に別で起動していた場合はそれを流用し、止めるのは Expo だけ）。

web 版はブラウザの CORS 制約で Notion API を直接叩けないため、proxy（`localhost:8787`）の起動が必須（ADR-0015）。proxy が起動していないと画面は開くがデータ取得が「うまく読めませんでした / Failed to fetch」で失敗する。

個別に起動したい場合はターミナルを2つ使う:

```bash
npm run proxy   # ターミナル1（起動したまま）
npm start       # ターミナル2 → w キーで web を開く
```

### ネイティブ（iPhone / Expo Go）

```bash
npm start
```

表示される QR コードを Expo Go で読み取る。**proxy は不要**（ネイティブは CORS の制約がなく Notion を直接叩く）。

### 本番（Vercel）

web 版のデプロイでは proxy の手動起動は不要。同梱のサーバーレス関数 `api/notion/[...path].ts` が proxy を担う（ADR-0016。Deployment Protection 必須）。
