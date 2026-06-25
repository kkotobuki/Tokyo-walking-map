# ADR-0015: 地図はWeb版(Vercel)＋Leaflet、軌跡は前面GPS記録でローカル保存

- ステータス: Accepted
- 日付: 2026-06-24
- 関連: ADR-0012（スタック=Expo）を Web ターゲットに拡張。ADR-0007/0009（記録・local-first）に「歩行軌跡」を追加。

## コンテキスト

「散歩の記録」を実現するため、アプリに地図を入れたいという要望が出た。やりたいことは3つ:

1. 現在地を地図に表示する
2. 歩いた道を線で残す（散歩の記録）
3. くじで当たった駅が地図上のどこかを大きく表示する

検討の結果、判断に効く前提が3点あった。

- **Expo Go では地図/GPSが動かない**: 地図ライブラリ（`react-native-maps` 等）はネイティブSDKを抱えるため、Expo Go では不可。実機ネイティブで動かすには Development Build（EAS）が必要で、iPhone無料運用だと Xcode ローカルビルド＋7日失効という運用コストがかかる。
- **Web版なら最短**: Expo は Web 書き出し（react-native-web）に対応する。地図はブラウザ用 Leaflet（OSM・APIキー不要・無料）を使えば、ビルド不要・即デプロイで「地図・現在地・駅表示」が形になる。
- **バックグラウンドGPSはブラウザ不可**: ブラウザの Geolocation は前面（タブが見えている間）でしか動かず、ロック/別アプリ切替で止まる。「ポケットに入れて歩いて記録」はWebでは満たせない。

ユーザーは当面これを許容し、**まずWeb版で最速に形にする**方針を選んだ。

## 決定

- **Web版を Vercel にデプロイ**する。`expo export -p web`（`web.output: "single"` のSPA）を `dist/` に出し、Vercel が配信する。言語・既存コードはそのまま流用する。
- **地図は Leaflet（react-leaflet）**。タイルは Google Map に近い見た目の **CARTO Voyager** を既定とし、**航空写真（Esri World Imagery ＋ CARTO ラベル）に切り替えるトグル**を持つ。いずれも APIキー不要・無料枠で個人利用に収まる（要 attribution）。`react-native-maps` は Web 非対応のため Web では使わない。
- **地図画面は `MapScreen.web.tsx`**（Leaflet 実装）と **`MapScreen.tsx`**（ネイティブ用スタブ）に分け、Metro のプラットフォーム解決に任せる。将来ネイティブ化しても壊れない。
- **歩行軌跡は前面GPSで記録**: `navigator.geolocation.watchPosition` で点列を集め Polyline で描画。5m未満の移動はジッタとして無視。軌跡は **localStorage に保存**（駅名でひもづけ、過去の散歩を薄い線で重ね描き）。ADR-0007/0009 の「記録・local-first」の延長。
- **駅座標は同梱表で持つ**: Notion スキーマは触らず、`data/stationCoords.ts`（駅名→緯度経度）をアプリに同梱して名前で突き合わせる。表は `scripts/geocode-stations.ts`（OSM Nominatim・無料）で一括生成する。

## 根拠

- **「縦に薄く1機能」**（CLAUDE.md）に沿い、地図の本体価値（地図・現在地・駅の位置・歩いた線が残る）を、ネイティブビルドの重い段取り無しで最短検証できる。
- 仮説/感想は引き続き Notion、**重い点列はローカル**、と住み分けることで Notion を汚さない（ADR-0009 local-first と整合）。
- Leaflet/OSM はキー登録・課金導線が無く、個人開発の初速に最適。

## 結果

- (+) ビルド不要・無料で、地図と散歩記録をすぐ公開・利用できる。
- (+) コード・言語（TypeScript/Expo）を流用、ネイティブ移行の余地も残す（スタブ構成）。
- (−) **バックグラウンド記録ができない**（画面を前面に保つ必要）。本格的な「ポケット記録」が欲しくなったらネイティブ（Dev Build）へ移行する。
- (−) **セキュリティ注意**: `EXPO_PUBLIC_NOTION_TOKEN` は Web バンドルに焼き込まれ、公開URLのJSから誰でも読める。Vercel の Deployment Protection（owner認証）等でURLを保護する。恒久対策はバックエンド経由（ADR-0012 の「配布時は要バックエンド」）。
- (−) 軌跡が端末の localStorage 依存（ブラウザデータ削除で消える）。必要なら後でエクスポート/同期を足す。

## 検討した代替案

- **ネイティブ Dev Build（react-native-maps）**: バックグラウンド記録ができるが、iPhone無料だと Xcode ローカルビルド＋7日失効の運用が重い。初速優先で却下（将来の移行先として保持）。
- **Mapbox GL JS**: 軌跡描画が綺麗だが APIキー登録が要る。まずキー不要の Leaflet を採用。
- **駅座標を Notion に持つ**: スキーマ変更と全駅入力が要る。同梱表＋自動ジオコーディングの方が軽いため却下。
