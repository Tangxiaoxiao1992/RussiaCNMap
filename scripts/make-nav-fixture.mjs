// 生成一份小的"假"导航数据（网格街道 + 两条地铁线），用来在没有真实数据时调试导航界面。
// 用法：node --experimental-strip-types scripts/make-nav-fixture.mjs [outDir=public/nav]
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const out = process.argv[2] || "public/nav";
const tmp = mkdtempSync(join(tmpdir(), "navfix-"));
mkdirSync(out, { recursive: true });
const feat = (coords, props) => "\u001e" + JSON.stringify({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } }) + "\n";
const nx = 60, ny = 90, mlon = 37.59, mlat = 55.72;
const MP = (i, j) => [+(mlon + i * 0.0016).toFixed(6), +(mlat + j * 0.0009).toFixed(6)];
const F = [];
for (let j = 0; j < ny; j++) F.push(feat(Array.from({ length: nx }, (_, i) => MP(i, j)), { highway: "residential", name: j % 7 === 0 ? "Тверская улица" : "улица Арбат" }));
for (let i = 0; i < nx; i++) F.push(feat(Array.from({ length: ny }, (_, j) => MP(i, j)), { highway: "residential", name: i % 5 === 0 ? "Никольская улица" : "Большая Дмитровка" }));
const seq = join(tmp, "walk.geojsonseq");
writeFileSync(seq, F.join(""));
const run = (args) => execFileSync("node", ["--experimental-strip-types", "--no-warnings", "scripts/build-nav.mjs", ...args], { stdio: "inherit", env: { ...process.env, MIN_EDGES: "1" } });
run(["walk", seq, out, "37.5,55.7,37.8,55.9"]);

const stop = (id, name, lon, lat) => ({ type: "node", id, lon, lat, tags: { name } });
const rel = (id, ref, name, colour, ids) => ({ type: "relation", id, tags: { route: "subway", ref, name, colour }, members: ids.map((r) => ({ type: "node", ref: r, role: "stop" })) });
const els = [
  stop(1, "Сокол", 37.60, 55.75), stop(2, "Охотный Ряд", 37.62, 55.75), stop(3, "Лубянка", 37.64, 55.75), stop(4, "Китай-город", 37.66, 55.75),
  stop(5, "Автозаводская", 37.62, 55.73), stop(12, "Охотный Ряд", 37.6203, 55.7502), stop(6, "Динамо", 37.62, 55.77), stop(7, "Аэропорт", 37.62, 55.79),
  rel(100, "1", "Сокольническая линия", "#ef161e", [1, 2, 3, 4]), rel(101, "1", "Сокольническая линия", "#ef161e", [4, 3, 2, 1]),
  rel(200, "2", "Замоскворецкая линия", "#2dbe2c", [5, 12, 6, 7]),
];
const ov = join(tmp, "ov.json");
writeFileSync(ov, JSON.stringify({ elements: els }));
run(["metro", ov, out]);
console.log("导航假数据已写入", out);
