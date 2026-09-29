// 俄文 → 汉字音译（参照新华社《俄语姓名译音表》的常用写法，做机械近似）。
// 仅用于词典里查不到的名称；结果是"音译"，不是官方译名。

// 每个辅音：[а, о, у, э/е, и/ы, 单独出现]
const C: Record<string, string[]> = {
  б: ["巴", "博", "布", "别", "比", "布"],
  в: ["瓦", "沃", "武", "韦", "维", "夫"],
  г: ["加", "戈", "古", "盖", "吉", "格"],
  д: ["达", "多", "杜", "杰", "季", "德"],
  ж: ["扎", "若", "茹", "热", "日", "日"],
  з: ["扎", "佐", "祖", "泽", "济", "兹"],
  к: ["卡", "科", "库", "凯", "基", "克"],
  л: ["拉", "洛", "卢", "列", "利", "尔"],
  м: ["马", "莫", "穆", "梅", "米", "姆"],
  н: ["纳", "诺", "努", "涅", "尼", "恩"],
  п: ["帕", "波", "普", "佩", "皮", "普"],
  р: ["拉", "罗", "鲁", "列", "里", "尔"],
  с: ["萨", "索", "苏", "谢", "西", "斯"],
  т: ["塔", "托", "图", "捷", "季", "特"],
  ф: ["法", "福", "弗", "费", "菲", "夫"],
  х: ["哈", "霍", "胡", "赫", "希", "赫"],
  ц: ["察", "措", "楚", "采", "齐", "茨"],
  ч: ["恰", "乔", "丘", "切", "奇", "奇"],
  ш: ["沙", "绍", "舒", "谢", "希", "什"],
  щ: ["沙", "肖", "修", "谢", "希", "希"],
};
// 不区分软硬的辅音：я/ю/ё 直接用 а/у/о 列
const NO_PALATAL = new Set(["ж", "ш", "щ", "ч", "ц"]);
// 元音单独出现（词首或跟在元音后）
const V0: Record<string, string> = {
  а: "阿", о: "奥", у: "乌", э: "埃", и: "伊", ы: "伊",
  я: "亚", ё: "约", ю: "尤", е: "叶",
};
const VOWEL_COL: Record<string, number> = { а: 0, о: 1, у: 2, э: 3, е: 3, и: 4, ы: 4 };
const PAL_COL: Record<string, [number, string]> = { я: [4, "亚"], ё: [4, "约"], ю: [4, "尤"] };

// 形容词词尾：[正则, 词干补的元音, 尾音]
// 词干+元音一起按辅音-元音音节译，再补尾音，避免词干末辅音被读成"恩/尔"
const ENDINGS: Array<[RegExp, string, string]> = [
  [/ская$/, "", "斯卡娅"], [/цкая$/, "", "茨卡娅"],
  [/ское$/, "", "斯科耶"], [/цкое$/, "", "茨科耶"],
  [/ский$/, "", "斯基"], [/цкий$/, "", "茨基"],
  [/ские$/, "", "斯基"], [/ского$/, "", "斯科戈"], [/ской$/, "", "斯科伊"],
  [/ая$/, "а", "娅"], [/яя$/, "я", "娅"], [/ое$/, "о", "耶"], [/ее$/, "е", "耶"],
  [/ые$/, "и", "耶"], [/ие$/, "и", "耶"], [/ый$/, "и", ""], [/ий$/, "и", ""], [/ой$/, "и", ""],
];

const isVowel = (ch: string) => ch in V0;

function core(w: string): string {
  let out = "";
  const s = [...w];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "ь" || ch === "ъ") continue;
    if (ch === "й") {
      const nx = s[i + 1];
      if (nx && isVowel(nx)) { // йо йа йу …
        out += V0[nx]; i++;
      } else out += "伊";
      continue;
    }
    if (ch in C) {
      if (s[i - 1] === ch) continue; // 双辅音只读一次
      const nx = s[i + 1];
      const row = C[ch];
      if (nx && nx in PAL_COL) {
        const [col, tail] = PAL_COL[nx];
        out += NO_PALATAL.has(ch) ? row[nx === "я" ? 0 : nx === "ю" ? 2 : 1] : row[col] + tail;
        i++;
      } else if (nx && nx in VOWEL_COL) {
        out += row[VOWEL_COL[nx]]; i++;
      } else if (nx === "ь" && s[i + 2] && isVowel(s[i + 2]) ) {
        out += row[4]; // 软音符号 + 元音：取 и 列，元音另读
      } else out += row[5];
      continue;
    }
    if (ch in V0) { out += V0[ch]; continue; }
    out += ch; // 数字、拉丁字母等原样保留
  }
  return out;
}

export function translitWord(word: string): string {
  const w = word.toLowerCase();
  for (const [re, vowel, tail] of ENDINGS) {
    const m = w.match(re);
    if (m && m.index !== undefined && m.index > 1) {
      const stem = w.slice(0, m.index);
      const head = tail.startsWith("斯") || tail.startsWith("茨") ? core(stem) : core(stem + vowel);
      return head + tail;
    }
  }
  return core(w);
}
