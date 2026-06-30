#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> OkzMongo ビルド開始"

# Wayland 環境での既知バグ回避（WebKit2GTK: Error 71 EPROTO）
export GDK_BACKEND=x11

cargo tauri build --no-bundle

echo "==> ビルド完了"
echo "    バイナリ: src-tauri/target/release/okzmongo"
