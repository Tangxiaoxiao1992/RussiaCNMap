#!/usr/bin/env bash
# 从 OSM 数据抽取全部有名字的地点 → public/places-osm.json（离线搜索用）。需要 osmium-tool。
set -euo pipefail
cd "$(dirname "$0")/.."
BBOX="${BBOX:-34.85,54.25,40.25,57.05}"
WORK="${NAV_WORK:-/tmp/nav-work}"
PBF_URL="${NAV_PBF_URL:-https://download.geofabrik.de/russia/central-fed-district-latest.osm.pbf}"
mkdir -p "$WORK"
command -v osmium >/dev/null || { echo "需要 osmium-tool" >&2; exit 1; }
if [ ! -s "$WORK/central.osm.pbf" ]; then curl -fL --retry 4 --retry-delay 10 -o "$WORK/central.osm.pbf" "$PBF_URL"; fi

osmium extract -b "$BBOX" --strategy=smart "$WORK/central.osm.pbf" -o "$WORK/oblast.osm.pbf" --overwrite
osmium tags-filter "$WORK/oblast.osm.pbf" \
  nwr/amenity nwr/shop nwr/tourism nwr/historic nwr/leisure nwr/office nwr/craft nwr/healthcare \
  nwr/railway=station,halt nwr/public_transport=station nwr/aeroway=aerodrome,terminal \
  nwr/man_made=tower,lighthouse,obelisk,monument nwr/natural=peak,beach,spring \
  nwr/building=church,cathedral,chapel,mosque,synagogue,temple,monastery nwr/place \
  -o "$WORK/places.osm.pbf" --overwrite
osmium export "$WORK/places.osm.pbf" -f geojsonseq --geometry-types=point,polygon -o "$WORK/places.geojsonseq" --overwrite
node --experimental-strip-types --no-warnings scripts/build-places.mjs "$WORK/places.geojsonseq" public/places-osm.json
ls -lh public/places-osm.json
