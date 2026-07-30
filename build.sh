#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$ROOT/dist}"
mkdir -p "$OUT"

build() {
  local dir_name="$1"
  local zip_name="${2:-$dir_name}"
  local dir="$ROOT/$dir_name"
  local zip="$OUT/$zip_name.zip"

  if [[ ! -d "$dir" ]]; then
    echo "skip: $dir_name (folder not found)" >&2
    return
  fi

  rm -f "$zip"
  (
    cd "$dir"
    zip -qr "$zip" manifest.json background.js content.js styles.css icons/
  )
  echo "built $zip"
}

build chrome HolyVK-Chrome
build firefox HolyVK-Firefox
build yandex HolyVK-Yandex
