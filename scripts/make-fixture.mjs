// 生成一个很小的"假"莫斯科 pmtiles（几条街、几个站、几个地名），用来在没有真实数据时调试界面。
// 用法：node scripts/make-fixture.mjs [out.pmtiles]     （schema 与 Protomaps 底图一致）
import { writeFileSync } from "node:fs";
import vtpbf from "vt-pbf";
import { zxyToTileId } from "pmtiles";

const out = process.argv[2] || "public/moscow-oblast.pmtiles";
const EXTENT = 4096;
const MAXZ = 14;

const lonlat2world = ([lon, lat], z) => {
  const s = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
};

const line = (name, kind, pts, extra = {}) => ({ layer: "roads", type: 2, props: { name, kind, kind_detail: kind, min_zoom: 8, ...extra }, rings: [pts] });
const pt = (layer, props, p) => ({ layer, type: 1, props: { min_zoom: 8, ...props }, rings: [[p]] });
const poly = (layer, props, pts) => ({ layer, type: 3, props, rings: [[...pts, pts[0]]] });

const F = [
  line("Тверская улица", "major_road", [[37.6135, 55.7570], [37.6040, 55.7640], [37.5940, 55.7700]]),
  line("улица Арбат", "medium_road", [[37.5985, 55.7522], [37.5880, 55.7495]]),
  line("Кутузовский проспект", "highway", [[37.5330, 55.7440], [37.5670, 55.7500], [37.5950, 55.7510]]),
  line("Ленинградский проспект", "highway", [[37.5150, 55.8040], [37.5450, 55.7900], [37.5800, 55.7780]]),
  line("Песчаная улица", "minor_road", [[37.5100, 55.8000], [37.5200, 55.8060]]),
  line("Красная площадь", "minor_road", [[37.6165, 55.7540], [37.6250, 55.7538]]),
  line("Щёлковское шоссе", "highway", [[37.7400, 55.8000], [37.8000, 55.8100], [37.9000, 55.8200]]),
  pt("places", { name: "Москва", "name:en": "Moscow", "name:zh": "莫斯科", kind: "locality", kind_detail: "city", population_rank: 13, min_zoom: 3, sort_key: 1 }, [37.6173, 55.7558]),
  pt("places", { name: "Химки", kind: "locality", kind_detail: "city", population_rank: 9, min_zoom: 8 }, [37.4300, 55.8970]),
  pt("places", { name: "Мытищи", kind: "locality", kind_detail: "city", population_rank: 9, min_zoom: 8 }, [37.7300, 55.9100]),
  pt("places", { name: "Красногорск", kind: "locality", kind_detail: "city", population_rank: 9, min_zoom: 8 }, [37.3300, 55.8200]),
  pt("places", { name: "Подольск", kind: "locality", kind_detail: "city", population_rank: 9, min_zoom: 8 }, [37.5500, 55.4300]),
  pt("places", { name: "Хорошёво-Мнёвники", kind: "neighbourhood", min_zoom: 12 }, [37.4900, 55.7700]),
  pt("pois", { name: "Сокол", kind: "station", min_zoom: 11 }, [37.5150, 55.8050]),
  pt("pois", { name: "Динамо", kind: "station", min_zoom: 11 }, [37.5590, 55.7900]),
  pt("pois", { name: "Китай-город", kind: "station", min_zoom: 11 }, [37.6330, 55.7560]),
  pt("pois", { name: "Университет", kind: "station", min_zoom: 11 }, [37.5340, 55.6930]),
  pt("pois", { name: "Красная площадь", "name:en": "Red Square", kind: "attraction", min_zoom: 12 }, [37.6208, 55.7539]),
  pt("pois", { name: "Московский Кремль", "name:zh": "克里姆林宫", kind: "attraction", min_zoom: 12 }, [37.6173, 55.7520]),
  pt("pois", { name: "Московский авиационный институт", kind: "university", min_zoom: 12 }, [37.5034, 55.8071]),
  pt("pois", { name: "Международный аэропорт Шереметьево", kind: "aerodrome", min_zoom: 10 }, [37.4146, 55.9726]),
  pt("pois", { name: "Sushi Wok", kind: "cafe", min_zoom: 14 }, [37.5060, 55.8020]),
  pt("pois", { name: "Парк Горького", kind: "park", min_zoom: 12 }, [37.6010, 55.7290]),
  poly("water", { kind: "lake", name: "Химкинское водохранилище", min_zoom: 8 }, [[37.45, 55.86], [37.50, 55.86], [37.50, 55.83], [37.45, 55.83]]),
  poly("landuse", { kind: "park", name: "Парк Победы", min_zoom: 8 }, [[37.505, 55.734], [37.520, 55.734], [37.520, 55.728], [37.505, 55.728]]),
  poly("buildings", { kind: "building", min_zoom: 13 }, [[37.6010, 55.7550], [37.6030, 55.7550], [37.6030, 55.7535], [37.6010, 55.7535]]),
];

