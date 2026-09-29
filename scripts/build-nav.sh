#!/usr/bin/env bash
# 生成离线导航数据 public/nav/：步行路网（来自 Geofabrik 的 OSM 数据）+ 地铁线路（来自 Overpass）。
# 范围默认是莫斯科市区+近郊；地图本身仍是整个莫斯科州。需要 osmium-tool（apt install osmium-tool）。
set -euo pipefail
cd "$(dirname "$0")/.."

NAV_BBOX="${NAV_BBOX:-37.0,55.45,38.2,56.05}"   # minLon,minLat,maxLon,maxLat
OUT="${NAV_OUT:-public/nav}"
WORK="${NAV_WORK:-/tmp/nav-work}"
PBF_URL="${NAV_PBF_URL:-https://download.geofabrik.de/russia/central-fed-district-latest.osm.pbf}"
mkdir -p "$OUT" "$WORK"

command -v osmium >/dev/null || { echo "需要 osmium-tool" >&2; exit 1; }

if [ ! -s "$WORK/central.osm.pbf" ]; then
  echo "下载 $PBF_URL"
  curl -fL --retry 4 --retry-delay 10 -o "$WORK/central.osm.pbf" "$PBF_URL"
fi
ls -lh "$WORK/central.osm.pbf"

osmium extract -b "$NAV_BBOX" --strategy=smart "$WORK/central.osm.pbf" -o "$WORK/area.osm.pbf" --overwrite
osmium tags-filter "$WORK/area.osm.pbf" w/highway -o "$WORK/highways.osm.pbf" --overwrite
osmium export "$WORK/highways.osm.pbf" -f geojsonseq --geometry-types=linestring -o "$WORK/highways.geojsonseq" --overwrite
node --experimental-strip-types --no-warnings scripts/build-nav.mjs walk "$WORK/highways.geojsonseq" "$OUT" "$NAV_BBOX"

# 地铁：优先直接从同一份 OSM 数据里抽 route=subway/light_rail 关系（不依赖外部接口）
IFS=',' read -r W S E N <<<"$NAV_BBOX"
ok=0
if osmium tags-filter "$WORK/area.osm.pbf" r/route=subway,light_rail -o "$WORK/metro.osm.pbf" --overwrite \
   && osmium cat "$WORK/metro.osm.pbf" -f opl -o "$WORK/metro.opl" --overwrite \
   && node --experimental-strip-types --no-warnings scripts/build-nav.mjs metro "$WORK/metro.opl" "$OUT"; then
  ok=1
else
  echo "从 OSM 数据抽取地铁失败，改用 Overpass" >&2
  QUERY="[out:json][timeout:240];(relation[\"route\"~\"^(subway|light_rail)\$\"]($S,$W,$N,$E););out body;>;out skel qt;"
  for EP in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://overpass.private.coffee/api/interpreter; do
    if curl -fsS --retry 2 --max-time 300 --data-urlencode "data=$QUERY" "$EP" -o "$WORK/metro.json" && [ -s "$WORK/metro.json" ] \
       && node --experimental-strip-types --no-warnings scripts/build-nav.mjs metro "$WORK/metro.json" "$OUT"; then ok=1; break; fi
    echo "Overpass 镜像失败：$EP" >&2
  done
fi
[ "$ok" = 1 ] || echo "⚠ 没取到地铁数据：只提供步行导航" >&2
ls -lh "$OUT"
