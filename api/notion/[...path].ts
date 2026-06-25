// Vercel サーバーレス関数：本番の Notion プロキシ（ADR-0016）。
// ローカルの scripts/notion-proxy.ts（dev 専用）の常設版。web 画面と同一オリジン
// （https://<your-app>/api/notion/...）で動くため CORS が発生せず、トークンは
// サーバ側の環境変数 NOTION_TOKEN から注入する（クライアントのバンドルに乗らない）。
//
// ルーティング: クライアントは EXPO_PUBLIC_NOTION_PROXY=/api/notion を見て
//   /api/notion/v1/databases/<id>/query のように叩く（src/notion.ts）。
//   この関数が /v1/* を https://api.notion.com/v1/* へ転送する。
//
// セキュリティ前提（重要）:
//   この関数はトークンを注入して Notion を叩くため、URL に到達できる者は誰でも
//   あなたの Notion を読み書きできてしまう。CORS はブラウザ越しの保護にすぎず、
//   curl 等の直接アクセスは防げない。したがって本番デプロイ全体に
//   Vercel Deployment Protection（オーナー認証 / パスワード）を必ず掛けること（ADR-0016）。

// 注: 型 import を避けるため req/res は any。Vercel の @vercel/node が
//     CommonJS/ESM を自動解決し、Node 20 のグローバル fetch を使う。
export default async function handler(req: any, res: any): Promise<void> {
  const TOKEN = process.env.NOTION_TOKEN;
  if (!TOKEN) {
    res.status(500).json({ error: "NOTION_TOKEN is not set (Vercel の環境変数に設定してください)" });
    return;
  }

  // /api/notion を剥がして Notion のパスを得る（クエリ文字列も保持）。
  const upstreamPath = String(req.url ?? "").replace(/^\/api\/notion/, "");

  // Notion REST（/v1/*）以外へは転送しない（dev proxy と同じ制限）。
  if (!upstreamPath.startsWith("/v1/")) {
    res.status(404).json({ error: "only /v1/* is proxied" });
    return;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && req.body != null;

  try {
    const upstream = await fetch("https://api.notion.com" + upstreamPath, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": (req.headers["notion-version"] as string) ?? "2022-06-28",
        "Content-Type": "application/json",
      },
      // Vercel は JSON ボディを req.body にパース済み。Notion へは再シリアライズして渡す。
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
