import { PLACES, METRO, STEMS, GENERIC, WORDS } from "./dict.ts";
import { translitWord } from "./translit.ts";

const CYR = /[Ѐ-ӿ]/;
const HAN = /[一-鿿]/;
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const STEM_KEYS = Object.keys(STEMS).sort((a, b) => b.length - a.length);
// 词干之后允许出现的"格尾/形容词尾/姓氏尾"，命中即丢弃（汉语不需要变格）
const INFLECTION = /^(а|я|у|ю|ы|и|е|ом|ем|ым|ой|ого|ому|ский|ская|ское|ские|ского|ской|ий|ый|ая|яя|ое|ые|ие|ов|ова|ово|ев|ева|ин|ина|ын|ына)?$/;
const DIGITS = "零一二三四五六七八九十";

function translateWord(raw: string): string {
  const w = norm(raw);
  if (!CYR.test(w)) return raw; // 数字、拉丁字母保持不变
  const ord = w.match(/^(\d+)-(?:й|я|е|ая|ой|ый|ое|го)$/);
  if (ord) return "第" + (Number(ord[1]) <= 10 ? DIGITS[Number(ord[1])] : ord[1]);
  if (w in WORDS) return WORDS[w];
  if (w in PLACES) return PLACES[w];
  for (const k of STEM_KEYS) {
    if (w.startsWith(k) && INFLECTION.test(w.slice(k.length))) return STEMS[k];
  }
  if (w.includes("-")) return w.split("-").map(translateWord).join("-");
  return translitWord(w);
}

export type Ctx = { station?: boolean };

/** 俄文名称 → 汉语。已有汉字或不含西里尔字母时返回 undefined（无需翻译）。 */
export function toZh(name: string | undefined | null, ctx: Ctx = {}): string | undefined {
  if (!name) return undefined;
  const n = name.trim();
  if (!n || HAN.test(n) || !CYR.test(n)) return undefined;
  const full = norm(n);
  if (ctx.station && full in METRO) return METRO[full];
  if (full in PLACES) return PLACES[full];
  const tokens = n.replace(/[«»"“”]/g, "").split(/\s+/);
  const generics: string[] = [];
  const parts: string[] = [];
  let title = "";
  for (let i = 0; i < tokens.length; i++) {
    const k = norm(tokens[i]);
    if (k === "имени" || k === "им." || k === "им") { // 冠名：后面的人名保留，去掉缩写首字母
      parts.push(...tokens.slice(i + 1).filter((x) => !/^[А-ЯЁ]\.?$/.test(x)).map(translateWord));
      break;
    }
    if (k === "академика") { title = "院士"; continue; }
    if (k in GENERIC && tokens.length > 1) { if (GENERIC[k]) generics.push(GENERIC[k]); continue; }
    parts.push(translateWord(tokens[i]));
  }
  let out = parts.join("") + title + generics.join("");
  if (/международный аэропорт/.test(full)) out = out.replace(/机场$/, "国际机场");
  return out || undefined;
}
