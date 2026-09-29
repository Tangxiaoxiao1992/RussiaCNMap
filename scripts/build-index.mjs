// 扫描 pmtiles 里的地名，生成离线三语（中/英/俄）搜索索引 places-index.json
// 用法：node --experimental-strip-types scripts/build-index.mjs <in.pmtiles> <out.json>
import { openSync, readSync, writeFileSync, statSync, closeSync } from "node:fs";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { toZh } from "../src/zh/index.ts";
import { toEn } from "../src/en/index.ts";

const [, , input, output] = process.argv;
if (!input || !output) { console.error("用法：build-index.mjs <in.pmtiles> <out.json>"); process.exit(2); }

const fd = openSync(input, "r");
const source = {
  getKey: () => input,
  async getBytes(offset, length) {
    const buf = Buffer.alloc(length);
    const n = readSync(fd, buf, 0, length, offset);
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + n) };
  },
};
const pm = new PMTiles(source);
const header = await pm.getHeader();
const Z = Math.min(14, header.maxZoom);

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const x0 = lon2x(header.minLon, Z), x1 = lon2x(header.maxLon, Z);
const y0 = lat2y(header.maxLat, Z), y1 = lat2y(header.minLat, Z);
console.log(`扫描 z${Z}：x ${x0}-${x1}, y ${y0}-${y1}（最多 ${(x1 - x0 + 1) * (y1 - y0 + 1)} 张）`);

// 类别编号见 src/services/search.ts 的 KINDS
const POI = { station: 3, aerodrome: 9, university: 10, college: 10, park: 7, garden: 7, zoo: 4, museum: 4, attraction: 4,
  theatre: 4, stadium: 4, library: 8, hospital: 8, townhall: 8, artwork: 4 };
const PLACE = { city: 0, town: 1, village: 2, hamlet: 2, suburb: 8, quarter: 8, neighbourhood: 8, macrohood: 8 };
const ROAD = new Set(["highway", "major_road", "medium_road", "minor_road"]);
const WATER = new Set(["lake", "river", "reservoir", "basin"]);
const LANDUSE = new Set(["park", "forest", "nature_reserve", "national_park", "cemetery"]);

function classify(layer, p) {
  if (layer === "places") {
    if (p.kind === "locality") return PLACE[p.kind_detail] ?? 2;
    return PLACE[p.kind] ?? null;
  }
  if (layer === "pois") return POI[p.kind] ?? null;
  if (layer === "roads") return ROAD.has(p.kind) ? 5 : null;
  if (layer === "water") return WATER.has(p.kind) ? 6 : null;
  if (layer === "landuse") return LANDUSE.has(p.kind) ? 7 : null;
  return null;
}

function firstPoint(f, x, y, z) {
  const g = f.toGeoJSON(x, y, z).geometry;
  let c = g.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return c; // [lon, lat]
}

const seen = new Map();
let tiles = 0;
const jobs = [];
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push([x, y]);

async function work() {
  for (let job; (job = jobs.pop()); ) {
    const [x, y] = job;
    const t = await pm.getZxy(Z, x, y);
    if (!t) continue;
    tiles++;
    const vt = new VectorTile(new PbfReader(new Uint8Array(t.data)));
    for (const [layer, L] of Object.entries(vt.layers)) {
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i);
        const p = f.properties;
        if (typeof p.name !== "string" || !p.name) continue;
        const k = classify(layer, p);
        if (k === null) continue;
        const [lon, lat] = firstPoint(f, x, y, Z);
        // 同名同类要素合并：道路/水体/绿地按 ~10km 网格，其他按 ~1km 网格
        const cell = k === 5 || k === 6 || k === 7 ? 0.1 : 0.01;
        const key = `${k}|${p.name}|${Math.round(lon / cell)}|${Math.round(lat / cell)}`;
        if (seen.has(key)) continue;
        const han = /[一-鿿]/.test(p.name);
        const zh = p["name:zh-Hans"] || p["name:zh"] || (han ? p.name : toZh(p.name, { station: k === 3 })) || p.name;
        const ru = han ? p["name:ru"] || "" : p.name;
        const en = p["name:en"] || toEn(ru || p.name) || (/[A-Za-z]/.test(p.name) ? p.name : "");
        seen.set(key, en && en !== zh && en !== ru ? [zh, ru, k, +lon.toFixed(4), +lat.toFixed(4), en] : [zh, ru, k, +lon.toFixed(4), +lat.toFixed(4)]);
      }
    }
    if (tiles % 5000 === 0) console.log(`  已处理 ${tiles} 张瓦片，${seen.size} 个地名`);
  }
}
await Promise.all(Array.from({ length: 8 }, work));
closeSync(fd);

const list = [...seen.values()].sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0], "zh"));
writeFileSync(output, JSON.stringify(list));
console.log(`完成：${tiles} 张瓦片 → ${list.length} 个地名，${(statSync(output).size / 1e6).toFixed(1)} MB → ${output}`);
