// 从 OSM 数据里抽出所有有名字的地点（店铺、餐饮、展览、酒店、景点、医院……），生成 places-osm.json，
// 补充 Protomaps 瓦片里没有的地点，让离线搜索更全。
// 用法：node --experimental-strip-types scripts/build-places.mjs <in.geojsonseq> <out.json>
//   输入由 osmium export -f geojsonseq --geometry-types=point,polygon 生成（属性里带 OSM 标签）
import { createReadStream, writeFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { toZh } from "../src/zh/index.ts";
import { toEn } from "../src/en/index.ts";

const [, , input, output] = process.argv;
if (!input || !output) { console.error("用法：build-places.mjs <in.geojsonseq> <out.json>"); process.exit(2); }

// 类别编号见 src/services/search.ts 的 KINDS
const K = { city: 0, town: 1, village: 2, station: 3, sight: 4, road: 5, water: 6, park: 7, place: 8, airport: 9, uni: 10, food: 11, arts: 12, lodging: 13, health: 14 };
const SKIP_AMENITY = new Set(["parking", "parking_space", "parking_entrance", "bench", "waste_basket", "waste_disposal", "bicycle_parking", "toilets", "shelter", "vending_machine", "atm", "post_box", "recycling", "drinking_water", "fountain", "bicycle_rental", "charging_station", "motorcycle_parking", "hunting_stand", "give_box", "clock", "lounger", "bbq", "grit_bin", "loading_dock"]);
const ARTS_TOURISM = new Set(["museum", "gallery", "artwork"]);
const LODGING = new Set(["hotel", "hostel", "guest_house", "apartment", "motel", "chalet", "camp_site", "resort"]);
const ARTS_AMENITY = new Set(["theatre", "cinema", "arts_centre", "library", "community_centre", "planetarium", "concert_hall", "events_venue", "exhibition_centre", "conference_centre"]);
const FOOD = new Set(["restaurant", "cafe", "fast_food", "bar", "pub", "food_court", "ice_cream", "biergarten", "marketplace"]);
const HEALTH = new Set(["hospital", "clinic", "pharmacy", "doctors", "dentist"]);
const WORSHIP_BUILDING = new Set(["church", "cathedral", "chapel", "mosque", "synagogue", "temple", "monastery"]);

function classify(p) {
  if (p.railway === "station" || p.railway === "halt" || p.station === "subway" || p.public_transport === "station") return K.station;
  if (p.aeroway === "aerodrome" || p.aeroway === "terminal") return K.airport;
  if (p.tourism) {
    if (ARTS_TOURISM.has(p.tourism)) return K.arts;
    if (LODGING.has(p.tourism)) return K.lodging;
    if (p.tourism === "information" || p.tourism === "picnic_site" || p.tourism === "camp_pitch") return null;
    return K.sight;
  }
  if (p.amenity) {
    if (SKIP_AMENITY.has(p.amenity)) return null;
    if (ARTS_AMENITY.has(p.amenity)) return K.arts;
    if (p.amenity === "university" || p.amenity === "college") return K.uni;
    if (FOOD.has(p.amenity)) return K.food;
    if (HEALTH.has(p.amenity)) return K.health;
    if (p.amenity === "place_of_worship") return K.sight;
    return K.place;
  }
  if (p.shop) return K.food;
  if (p.healthcare) return K.health;
  if (p.historic) return K.sight;
  if (p.leisure === "park" || p.leisure === "garden" || p.leisure === "nature_reserve") return K.park;
  if (p.leisure === "stadium" || p.leisure === "water_park" || p.leisure === "sports_centre") return K.sight;
  if (p.leisure && p.leisure !== "pitch" && p.leisure !== "track" && p.leisure !== "swimming_pool") return K.place;
  if (p.office || p.craft) return K.place;
  if (WORSHIP_BUILDING.has(p.building)) return K.sight;
  if (["tower", "lighthouse", "obelisk", "monument"].includes(p.man_made)) return K.sight;
  if (p.natural === "peak" || p.natural === "beach" || p.natural === "spring") return K.place;
  if (p.place) return { city: K.city, town: K.town, village: K.village, hamlet: K.village, suburb: K.place, quarter: K.place, neighbourhood: K.place, locality: K.place, square: K.place }[p.place] ?? null;
  return null;
}

function center(g) {
  if (g.type === "Point") return g.coordinates;
  let ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
  if (!ring || !ring.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

const seen = new Map();
let lines = 0;
const rl = createInterface({ input: createReadStream(input, { encoding: "utf8" }), crlfDelay: Infinity });
for await (let line of rl) {
  line = line.replace(/^\u001e/, "").trim();
  if (!line) continue;
  lines++;
  let f;
  try { f = JSON.parse(line); } catch { continue; }
  const p = f.properties || {};
  const name = p.name || p["name:ru"] || p["name:en"];
  if (typeof name !== "string" || !name) continue;
  const k = classify(p);
  if (k === null) continue;
  const c = center(f.geometry);
  if (!c) continue;
  const [lon, lat] = c;
  const key = `${k}|${name}|${Math.round(lon / 0.003)}|${Math.round(lat / 0.003)}`;
  if (seen.has(key)) continue;
  const han = /[一-鿿]/.test(name);
  const ruName = p["name:ru"] || (/[А-Яа-яЁё]/.test(name) ? name : "");
  const zh = p["name:zh-Hans"] || p["name:zh"] || (han ? name : toZh(ruName || name, { station: k === 3 })) || name;
  const ru = han ? p["name:ru"] || "" : ruName || (/[A-Za-z]/.test(name) ? "" : name);
  const en = p["name:en"] || toEn(ru || name) || (/[A-Za-z]/.test(name) ? name : "");
  // 其他可搜索的叫法：品牌、简称、别名、旧名
  const alt = [...new Set([p.brand, p["brand:en"], p.short_name, p.alt_name, p.int_name, p.official_name, p.old_name, p.operator]
    .flatMap((v) => (typeof v === "string" ? v.split(";") : [])).map((v) => v.trim()).filter((v) => v && v !== name && v !== en && v !== zh))].slice(0, 4).join(";");
  const e = [zh, ru, k, +lon.toFixed(5), +lat.toFixed(5), en && en !== zh && en !== ru ? en : ""];
  if (alt) e.push(alt);
  seen.set(key, e);
}

const list = [...seen.values()];
writeFileSync(output, JSON.stringify(list));
console.log(`读取 ${lines} 个要素 → ${list.length} 个地点，${(statSync(output).size / 1e6).toFixed(1)} MB → ${output}`);
