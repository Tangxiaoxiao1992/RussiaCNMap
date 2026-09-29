import { cumulative, project } from "./geo.ts";
import type { LngLat } from "./geo.ts";
import type { Path, WalkGraph } from "./graph.ts";
import type { MetroLeg, MetroPlan } from "./metro.ts";
import type { Maneuver, Step } from "./steps.ts";
import { ARROW, stepText, type Lang } from "./i18n.ts";
import type { Station } from "./metro-types.ts";
import { buildSteps } from "./steps.ts";

export interface Instr {
  along: number;
  arrow: string;
  type: Maneuver | "ride" | "transfer";
  text: (lang: Lang, speech: boolean) => string;
}

export interface GuideLeg { kind: "walk" | "ride" | "transfer"; a: number; b: number; t0: number; t1: number }

/** 一条可导航的路线：连续折线 + 沿线的提示点 + 时间映射 */
export interface Guide {
  coords: LngLat[];
  cum: number[];
  total: number;
  totalTime: number;
  instrs: Instr[];
  legs: GuideLeg[];
}

export const stationName = (s: Station, lang: Lang) => (lang === "zh" ? s.zh : lang === "en" ? s.en : s.ru) || s.ru || s.zh || s.en;

const lineName = (l: { ref: string; zh: string; en: string; ru: string }, lang: Lang) => (lang === "zh" ? l.zh : lang === "en" ? l.en : l.ru) || l.ref;

function rideText(leg: Extract<MetroLeg, { kind: "ride" }>, lang: Lang, speech: boolean): string {
  const n = leg.stops.length - 1, from = stationName(leg.from, lang), to = stationName(leg.to, lang), ln = lineName(leg.line, lang);
  void speech;
  if (lang === "zh") return `在${from}站乘地铁${ln}，坐${n}站，在${to}站下车`;
  if (lang === "en") return `Board ${ln} at ${from}, ride ${n} stop${n > 1 ? "s" : ""}, get off at ${to}`;
  return `Сядьте на ${ln} на станции ${from}, проедьте ${n} ост., выйдите на станции ${to}`;
}

function transferText(leg: Extract<MetroLeg, { kind: "transfer" }>, lang: Lang): string {
  const to = stationName(leg.to, lang);
  if (lang === "zh") return `换乘：前往${to}站`;
  if (lang === "en") return `Transfer to ${to}`;
  return `Пересадка: станция ${to}`;
}

export function walkGuide(g: WalkGraph, path: Path): Guide {
  return fromLegs(g, [{ kind: "walk", path, steps: buildSteps(g, path), time: path.time, distance: path.distance }]);
}

export function metroGuide(g: WalkGraph, plan: MetroPlan): Guide {
  return fromLegs(g, plan.legs);
}

function fromLegs(_g: WalkGraph, legs: MetroLeg[]): Guide {
  const coords: LngLat[] = [];
  const starts: number[] = [];
  for (const l of legs) {
    starts.push(coords.length);
    const c = l.kind === "walk" ? l.path.coords : l.coords;
    for (const p of c) coords.push(p);
  }
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] ?? 0;
  const instrs: Instr[] = [];
  const gl: GuideLeg[] = [];
  let tAcc = 0;
  legs.forEach((l, li) => {
    const a = cum[starts[li]];
    const b = li + 1 < legs.length ? cum[starts[li + 1]] : total;
    gl.push({ kind: l.kind, a, b, t0: tAcc, t1: tAcc + l.time });
    tAcc += l.time;
    const last = li === legs.length - 1;
    if (l.kind === "walk") {
      for (const s of l.steps as Step[]) {
        if (s.type === "arrive" && !last) continue;
        const along = s.type === "arrive" ? total : cum[starts[li] + s.at];
        instrs.push({ along, arrow: ARROW[s.type], type: s.type, text: (lang, sp) => stepText(s, lang, sp) });
      }
    } else if (l.kind === "ride") {
      instrs.push({ along: a, arrow: "🚇", type: "ride", text: (lang, sp) => rideText(l, lang, sp) });
    } else {
      instrs.push({ along: a, arrow: "🚶", type: "transfer", text: (lang) => transferText(l, lang) });
    }
  });
  if (!instrs.length || instrs[instrs.length - 1].type !== "arrive") {
    instrs.push({ along: total, arrow: ARROW.arrive, type: "arrive", text: (lang) => stepText({ type: "arrive", at: 0, distance: 0, time: 0, name: null }, lang) });
  }
  instrs.sort((x, y) => x.along - y.along);
  return { coords, cum, total, totalTime: tAcc, instrs, legs: gl };
}

export interface Progress {
  along: number;
  off: number;
  seg: number;
  remaining: number;
  /** 估算剩余秒数；walkFactor 是按实测步速对步行段的修正（1 = 不修正） */
  remainingTime: number;
  cur: number;
  up: number;
}

export function progress(gd: Guide, lon: number, lat: number, lastSeg: number, walkFactor = 1): Progress {
  let p = project(gd.coords, gd.cum, lon, lat, Math.max(0, lastSeg - 3), Math.min(gd.coords.length - 1, lastSeg + 80));
  if (p.d > 40) {
    const full = project(gd.coords, gd.cum, lon, lat);
    if (full.d < p.d) p = full;
  }
  const along = p.along;
  let rem = 0;
  for (const l of gd.legs) {
    const dur = (l.t1 - l.t0) * (l.kind === "ride" ? 1 : walkFactor);
    if (along >= l.b) continue;
    const frac = l.b > l.a ? Math.min(1, Math.max(0, (l.b - Math.max(along, l.a)) / (l.b - l.a))) : 1;
    rem += dur * frac;
  }
  let cur = 0;
  for (let i = 0; i < gd.instrs.length; i++) if (gd.instrs[i].along <= along + 8) cur = i;
  let up = gd.instrs.length - 1;
  for (let i = 0; i < gd.instrs.length; i++) if (gd.instrs[i].along > along + 8) { up = i; break; }
  return { along, off: p.d, seg: p.seg, remaining: Math.max(0, gd.total - along), remainingTime: rem, cur, up };
}
