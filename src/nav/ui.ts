import { Marker } from "maplibre-gl";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { Map as MapLibre, GeoJSONSource } from "maplibre-gl";
import { loadNav, type NavData } from "./load.ts";
import { metroGuide, progress, walkGuide, stationName, type Guide } from "./guide.ts";
import { SPEECH_LANG, UI, fmtClock, fmtDist, fmtTime, t, type Lang } from "./i18n.ts";
import type { MetroPlan } from "./metro.ts";
import type { Path } from "./graph.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Fix { lon: number; lat: number; heading?: number | null; speed?: number | null; accuracy?: number }
export interface Dest { lon: number; lat: number; name: string }
interface Option { id: "walk" | "metro"; time: number; distance: number; guide: Guide; plan?: MetroPlan; path?: Path }

const WALK_BASE = 1.3;
const OFF_ROUTE_M = 40, OFF_ROUTE_FIXES = 3, ARRIVE_M = 25;

export interface NavUIOptions {
  map: MapLibre;
  navDir: string;
  getLang: () => Lang;
  /** 面板打开/关闭时，主界面需要藏起/恢复地点卡片 */
  onPanel: (open: boolean) => void;
}

export class NavUI {
  private map: MapLibre;
  private o: NavUIOptions;
  private data: Promise<NavData | null> | undefined;
  private panel: HTMLElement; private banner: HTMLElement; private bar: HTMLElement; private hint: HTMLElement;
  private dest: Dest | undefined;
  private origin: { lon: number; lat: number; gps: boolean } | undefined;
  private options: Option[] = [];
  private chosen: Option["id"] = "walk";
  private message = "";
  private busy = false;
  private picking = false;
  private lastFix: Fix | undefined;
  private watchId: number | undefined;
  private me: Marker | undefined; private cone: HTMLElement | undefined;
  private compass: number | undefined;
  // 导航状态
  private guide: Guide | undefined;
  private navigating = false;
  private follow = true;
  private lastSeg = 0;
  private offCount = 0;
  private said = new Set<string>();
  private muted = false;
  private emaSpeed = 0;
  private lastFixAt = 0;
  private rerouting = false;

  constructor(o: NavUIOptions) {
    this.o = o; this.map = o.map;
    const mk = (cls: string) => { const e = document.createElement("div"); e.className = cls; e.hidden = true; document.getElementById("app")!.appendChild(e); return e; };
    this.panel = mk("route"); this.banner = mk("navtop"); this.bar = mk("navbar"); this.hint = mk("pickhint");
    const btn = document.createElement("button");
    btn.id = "locate"; btn.className = "locate"; btn.type = "button"; btn.setAttribute("aria-label", "定位 / My location"); btn.textContent = "◎";
    btn.addEventListener("click", () => this.locate(true));
    document.getElementById("app")!.appendChild(btn);
    this.map.on("dragstart", () => { if (this.navigating && this.follow) { this.follow = false; this.renderBar(); } });
    if (this.map.loaded()) this.ensureLayers(); else this.map.once("load", () => this.ensureLayers());
    window.addEventListener("deviceorientationabsolute", (e) => this.onOrient(e as DeviceOrientationEvent));
    window.addEventListener("deviceorientation", (e) => { const w = e as DeviceOrientationEvent & { webkitCompassHeading?: number }; if (typeof w.webkitCompassHeading === "number") this.compass = w.webkitCompassHeading; });
  }

  get lang(): Lang { return this.o.getLang(); }
  isPicking() { return this.picking; }
  isActive() { return this.navigating || !this.panel.hidden; }

