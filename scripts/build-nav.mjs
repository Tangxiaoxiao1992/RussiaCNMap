// 导航数据构建：
//   walk：osmium 导出的 GeoJSON 序列（highway 线）→ 步行路网
//     node --experimental-strip-types scripts/build-nav.mjs walk <highways.geojsonseq> <outDir> <minLon,minLat,maxLon,maxLat>
//     输出 <outDir>/walk.bin.gz（路网）、<outDir>/walk-names.json.gz（道路名：俄/中/英）
//   metro：Overpass 返回（.json）或 osmium 导出的 .opl的地铁线路关系 → 车站与线路
//     node --experimental-strip-types scripts/build-nav.mjs metro <overpass.json> <outDir>
//     输出 <outDir>/metro.json.gz
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { encodeWalk, EdgeFlag } from "../src/nav/format.ts";
import { toZh } from "../src/zh/index.ts";
import { toEn } from "../src/en/index.ts";

const [, , cmd, input, outDir, bboxArg] = process.argv;
if ((cmd !== "walk" && cmd !== "metro") || !input || !outDir) { console.error("用法：build-nav.mjs walk <in.geojsonseq> <outDir> [bbox] | metro <overpass.json> <outDir>"); process.exit(2); }

/** 解析 osmium 输出的 OPL 文本（只取车站/线路用得到的字段），得到与 Overpass JSON 相同结构的元素 */
function parseOpl(text) {
  const dec = (v) => v.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  const out = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split(" ");
    const kind = parts[0][0];
    if (kind !== "n" && kind !== "r") continue;
    const el = { type: kind === "n" ? "node" : "relation", id: Number(parts[0].slice(1)), tags: {} };
    if (kind === "r") el.members = [];
    for (const f of parts.slice(1)) {
      const c = f[0], v = f.slice(1);
      if (c === "T" && v) for (const kv of v.split(",")) { const i = kv.indexOf("="); if (i > 0) el.tags[dec(kv.slice(0, i))] = dec(kv.slice(i + 1)); }
      else if (c === "x" && kind === "n") el.lon = Number(v);
      else if (c === "y" && kind === "n") el.lat = Number(v);
      else if (c === "M" && kind === "r" && v) for (const m of v.split(",")) {
        const at = m.indexOf("@"); const t = m[0];
        el.members.push({ type: t === "n" ? "node" : t === "w" ? "way" : "relation", ref: Number(m.slice(1, at)), role: dec(m.slice(at + 1)) });
      }
    }
    if (el.type === "node" && (el.lon === undefined || el.lat === undefined)) continue;
    out.push(el);
  }
  return out;
}

if (cmd === "metro") {
  const { buildMetro } = await import("../src/nav/metro-build.ts");
  const { readFileSync } = await import("node:fs");
  const elements = input.endsWith(".opl") ? parseOpl(readFileSync(input, "utf8")) : (JSON.parse(readFileSync(input, "utf8")).elements ?? []);
  const data = buildMetro(elements);
  if (data.stations.length < 5 || data.segments.length < 5) { console.error(`地铁数据太少（${data.stations.length} 站，${data.segments.length} 段），Overpass 返回不对`); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "metro.json.gz"), gzipSync(JSON.stringify(data)));
  console.log(`地铁：${data.stations.length} 站，${data.lines.length} 条线，${data.segments.length} 段`);
  process.exit(0);
}
const bbox = (bboxArg || "-180,-90,180,90").split(",").map(Number);

// —— 哪些道路行人能走
const WALKABLE = new Set(["footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "unclassified",
  "tertiary", "tertiary_link", "secondary", "secondary_link", "primary", "primary_link", "trunk", "trunk_link", "road", "track",
  "cycleway", "corridor"]);
const NO = new Set(["no", "private"]);

