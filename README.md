# Tokyo-walking-map

知らない街を歩きながら「この街はなぜこうなったのか」を自分で考え、仮説を立てて残し、史実で答え合わせする思考装置。観光アプリでも歩数アプリでもなく「東京というシステムを理解するゲーム」を目指す。

- 設計判断は `docs/adr/`、次の作業は `docs/NEXT_STEPS.md`。
- 駅データは `data/stations/*.json`（77駅）。
- スタック: Expo (React Native) + Notion(CMS)。秘密は `.env`（gitignore済み）で管理。

## セットアップ
`.env.example` をコピーして `.env` を作り、Notion トークンと DB ID を設定する。
