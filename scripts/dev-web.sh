#!/usr/bin/env bash
# web 版の一括起動: Notion proxy（CORS 回避・ADR-0015）と Expo dev server を同時に立ち上げる。
# 使い方: npm run web
# 終了: Ctrl-C で Expo と proxy の両方が止まる。
# proxy が既に起動中（ポート使用中）の場合は二重起動せず、そのまま使う。
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${NOTION_PROXY_PORT:-8787}"

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ポート :${PORT} は使用中（proxy 起動済みとみなしてそのまま使います。別プロセスなら止めてから再実行）。"
else
  # npm run 経由では node_modules/.bin が PATH に入るため直呼びできる（npx 層を挟むとシグナル転送が不確実になる）。
  tsx scripts/notion-proxy.ts &
  PROXY_PID=$!
  # Expo 終了時に proxy も道連れにする。
  # EXIT だけだと Ctrl-C（INT）でトラップが走らず proxy が孤児化するため INT/TERM も拾う。
  trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT INT TERM
  # proxy の起動失敗（トークン未設定等）を先に検知する。
  sleep 1
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    echo "Notion proxy の起動に失敗しました（上のログを確認してください）。" >&2
    exit 1
  fi
fi

expo start --web