function walkable(p) {
  const h = p.highway;
  if (!WALKABLE.has(h)) return false;
  if (p.foot === "no" || p.foot === "private") return false;
  if (p.area === "yes") return false;
  const open = p.foot === "yes" || p.foot === "designated" || p.foot === "permissive";
  if (!open && (NO.has(p.access) )) return false;
  if ((h === "trunk" || h === "trunk_link" || h === "primary_link") && p.motorroad === "yes" && !open) return false;
  if (h === "cycleway" && p.foot === undefined && p.bicycle === "designated" && p.segregated === "no") return true;
  return true;
}

function flagOf(p) {
  if (p.highway === "steps") return EdgeFlag.Steps;
  if (p.footway === "crossing" || p.crossing) return EdgeFlag.Crossing;
  if (p.tunnel === "yes" || p.tunnel === "building_passage" || (Number(p.layer) < 0 && p.highway === "footway")) return EdgeFlag.Underpass;
  if (p.bridge === "yes" && (p.highway === "footway" || p.highway === "path")) return EdgeFlag.Bridge;
  const busy = ["trunk", "trunk_link", "primary", "primary_link"].includes(p.highway);
  const hasSidewalk = p.sidewalk && p.sidewalk !== "no" && p.sidewalk !== "none";
  if (busy && !hasSidewalk) return EdgeFlag.BusyRoad;
  return EdgeFlag.Normal;
}

// 节点键：经纬度 ×1e6 取整后拼成一个数（同一 OSM 节点导出的坐标完全一致，所以相等即同一节点）
const LON0 = Math.floor(bbox[0] * 1e6) - 1000, LAT0 = Math.floor(bbox[1] * 1e6) - 1000;
const SPAN = 2 ** 22;
const keyOf = (lonI, latI) => (lonI - LON0) * SPAN + (latI - LAT0);

const nodeIds = new Map();
const nodeLon = [], nodeLat = [];
const idOf = (lonI, latI) => {
  const k = keyOf(lonI, latI);
  let id = nodeIds.get(k);
  if (id === undefined) { id = nodeLon.length; nodeIds.set(k, id); nodeLon.push(lonI); nodeLat.push(latI); }
  return id;
};

const names = [["", "", ""]]; // 0 = 无名
const nameIds = new Map();
const nameIdOf = (p) => {
  const ru = p.name;
  if (!ru) return 0;
  const key = ru + "|" + (p["name:zh"] || "") + "|" + (p["name:en"] || "");
  let id = nameIds.get(key);
  if (id === undefined) {
    const zh = p["name:zh-Hans"] || p["name:zh"] || toZh(ru) || ru;
    const en = p["name:en"] || toEn(ru) || ru;
    id = names.length; names.push([ru, zh, en]); nameIds.set(key, id);
  }
  return id;
};

const EA = [], EB = [], EL = [], EF = [], EN = [];
const rad = Math.PI / 180;
const seglen = (lo1, la1, lo2, la2) => 6371008.8 * Math.hypot((lo2 - lo1) * 1e-6 * rad * Math.cos(((la1 + la2) / 2) * 1e-6 * rad), (la2 - la1) * 1e-6 * rad);

let features = 0, used = 0, skipped = 0;
const rl = createInterface({ input: createReadStream(input, { encoding: "utf8" }), crlfDelay: Infinity });
for await (let line of rl) {
  line = line.replace(/^\u001e/, "").trim();
  if (!line) continue;
  let f;
  try { f = JSON.parse(line); } catch { skipped++; continue; }
  features++;
  const p = f.properties || {};
  const g = f.geometry;
  if (!g || (g.type !== "LineString" && g.type !== "MultiLineString") || !walkable(p)) continue;
  const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  const flag = flagOf(p), nm = nameIdOf(p);
  for (const coords of lines) {
    used++;
    let prev = -1, pLon = 0, pLat = 0;
    for (const [lon, lat] of coords) {
      const lonI = Math.round(lon * 1e6), latI = Math.round(lat * 1e6);
      if (lonI < bbox[0] * 1e6 - 1000 || lonI > bbox[2] * 1e6 + 1000 || latI < bbox[1] * 1e6 - 1000 || latI > bbox[3] * 1e6 + 1000) { prev = -1; continue; }
      const id = idOf(lonI, latI);
      if (prev >= 0 && id !== prev) {
        let L = seglen(pLon, pLat, lonI, latI);
        // 单条边最长约 6.5 km（Uint16 × 0.1 m），过长的极端情况截断
        EA.push(prev); EB.push(id); EL.push(Math.min(65535, Math.round(L * 10))); EF.push(flag); EN.push(nm);
      }
      prev = id; pLon = lonI; pLat = latI;
    }
  }
}
console.log(`读取 ${features} 个要素（${skipped} 行无法解析），其中 ${used} 条可步行线，${nodeLon.length} 个节点，${EA.length} 条边`);
const MIN_EDGES = Number(process.env.MIN_EDGES ?? 1000);
if (EA.length < MIN_EDGES) { console.error(`可步行的边只有 ${EA.length} 条（少于 ${MIN_EDGES}），数据不对`); process.exit(1); }

