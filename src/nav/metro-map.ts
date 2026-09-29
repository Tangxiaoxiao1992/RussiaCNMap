import type { Map as MapLibre, GeoJSONSource } from "maplibre-gl";
import type { Line, MetroData, Station } from "./metro-types.ts";
import { stationName } from "./guide.ts";
import type { Lang } from "./i18n.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const T = {
  title: { zh: "地铁线路图", en: "Metro lines", ru: "Схема метро" },
  lines: { zh: "全部线路", en: "All lines", ru: "Все линии" },
  stations: { zh: "站", en: "stations", ru: "ст." },
  none: { zh: "这个版本没有地铁数据", en: "No metro data in this build", ru: "В этой сборке нет данных метро" },
  back: { zh: "返回", en: "Back", ru: "Назад" },
  hint: { zh: "点站名可在地图上定位", en: "Tap a station to locate it", ru: "Нажмите на станцию, чтобы показать её" },
};
const lineName = (l: Line, lang: Lang) => (lang === "zh" ? l.zh : lang === "en" ? l.en : l.ru) || l.ref;

/** 按线路把车站排成顺序（从端点出发深度优先；环线从任意站开始） */
export function orderStations(data: MetroData, lineIdx: number): number[] {
  const adj = new Map<number, number[]>();
  for (const [a, b, l] of data.segments) {
    if (l !== lineIdx) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const ids = [...adj.keys()];
  if (!ids.length) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  const dfs = (n: number) => { seen.add(n); out.push(n); for (const m of adj.get(n)!) if (!seen.has(m)) dfs(m); };
  const ends = ids.filter((i) => adj.get(i)!.length === 1);
  for (const s of [...ends, ...ids]) if (!seen.has(s)) dfs(s);
  return out;
}

export class MetroMap {
  private map: MapLibre;
  private data: MetroData | null = null;
  private panel: HTMLElement;
  private shown = false;
  private selected = -1;
  constructor(private o: { map: MapLibre; getLang: () => Lang; load: () => Promise<MetroData | null>; onStation: (s: Station, lang: Lang) => void }) {
    this.map = o.map;
    const app = document.getElementById("app")!;
    this.panel = document.createElement("div"); this.panel.className = "route lines"; this.panel.hidden = true; app.appendChild(this.panel);
    const btn = document.createElement("button");
    btn.className = "locate metrobtn"; btn.type = "button"; btn.setAttribute("aria-label", "地铁线路图 / Metro map"); btn.textContent = "🚇";
    btn.addEventListener("click", () => void (this.shown ? this.hide() : this.show()));
    app.appendChild(btn);
    this.panel.addEventListener("click", (e) => this.onClick(e));
  }
  private get lang() { return this.o.getLang(); }

  async show() {
    this.shown = true; this.panel.hidden = false; this.selected = -1;
    this.panel.innerHTML = `<p class="msg">…</p>`;
    this.data ??= await this.o.load();
    if (!this.data) { this.panel.innerHTML = `<button class="close" data-act="close">×</button><p class="msg">${esc(T.none[this.lang])}</p>`; return; }
    this.ensureLayers(); this.applyLang(); this.setVisible(true);
    this.fitAll(); this.render();
  }
  hide() { this.shown = false; this.panel.hidden = true; this.setVisible(false); }

  private setVisible(v: boolean) {
    for (const id of ["metro-line", "metro-station", "metro-label"]) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
  }

  private ensureLayers() {
    const d = this.data!;
    const lineFeatures: GeoJSON.Feature[] = d.segments.map(([a, b, l]) => ({ type: "Feature", properties: { line: l, color: d.lines[l]?.color || "#243b53" }, geometry: { type: "LineString", coordinates: [[d.stations[a].lon, d.stations[a].lat], [d.stations[b].lon, d.stations[b].lat]] } }));
    const lineOf = new Map<number, Set<number>>();
    for (const [a, b, l] of d.segments) for (const s of [a, b]) (lineOf.get(s) ?? lineOf.set(s, new Set()).get(s)!).add(l);
    const stFeatures: GeoJSON.Feature[] = d.stations.map((s, i) => ({ type: "Feature", properties: { i, zh: s.zh || s.ru, en: s.en || s.ru, ru: s.ru, all: [s.zh, s.en, s.ru].filter((x, k, a) => x && a.indexOf(x) === k).join("\n"), lines: [...(lineOf.get(i) ?? [])].join(",") }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }));
    const fc = (features: GeoJSON.Feature[]) => ({ type: "FeatureCollection" as const, features });
    if (!this.map.getSource("metro-lines")) {
      this.map.addSource("metro-lines", { type: "geojson", data: fc(lineFeatures) });
      this.map.addSource("metro-stations", { type: "geojson", data: fc(stFeatures) });
      this.map.addLayer({ id: "metro-line", type: "line", source: "metro-lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 6], "line-opacity": ["case", ["==", ["get", "line"], ["literal", -1]], 1, 0.92] } });
      this.map.addLayer({ id: "metro-station", type: "circle", source: "metro-stations", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 5.5], "circle-color": "#fff", "circle-stroke-color": "#243b53", "circle-stroke-width": 1.8 } });
      this.map.addLayer({ id: "metro-label", type: "symbol", source: "metro-stations", minzoom: 10.5, layout: { "text-field": ["get", "zh"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-anchor": "top", "text-offset": [0, 0.7], "text-optional": true }, paint: { "text-color": "#102a43", "text-halo-color": "#fff", "text-halo-width": 1.6 } });
      this.map.on("click", "metro-station", (e) => {
        if (!this.shown) return;
        const f = e.features?.[0];
        if (f) this.o.onStation(this.data!.stations[Number(f.properties!.i)], this.lang);
      });
    }
  }

  private applyLang() {
    if (this.map.getLayer("metro-label")) this.map.setLayoutProperty("metro-label", "text-field", ["get", this.o.getLang() === "zh" ? "zh" : this.o.getLang()]);
  }

  private fitAll() {
    const d = this.data!;
    if (!d.stations.length) return;
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const s of d.stations) { x0 = Math.min(x0, s.lon); x1 = Math.max(x1, s.lon); y0 = Math.min(y0, s.lat); y1 = Math.max(y1, s.lat); }
    this.map.fitBounds([[x0, y0], [x1, y1]], { padding: { top: 100, bottom: 340, left: 30, right: 30 }, maxZoom: 12, duration: 500 });
  }

  private render() {
    const d = this.data!, L = this.lang;
    const close = `<button class="close" data-act="close" aria-label="close">×</button>`;
    if (this.selected < 0) {
      const counts = d.lines.map((_, i) => orderStations(d, i).length);
      this.panel.innerHTML = `${close}<h3>🚇 ${esc(T.title[L])}</h3><p class="note" style="text-align:left">${esc(T.hint[L])}</p>` +
        d.lines.map((l, i) => counts[i] ? `<button class="leg lbtn" data-line="${i}"><i class="chip" style="background:${esc(l.color || "#243b53")}">${esc(l.ref || "M")}</i><div><b>${esc(lineName(l, L))}</b><br><small>${counts[i]} ${esc(T.stations[L])}</small></div></button>` : "").join("");
    } else {
      const l = d.lines[this.selected], ord = orderStations(d, this.selected);
      this.panel.innerHTML = `${close}<h3><button class="ghost back" data-act="back">‹ ${esc(T.back[L])}</button> ${esc(lineName(l, L))}</h3>` +
        ord.map((sid, k) => { const s = d.stations[sid]; const alt = [s.zh, s.en, s.ru].filter((x) => x && x !== stationName(s, L)); return `<button class="leg lbtn" data-st="${sid}"><i class="chip" style="background:${esc(l.color || "#243b53")}">${k + 1}</i><div><b>${esc(stationName(s, L))}</b><br><small>${esc(alt.join(" · "))}</small></div></button>`; }).join("");
    }
  }

  private onClick(e: Event) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b || !this.data) return;
    if (b.dataset.act === "close") return this.hide();
    if (b.dataset.act === "back") { this.selected = -1; this.setLineFilter(-1); this.render(); return this.fitAll(); }
    if (b.dataset.line) {
      this.selected = Number(b.dataset.line); this.setLineFilter(this.selected); this.render();
      const ord = orderStations(this.data, this.selected).map((i) => this.data!.stations[i]);
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      for (const s of ord) { x0 = Math.min(x0, s.lon); x1 = Math.max(x1, s.lon); y0 = Math.min(y0, s.lat); y1 = Math.max(y1, s.lat); }
      this.map.fitBounds([[x0, y0], [x1, y1]], { padding: { top: 100, bottom: 340, left: 30, right: 30 }, maxZoom: 14, duration: 500 });
    }
    if (b.dataset.st) { const s = this.data.stations[Number(b.dataset.st)]; this.map.flyTo({ center: [s.lon, s.lat], zoom: 15, essential: true }); this.o.onStation(s, this.lang); }
  }

  /** 选中某条线时其它线变淡 */
  private setLineFilter(line: number) {
    if (!this.map.getLayer("metro-line")) return;
    this.map.setPaintProperty("metro-line", "line-opacity", line < 0 ? 0.92 : ["case", ["==", ["get", "line"], line], 1, 0.15]);
  }

  refresh() { if (!this.shown || !this.data) return; this.applyLang(); this.render(); }
}
export type { GeoJSONSource };
