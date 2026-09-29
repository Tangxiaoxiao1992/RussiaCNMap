import { bearing, dist, turnAngle } from "./geo.ts";
import { EdgeFlag } from "./format.ts";
import type { NameRow, Path, WalkGraph } from "./graph.ts";

export type Maneuver =
  | "depart" | "straight" | "slight-left" | "slight-right" | "left" | "right" | "sharp-left" | "sharp-right" | "uturn"
  | "crossing" | "steps" | "underpass" | "arrive";

export interface Step {
  type: Maneuver;
  /** 该步骤起点在路线折线里的下标 */
  at: number;
  /** 这一步走多远（米） */
  distance: number;
  /** 这一步用多久（秒） */
  time: number;
  /** 所在道路名（俄/中/英），无名为 null */
  name: NameRow | null;
}

const segClass = (flag: number) => (flag === EdgeFlag.Crossing ? "crossing" : flag === EdgeFlag.Steps ? "steps" : flag === EdgeFlag.Underpass ? "underpass" : "road");

/** 沿路线在节点 idx 前/后取一个相距至少 minM 米的点，用来算进出方向（避免被很短的边带偏） */
function pointAround(path: Path, g: WalkGraph, idx: number, dir: -1 | 1, minM = 15, maxM = 40): [number, number] {
  const [lon0, lat0] = path.coords[idx];
  let j = idx, acc = 0;
  while (j + dir >= 0 && j + dir < path.coords.length && acc < minM) {
    const [a, b] = path.coords[j], [c, d] = path.coords[j + dir];
    acc += dist(a, b, c, d); j += dir;
    if (acc >= maxM) break;
  }
  return j === idx ? [lon0, lat0] : path.coords[j];
}

export function maneuverFromAngle(delta: number): Maneuver {
  const a = Math.abs(delta);
  if (a < 20) return "straight";
  const right = delta > 0;
  if (a < 55) return right ? "slight-right" : "slight-left";
  if (a < 125) return right ? "right" : "left";
  if (a < 170) return right ? "sharp-right" : "sharp-left";
  return "uturn";
}

/** 把一条步行路径拆成逐段转向指令 */
export function buildSteps(g: WalkGraph, path: Path): Step[] {
  const E = path.edges.length;
  if (E === 0) return [{ type: "arrive", at: 0, distance: 0, time: 0, name: null }];
  const nameOf = (e: number): NameRow | null => { const i = g.d.nameIdx[e]; return i > 0 ? g.names[i] : null; };
  const keyOf = (e: number) => segClass(g.d.flag[e]) + "|" + (segClass(g.d.flag[e]) === "road" ? g.d.nameIdx[e] : 0);

  // 1) 按"道路名/类型"切成段；同名段内遇到明显转弯的路口再切开
  type Seg = { start: number; end: number; key: string };
  const segs: Seg[] = [];
  let cur: Seg = { start: 0, end: 1, key: keyOf(path.edges[0]) };
  for (let k = 1; k < E; k++) {
    const key = keyOf(path.edges[k]);
    let split = key !== cur.key;
    if (!split) {
      const v = path.nodes[k];
      const deg = g.d.off[v + 1] - g.d.off[v];
      if (deg >= 3) {
        const [ax, ay] = pointAround(path, g, k, -1), [px, py] = path.coords[k], [bx, by] = pointAround(path, g, k, 1);
        if (Math.abs(turnAngle(bearing(ax, ay, px, py), bearing(px, py, bx, by))) >= 45) split = true;
      }
    }
    if (split) { cur.end = k; segs.push(cur); cur = { start: k, end: k + 1, key }; } else cur.end = k + 1;
  }
  segs.push(cur);

  // 2) 太短的普通路段（<10 m，比如路口连接线）并入前一段
  const segLen = (s: Seg) => { let L = 0; for (let k = s.start; k < s.end; k++) L += g.d.len[path.edges[k]] / 10; return L; };
  const merged: Seg[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && s.key.startsWith("road|") && segLen(s) < 10 && !(prev.key.startsWith("crossing"))) prev.end = s.end;
    else merged.push({ ...s });
  }

  // 3) 生成步骤
  const steps: Step[] = [];
  merged.forEach((s, i) => {
    const e0 = path.edges[s.start];
    const cls = segClass(g.d.flag[e0]);
    let type: Maneuver;
    if (i === 0) type = cls === "road" ? "depart" : (cls as Maneuver);
    else if (cls !== "road") type = cls as Maneuver;
    else {
      const [ax, ay] = pointAround(path, g, s.start, -1), [px, py] = path.coords[s.start], [bx, by] = pointAround(path, g, s.start, 1);
      type = maneuverFromAngle(turnAngle(bearing(ax, ay, px, py), bearing(px, py, bx, by)));
    }
    let time = 0, distance = 0;
    for (let k = s.start; k < s.end; k++) { time += g.edgeTime(path.edges[k]); distance += g.d.len[path.edges[k]] / 10; }
    steps.push({ type, at: s.start, distance, time, name: nameOf(e0) });
  });

  // 4) 直行且道路名没变的步骤没有信息量，并入上一步
  const out: Step[] = [];
  for (const st of steps) {
    const prev = out[out.length - 1];
    if (prev && st.type === "straight" && (st.name?.[0] ?? "") === (prev.name?.[0] ?? "")) { prev.distance += st.distance; prev.time += st.time; }
    else out.push(st);
  }
  out.push({ type: "arrive", at: path.coords.length - 1, distance: 0, time: 0, name: null });
  return out;
}