// —— 只保留最大连通分量（否则起点可能吸附到孤立的小院子里）
const N = nodeLon.length;
const uf = new Int32Array(N).map((_, i) => i);
const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
for (let i = 0; i < EA.length; i++) { const a = find(EA[i]), b = find(EB[i]); if (a !== b) uf[a] = b; }
const size = new Int32Array(N);
for (let i = 0; i < N; i++) size[find(i)]++;
let root = 0;
for (let i = 0; i < N; i++) if (size[i] > size[root]) root = i;
const keep = new Int32Array(N).fill(-1);
let n = 0;
for (let i = 0; i < N; i++) if (find(i) === find(root)) keep[i] = n++;
console.log(`最大连通分量：${n} / ${N} 个节点（${((100 * n) / N).toFixed(1)}%）`);

// —— 建 CSR 邻接表（无向边 → 两条有向边）
const deg = new Uint32Array(n + 1);
let m = 0;
for (let i = 0; i < EA.length; i++) if (keep[EA[i]] >= 0 && keep[EB[i]] >= 0) { deg[keep[EA[i]] + 1]++; deg[keep[EB[i]] + 1]++; m += 2; }
for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
const fill = deg.slice(0, n);
const to = new Uint32Array(m), nameIdx = new Uint32Array(m), len = new Uint16Array(m), flag = new Uint8Array(m);
for (let i = 0; i < EA.length; i++) {
  const a = keep[EA[i]], b = keep[EB[i]];
  if (a < 0 || b < 0) continue;
  let e = fill[a]++; to[e] = b; nameIdx[e] = EN[i]; len[e] = EL[i]; flag[e] = EF[i];
  e = fill[b]++; to[e] = a; nameIdx[e] = EN[i]; len[e] = EL[i]; flag[e] = EF[i];
}
const coords = new Int32Array(2 * n);
for (let i = 0; i < N; i++) if (keep[i] >= 0) { coords[2 * keep[i]] = nodeLon[i]; coords[2 * keep[i] + 1] = nodeLat[i]; }

mkdirSync(outDir, { recursive: true });
const usedNames = new Set(nameIdx);
// 只保留被用到的道路名
const remap = new Map([[0, 0]]);
const outNames = [names[0]];
for (const id of [...usedNames].sort((a, b) => a - b)) if (id > 0) { remap.set(id, outNames.length); outNames.push(names[id]); }
for (let e = 0; e < m; e++) nameIdx[e] = remap.get(nameIdx[e]);
const bin2 = gzipSync(encodeWalk({ n, m, coords, off: deg, to, nameIdx, len, flag }), { level: 9 });
writeFileSync(join(outDir, "walk.bin.gz"), bin2);
writeFileSync(join(outDir, "walk-names.json.gz"), gzipSync(JSON.stringify(outNames)));
console.log(`步行路网：${n} 节点，${m} 有向边，${outNames.length} 个道路名 → ${(bin2.length / 1e6).toFixed(1)} MB（gzip）`);
