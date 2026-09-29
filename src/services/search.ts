import { aliasPlaces } from "../data/aliases";

/** places-index.json 里每一项：[汉语名, 俄文名, 类别编号, 经度, 纬度] */
export type IndexEntry = [string, string, number, number, number];
export const KINDS = ["城市", "城镇", "村庄", "地铁/火车站", "景点", "道路", "水体", "公园", "地点", "机场", "大学"];

export type Hit = { zh: string; ru: string; kind: string; center: [number, number] };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s\-·,.]/g, "");
let index: IndexEntry[] = [];
let normed: string[] = [];
let loaded: Promise<boolean> | undefined;

export function loadIndex(url: string): Promise<boolean> {
  loaded ??= fetch(url).then(async (r) => {
    if (!r.ok) return false;
    index = (await r.json()) as IndexEntry[];
    normed = index.map((e) => norm(e[0]) + "|" + norm(e[1]));
    return true;
  }).catch(() => false);
  return loaded;
}

export function indexSize() { return index.length; }

export function search(query: string, limit = 25): Hit[] {
  const q = norm(query);
  if (!q) return [];
  const out: Array<{ h: Hit; score: number }> = [];
  for (const p of aliasPlaces) {
    const names = [p.zh, p.ru, p.en ?? "", ...p.aliases].map(norm);
    if (names.some((n) => n === q)) out.push({ h: { zh: p.zh, ru: p.ru, kind: p.category, center: p.center }, score: -2 });
    else if (names.some((n) => n.includes(q))) out.push({ h: { zh: p.zh, ru: p.ru, kind: p.category, center: p.center }, score: -1 });
  }
  for (let i = 0; i < index.length; i++) {
    const s = normed[i];
    const at = s.indexOf(q);
    if (at < 0) continue;
    const [zh, ru, k, lon, lat] = index[i];
    const zhN = norm(zh), ruN = norm(ru);
    // 整名相同 < 名字开头 < 包含；城市/车站/景点排在道路和小地点前
    const base = zhN === q || ruN === q ? 0 : zhN.startsWith(q) || ruN.startsWith(q) ? 10 : 20;
    const kindRank = [0, 1, 3, 1, 1, 4, 3, 2, 5, 0, 1][k] ?? 5;
    out.push({ h: { zh, ru, kind: KINDS[k] ?? "地点", center: [lon, lat] }, score: base + kindRank + at / 100 });
  }
  out.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const res: Hit[] = [];
  for (const { h } of out) {
    const key = h.zh + h.ru + h.center[0].toFixed(2) + h.center[1].toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key); res.push(h);
    if (res.length >= limit) break;
  }
  return res;
}
