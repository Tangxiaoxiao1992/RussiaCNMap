import { dist } from "./geo.ts";
import type { LngLat } from "./geo.ts";
import type { NameRow, Path, WalkGraph } from "./graph.ts";
import { buildSteps, type Step } from "./steps.ts";
import type { Line, MetroData, Station } from "./metro-types.ts";

/** 时间估算参数（秒/米每秒）。都是经验值，界面上会标明"预估" */
export const METRO = {
  rideSpeed: 13,      // 列车运行平均速度（含加减速），约 47 km/h
  dwell: 25,          // 每个中间站停靠
  board: 210,         // 进站（过安检、走到站台）+ 平均候车
  transferSame: 240,  // 同站换乘：站内步行 + 候车
  transferWalk: 1.2,  // 站外换乘步行速度
  transferWait: 210,  // 站外换乘的候车和进站
  nearTransferM: 350, // 相距不超过这个距离的两个站视为可换乘
  accessMax: 1800,    // 起终点走到车站的最长步行时间（秒）
};

export type MetroLeg =
  | { kind: "walk"; path: Path; steps: Step[]; time: number; distance: number }
  | { kind: "ride"; line: Line; from: Station; to: Station; stops: Station[]; time: number; distance: number; coords: LngLat[] }
  | { kind: "transfer"; from: Station; to: Station; time: number; distance: number; coords: LngLat[] };

export interface MetroPlan {
  legs: MetroLeg[];
  /** 全程总时间（秒） */
  time: number;
  /** 步行总长度（米）与乘车总长度（米） */
  walkDistance: number;
  rideDistance: number;
  walkTime: number;
  rideTime: number;
  stopsCount: number;
  transfers: number;
}

interface Edge { to: number; time: number; dist: number; kind: "ride" | "transfer" }

export class Metro {
  data: MetroData;
  private nodeOf = new Map<string, number>();
  private nodeStation: number[] = [];
  private nodeLine: number[] = [];
  private adj: Edge[][] = [];
  private stationNodes: number[][] = [];
  private stationWalkNode = new Map<WalkGraph, Int32Array>();

  constructor(data: MetroData) {
    this.data = data;
    const node = (s: number, l: number) => {
      const k = s + "|" + l;
      let id = this.nodeOf.get(k);
      if (id === undefined) {
        id = this.nodeStation.length; this.nodeOf.set(k, id);
        this.nodeStation.push(s); this.nodeLine.push(l); this.adj.push([]);
        (this.stationNodes[s] ??= []).push(id);
      }
      return id;
    };
    for (const [a, b, l, d] of data.segments) {
      const na = node(a, l), nb = node(b, l);
      const t = d / METRO.rideSpeed + METRO.dwell;
      this.adj[na].push({ to: nb, time: t, dist: d, kind: "ride" });
      this.adj[nb].push({ to: na, time: t, dist: d, kind: "ride" });
    }
    // 换乘：同站不同线；相距很近的不同站
    const S = data.stations;
    for (let s = 0; s < S.length; s++) {
      const ns = this.stationNodes[s] ?? [];
      for (const x of ns) for (const y of ns) if (x !== y) this.adj[x].push({ to: y, time: METRO.transferSame, dist: 0, kind: "transfer" });
      for (let o = s + 1; o < S.length; o++) {
        const d = dist(S[s].lon, S[s].lat, S[o].lon, S[o].lat);
        if (d > METRO.nearTransferM) continue;
        const no = this.stationNodes[o] ?? [];
        const t = d / METRO.transferWalk + METRO.transferWait;
        for (const x of ns) for (const y of no) { this.adj[x].push({ to: y, time: t, dist: d, kind: "transfer" }); this.adj[y].push({ to: x, time: t, dist: d, kind: "transfer" }); }
      }
    }
  }

  private walkNodes(g: WalkGraph): Int32Array {
    let m = this.stationWalkNode.get(g);
    if (!m) {
      m = new Int32Array(this.data.stations.length);
      this.data.stations.forEach((s, i) => { m![i] = g.nearest(s.lon, s.lat, 300); });
      this.stationWalkNode.set(g, m);
    }
    return m;
  }

