import { PLACES_EN, STEMS_EN, GENERIC_EN } from "./dict.ts";
import { translitWordEn, cap } from "./translit.ts";

const CYR = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const STEM_KEYS = Object.keys(STEMS_EN).sort((a, b) => b.length - a.length);
const INFLECTION = /^(а|я|у|ю|ы|и|е|ом|ем|ым|ой|ого|ому|ский|ская|ское|ские|ского|ской|ий|ый|ая|яя|ое|ые|ие|ов|ова|ово|ев|ева|ин|ина|ын|ына)?$/;

const ADJ = /^(ский|ская|ское|ские|ий|ый|ой|ая|яя|ое|ые|ие)$/;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function translateWord(raw: string): string {
  const w = norm(raw);
  if (!CYR.test(w)) return raw;
  const ord = w.match(/^(\d+)-(?:й|я|е|ая|ой|ый|ое|го)$/);
  if (ord) return ordinal(Number(ord[1]));
  if (w in PLACES_EN) return PLACES_EN[w];
  for (const k of STEM_KEYS) {
    const rest = w.slice(k.length);
    if (!w.startsWith(k) || !INFLECTION.test(rest)) continue;
    // 形容词形式保留词尾（Leningradsky、Kutuzovsky）；属格（улица Пушкина → Pushkin）丢掉词尾
    return ADJ.test(rest) ? cap(translitWordEn(w)) : STEMS_EN[k];
  }
  if (w.includes("-")) return w.split("-").map(translateWord).join("-");
  return cap(translitWordEn(w));
}

/** 俄文名称 → 英语。已含拉丁字母或没有西里尔字母时返回 undefined（无需翻译）。 */
export function toEn(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const n = name.trim();
  if (!n || !CYR.test(n) || (LATIN.test(n) && !/[Ѐ-ӿ]{2}/.test(n))) return undefined;
  const full = norm(n);
  if (full in PLACES_EN) return PLACES_EN[full];
  const tokens = n.replace(/[«»"“”]/g, "").split(/\s+/);
  const body: string[] = [];
  const generics: string[] = [];
  let title = "";
  for (let i = 0; i < tokens.length; i++) {
    const k = norm(tokens[i]);
    if (k === "академика") { title = "Academician "; continue; }
    if (k === "международный") continue;
    if (k in GENERIC_EN && tokens.length > 1) { generics.push(GENERIC_EN[k]); continue; }
    body.push(translateWord(tokens[i]));
  }
  let out = title + body.join(" ") + (generics.length ? " " + generics.join(" ") : "");
  if (/международный аэропорт/.test(full)) out = out.replace(/ Airport$/, " International Airport");
  return out.trim() || undefined;
}
