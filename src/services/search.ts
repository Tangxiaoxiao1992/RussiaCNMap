import { aliasPlaces } from "../data/aliases.ts";

/** 每一项：[汉语名, 俄文名, 类别编号, 经度, 纬度, 英文名, 其他叫法（分号分隔）] */
export type IndexEntry = [string, string, number, number, number, string?, string?];

/** 类别：[汉语, English]，编号与 scripts/build-index.mjs 对应 */
export const KINDS: Array<[string, string]> = [
  ["城市", "City"], ["城镇", "Town"], ["村庄", "Village"], ["地铁/火车站", "Metro / rail station"], ["景点", "Landmark"],
  ["道路", "Road"], ["水体", "Water"], ["公园", "Park"], ["地点", "Place"], ["机场", "Airport"], ["大学", "University"],
  ["餐饮/购物", "Food / Shopping"], ["文化/展览", "Arts / Culture"], ["住宿", "Lodging"], ["医疗", "Health"],
];
export const kindLabel = (k: number) => `${KINDS[k]?.[0] ?? KINDS[8][0]} · ${KINDS[k]?.[1] ?? KINDS[8][1]}`;

export type Hit = { zh: string; en: string; ru: string; kind: number; center: [number, number] };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[\s\-·,.'’"«»()]/g, "");
let index: IndexEntry[] = [];
let normed: string[] = [];
let masks: Int32Array = new Int32Array(0);
let loaded: Promise<boolean> | undefined;

/** 字符集合的 32 位签名：查询里有 >k 种字符不在名字里，就不可能在 k 个错别字内匹配 */
function maskOf(s: string): number { let m = 0; for (let i = 0; i < s.length; i++) m |= 1 << (s.charCodeAt(i) % 31); return m; }
function popcount(x: number): number { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

/** 允许的错字数：越长越宽容 */
const tolerance = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

/** 近似子串匹配（Sellers + 相邻字母互换）：t 与 s 的任意子串的最小编辑距离，超过 k 时返回 k+1 */
const A = new Int16Array(64), B = new Int16Array(64), C = new Int16Array(64);
function approx(t: string, s: string, k: number): number {
  const m = Math.min(t.length, 60);
  if (m === 0) return 0;
  if (k === 0) return s.includes(t) ? 0 : 1;
  let prev2 = A, prev = B, cur = C;
  for (let i = 0; i <= m; i++) { prev[i] = i; prev2[i] = i; }
  let best = m;
  for (let j = 0; j < s.length; j++) {
    cur[0] = 0;
    const sc = s.charCodeAt(j);
    let rowMin = 0;
    for (let i = 1; i <= m; i++) {
      const tc = t.charCodeAt(i - 1);
      let v = prev[i - 1] + (tc === sc ? 0 : 1);
      const del = prev[i] + 1; if (del < v) v = del;
      const ins = cur[i - 1] + 1; if (ins < v) v = ins;
      if (i > 1 && j > 0 && tc === s.charCodeAt(j - 1) && t.charCodeAt(i - 2) === sc) { const tr = prev2[i - 2] + 1; if (tr < v) v = tr; }
      cur[i] = v;
      if (i === 1 || v < rowMin) rowMin = v;
    }
    if (cur[m] < best) { best = cur[m]; if (best === 0) return 0; }
    const tmp = prev2; prev2 = prev; prev = cur; cur = tmp;
    void rowMin;
  }
  return best <= k ? best : k + 1;
}

/** 载入一个或多个索引文件（缺失的文件忽略；只要有一个成功就算成功） */
export function loadIndex(urls: string | string[]): Promise<boolean> {
  loaded ??= Promise.all((Array.isArray(urls) ? urls : [urls]).map((u) =>
    fetch(u).then(async (r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? ((await r.json()) as IndexEntry[]) : [])).catch(() => [] as IndexEntry[]),
  )).then((parts) => {
    index = parts.flat();
    normed = index.map((e) => norm(e[0]) + "|" + norm(e[1]) + "|" + norm(e[5] ?? "") + "|" + norm(e[6] ?? ""));
    masks = Int32Array.from(normed, maskOf);
    return index.length > 0;
  });
  return loaded;
}

export function indexSize() { return index.length; }

const KIND_RANK = [0, 1, 3, 1, 1, 4, 3, 2, 5, 0, 1, 3, 2, 4, 4];

export function search(query: string, limit = 25): Hit[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = query.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  const out: Array<{ h: Hit; score: number }> = [];

  // 1) 别名表（常用地标，三语别名）：精确 / 包含 / 模糊
  for (const p of aliasPlaces) {
    const names = [p.zh, p.ru, p.en, ...p.aliases].map(norm);
    const h: Hit = { zh: p.zh, en: p.en, ru: p.ru, kind: p.category, center: p.center };
    if (names.some((n) => n === q)) out.push({ h, score: -2 });
    else if (names.some((n) => n.includes(q))) out.push({ h, score: -1 });
    else if (tokens.length > 1 && names.some((n) => tokens.every((t) => n.includes(t)))) out.push({ h, score: 24 });
    else if (tokens.length === 1 && q.length >= 4 && names.some((n) => approx(q, n, 1) <= 1)) out.push({ h, score: 45 });
  }

  // 2) 精确：整串包含，或多个词各自包含（顺序无关，如 "moscow art" 也能找到 "Art Moscow"）
  const exact = new Set<number>();
  for (let i = 0; i < index.length && exact.size < 4000 && q.length >= (/[一-鿿]/.test(q) ? 1 : 2); i++) {
    const s = normed[i];
    const at = s.indexOf(q);
    let score: number;
    if (at >= 0) {
      const [zh, ru, , , , en = ""] = index[i];
      const names = [norm(zh), norm(ru), norm(en)];
      const base = names.includes(q) ? 0 : names.some((n) => n.startsWith(q)) ? 10 : 20;
      score = base + at / 100;
    } else if (tokens.length > 1 && tokens.every((t) => s.includes(t))) score = 25;
    else continue;
    exact.add(i);
    const [zh, ru, k, lon, lat, en = ""] = index[i];
    out.push({ h: { zh, en, ru, kind: k, center: [lon, lat] }, score: score + (KIND_RANK[k] ?? 5) });
  }

  // 3) 模糊：结果不多时再扫一遍，容忍错别字（如 "tretyakov galery"、"кремль" 拼错）
  if (out.length < 8 && q.length >= 3) {
    const tk = tokens.map((t) => ({ t, k: tolerance(t.length), m: maskOf(t) }));
    const cand: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < index.length; i++) {
      if (exact.has(i)) continue;
      const em = masks[i];
      let ok = true;
      for (const x of tk) if (popcount(x.m & ~em) > x.k) { ok = false; break; }
      if (!ok) continue;
      let total = 0;
      for (const x of tk) { const d = approx(x.t, normed[i], x.k); if (d > x.k) { ok = false; break; } total += d; }
      if (ok) cand.push({ i, d: total });
      if (cand.length > 4000) break;
    }
    for (const { i, d } of cand) {
      const [zh, ru, k, lon, lat, en = ""] = index[i];
      out.push({ h: { zh, en, ru, kind: k, center: [lon, lat] }, score: 40 + d * 4 + (KIND_RANK[k] ?? 5) });
    }
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
