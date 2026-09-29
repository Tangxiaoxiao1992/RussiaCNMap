import { Map as MapLibre, Marker, NavigationControl, GeolocateControl, ScaleControl, addProtocol } from "maplibre-gl";
import type { MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { PMTiles, Protocol } from "pmtiles";
import { makeStyle } from "./style";
import { ChunkedSource } from "./pm-source";
import { addZhNames } from "./tile-zh";
import { loadIndex, search, indexSize, type Hit } from "./services/search";
import { toZh } from "./zh/index";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div id="map"></div>
<header class="top">
  <form id="search" autocomplete="off">
    <input id="q" type="search" enterkeyhint="search" placeholder="搜索地名：红场、莫航、索科尔、Химки…" />
  </form>
  <div id="results" class="results" hidden></div>
</header>
<div id="status" class="status">正在读取离线地图…</div>
<aside id="card" class="card" hidden></aside>`;

// —— 离线数据：pmtiles 与页面同源（Capacitor 里在 APK 的 assets 中）
const base = window.location.href;
// dataUrl 只是数据源的名字；分块模式下真正读取的是 data/ 目录里的小文件
const dataUrl = new URL("moscow-oblast.pmtiles", base).href;
const protocol = new Protocol();
protocol.add(new PMTiles(new ChunkedSource(dataUrl, new URL("data/", base).href)));
// 包一层：每张瓦片解码后补上汉语名，再交给 MapLibre
addProtocol("pmtiles", async (params, abort) => {
  const res = await protocol.tilev4(params, abort);
  if (params.type !== "json" && res.data instanceof Uint8Array && res.data.length > 0) {
    res.data = addZhNames(res.data);
  }
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

// —— 状态提示
const status = $("status");
let failed = false;
const setStatus = (text: string, cls = "") => { status.textContent = text; status.className = "status " + cls; };
map.on("error", (e) => {
  console.error("map error", e.error);
  if (failed) return;
  failed = true;
  setStatus("离线地图数据缺失或损坏（data/ 目录里没有地图数据）", "error");
});
map.once("idle", () => {
  if (failed) return;
  setStatus("离线地图已就绪", "ok");
  setTimeout(() => status.classList.add("hidden"), 2200);
});

// —— 搜索
const input = $<HTMLInputElement>("q");
const results = $("results");
const card = $("card");
let marker: Marker | undefined;
let hits: Hit[] = [];
const indexReady = loadIndex(new URL("places-index.json", base).href);

function renderResults() {
  const q = input.value.trim();
  if (!q) { results.hidden = true; return; }
  hits = search(q);
  results.hidden = false;
  if (!hits.length) {
    results.innerHTML = `<div class="empty">没有找到「${esc(q)}」${indexSize() ? "" : "（地名索引未加载，只能搜索常用别名）"}</div>`;
    return;
  }
  results.innerHTML = hits.map((h, i) => `<button data-i="${i}"><b>${esc(h.zh)}</b><span>${esc(h.ru)}</span><i>${esc(h.kind)}</i></button>`).join("");
}
input.addEventListener("input", () => { void indexReady.then(renderResults); renderResults(); });
input.addEventListener("focus", renderResults);
$("search").addEventListener("submit", (e) => { e.preventDefault(); renderResults(); (results.querySelector("button") as HTMLButtonElement | null)?.click(); input.blur(); });
results.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const h = hits[Number(b.dataset.i)];
  results.hidden = true; input.blur();
  showPlace(h.zh, h.ru, h.kind, h.center, true);
});

function showPlace(zh: string, ru: string, kind: string, at: [number, number], fly: boolean) {
  marker?.remove();
  marker = new Marker({ color: "#d63b31" }).setLngLat(at).addTo(map);
  if (fly) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), kind === "城市" || kind === "城镇" ? 11 : 15.5), essential: true });
  card.hidden = false;
  card.innerHTML = `<button class="close" aria-label="关闭">×</button><span class="tag">${esc(kind)}</span><h2>${esc(zh)}</h2>${ru && ru !== zh ? `<p class="ru">${esc(ru)}</p>` : ""}<p class="coords">${at[1].toFixed(5)}, ${at[0].toFixed(5)}</p>`;
  card.querySelector(".close")!.addEventListener("click", () => { card.hidden = true; marker?.remove(); });
}

// —— 点地图：识别要素，显示汉语名 + 俄文原名
const KIND_ZH: Record<string, string> = {
  station: "车站", aerodrome: "机场", university: "大学", school: "学校", park: "公园", museum: "博物馆", attraction: "景点",
  theatre: "剧院", hospital: "医院", restaurant: "餐厅", cafe: "咖啡馆", supermarket: "超市", locality: "地点",
  city: "城市", town: "城镇", village: "村庄", neighbourhood: "街区", macrohood: "街区", river: "河流", lake: "湖泊",
  major_road: "主干道", medium_road: "道路", minor_road: "道路", highway: "高速公路", other: "道路", rail: "铁路",
};
map.on("click", (e) => {
  results.hidden = true; input.blur();
  const r = 8;
  const feats = map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]])
    .filter((f: MapGeoJSONFeature) => typeof f.properties?.name === "string" && f.properties.name);
  if (!feats.length) { card.hidden = true; marker?.remove(); return; }
  const rank = (f: MapGeoJSONFeature) => (f.sourceLayer === "pois" ? 0 : f.sourceLayer === "places" ? 1 : f.sourceLayer === "roads" ? 3 : 2);
  feats.sort((a, b) => rank(a) - rank(b));
  const p = feats[0].properties as Record<string, string>;
  const ru = p.name;
  const zh = p["name:zh-Hans"] || p["name:zh"] || toZh(ru, { station: p.kind === "station" }) || ru;
  showPlace(zh, ru, KIND_ZH[p.kind] ?? "地点", [e.lngLat.lng, e.lngLat.lat], false);
});

// 调试/自动化测试用
(window as unknown as { __map: MapLibre }).__map = map;
