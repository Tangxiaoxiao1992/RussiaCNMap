import { Map as MapLibre, Marker, NavigationControl, GeolocateControl, ScaleControl, addProtocol } from "maplibre-gl";
import type { MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { PMTiles, Protocol } from "pmtiles";
import { makeStyle } from "./style";
import { ChunkedSource } from "./pm-source";
import { addNames } from "./tile-names";
import { loadIndex, search, indexSize, kindLabel, type Hit } from "./services/search";
import { toZh } from "./zh/index";
import { toEn } from "./en/index";
import { MODES, applyLabelMode, nameLayerIds, type LabelMode } from "./labels";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// —— 记住上次选的标注语言（存储不可用时静默忽略）
const STORE = "russiacnmap.labelMode";
let mode: LabelMode = "zh";
try { const v = localStorage.getItem(STORE); if (v && v in MODES) mode = v as LabelMode; } catch { /* ignore */ }

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div id="map"></div>
<header class="top">
  <form id="search" autocomplete="off">
    <input id="q" type="search" enterkeyhint="search" placeholder="搜索 / Search：红场 · Red Square" />
  </form>
  <div id="langs" class="langs" role="group" aria-label="标注语言 / Label language">
    ${(Object.keys(MODES) as LabelMode[]).map((m) => `<button data-mode="${m}" title="${esc(MODES[m].title)}">${esc(MODES[m].short)}</button>`).join("")}
  </div>
  <div id="results" class="results" hidden></div>
</header>
<div id="status" class="status">正在读取离线地图… · Loading offline map…</div>
<aside id="card" class="card" hidden></aside>`;

// —— 离线数据：与页面同源（Capacitor 里在 APK 的 assets 中）
const base = window.location.href;
// dataUrl 只是数据源的名字；分块模式下真正读取的是 data/ 目录里的小文件
const dataUrl = new URL("moscow-oblast.pmtiles", base).href;
const protocol = new Protocol();
protocol.add(new PMTiles(new ChunkedSource(dataUrl, new URL("data/", base).href)));
// 包一层：每张瓦片解码后补上汉语名和英文名，再交给 MapLibre
addProtocol("pmtiles", async (params, abort) => {
  const res = await protocol.tilev4(params, abort);
  if (params.type !== "json" && res.data instanceof Uint8Array && res.data.length > 0) res.data = addNames(res.data);
  return res;
});

const map = new MapLibre({
  container: "map",
  style: makeStyle(dataUrl, base),
  center: [37.6173, 55.7558],
  zoom: 10,
  minZoom: 5,
  maxZoom: 19,
  // CJK 字形用手机系统字体绘制，离线也不需要几万个字形文件
  localIdeographFontFamily: '"PingFang SC","Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC","HarmonyOS Sans SC","MiSans","Microsoft YaHei",sans-serif',
  attributionControl: { compact: true },
});
map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");
map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

// —— 标注语言切换（不重新加载瓦片，直接改样式）
let labelIds: string[] = [];
const langs = $("langs");
function markMode() { langs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode)); }
map.on("load", () => { labelIds = nameLayerIds(map); applyLabelMode(map, mode, labelIds); });
langs.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  mode = b.dataset.mode as LabelMode;
  try { localStorage.setItem(STORE, mode); } catch { /* ignore */ }
  markMode(); applyLabelMode(map, mode, labelIds);
  renderResults(); // 结果列表的主语言也跟着变
  if (current) showPlace(current.names, current.kind, current.at, false);
});
markMode();

// —— 状态提示
const status = $("status");
let failed = false;
const setStatus = (text: string, cls = "") => { status.textContent = text; status.className = "status " + cls; };
map.on("error", (e) => {
  console.error("map error", e.error);
  if (failed) return;
  failed = true;
  setStatus("离线地图数据缺失或损坏（data/ 目录里没有地图数据） · Offline map data missing or corrupt", "error");
});
map.once("idle", () => {
  if (failed) return;
  setStatus("离线地图已就绪 · Offline map ready", "ok");
  setTimeout(() => status.classList.add("hidden"), 2200);
});

// —— 三语名称：按当前模式排出主次
type Names = { zh: string; en: string; ru: string };
const ORDER: Record<LabelMode, Array<keyof Names>> = { zh: ["zh", "en", "ru"], en: ["en", "zh", "ru"], ru: ["ru", "zh", "en"], all: ["zh", "en", "ru"] };
function lines(n: Names): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of ORDER[mode]) {
    const v = n[k]?.trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}

// —— 搜索
const input = $<HTMLInputElement>("q");
const results = $("results");
const card = $("card");
let marker: Marker | undefined;
let hits: Hit[] = [];
let current: { names: Names; kind: number; at: [number, number] } | undefined;
const indexReady = loadIndex(new URL("places-index.json", base).href);

function renderResults() {
  const q = input.value.trim();
  if (!q) { results.hidden = true; return; }
  hits = search(q);
  results.hidden = false;
  if (!hits.length) {
    results.innerHTML = `<div class="empty">没有找到「${esc(q)}」· No results${indexSize() ? "" : "（地名索引未加载，只能搜索常用别名 · index not loaded）"}</div>`;
    return;
  }
  results.innerHTML = hits.map((h, i) => {
    const [first, ...rest] = lines(h);
    return `<button data-i="${i}"><b>${esc(first)}</b><span>${esc(rest.join(" · "))}</span><i>${esc(kindLabel(h.kind))}</i></button>`;
  }).join("");
}
input.addEventListener("input", () => { void indexReady.then(renderResults); renderResults(); });
input.addEventListener("focus", renderResults);
$("search").addEventListener("submit", (e) => { e.preventDefault(); renderResults(); (results.querySelector("button") as HTMLButtonElement | null)?.click(); input.blur(); });
results.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button[data-i]") as HTMLButtonElement | null;
  if (!b) return;
  const h = hits[Number(b.dataset.i)];
  results.hidden = true; input.blur();
  showPlace({ zh: h.zh, en: h.en, ru: h.ru }, h.kind, h.center, true);
});

function showPlace(names: Names, kind: number, at: [number, number], fly: boolean) {
  current = { names, kind, at };
  marker?.remove();
  marker = new Marker({ color: "#d63b31" }).setLngLat(at).addTo(map);
  if (fly) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), kind <= 1 ? 11 : 15.5), essential: true });
  const [first, ...rest] = lines(names);
  card.hidden = false;
  card.innerHTML = `<button class="close" aria-label="关闭 / Close">×</button><span class="tag">${esc(kindLabel(kind))}</span><h2>${esc(first)}</h2>${rest.map((r) => `<p class="alt">${esc(r)}</p>`).join("")}<p class="coords">${at[1].toFixed(5)}, ${at[0].toFixed(5)}</p>`;
  card.querySelector(".close")!.addEventListener("click", () => { card.hidden = true; current = undefined; marker?.remove(); });
}

// —— 点地图：识别要素，显示中文 / English / Русский 三种名称
const KIND_IDX: Record<string, number> = {
  city: 0, town: 1, village: 2, station: 3, attraction: 4, museum: 4, theatre: 4, stadium: 4, artwork: 4,
  major_road: 5, medium_road: 5, minor_road: 5, highway: 5, other: 5, rail: 5,
  river: 6, lake: 6, park: 7, garden: 7, aerodrome: 9, university: 10, college: 10,
};
map.on("click", (e) => {
  results.hidden = true; input.blur();
  const r = 8;
  const feats = map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]])
    .filter((f: MapGeoJSONFeature) => typeof f.properties?.name === "string" && f.properties.name);
  if (!feats.length) { card.hidden = true; current = undefined; marker?.remove(); return; }
  const rank = (f: MapGeoJSONFeature) => (f.sourceLayer === "pois" ? 0 : f.sourceLayer === "places" ? 1 : f.sourceLayer === "roads" ? 3 : 2);
  feats.sort((a, b) => rank(a) - rank(b));
  const p = feats[0].properties as Record<string, string>;
  const ru = p.name;
  const station = p.kind === "station";
  const names: Names = {
    ru,
    zh: p["name:zh-Hans"] || p["name:zh"] || toZh(ru, { station }) || ru,
    en: p["name:en"] || toEn(ru) || ru,
  };
  const kind = p.kind === "locality" ? (KIND_IDX[p.kind_detail] ?? 2) : (KIND_IDX[p.kind] ?? 8);
  showPlace(names, kind, [e.lngLat.lng, e.lngLat.lat], false);
});

// 调试/自动化测试用
(window as unknown as { __map: MapLibre }).__map = map;