  // ————— 定位（离线可用，靠手机 GPS）
  private watching = false;
  locate(center: boolean) {
    if (!this.watching) {
      this.watching = true;
      const onPos = (c: { longitude: number; latitude: number; heading?: number | null; speed?: number | null; accuracy?: number }, ts?: number) => {
        if (ts && Date.now() - ts > 15000) return; // 丢弃过期的缓存定位
        this.feed({ lon: c.longitude, lat: c.latitude, heading: c.heading, speed: c.speed, accuracy: c.accuracy });
      };
      if (Capacitor.isNativePlatform()) {
        // 用系统的融合定位（GPS + 网络），比 WebView 自带的 geolocation 准，也会正确弹出权限申请
        void (async () => {
          try { await Geolocation.requestPermissions(); } catch { /* 用户拒绝时下面会报错 */ }
          try {
            await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }, (pos, err) => {
              if (err || !pos) { console.warn("定位失败", err); return; }
              onPos(pos.coords, pos.timestamp);
            });
          } catch (e) { console.warn("定位失败", e); this.watching = false; }
        })();
      } else if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition((p) => onPos(p.coords, p.timestamp), (err) => console.warn("定位失败", err.message), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      }
    }
    if (center && this.lastFix) this.map.flyTo({ center: [this.lastFix.lon, this.lastFix.lat], zoom: Math.max(this.map.getZoom(), 15), essential: true });
    else if (center) this.wantCenter = true;
  }
  private wantCenter = false;

  private onOrient(e: DeviceOrientationEvent) {
    if (e.absolute && typeof e.alpha === "number") { this.compass = (360 - e.alpha) % 360; this.updateDot(); }
  }

  private heading(): number | undefined {
    const f = this.lastFix;
    if (f && typeof f.heading === "number" && !Number.isNaN(f.heading) && (f.speed ?? 0) > 0.7) return f.heading;
    return this.compass;
  }

  private badge: HTMLElement | undefined;
  private showAccuracy(f: Fix) {
    if (!this.badge) { this.badge = document.createElement("div"); this.badge.className = "accbadge"; document.getElementById("app")!.appendChild(this.badge); }
    const a = f.accuracy;
    this.badge.textContent = a ? `±${Math.round(a)}m` : "";
    this.badge.style.color = !a ? "#52606d" : a <= 30 ? "#1b7f3b" : a <= 100 ? "#b26a00" : "#c0341d";
    const src = this.map.getSource("me-acc") as GeoJSONSource | undefined;
    if (src && a) {
      const k = Math.cos((f.lat * Math.PI) / 180), pts: [number, number][] = [];
      for (let i = 0; i <= 48; i++) { const t = (i / 48) * 2 * Math.PI; pts.push([f.lon + (a * Math.cos(t)) / (111320 * k), f.lat + (a * Math.sin(t)) / 110540]); }
      src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } });
    }
  }

  private updateDot() {
    const f = this.lastFix;
    if (!f) return;
    if (!this.me) {
      const el = document.createElement("div"); el.className = "me";
      el.innerHTML = `<div class="cone"></div><div class="dot"></div>`;
      this.cone = el.querySelector(".cone") as HTMLElement;
      this.me = new Marker({ element: el, rotationAlignment: "map" }).setLngLat([f.lon, f.lat]).addTo(this.map);
    }
    this.me.setLngLat([f.lon, f.lat]);
    this.showAccuracy(f);
    const h = this.heading();
    if (this.cone) { this.cone.style.display = h === undefined ? "none" : "block"; if (h !== undefined) this.cone.style.transform = `rotate(${h}deg)`; }
  }

  /** 收到一个定位点（真实 GPS 或测试注入） */
  feed(f: Fix) {
    const now = Date.now();
    // 精度很差的点（多半是基站/缓存定位）不要覆盖刚拿到的好定位
    if (f.accuracy && f.accuracy > 150 && this.lastFix && now - this.lastFixAt < 20000 && (this.lastFix.accuracy ?? 999) < f.accuracy) return;
    if (this.lastFix && typeof f.speed !== "number") {
      const dt = (now - this.lastFixAt) / 1000;
      if (dt > 0.5) { const dx = (f.lon - this.lastFix.lon) * 111320 * Math.cos((f.lat * Math.PI) / 180), dy = (f.lat - this.lastFix.lat) * 110540; f.speed = Math.hypot(dx, dy) / dt; }
    }
    this.lastFix = f; this.lastFixAt = now;
    if (this.wantCenter) { this.wantCenter = false; this.map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(this.map.getZoom(), 15), essential: true }); }
    if (typeof f.speed === "number" && f.speed > 0.4) this.emaSpeed = this.emaSpeed ? this.emaSpeed * 0.8 + f.speed * 0.2 : f.speed;
    this.updateDot();
    if (!this.panel.hidden && this.dest && !this.origin && !this.busy) { this.origin = { lon: f.lon, lat: f.lat, gps: true }; void this.plan(); }
    if (this.navigating) this.onNavFix(f);
  }

  // ————— 路线图层
  private ensureLayers() {
    if (this.map.getSource("route")) return;
    this.map.addSource("me-acc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    this.map.addLayer({ id: "me-acc", type: "fill", source: "me-acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
    this.map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    this.map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.95 } });
    this.map.addLayer({ id: "route-ride", type: "line", source: "route", filter: ["==", ["get", "kind"], "ride"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 6 } });
    this.map.addLayer({ id: "route-walk", type: "line", source: "route", filter: ["!=", ["get", "kind"], "ride"], layout: { "line-join": "round" }, paint: { "line-color": "#1a73e8", "line-width": 5, "line-dasharray": [0.2, 1.6], } });
  }
  private setRouteData(opt: Option | undefined) {
    this.ensureLayers();
    const src = this.map.getSource("route") as GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [];
    if (opt?.path) features.push({ type: "Feature", properties: { kind: "walk" }, geometry: { type: "LineString", coordinates: opt.path.coords } });
    if (opt?.plan) for (const l of opt.plan.legs) {
      if (l.kind === "walk") features.push({ type: "Feature", properties: { kind: "walk" }, geometry: { type: "LineString", coordinates: l.path.coords } });
      else if (l.kind === "ride") features.push({ type: "Feature", properties: { kind: "ride", color: l.line.color || "#243b53" }, geometry: { type: "LineString", coordinates: l.coords } });
      else features.push({ type: "Feature", properties: { kind: "transfer" }, geometry: { type: "LineString", coordinates: l.coords } });
    }
    src.setData({ type: "FeatureCollection", features });
  }

  // ————— 路线规划
  /** 地铁线路数据（线路图用）；没有导航数据时为 null */
  async metroData() { const n = await this.navData(); return n?.metro?.data ?? null; }
  private navData() { return (this.data ??= loadNav(this.o.navDir)); }

  open(dest: Dest) {
    this.dest = dest; this.message = ""; this.options = []; this.userPicked = false;
    this.origin = this.lastFix ? { lon: this.lastFix.lon, lat: this.lastFix.lat, gps: true } : undefined;
    this.locate(false);
    this.o.onPanel(true);
    this.panel.hidden = false;
    this.render();
    void this.plan();
  }

  close() {
    this.stop(true);
    this.panel.hidden = true; this.picking = false; this.hint.hidden = true;
    this.setRouteData(undefined);
    this.options = []; this.o.onPanel(false);
  }

  /** 地图点击：选择起点 */
  pick(lon: number, lat: number) {
    this.picking = false; this.hint.hidden = true; this.panel.hidden = false;
    this.origin = { lon, lat, gps: false };
    this.render(); void this.plan();
  }

  private async plan() {
    if (!this.dest) return;
    if (!this.origin) { this.message = t(UI.noGps, this.lang); this.render(); return; }
    this.busy = true; this.message = t(UI.loading, this.lang); this.render();
    const nav = await this.navData();
    this.busy = false;
    if (!nav) { this.message = t(UI.noData, this.lang); this.options = []; this.render(); return; }
    this.message = "";
    const opts = this.compute(nav, this.origin, this.dest);
    this.options = opts;
    if (!opts.length) { this.message ||= t(UI.noRoute, this.lang); this.setRouteData(undefined); this.render(); return; }
    const best = opts.slice().sort((a, b) => a.time - b.time)[0];
    if (!opts.some((x) => x.id === this.chosen)) this.chosen = best.id;
    if (opts.length === 2 && this.chosen === "walk" && best.id === "metro" && !this.userPicked) this.chosen = "metro";
    this.showChosen(true);
  }
  private userPicked = false;

  private compute(nav: NavData, o: { lon: number; lat: number }, d: Dest): Option[] {
    const g = nav.graph;
    const s = g.nearest(o.lon, o.lat, 600), e = g.nearest(d.lon, d.lat, 600);
    if (s < 0 || e < 0) { this.message = t(UI.outside, this.lang); return []; }
    const out: Option[] = [];
    const wp = g.route(s, e);
    if (wp) out.push({ id: "walk", time: wp.time, distance: wp.distance, guide: walkGuide(g, wp), path: wp });
    if (nav.metro) {
      try {
        const mp = nav.metro.plan(g, [o.lon, o.lat], [d.lon, d.lat]);
        if (mp && (!wp || mp.time < wp.time * 0.95)) out.push({ id: "metro", time: mp.time, distance: mp.walkDistance + mp.rideDistance, guide: metroGuide(g, mp), plan: mp });
      } catch (err) { console.warn("地铁规划失败", err); }
    }
    return out;
  }

  private showChosen(fit: boolean) {
    const opt = this.options.find((x) => x.id === this.chosen);
    this.setRouteData(opt);
    this.render();
    if (fit && opt) {
      const c = opt.guide.coords;
      if (c.length) {
        let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
        for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        this.map.fitBounds([[x0, y0], [x1, y1]], { padding: { top: 120, bottom: 330, left: 40, right: 40 }, maxZoom: 17, duration: 600 });
      }
    }
  }

  // ————— 面板
  private render() {
    if (this.panel.hidden || !this.dest) return;
    const L = this.lang;
    const now = Date.now();
    const acc = this.origin?.gps && this.lastFix?.accuracy ? ` ±${Math.round(this.lastFix.accuracy)}m` : "";
    const from = this.origin ? (this.origin.gps ? t(UI.myPos, L) + acc : `${this.origin.lat.toFixed(4)}, ${this.origin.lon.toFixed(4)}`) : "—";
    const opts = this.options.map((x) => {
      const on = x.id === this.chosen;
      const title = x.id === "walk" ? "🚶 " + t(UI.walk, L) : "🚇 " + t(UI.metro, L);
      return `<button class="opt${on ? " on" : ""}" data-opt="${x.id}"><b>${title}</b><span class="big">${esc(fmtTime(x.time, L))}</span><small>${esc(fmtDist(x.distance, L))} · ${esc(t(UI.eta, L))} ${fmtClock(now + x.time * 1000)}</small></button>`;
    }).join("");
    const cur = this.options.find((x) => x.id === this.chosen);
    this.panel.innerHTML = `<button class="close" data-act="close" aria-label="${esc(t(UI.close, L))}">×</button>
      <h3>${esc(t(UI.directions, L))} → ${esc(this.dest.name)}</h3>
      <div class="from"><span>${esc(t(UI.from, L))}：${esc(from)}</span><button data-act="pick">${esc(t(UI.changeStart, L))}</button></div>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ""}
      ${opts ? `<div class="opts">${opts}</div>` : ""}
      ${cur ? `<div class="detail">${this.detail(cur)}</div><button class="go" data-act="go">${esc(t(UI.start, L))}</button><p class="note">${esc(t(UI.estimate, L))}</p>` : ""}`;
  }

  private detail(o: Option): string {
    const L = this.lang;
    if (o.plan) {
      return o.plan.legs.map((l) => {
        if (l.kind === "walk") return `<div class="leg"><i class="ic">🚶</i><div>${esc(t(UI.walkTo, L))} ${esc(fmtDist(l.distance, L))} · ${esc(fmtTime(l.time, L))}</div></div>`;
        if (l.kind === "ride") {
          const nm = (L === "zh" ? l.line.zh : L === "en" ? l.line.en : l.line.ru) || l.line.ref;
          return `<div class="leg"><i class="chip" style="background:${esc(l.line.color || "#243b53")}">${esc(l.line.ref || "M")}</i><div><b>${esc(stationName(l.from, L))}</b> → <b>${esc(stationName(l.to, L))}</b><br><small>${esc(nm)} · ${esc(UI.stopsWord(l.stops.length - 1, L))} · ${esc(fmtTime(l.time, L))}${l === o.plan!.legs.find((x) => x.kind === "ride") ? " · " + esc(t(UI.waitNote, L)) : ""}</small></div></div>`;
        }
        return `<div class="leg"><i class="ic">⇄</i><div>${esc(t(UI.transferTo, L))} → ${esc(stationName(l.to, L))} · ${esc(fmtTime(l.time, L))}</div></div>`;
      }).join("");
    }
    const steps = o.guide.instrs;
    return steps.slice(0, 40).map((i, k) => {
      const next = steps[k + 1];
      const d = next ? fmtDist(next.along - i.along, L) : "";
      return `<div class="leg"><i class="ic">${i.arrow}</i><div>${esc(i.text(L, false))}${d ? `<small> · ${esc(d)}</small>` : ""}</div></div>`;
    }).join("");
  }

  handlePanelClick(e: Event) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.opt) { this.chosen = b.dataset.opt as Option["id"]; this.userPicked = true; this.showChosen(true); return; }
    switch (b.dataset.act) {
      case "close": this.close(); break;
      case "pick": this.picking = true; this.panel.hidden = true; this.hint.hidden = false; this.hint.textContent = t(UI.pickStart, this.lang); break;
      case "go": this.start(); break;
    }
  }

  // ————— 导航
  start() {
    const opt = this.options.find((x) => x.id === this.chosen);
    if (!opt) return;
    this.guide = opt.guide; this.navigating = true; this.follow = true; this.lastSeg = 0; this.offCount = 0; this.said.clear();
    this.panel.hidden = true;
    this.locate(false);
    this.banner.hidden = false; this.bar.hidden = false;
    this.speak(t(UI.start, this.lang) + ". " + opt.guide.instrs[0].text(this.lang, true), true);
    if (this.lastFix) this.onNavFix(this.lastFix); else { this.renderBanner(undefined); this.renderBar(); }
  }

  stop(silent = false) {
    if (!this.navigating && !this.guide) return;
    this.navigating = false; this.guide = undefined;
    this.banner.hidden = true; this.bar.hidden = true;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (!silent) { this.panel.hidden = false; this.render(); }
    try { this.map.easeTo({ bearing: 0, pitch: 0, duration: 400 }); } catch { /* ignore */ }
  }

  private lastProg: ReturnType<typeof progress> | undefined;
  private onNavFix(f: Fix) {
    const gd = this.guide;
    if (!gd) return;
    const factor = this.emaSpeed > 0.5 ? Math.min(1.6, Math.max(0.6, WALK_BASE / this.emaSpeed)) : 1;
    const p = progress(gd, f.lon, f.lat, this.lastSeg, factor);
    this.lastProg = p;
    if (p.off > OFF_ROUTE_M) {
      this.offCount++;
      if (this.offCount >= OFF_ROUTE_FIXES) { void this.reroute(f); return; }
    } else { this.offCount = 0; this.lastSeg = p.seg; }
    if (p.remaining < ARRIVE_M && p.off < 80) { this.arrive(); return; }
    this.renderBanner(p); this.renderBar(p);
    this.announce(p);
    if (this.follow) {
      const h = this.heading();
      this.map.easeTo({ center: [f.lon, f.lat], zoom: Math.max(this.map.getZoom(), 16.5), bearing: h ?? this.map.getBearing(), duration: 700, essential: true });
    }
  }

  private async reroute(f: Fix) {
    if (this.rerouting || !this.dest) return;
    this.rerouting = true; this.offCount = 0;
    this.banner.innerHTML = `<div class="ttl">${esc(t(UI.rerouting, this.lang))}</div>`;
    this.speak(t(UI.rerouting, this.lang), true);
    try {
      const nav = await this.navData();
      if (!nav) return;
      const opts = this.compute(nav, f, this.dest);
      const opt = opts.find((x) => x.id === this.chosen) ?? opts[0];
      if (opt) {
        this.options = opts; this.chosen = opt.id; this.guide = opt.guide; this.lastSeg = 0; this.said.clear();
        this.setRouteData(opt);
        this.origin = { lon: f.lon, lat: f.lat, gps: true };
      }
    } finally { this.rerouting = false; }
  }

  private arrive() {
    const L = this.lang;
    this.banner.innerHTML = `<div class="arr">⚑</div><div class="ttl">${esc(t(UI.arrived, L))}</div>`;
    this.speak(t(UI.arrived, L), true);
    this.navigating = false; this.guide = undefined;
    this.bar.innerHTML = `<button class="end" data-act="end">${esc(t(UI.close, L))}</button>`;
  }

  private renderBanner(p: ReturnType<typeof progress> | undefined) {
    const gd = this.guide;
    if (!gd) return;
    const L = this.lang;
    const i = p ? (gd.instrs[p.cur].type === "ride" ? gd.instrs[p.cur] : gd.instrs[p.up]) : gd.instrs[0];
    const dist = p ? (gd.instrs[p.cur].type === "ride" ? 0 : Math.max(0, gd.instrs[p.up].along - p.along)) : 0;
    const after = p && p.up + 1 < gd.instrs.length && gd.instrs[p.up].type !== "arrive" ? gd.instrs[p.up + 1] : undefined;
    this.banner.innerHTML = `<div class="arr">${i.arrow}</div><div class="txt"><div class="dist">${dist > 0 ? esc(fmtDist(dist, L)) : ""}</div><div class="ttl">${esc(i.text(L, false))}</div>${after ? `<div class="then">${esc(t(UI.next, L))}：${esc(after.text(L, false))}</div>` : ""}</div>`;
  }

  private renderBar(p?: ReturnType<typeof progress>) {
    const L = this.lang;
    const q = p ?? this.lastProg;
    const rem = q ? fmtDist(q.remaining, L) : "";
    const time = q ? fmtTime(q.remainingTime, L) : "";
    const eta = q ? fmtClock(Date.now() + q.remainingTime * 1000) : "";
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    this.bar.innerHTML = `<div class="stat"><b>${esc(time)}</b><small>${esc(rem)}${eta ? " · " + esc(t(UI.eta, L)) + " " + eta : ""}</small></div>
      ${this.follow ? "" : `<button data-act="recenter" class="ghost">◎</button>`}
      ${canSpeak ? `<button data-act="mute" class="ghost">${this.muted ? "🔇" : "🔊"}</button>` : ""}
      <button class="end" data-act="end">${esc(t(UI.end, L))}</button>`;
  }

  handleBarClick(e: Event) {
    const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.act === "end") { if (this.navigating) this.stop(); else { this.stop(true); this.bar.hidden = true; this.banner.hidden = true; this.close(); } }
    else if (b.dataset.act === "mute") { this.muted = !this.muted; if (this.muted) window.speechSynthesis?.cancel(); this.renderBar(); }
    else if (b.dataset.act === "recenter") { this.follow = true; this.renderBar(); if (this.lastFix) this.onNavFix(this.lastFix); }
  }

  // ————— 语音
  private announce(p: ReturnType<typeof progress>) {
    const gd = this.guide;
    if (!gd) return;
    const L = this.lang;
    const cur = gd.instrs[p.cur];
    if ((cur.type === "ride" || cur.type === "transfer") && !this.said.has("c" + p.cur)) { this.said.add("c" + p.cur); this.speak(cur.text(L, true)); return; }
    const up = gd.instrs[p.up];
    const d = up.along - p.along;
    if (up.type === "ride" || up.type === "transfer") { if (d < 60 && !this.said.has("n" + p.up)) { this.said.add("n" + p.up); this.speak(up.text(L, true)); } return; }
    const prevAlong = p.up > 0 ? gd.instrs[p.up - 1].along : 0;
    if (d <= 150 && d > 45 && up.along - prevAlong > 130 && !this.said.has("f" + p.up)) { this.said.add("f" + p.up); this.speak(this.speechOf(up, d, L)); }
    else if (d <= 40 && !this.said.has("n" + p.up)) { this.said.add("n" + p.up); this.speak(this.speechOf(up, d, L)); }
  }

  private speechOf(i: { text: (l: Lang, s: boolean) => string }, d: number, L: Lang): string {
    const what = i.text(L, true);
    if (d <= 15) return what;
    const lc = what.charAt(0).toLowerCase() + what.slice(1);
    return L === "zh" ? `${fmtDist(d, L)}后，${what}` : L === "en" ? `In ${fmtDist(d, L)}, ${lc}` : `Через ${fmtDist(d, L)} ${lc}`;
  }

  private speak(text: string, urgent = false) {
    if (this.muted || !text) return;
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      if (urgent) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[this.lang];
      const v = s.getVoices().find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
      if (v) u.voice = v;
      s.speak(u);
    } catch { /* 语音不可用就静默 */ }
  }

  /** 语言切换后刷新界面文字 */
  refresh() {
    if (this.navigating) { this.renderBar(); this.renderBanner(this.lastProg); }
    if (!this.panel.hidden) this.render();
    if (!this.hint.hidden) this.hint.textContent = t(UI.pickStart, this.lang);
  }

  wire() {
    this.panel.addEventListener("click", (e) => this.handlePanelClick(e));
    this.bar.addEventListener("click", (e) => this.handleBarClick(e));
  }
}