function encodeTile(z, x, y) {
  const layers = {};
  for (const f of F) {
    const rings = f.rings.map((r) => r.map((p) => {
      const [wx, wy] = lonlat2world(p, z);
      return { x: Math.round((wx - x) * EXTENT), y: Math.round((wy - y) * EXTENT) };
    }));
    const xs = rings.flat().map((p) => p.x), ys = rings.flat().map((p) => p.y);
    const M = 256;
    if (Math.max(...xs) < -M || Math.min(...xs) > EXTENT + M || Math.max(...ys) < -M || Math.min(...ys) > EXTENT + M) continue;
    if (f.type === 1 && (xs[0] < -M || xs[0] > EXTENT + M || ys[0] < -M || ys[0] > EXTENT + M)) continue;
    (layers[f.layer] ??= []).push({ id: undefined, type: f.type, properties: f.props, loadGeometry: () => rings });
  }
  const names = Object.keys(layers);
  if (!names.length) return null;
  const obj = {};
  for (const n of names) obj[n] = { version: 2, name: n, extent: EXTENT, length: layers[n].length, feature: (i) => layers[n][i] };
  return Buffer.from(vtpbf.fromVectorTileJs({ layers: obj }));
}

// 范围：莫斯科市区及近郊，各级别都生成能覆盖这些要素的瓦片
const bounds = { minLon: 37.2, maxLon: 38.0, minLat: 55.35, maxLat: 56.05 };
const entries = [];
for (let z = 0; z <= MAXZ; z++) {
  const [ax, ay] = lonlat2world([bounds.minLon, bounds.maxLat], z);
  const [bx, by] = lonlat2world([bounds.maxLon, bounds.minLat], z);
  for (let x = Math.floor(ax); x <= Math.floor(bx); x++) for (let y = Math.floor(ay); y <= Math.floor(by); y++) {
    const data = encodeTile(z, x, y);
    if (data) entries.push({ id: zxyToTileId(z, x, y), data });
  }
}
entries.sort((a, b) => a.id - b.id);

const varint = (n) => { const b = []; while (n >= 128) { b.push((n % 128) | 128); n = Math.floor(n / 128); } b.push(n); return b; };
let offset = 0;
const dir = [...varint(entries.length)];
let prev = 0;
for (const e of entries) { dir.push(...varint(e.id - prev)); prev = e.id; }
for (const _ of entries) dir.push(...varint(1));
for (const e of entries) dir.push(...varint(e.data.length));
for (const e of entries) { dir.push(...varint(offset + 1)); offset += e.data.length; } // 显式偏移（+1）
const rootDir = Buffer.from(dir);
const meta = Buffer.from(JSON.stringify({ name: "fixture", attribution: "fixture" }));
const tileData = Buffer.concat(entries.map((e) => e.data));

const H = Buffer.alloc(127);
H.write("PMTiles", 0, "latin1"); H[7] = 3;
const u64 = (v, at) => { H.writeUInt32LE(v % 2 ** 32, at); H.writeUInt32LE(Math.floor(v / 2 ** 32), at + 4); };
const rootOff = 127, metaOff = rootOff + rootDir.length, tileOff = metaOff + meta.length;
u64(rootOff, 8); u64(rootDir.length, 16); u64(metaOff, 24); u64(meta.length, 32);
u64(tileOff + tileData.length, 40); u64(0, 48); u64(tileOff, 56); u64(tileData.length, 64);
u64(entries.length, 72); u64(entries.length, 80); u64(entries.length, 88);
H[96] = 1; H[97] = 1; H[98] = 1; H[99] = 1; H[100] = 0; H[101] = MAXZ;
const i32 = (v, at) => H.writeInt32LE(Math.round(v * 1e7), at);
i32(bounds.minLon, 102); i32(bounds.minLat, 106); i32(bounds.maxLon, 110); i32(bounds.maxLat, 114);
H[118] = 10; i32(37.6173, 119); i32(55.7558, 123);
writeFileSync(out, Buffer.concat([H, rootDir, meta, tileData]));
console.log(`fixture：${entries.length} 张瓦片 → ${out}（${((127 + rootDir.length + meta.length + tileData.length) / 1024).toFixed(0)} KB）`);
