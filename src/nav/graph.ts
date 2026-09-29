import { dist } from "./geo.ts";
import { PENALTY, SPEED, type WalkData } from "./format.ts";
import type { LngLat } from "./geo.ts";

export type NameRow = [ru: string, zh: string, en: string];

export interface Path {
  nodes: number[];
  edges: number[];
  coords: LngLat[];
  /** 步行时间（秒），不含代价倍率 */
  time: number;
  /** 长度（米） */
  distance: number;
  /** 搜索用的代价 */
  cost: number;
}

/** 二叉小顶堆（键 Float64，值 Int32），允许重复入堆（惰性删除） */
class Heap {
  private k = new Float64Array(1024);
  private v = new Int32Array(1024);
  size = 0;
  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const nk = new Float64Array(this.size * 2); nk.set(this.k); this.k = nk;
      const nv = new Int32Array(this.size * 2); nv.set(this.v); this.v = nv;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop(): number {
    const top = this.v[0];
    const key = this.k[--this.size], val = this.v[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  }
}

export interface Tree {
  cost: Map<number, number>;
  has(node: number): boolean;
  pathTo(node: number): Path;
}

const CELL_LON = 0.004, CELL_LAT = 0.0025; // 约 250 m

export class WalkGraph {
  private g: Float64Array;
  private parent: Int32Array;
  private parentEdge: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 0;
  private gridStart!: Int32Array;
  private gridNodes!: Int32Array;
  private gx0 = 0; private gy0 = 0; private gw = 0; private gh = 0;

  d: WalkData;
  names: NameRow[];

  constructor(d: WalkData, names: NameRow[]) {
    this.d = d;
    this.names = names;
    this.g = new Float64Array(d.n);
    this.parent = new Int32Array(d.n);
    this.parentEdge = new Int32Array(d.n);
    this.stamp = new Uint32Array(d.n);
    this.closed = new Uint32Array(d.n);
    this.buildGrid();
  }

  lon(i: number) { return this.d.coords[2 * i] / 1e6; }
  lat(i: number) { return this.d.coords[2 * i + 1] / 1e6; }

  private buildGrid() {
    const { n, coords } = this.d;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = coords[2 * i] / 1e6, y = coords[2 * i + 1] / 1e6;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    this.gx0 = Math.floor(minX / CELL_LON); this.gy0 = Math.floor(minY / CELL_LAT);
    this.gw = Math.floor(maxX / CELL_LON) - this.gx0 + 1; this.gh = Math.floor(maxY / CELL_LAT) - this.gy0 + 1;
    const cells = this.gw * this.gh;
    const start = new Int32Array(cells + 1);
    const cellOf = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const c = (Math.floor(coords[2 * i + 1] / 1e6 / CELL_LAT) - this.gy0) * this.gw + (Math.floor(coords[2 * i] / 1e6 / CELL_LON) - this.gx0);
      cellOf[i] = c; start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cells);
    const nodes = new Int32Array(n);
    for (let i = 0; i < n; i++) nodes[fill[cellOf[i]]++] = i;
    this.gridStart = start; this.gridNodes = nodes;
  }

  /** 离给定坐标最近的路网节点；maxM 米内没有则返回 -1 */
  nearest(lon: number, lat: number, maxM = 500): number {
    const cx = Math.floor(lon / CELL_LON) - this.gx0, cy = Math.floor(lat / CELL_LAT) - this.gy0;
    let best = -1, bestD = Infinity;
    const rings = Math.ceil(maxM / 120) + 1;
    for (let r = 0; r <= rings; r++) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) continue;
        const c = y * this.gw + x;
        for (let p = this.gridStart[c]; p < this.gridStart[c + 1]; p++) {
          const i = this.gridNodes[p];
          const d = dist(lon, lat, this.lon(i), this.lat(i));
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0 && bestD <= r * 100) break; // 更大的圈不可能更近
    }
    return bestD <= maxM ? best : -1;
  }

  edgeTime(e: number) { return this.d.len[e] / 10 / SPEED[this.d.flag[e]]; }
  edgeCost(e: number) { return this.edgeTime(e) * PENALTY[this.d.flag[e]]; }

  private search(src: number, dst: number, maxCost: number): { visited: number[]; found: boolean } {
    const { off, to } = this.d;
    const gen = ++this.gen;
    const heap = new Heap();
    const visited: number[] = [];
    this.g[src] = 0; this.parent[src] = -1; this.parentEdge[src] = -1; this.stamp[src] = gen;
    const dlon = dst >= 0 ? this.lon(dst) : 0, dlat = dst >= 0 ? this.lat(dst) : 0;
    const h = (i: number) => (dst >= 0 ? dist(this.lon(i), this.lat(i), dlon, dlat) / 1.3 : 0);
    heap.push(h(src), src);
    while (heap.size) {
      const u = heap.pop();
      if (this.closed[u] === gen) continue;
      this.closed[u] = gen;
      visited.push(u);
      if (u === dst) return { visited, found: true };
      const gu = this.g[u];
      if (gu > maxCost) continue;
      for (let e = off[u]; e < off[u + 1]; e++) {
        const v = to[e];
        if (this.closed[v] === gen) continue;
        const ng = gu + this.edgeCost(e);
        if (this.stamp[v] !== gen || ng < this.g[v]) {
          this.stamp[v] = gen; this.g[v] = ng; this.parent[v] = u; this.parentEdge[v] = e;
          heap.push(ng + h(v), v);
        }
      }
    }
    return { visited, found: dst < 0 };
  }

  private extract(end: number, parent: (n: number) => number, parentEdge: (n: number) => number): Path {
    const nodes: number[] = [], edges: number[] = [];
    for (let n = end; n !== -1; n = parent(n)) { nodes.push(n); const e = parentEdge(n); if (e >= 0) edges.push(e); }
    nodes.reverse(); edges.reverse();
    let time = 0, distance = 0, cost = 0;
    for (const e of edges) { time += this.edgeTime(e); distance += this.d.len[e] / 10; cost += this.edgeCost(e); }
    return { nodes, edges, coords: nodes.map((n) => [this.lon(n), this.lat(n)] as LngLat), time, distance, cost };
  }

  /** 单对节点的最短路（A*）。找不到返回 null。 */
  route(src: number, dst: number): Path | null {
    if (src === dst) return this.extract(src, () => -1, () => -1);
    const r = this.search(src, dst, Infinity);
    if (!r.found) return null;
    return this.extract(dst, (n) => this.parent[n], (n) => this.parentEdge[n]);
  }

  /** 从 src 出发、代价不超过 maxCost 的所有节点（Dijkstra）。 */
  tree(src: number, maxCost: number): Tree {
    const { visited } = this.search(src, -1, maxCost);
    const cost = new Map<number, number>();
    const par = new Map<number, number>();
    const parE = new Map<number, number>();
    for (const n of visited) {
      if (this.g[n] > maxCost + 1e-6) continue;
      cost.set(n, this.g[n]); par.set(n, this.parent[n]); parE.set(n, this.parentEdge[n]);
    }
    return {
      cost,
      has: (n) => cost.has(n),
      pathTo: (n) => this.extract(n, (x) => par.get(x) ?? -1, (x) => parE.get(x) ?? -1),
    };
  }
}
