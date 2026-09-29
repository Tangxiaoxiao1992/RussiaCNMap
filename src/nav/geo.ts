export const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** 两点距离（米），小范围内用等距圆柱近似，足够精确且很快 */
export function dist(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const x = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2));
  const y = rad(lat2 - lat1);
  return R * Math.hypot(x, y);
}

/** 从 1 指向 2 的方位角（度，0=北，顺时针） */
export function bearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const x = rad(lon2 - lon1) * Math.cos(rad((lat1 + lat2) / 2));
  const y = rad(lat2 - lat1);
  return (deg(Math.atan2(x, y)) + 360) % 360;
}

/** 方位角之差，范围 (-180, 180]，正数=向右转 */
export function turnAngle(fromBearing: number, toBearing: number): number {
  let d = (toBearing - fromBearing + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

export type LngLat = [number, number];

/** 点到折线的投影：返回最近点、所在线段序号、沿线距离（米）、偏离距离（米） */
export function project(coords: LngLat[], cum: number[], lon: number, lat: number, from = 0, to = coords.length - 1) {
  let best = { d: Infinity, seg: from, t: 0, along: 0, point: coords[from] as LngLat };
  const k = Math.cos(rad(lat));
  for (let i = Math.max(0, from); i < Math.min(to, coords.length - 1); i++) {
    const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
    const vx = (bx - ax) * k, vy = by - ay;
    const wx = (lon - ax) * k, wy = lat - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2));
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    const d = dist(lon, lat, px, py);
    if (d < best.d) best = { d, seg: i, t, along: cum[i] + (cum[i + 1] - cum[i]) * t, point: [px, py] };
  }
  return best;
}

export function cumulative(coords: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
  return cum;
}
