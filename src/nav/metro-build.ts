import { dist } from "./geo.ts";
import { toZh } from "../zh/index.ts";
import { toEn } from "../en/index.ts";
import type { Line, MetroData, Segment, Station } from "./metro-types.ts";

interface OverpassEl {
  type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number;
  tags?: Record<string, string>; members?: Array<{ type: string; ref: number; role: string }>;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/**
 * Overpass 返回的地铁线路关系（route=subway / light_rail）→ 站点 + 线路 + 相邻站区间。
 * 同名且相距 800 m 内的停靠点合并为一个车站（换乘站里不同线的站台会被合到一起）。
 */
export function buildMetro(elements: OverpassEl[]): MetroData {
  const nodes = new Map<number, OverpassEl>();
  for (const e of elements) if (e.type === "node" && e.lat !== undefined && e.lon !== undefined) nodes.set(e.id, e);

  const stations: Station[] = [];
  const members: Array<{ sum: [number, number]; n: number }> = [];
  const byName = new Map<string, number[]>();

  const stationOf = (n: OverpassEl): number | null => {
    const ru = n.tags?.name;
    if (!ru) return null;
    const key = norm(ru);
    for (const id of byName.get(key) ?? []) {
      const s = stations[id];
      if (dist(s.lon, s.lat, n.lon!, n.lat!) <= 800) {
        const m = members[id]; m.sum[0] += n.lon!; m.sum[1] += n.lat!; m.n++;
        s.lon = m.sum[0] / m.n; s.lat = m.sum[1] / m.n;
        return id;
      }
    }
    const id = stations.length;
    const t = n.tags!;
    stations.push({
      id, ru,
      zh: t["name:zh-Hans"] || t["name:zh"] || toZh(ru, { station: true }) || ru,
      en: t["name:en"] || toEn(ru) || ru,
      lon: n.lon!, lat: n.lat!,
    });
    members.push({ sum: [n.lon!, n.lat!], n: 1 });
    byName.set(key, [...(byName.get(key) ?? []), id]);
    return id;
  };

  const lines: Line[] = [];
  const lineIdx = new Map<string, number>();
  const segKeys = new Map<string, Segment>();

  for (const rel of elements) {
    if (rel.type !== "relation" || !rel.members) continue;
    const tags = rel.tags ?? {};
    if (tags.route !== "subway" && tags.route !== "light_rail") continue;
    const stopRole = (r: string) => r.startsWith("stop");
    let stops = rel.members.filter((m) => m.type === "node" && stopRole(m.role));
    if (stops.length < 2) stops = rel.members.filter((m) => m.type === "node" && m.role.startsWith("platform"));
    const ids: number[] = [];
    for (const m of stops) {
      const n = nodes.get(m.ref);
      if (!n) continue;
      const sid = stationOf(n);
      if (sid !== null && ids[ids.length - 1] !== sid) ids.push(sid);
    }
    if (ids.length < 2) continue;

    const ref = tags.ref || tags.name || String(rel.id);
    let li = lineIdx.get(ref);
    if (li === undefined) {
      li = lines.length; lineIdx.set(ref, li);
      const numeric = /^\d+$/.test(ref);
      const ruName = (tags.name || "").replace(/^Метро:?\s*/i, "").replace(/:.*$/, "").trim() || ref;
      lines.push({
        ref, ru: ruName,
        zh: tags["name:zh"] || (numeric ? `${ref}号线` : toZh(ruName) || ruName),
        en: tags["name:en"] || (numeric ? `Line ${ref}` : toEn(ruName) || ruName),
        color: /^#?[0-9a-f]{3,8}$/i.test(tags.colour ?? "") ? "#" + tags.colour!.replace("#", "") : tags.colour || "#888888",
      });
    }
    for (let i = 1; i < ids.length; i++) {
      const a = Math.min(ids[i - 1], ids[i]), b = Math.max(ids[i - 1], ids[i]);
      if (a === b) continue;
      const key = `${li}:${a}-${b}`;
      if (!segKeys.has(key)) segKeys.set(key, [a, b, li, Math.round(dist(stations[a].lon, stations[a].lat, stations[b].lon, stations[b].lat))]);
    }
  }
  // 站点坐标可能在合并过程中移动，区间距离最后统一重算
  const segments = [...segKeys.values()].map(([a, b, l]) => [a, b, l, Math.round(dist(stations[a].lon, stations[a].lat, stations[b].lon, stations[b].lat))] as Segment);
  // 只保留有线路经过的车站，并重排编号
  const used = new Set<number>();
  for (const [a, b] of segments) { used.add(a); used.add(b); }
  const remap = new Map<number, number>();
  const outStations: Station[] = [];
  for (const s of stations) if (used.has(s.id)) { remap.set(s.id, outStations.length); outStations.push({ ...s, id: outStations.length, lon: +s.lon.toFixed(6), lat: +s.lat.toFixed(6) }); }
  return { stations: outStations, lines, segments: segments.map(([a, b, l, d]) => [remap.get(a)!, remap.get(b)!, l, d] as Segment) };
}
