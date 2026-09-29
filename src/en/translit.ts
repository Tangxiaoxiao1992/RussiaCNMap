// 俄文 → 拉丁字母（接近莫斯科路牌/BGN 的常见写法）：Тверская → Tverskaya，Ленинградский → Leningradsky
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ы: "y", э: "e", ю: "yu", я: "ya", ъ: "", ь: "",
};
const VOWELS = new Set([..."аоуыэеёиюяъь"]);

// 形容词词尾（长的在前），只对长度足够的词生效
const ENDINGS: Array<[RegExp, string]> = [
  [/ий$/, "y"], [/ый$/, "y"], [/ой$/, "oy"], [/ая$/, "aya"], [/яя$/, "yaya"],
  [/ое$/, "oye"], [/ее$/, "eye"], [/ые$/, "ye"], [/ие$/, "ie"],
];

function chars(w: string): string {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    if (ch === "е" || ch === "ё") {
      const prev = w[i - 1];
      const ye = prev === undefined || VOWELS.has(prev);
      out += ch === "е" ? (ye ? "ye" : "e") : ye ? "yo" : "yo";
    } else out += ch in MAP ? MAP[ch] : ch;
  }
  return out;
}

export function translitWordEn(word: string): string {
  const w = word.toLowerCase();
  for (const [re, rep] of ENDINGS) {
    const m = w.match(re);
    if (m && m.index !== undefined && m.index > 1) return chars(w.slice(0, m.index)) + rep;
  }
  return chars(w);
}

export const cap = (s: string) => s.replace(/(^|[\s\-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
