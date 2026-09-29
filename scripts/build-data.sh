#!/usr/bin/env bash
# 从 Protomaps 每日 OSM 底图里截出莫斯科州，输出 public/moscow-oblast.pmtiles，再生成离线搜索索引。
# 需要能访问 build.protomaps.com（GitHub Actions 可以；部分网络环境需要代理）。
set -euo pipefail
cd "$(dirname "$0")/.."

BBOX="${BBOX:-34.85,54.25,40.25,57.05}"   # 莫斯科州（含莫斯科市）
MAXZOOM="${MAXZOOM:-14}"                   # 14 级已含建筑和街道；更高级别由客户端放大显示
OUT="public/moscow-oblast.pmtiles"
CLI="${PMTILES_CLI:-./pmtiles}"

if [ ! -x "$CLI" ]; then
  V=1.28.0
  curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${V}/go-pmtiles_${V}_Linux_x86_64.tar.gz" -o /tmp/pmtiles.tgz
  tar -xzf /tmp/pmtiles.tgz -C . pmtiles
  chmod +x pmtiles
fi

SRC=""
for d in 1 2 3 4 5 6 7 8; do
  DATE=$(date -u -d "$d days ago" +%Y%m%d)
  URL="https://build.protomaps.com/${DATE}.pmtiles"
  if curl -fsI "$URL" >/dev/null 2>&1; then SRC="$URL"; break; fi
done
[ -n "$SRC" ] || { echo "找不到可用的 Protomaps 每日构建" >&2; exit 1; }
echo "数据源：$SRC  范围：$BBOX  最大级别：$MAXZOOM"

mkdir -p public
"$CLI" extract "$SRC" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
ls -lh "$OUT"

node --experimental-strip-types scripts/build-index.mjs "$OUT" public/places-index.json

# 切成 4MB 小块：Android WebView 的本地服务器不能正确处理 Range 请求，见 src/pm-source.ts
node scripts/split-chunks.mjs "$OUT" public/data
[ "${KEEP_SINGLE:-0}" = "1" ] || rm -f "$OUT"
du -sh public/data public/places-index.json
