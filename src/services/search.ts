import { aliasPlaces } from "../data/aliases";

/** places-index.json 每一项：[汉语名, 俄文名, 类别编号, 经度, 纬度, 英文名] */
export type IndexEntry = [string, string, number, number, number, string?];

/** 类别：[汉语, English]，编号与 scripts/build-index.mjs 对应 */
export const KINDS: Array<[string, string]> = [
  ["城市", "City"], ["城镇", "Town"], ["村庄", "Village"], ["地铁/火车站", "Metro / rail station"], ["景点", "Landmark"],
  ["道路", "Road"], ["水体", "Water"], ["公园", "Park"], ["地点", "Place"], ["机场", "Airport"], ["大学", "University"],
];
export const kindLabel = (k: number) => `${KINDS[k]?.[0] ?? KINDS[8][0]} · ${KINDS[k]?.[1] ?? KINDS[8][1]}`;

export type Hit = { zh: string; en: string; ru: string; kind: number; center: [number, number] };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s\-·,.'’]/g, "");
let index: IndexEntry[] = [];
let normed: string[] = [];
let loaded: Promise<boolean> | undefined;

export function loadIndex(url: string): Promise<boolean> {
  loaded ??= fetch(url).then(async (r) => {
    if (!r.ok) return false;
    index = (await r.json()) as IndexEntry[];
    normed = index.map((e) => norm(e[0]) + "|" + norm(e[1]) + "|" + norm(e[5] ?? ""));
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
    const names = [p.zh, p.ru, p.en, ...p.aliases].map(norm);
    const h: Hit = { zh: p.zh, en: p.en, ru: p.ru, kind: p.category, center: p.center };
    if (names.some((n) => n === q)) out.push({ h, score: -2 });
    else if (names.some((n) => n.includes(q))) out.push({ h, score: -1 });
  }
  for (let i = 0; i < index.length; i++) {
    const s = normed[i];
    const at = s.indexOf(q);
    if (at < 0) continue;
    const [zh, ru, k, lon, lat, en = ""] = index[i];
    const names = [norm(zh), norm(ru), norm(en)];
    // 整名相同 < 名字开头 < 包含；城市/车站/景点排在道路和小地点前
    const base = names.includes(q) ? 0 : names.some((n) => n.startsWith(q)) ? 10 : 20;
    const kindRank = [0, 1, 3, 1, 1, 4, 3, 2, 5, 0, 1][k] ?? 5;
    out.push({ h: { zh, en, ru, kind: k, center: [lon, lat] }, score: base + kindRank + at / 100 });
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
