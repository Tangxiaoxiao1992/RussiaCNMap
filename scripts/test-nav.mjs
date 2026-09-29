// 步行路网：构建 → 载入 → 路线/转向/吸附 的回归测试。  npm run test:nav
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { decodeWalk } from "../src/nav/format.ts";
import { WalkGraph } from "../src/nav/graph.ts";
import { buildSteps } from "../src/nav/steps.ts";
import { dist } from "../src/nav/geo.ts";
import { buildMetro } from "../src/nav/metro-build.ts";
import { Metro } from "../src/nav/metro.ts";

const dir = mkdtempSync(join(tmpdir(), "nav-test-"));
const lon0 = 37.6, lat0 = 55.75, dx = 0.0016, dy = 0.0009; // 约 100 m
const P = (i, j) => [+(lon0 + i * dx).toFixed(6), +(lat0 + j * dy).toFixed(6)];
const feat = (coords, props) => "\u001e" + JSON.stringify({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } }) + "\n";

function build(name, features, bbox) {
  const f = join(dir, name + ".geojsonseq");
  writeFileSync(f, features.join(""));
  execFileSync("node", ["--experimental-strip-types", "--no-warnings", "scripts/build-nav.mjs", "walk", f, join(dir, name), bbox], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, MIN_EDGES: "1" } });
  const d = decodeWalk(new Uint8Array(gunzipSync(readFileSync(join(dir, name, "walk.bin.gz")))));
  const names = JSON.parse(gunzipSync(readFileSync(join(dir, name, "walk-names.json.gz"))).toString());
  return new WalkGraph(d, names);
}

