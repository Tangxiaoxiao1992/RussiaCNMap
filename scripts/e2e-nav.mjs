// 导航端到端：假数据 + 模拟 GPS。需要先 `npm run fixture && node scripts/make-nav-fixture.mjs && npm run build && npx vite preview --port 4173`
// 用法：node scripts/e2e-nav.mjs [截图目录]
import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const S = process.argv[2] || "/tmp/shots"; mkdirSync(S, { recursive: true });
const URL_ = process.env.URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: { latitude: 55.7402, longitude: 37.6002 }, permissions: ["geolocation"] });
const page = await ctx.newPage();
const external = [], errs = [];
await page.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("http://127.0.0.1")) return r.continue(); external.push(u); return r.abort(); });
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
await page.goto(URL_);
await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { timeout: 30000 });
await page.evaluate(() => window.__map.jumpTo({ center: [37.61, 55.745], zoom: 14 }));
await page.click("#locate"); await page.waitForTimeout(1200);
assert.ok(await page.$(".me"), "应出现定位小蓝点");

// 1) 步行：搜索"红场" → 路线
await page.fill("#q", "Red Square"); await page.waitForTimeout(400);
await page.click("#results button"); await page.waitForTimeout(800);
await page.click("#card .dir"); await page.waitForSelector(".route .opt", { timeout: 15000 });
console.log("路线面板:", (await page.textContent(".route")).replace(/\s+/g, " ").slice(0, 300));
await page.waitForTimeout(900); await page.screenshot({ path: S + "/1-route-walk.png" });
assert.ok((await page.textContent(".route")).includes("步行"));
await page.click('.route .opt[data-opt="walk"]'); await page.waitForTimeout(300);
await page.click(".route .go"); await page.waitForTimeout(600);
assert.ok(!(await page.$eval(".navtop", (e) => e.hidden)), "应显示导航横幅");
// 沿路线推进 GPS
const route = await page.evaluate(() => window.__nav.guide.coords);
const total = await page.evaluate(() => window.__nav.guide.total);
console.log("路线点数", route.length, "总长", Math.round(total), "m");
const feed = (lon, lat, heading) => page.evaluate(([a, b, h]) => window.__nav.feed({ lon: a, lat: b, heading: h, speed: 1.4 }), [lon, lat, heading]);
let n = 0;
for (let i = 0; i < Math.floor(route.length / 2); i += Math.max(1, Math.floor(route.length / 12))) { await feed(route[i][0], route[i][1], 90); await page.waitForTimeout(120); n++; if (n === 4) await page.screenshot({ path: S + "/2-navigating.png" }); }
console.log("横幅:", (await page.textContent(".navtop")).replace(/\s+/g, " "));
console.log("底栏:", (await page.textContent(".navbar")).replace(/\s+/g, " "));
// 2) 偏航重算：把点放到离路线 300 m 的地方
await page.evaluate(() => { window.__nav.navigating || 0; });
const off = [route[0][0] + 0.004, route[0][1] + 0.003];
for (let k = 0; k < 4; k++) { await feed(off[0], off[1], 0); await page.waitForTimeout(150); }
await page.waitForTimeout(1500);
const newStart = await page.evaluate(() => window.__nav.guide.coords[0]);
console.log("重算后起点", newStart, "偏航点", off);
assert.ok(Math.abs(newStart[0] - off[0]) < 0.003, "重算后的路线应从偏航位置附近开始");
// 3) 到达
const last = await page.evaluate(() => { const c = window.__nav.guide.coords; return c[c.length - 1]; });
await feed(last[0], last[1], 0); await page.waitForTimeout(500);
console.log("到达:", (await page.textContent(".navtop")).replace(/\s+/g, " "));
await page.screenshot({ path: S + "/3-arrived.png" });
assert.ok((await page.textContent(".navtop")).includes("到达"));
await page.click(".navbar .end"); await page.waitForTimeout(300);

// 4) 地铁：远距离目的地（Китай-город 站附近），英文界面
await page.click('#langs button[data-mode="en"]');
await page.evaluate(() => window.__nav.feed({ lon: 37.6002, lat: 55.7402, heading: 0, speed: 0 }));
await page.evaluate(() => window.__nav.open({ lon: 37.66, lat: 55.752, name: "Kitay-gorod" }));
await page.waitForSelector(".route .opt", { timeout: 15000 }); await page.waitForTimeout(900);
const txt = (await page.textContent(".route")).replace(/\s+/g, " ");
console.log("地铁面板:", txt.slice(0, 400));
assert.ok(txt.includes("Metro") && txt.includes("Walk"), "应同时给出步行和地铁两个方案");
await page.screenshot({ path: S + "/4-route-metro.png" });
assert.ok((await page.$eval('.route .opt[data-opt="metro"]', (e) => e.classList.contains("on"))), "更快的地铁方案应默认选中");
assert.ok(txt.includes("Line 1") || txt.includes("Sokol"), "应列出线路/站名");
await page.click(".route .go"); await page.waitForTimeout(400);
console.log("地铁导航横幅:", (await page.textContent(".navtop")).replace(/\s+/g, " "));
await page.screenshot({ path: S + "/5-metro-nav.png" });
// 5) 地铁线路图
await page.click("#metrobtn, .metrobtn"); await page.waitForSelector(".lines .lbtn", { timeout: 10000 });
console.log("线路列表:", (await page.textContent(".lines")).replace(/\s+/g, " "));
await page.waitForTimeout(1500); await page.screenshot({ path: S + "/6-metro-map.png" });
await page.click('.lines .lbtn[data-line="0"]'); await page.waitForTimeout(1200);
console.log("线路站点:", (await page.textContent(".lines")).replace(/\s+/g, " "));
await page.screenshot({ path: S + "/7-metro-line.png" });
await page.click('.lines .lbtn[data-st]'); await page.waitForTimeout(800);
console.log("点站名后卡片:", (await page.textContent("#card")).replace(/\s+/g, " ").slice(0, 120));
console.log("外部请求:", external.length, "错误:", errs.slice(0, 5));
assert.equal(external.length, 0); assert.equal(errs.length, 0);
console.log("导航端到端：通过");
await browser.close();
