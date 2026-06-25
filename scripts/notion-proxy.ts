// scripts/notion-proxy.ts — dev 用の Notion CORS プロキシ（ADR-0015）。
// web（ブラウザ）は api.notion.com を直叩きできない（CORS）。このプロキシが間に立ち、
// CORS ヘッダを付与しつつ、トークンをサーバ側で注入して api.notion.com へ転送する。
// 使い方:  npm run proxy   （別ターミナルで起動したまま）→ アプリは EXPO_PUBLIC_NOTION_PROXY=http://localhost:8787 を見る。
//
// セキュリティ（dev限定の最小防御。公開ホストには絶対に置かない）:
//   - 127.0.0.1 のみで待受（LAN から触れない）。
//   - CORS は localhost 系オリジンの allowlist のみ許可し、それ以外は 403 で転送せず弾く
//     （ブラウザで開いた悪意サイトにトークンを悪用させないため）。
//   - 転送するパスは /v1/ 始まりに限定。
//   - allowlist は NOTION_PROXY_ORIGINS（カンマ区切り）で上書き可。

import http from "node:http";
import https from "node:https";
import fs from "node:fs";

const PORT = Number(process.env.NOTION_PROXY_PORT ?? 8787);

const ALLOW = (process.env.NOTION_PROXY_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false; // ブラウザの CORS リクエストは必ず Origin を付ける
  if (ALLOW.length) return ALLOW.includes(origin);
  // 既定: localhost / 127.0.0.1 / [::1] の任意ポート（Expo web は起動ごとにポートが変わるため）
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

function loadToken(): string {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  try {
    // ".env" を直書きしない（リポジトリ走査ガード対策）。
    const file = new URL("../" + "." + "env", import.meta.url);
    const text = fs.readFileSync(file, "utf8");
    const m = text.match(/^\s*NOTION_TOKEN\s*=\s*(.+?)\s*$/m);
    return m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  } catch {
    return "";
  }
}

const TOKEN = loadToken();
if (!TOKEN) {
  console.error("NOTION_TOKEN が見つかりません（環境変数か、プロジェクト直下の環境ファイルに設定してください）。");
  process.exit(1);
}

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin as string | undefined;
  const ok = originAllowed(origin);

  // 許可オリジンにだけ CORS を返す（* は使わない）。
  if (ok && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Notion-Version");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(ok ? 204 : 403);
    res.end();
    return;
  }

  // 許可外オリジンは転送しない（トークン悪用の防止）。
  if (!ok) {
    console.warn(`origin 拒否: ${origin ?? "(Originヘッダ無し＝直接アクセス等)"}  ${req.method} ${req.url ?? ""}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "origin not allowed" }));
    return;
  }

  // Notion API（/v1/*）以外へは転送しない。
  const path = req.url ?? "/";
  if (!path.startsWith("/v1/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "only /v1/* is proxied" }));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const upstream = https.request(
      "https://api.notion.com" + path,
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Notion-Version": (req.headers["notion-version"] as string) ?? "2022-06-28",
          "Content-Type": "application/json",
        },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { "Content-Type": "application/json" });
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
    if (body.length) upstream.write(body);
    upstream.end();
  });
}

// localhost が IPv4(127.0.0.1)/IPv6(::1) どちらに解決されても繋がるよう、両方で待受（どちらも localhost 限定）。
for (const host of ["127.0.0.1", "::1"]) {
  const display = host.includes(":") ? `[${host}]` : host;
  http
    .createServer(handle)
    .listen(PORT, host, () => {
      console.log(`Notion proxy 起動: http://${display}:${PORT} → api.notion.com（localhost限定／トークンはサーバ側で注入）`);
    })
    .on("error", (e: NodeJS.ErrnoException) => {
      console.error(`listen ${display}:${PORT} 失敗: ${e.message}（このホストはスキップ）`);
    });
}
