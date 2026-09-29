// 搜索回归测试：精确、词序无关、错别字、别名、多语。  npm run test:search
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "search-"));
const seq = join(dir, "p.geojsonseq");
const pt = (props, c) => JSON.stringify({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: c } }) + "\n";
writeFileSync(seq, [
  pt({ name: "Art Moscow", tourism: "gallery" }, [37.6218, 55.7581]),
  pt({ name: "Московский музей современного искусства", tourism: "museum", "name:en": "Moscow Museum of Modern Art" }, [37.6, 55.76]),
  pt({ name: "Третьяковская галерея", tourism: "gallery", "name:en": "Tretyakov Gallery" }, [37.62, 55.74]),
  pt({ name: "Кофе Хаус", amenity: "cafe", brand: "Coffee House" }, [37.61, 55.75]),
  pt({ name: "Пятёрочка", shop: "supermarket" }, [37.5, 55.7]),
  pt({ name: "Hotel Metropol", tourism: "hotel", "name:en": "Hotel Metropol" }, [37.62, 55.758]),
].join(""));
execFileSync("node", ["--experimental-strip-types", "--no-warnings", "scripts/build-places.mjs", seq, join(dir, "osm.json")], { stdio: "ignore" });
const osm = readFileSync(join(dir, "osm.json"), "utf8");
globalThis.fetch = async (u) => (String(u).includes("osm") ? new Response(osm, { headers: { "content-type": "application/json" } }) : new Response("nf", { status: 404 }));
const { loadIndex, search } = await import("../src/services/search.ts");
assert.ok(await loadIndex(["places-index.json", "places-osm.json"]));
const top = (q, n = 3) => search(q).slice(0, n).map((h) => h.zh + "/" + h.en + "/" + h.ru);
const has = (q, re, n = 5) => { const r = top(q, n).join(" | "); assert.match(r, re, `搜 "${q}" 应包含 ${re}，实际：${r}`); console.log("  ✓", q, "→", r.slice(0, 80)); };

has("art moscow", /Art Moscow/);          // 精确
has("moscow art", /Art Moscow/);          // 词序无关
has("art moscw", /Art Moscow/);           // 少字母
has("art mosocw", /Art Moscow/);          // 字母互换
has("tretyakov galery", /Tretyakov/);     // 错别字
has("третьяковская галерея", /Третьяковская/);
has("третьяковкая галерея", /Третьяковская/); // 漏字
has("coffee house", /Кофе Хаус/);         // 品牌名
has("metropol", /Metropol/);
has("современн", /современного/);          // 词的一部分
assert.equal(search("qwertyzzz").length, 0, "乱输不应有结果");
console.log("搜索：全部通过");