try {
  // ── 网络 1：L 形道路 + 一段人行横道 + 一段台阶 + 不可步行的道路 + 孤岛
  const road = (a, b, name, extra = {}) => feat([a, b], { highway: "residential", name, ...extra });
  const L = [
    road(P(0, 0), P(5, 0), "Тверская улица"),                        // 向东 500 m
    road(P(5, 0), P(5, 3), "улица Арбат"),                            // 向北 300 m
    feat([P(5, 3), P(5, 4)], { highway: "footway", footway: "crossing" }), // 过马路 100 m
    road(P(5, 4), P(5, 6), "улица Арбат"),                            // 继续向北 200 m
    feat([P(5, 6), P(6, 6)], { highway: "steps" }),                   // 台阶 100 m
    road(P(6, 6), P(9, 6), "Никольская улица"),                       // 向东 300 m
    feat([P(2, 0), P(2, -3)], { highway: "motorway", name: "МКАД" }), // 行人不能走
    feat([P(0, 0), P(0, 5)], { highway: "residential", name: "Частная улица", access: "private" }), // 私有
    feat([P(0, 5), P(1, 5)], { highway: "residential", name: "Безымянный", foot: "no" }),
    road(P(30, 30), P(31, 30), "Островная улица"),                    // 孤岛，应被丢弃
  ];
  // 第二条备选路线：从 (5,0) 向东再北到 (9,6) 的那条更绕，测试 A* 选最短
  L.push(road(P(5, 0), P(9, 0), "Дальняя улица"), road(P(9, 0), P(9, 6), "Дальняя улица"));
  const g1 = build("l", L, "37.5,55.7,37.8,55.8");
  console.log(`  网络1：${g1.d.n} 节点 ${g1.d.m} 边`);
  assert.equal(g1.d.n, 8, "应排除孤岛、私有路、foot=no、机动车道，只剩 8 个节点");
  assert.equal(g1.d.m, 16, "8 条无向边 = 16 条有向边");
  const at = (i, j) => { const [lo, la] = P(i, j); const n = g1.nearest(lo, la, 10); assert.ok(n >= 0, `找不到节点 (${i},${j})`); return n; };

  // 1) 两条等长路线，A 经过人行横道和台阶（更慢、代价更高），应选 B（Дальняя улица）
  const p1 = g1.route(at(0, 0), at(9, 6));
  assert.ok(p1, "应能到达");
  assert.ok(Math.abs(p1.distance - 1500) < 15, `距离应约 1500 m，实际 ${p1.distance}`);
  const s1 = buildSteps(g1, p1);
  assert.ok(s1.some((s) => s.name?.[0] === "Дальняя улица"), "应走 Дальняя улица");
  assert.ok(!s1.some((s) => s.type === "steps" || s.type === "crossing"), "不应走台阶/人行横道");

  // 2) 唯一路线：先向东再向北（左转）→ 过马路 → 继续直行
  const p2 = g1.route(at(0, 0), at(5, 6));
  const s2 = buildSteps(g1, p2);
  assert.deepEqual(s2.map((s) => s.type), ["depart", "left", "crossing", "straight", "arrive"], JSON.stringify(s2.map((s) => s.type)));
  assert.equal(s2[0].name[1], "特维尔街");
  assert.equal(s2[1].name[1], "阿尔巴特街");
  assert.equal(s2[1].name[2], "Arbat Street");
  assert.ok(Math.abs(s2[0].distance - 500) < 6, `第一段应约 500 m，实际 ${s2[0].distance}`);
  assert.ok(Math.abs(p2.distance - 1100) < 12);
  assert.ok(Math.abs(p2.time - 500 / 1.3 - 300 / 1.3 - 100 / 1.2 - 200 / 1.3) < 4, "时间 = 各段长度/速度");

  // 3) 台阶
  const s3 = buildSteps(g1, g1.route(at(5, 4), at(6, 6)));
  assert.ok(s3.some((s) => s.type === "steps"), "应有台阶步骤：" + JSON.stringify(s3.map((s) => s.type)));

  // 4) 吸附与范围树
  const [lo, la] = P(0, 0);
  assert.equal(g1.nearest(lo + 0.0004, la, 100), at(0, 0), "离 (0,0) 约 25 m 的点应吸附到它");
  assert.equal(g1.nearest(lo + 1, la, 500), -1, "太远应返回 -1");
  const tr = g1.tree(at(0, 0), 400);
  assert.equal(tr.cost.size, 2, "400 秒内只能走到 (5,0)");
  assert.ok(Math.abs(tr.pathTo(at(5, 0)).distance - 500) < 6);

  // ── 网络 2：10×10 网格，A* 的结果必须和 Dijkstra 一致
  const G = [];
  for (let j = 0; j < 10; j++) G.push(feat([P(0, j), P(9, j)].flatMap((p, k) => k === 0 ? Array.from({ length: 10 }, (_, i) => P(i, j)) : []), { highway: "residential", name: "Тверская улица" }));
  for (let i = 0; i < 10; i++) G.push(feat(Array.from({ length: 10 }, (_, j) => P(i, j)), { highway: "residential", name: "улица Арбат" }));
  const g2 = build("grid", G, "37.5,55.7,37.8,55.8");
  assert.equal(g2.d.n, 100);
  const ids = (i, j) => { const [a, b] = P(i, j); return g2.nearest(a, b, 10); };
  for (const [a, b, c, d] of [[0, 0, 9, 9], [3, 7, 8, 1], [9, 0, 0, 9], [4, 4, 5, 5]]) {
    const ar = g2.route(ids(a, b), ids(c, d));
    const full = g2.tree(ids(a, b), 1e9);
    assert.ok(Math.abs(ar.cost - full.cost.get(ids(c, d))) < 1e-6, `A* 与 Dijkstra 代价不一致 (${a},${b})→(${c},${d})`);
    assert.ok(Math.abs(ar.distance - (Math.abs(a - c) + Math.abs(b - d)) * 100) < 20, "网格里最短距离 = 曼哈顿距离");
  }
  const st = buildSteps(g2, g2.route(ids(0, 0), ids(9, 0)));
  assert.deepEqual(st.map((s) => s.type), ["depart", "arrive"], "直路只有出发和到达");
  assert.ok(Math.abs(st[0].distance - 900) < 10);
  assert.ok(dist(...P(0, 0), ...P(9, 0)) > 890);
  console.log("步行路网与路线：全部通过");

  // ── 地铁：两条线在"Охотный Ряд"换乘
  const M = [];
  const nx = 60, ny = 90; // 覆盖 37.59–37.69 × 55.72–55.80 的密网格
  const mlon = 37.59, mlat = 55.72;
  const MP = (i, j) => [+(mlon + i * 0.0016).toFixed(6), +(mlat + j * 0.0009).toFixed(6)];
  for (let j = 0; j < ny; j++) M.push(feat(Array.from({ length: nx }, (_, i) => MP(i, j)), { highway: "residential", name: "Тверская улица" }));
  for (let i = 0; i < nx; i++) M.push(feat(Array.from({ length: ny }, (_, j) => MP(i, j)), { highway: "residential", name: "улица Арбат" }));
  const g3 = build("metro", M, "37.5,55.7,37.8,55.9");
  const stop = (id, name, lon, lat) => ({ type: "node", id, lon, lat, tags: { name } });
  const els = [
    stop(1, "Сокол", 37.60, 55.75), stop(2, "Охотный Ряд", 37.62, 55.75), stop(3, "Лубянка", 37.64, 55.75), stop(4, "Китай-город", 37.66, 55.75),
    stop(5, "Автозаводская", 37.62, 55.73), stop(12, "Охотный Ряд", 37.6203, 55.7502), stop(6, "Динамо", 37.62, 55.77), stop(7, "Аэропорт", 37.62, 55.79),
    { type: "relation", id: 100, tags: { route: "subway", ref: "1", name: "Сокольническая линия", colour: "#ef161e" }, members: [1, 2, 3, 4].map((ref) => ({ type: "node", ref, role: "stop" })) },
    { type: "relation", id: 101, tags: { route: "subway", ref: "1", name: "Сокольническая линия", colour: "#ef161e" }, members: [4, 3, 2, 1].map((ref) => ({ type: "node", ref, role: "stop" })) },
    { type: "relation", id: 200, tags: { route: "subway", ref: "2", name: "Замоскворецкая линия", colour: "#2dbe2c" }, members: [5, 12, 6, 7].map((ref) => ({ type: "node", ref, role: "stop_entry_only" })) },
    { type: "relation", id: 300, tags: { route: "bus", ref: "10" }, members: [] },
  ];
  const md = buildMetro(els);
  assert.equal(md.stations.length, 7, "同名且相距 <800 m 的停靠点应合并：" + md.stations.map((s) => s.ru));
  assert.equal(md.lines.length, 2);
  assert.equal(md.segments.length, 6, "线1 3 段（双向合并）+ 线2 3 段");
  assert.equal(md.stations.find((s) => s.ru === "Сокол").zh, "索科尔");
  assert.equal(md.stations.find((s) => s.ru === "Охотный Ряд").en, "Okhotny Ryad");
  assert.equal(md.lines[0].zh, "1号线");
  assert.equal(md.lines[0].color, "#ef161e");
  const metro = new Metro(md);
  const plan = metro.plan(g3, [37.6002, 55.7502], [37.6203, 55.7898]);
  assert.ok(plan, "应有地铁方案");
  const kinds = plan.legs.map((l) => l.kind + (l.kind === "ride" ? ":" + l.line.ref : ""));
  assert.ok(kinds.includes("ride:1") && kinds.includes("ride:2") && kinds.includes("transfer"), "应为 1 号线 → 换乘 → 2 号线：" + kinds);
  assert.equal(plan.transfers, 1);
  assert.equal(plan.stopsCount, 3, "1 号线 1 站 + 2 号线 2 站");
  const walkOnly = g3.route(g3.nearest(37.6002, 55.7502, 100), g3.nearest(37.6203, 55.7898, 100));
  assert.ok(plan.time < walkOnly.time / 2, `地铁应明显快于步行：${Math.round(plan.time)}s vs ${Math.round(walkOnly.time)}s`);
  assert.ok(plan.time > 600 && plan.time < 1800, "总时间应在 10–30 分钟：" + plan.time);
  assert.ok(metro.plan(g3, [37.6002, 55.7502], [37.6004, 55.7504]) === null || metro.plan(g3, [37.6002, 55.7502], [37.6004, 55.7504]).legs.length > 0);
  console.log(`地铁换乘：通过（预估 ${Math.round(plan.time / 60)} 分钟，步行需 ${Math.round(walkOnly.time / 60)} 分钟）`);

} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
rmSync(dir, { recursive: true, force: true });
