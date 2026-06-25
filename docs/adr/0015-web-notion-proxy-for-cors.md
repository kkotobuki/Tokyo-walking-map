# ADR-0015: web は dev プロキシ経由で Notion を叩く（CORS 回避＋トークンをクライアントから外す）

- ステータス: Accepted
- 日付: 2026-06-25
- 関連: ADR-0012（Notion を唯一のデータの家）/ ADR-0008（Notion を保存先）を実行面で補う。注意2（EXPO_PUBLIC にトークンを置く危険）への web 側の回答。

## コンテキスト

アプリを web（`expo start` → ブラウザ）で動かすと、`fetchAllStations` 等の Notion 直叩きが **CORS で全滅**する。

```
Access to fetch at 'https://api.notion.com/v1/databases/.../query' from origin 'http://localhost:8082'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

Notion REST API はブラウザ向けの CORS ヘッダを返さないため、これは設定で直らない（`src/notion.ts` も元々「ネイティブ前提＝CORS なし」と書いていた）。加えて、web で動かすにはトークンを `EXPO_PUBLIC_NOTION_TOKEN` でバンドルに焼き込む必要があり、配布物からトークンが抜ける（注意2）という別の危険も抱えていた。

## 決定

**web では薄い dev プロキシを経由して Notion を叩く**。

- `scripts/notion-proxy.ts`（`npm run proxy`）が `http://localhost:8787` で待ち受け、CORS ヘッダを付与しつつ、**トークンをサーバ側（node の env / 環境ファイル）で注入**して `api.notion.com` へ転送する。
- アプリは `EXPO_PUBLIC_NOTION_PROXY` が設定されていればそのベース URL を使い（`src/notion.ts` / `src/config.ts`）、**proxy 経由時はクライアントから `Authorization` を送らない**＝web クライアントにトークンを置かない。
- ネイティブ（iOS/Android）は従来どおり `api.notion.com` 直叩き（CORS 制約がないため）。`EXPO_PUBLIC_NOTION_PROXY` を空にすれば直叩きに戻る。

## 根拠

- CORS はクライアント設定では回避できず、ブラウザで Notion を使うには中継が要る。最小の中継＝薄い proxy。
- proxy がトークンを持つことで、**web ではトークンがクライアントに乗らない**（注意2 を web について解消）。
- Notion を保存先として維持（ADR-0012/0008 と非衝突）。データモデルやオーサリング手順（ADR-0009）は変えない。
- dev 専用の最小構成。配布時の本番バックエンドは別途（ADR-0012 の「配布時は要バックエンド」を、この proxy が将来差し替える土台になる）。

## 結果

- (+) web で Notion 読み書きが通る。トークンが web クライアントから外れる。
- (+) ネイティブは無変更。`EXPO_PUBLIC_NOTION_PROXY` の有無だけで切替。
- (−) web で使う間は proxy プロセスを別ターミナルで起動しておく必要がある。
- オープンプロキシ化を防ぐため、proxy は **127.0.0.1 のみで待受／CORS は localhost 系オリジンの allowlist のみ（`*` を使わない）／許可外オリジンは 403 で転送せず／転送パスは `/v1/` 限定**とした（自動セキュリティレビュー指摘を反映）。それでも dev 専用で、公開ホストには絶対に置かない。

## 検討した代替案

- **実行時データを同梱ローカル JSON に切替（reads をローカル化）**: オフライン化でき ADR-0009 とも整合するが、訪問ステータス/仮説/感想の保存先が割れる（localStorage 化が必要）中規模改修になる。Notion を保存先に保ちたい現段階では過剰。将来オフライン対応として再検討。
- **ネイティブのみで運用**: コード変更ゼロだが web 開発を捨てることになる。
- **公開 CORS プロキシ/ブラウザ拡張**: トークンを第三者に晒す・再現性が低いため却下。
