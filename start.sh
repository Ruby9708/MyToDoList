#!/bin/bash
cd "$(dirname "$0")"

PORT=3000

echo "=================================================="
echo "🚀 正在啟動 MyToDoList 本地伺服器..."
echo "=================================================="

# 開啟瀏覽器函數
open_browser() {
  sleep 1
  if which open >/dev/null 2>&1; then
    open "http://localhost:$PORT"
  fi
}

# 優先順序 1: Ruby (macOS 系統內建，免安裝額外工具)
if which ruby >/dev/null 2>&1; then
  echo "📡 使用 macOS 內建 Ruby 伺服器啟動於 http://localhost:$PORT"
  open_browser &
  ruby -run -e httpd . -p $PORT
  exit 0
fi

# 優先順序 2: Python 3
if which python3 >/dev/null 2>&1; then
  echo "📡 使用 Python 3 啟動於 http://localhost:$PORT"
  open_browser &
  python3 serve.py
  exit 0
fi

# 優先順序 3: PHP (若有安裝)
if which php >/dev/null 2>&1; then
  echo "📡 使用 PHP 伺服器啟動於 http://localhost:$PORT"
  open_browser &
  php -S localhost:$PORT
  exit 0
fi

echo "⚠️ 未檢測到伺服器執行環境，正直接為您以瀏覽器開啟 index.html..."
open index.html