  /** 步行 → 地铁（可换乘）→ 步行。找不到合理方案返回 null。 */
  plan(g: WalkGraph, from: LngLat, to: LngLat): MetroPlan | null {
    const src = g.nearest(from[0], from[1], 500), dst = g.nearest(to[0], to[1], 500);
    if (src < 0 || dst < 0) return null;
    const wn = this.walkNodes(g);
    const treeA = g.tree(src, METRO.accessMax), treeB = g.tree(dst, METRO.accessMax);
    const N = this.nodeStation.length;
    const best = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const prevEdge: Array<Edge | null> = new Array(N).fill(null);
    const done = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const w = wn[this.nodeStation[i]];
      if (w >= 0 && treeA.has(w)) best[i] = (treeA.cost.get(w) as number) + METRO.board;
    }
    for (;;) {
      let u = -1, bu = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && best[i] < bu) { bu = best[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const e of this.adj[u]) {
        const nt = bu + e.time;
        if (nt < best[e.to]) { best[e.to] = nt; prev[e.to] = u; prevEdge[e.to] = e; }
      }
    }
    let endNode = -1, endTotal = Infinity;
    for (let i = 0; i < N; i++) {
      const w = wn[this.nodeStation[i]];
      if (prev[i] === -1 || !isFinite(best[i]) || w < 0 || !treeB.has(w)) continue; // prev=-1：没坐过车，不算地铁方案
      const total = best[i] + (treeB.cost.get(w) as number);
      if (total < endTotal) { endTotal = total; endNode = i; }
    }
    if (endNode < 0) return null;

    // 回溯
    const chain: number[] = [];
    for (let n = endNode; n !== -1; n = prev[n]) chain.push(n);
    chain.reverse();
    const S = this.data.stations;
    const legs: MetroLeg[] = [];
    const accessPath = treeA.pathTo(wn[this.nodeStation[chain[0]]]);
    if (accessPath.distance > 1) legs.push({ kind: "walk", path: accessPath, steps: buildSteps(g, accessPath), time: accessPath.time, distance: accessPath.distance });

    let i = 0;
    let first = true;
    while (i < chain.length) {
      const line = this.nodeLine[chain[i]];
      let j = i;
      while (j + 1 < chain.length && this.nodeLine[chain[j + 1]] === line && prevEdge[chain[j + 1]]!.kind === "ride") j++;
      if (j > i) {
        const stops = chain.slice(i, j + 1).map((n) => S[this.nodeStation[n]]);
        let d = 0, t = 0;
        for (let k = i + 1; k <= j; k++) { const e = prevEdge[chain[k]]!; d += e.dist; t += e.time; }
        legs.push({
          kind: "ride", line: this.data.lines[line], from: stops[0], to: stops[stops.length - 1], stops,
          time: t + (first ? METRO.board : 0), distance: d, coords: stops.map((s) => [s.lon, s.lat] as LngLat),
        });
        first = false;
      }
      if (j + 1 < chain.length) {
        const e = prevEdge[chain[j + 1]]!;
        const a = S[this.nodeStation[chain[j]]], b = S[this.nodeStation[chain[j + 1]]];
        legs.push({ kind: "transfer", from: a, to: b, time: e.time, distance: e.dist, coords: [[a.lon, a.lat], [b.lon, b.lat]] });
        i = j + 1;
      } else i = j + 1;
    }
    const forward = g.route(wn[this.nodeStation[endNode]], dst);
    if (!forward) return null;
    if (forward.distance > 1) legs.push({ kind: "walk", path: forward, steps: buildSteps(g, forward), time: forward.time, distance: forward.distance });

    let walkDistance = 0, rideDistance = 0, walkTime = 0, rideTime = 0, stopsCount = 0, transfers = 0;
    for (const l of legs) {
      if (l.kind === "walk") { walkDistance += l.distance; walkTime += l.time; }
      else if (l.kind === "ride") { rideDistance += l.distance; rideTime += l.time; stopsCount += l.stops.length - 1; }
      else { walkDistance += l.distance; rideTime += l.time; transfers++; }
    }
    const time = legs.reduce((s, l) => s + l.time, 0);
    return { legs, time, walkDistance, rideDistance, walkTime, rideTime, stopsCount, transfers };
  }
}

export type { NameRow };
