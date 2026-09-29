// 汉语 / 英语地名规则的回归测试：npm run test:names
import { toZh } from "../src/zh/index.ts";
import { toEn } from "../src/en/index.ts";
const cases = [
  ["Красная площадь", "红场"], ["улица Пушкина", "普希金街"], ["Ленинградский проспект", "列宁格勒大街"],
  ["Тверская улица", "特维尔街"], ["Кутузовский проспект", "库图佐夫大街"], ["Проспект Вернадского", "韦尔纳茨基大街"],
  ["Ярославское шоссе", "雅罗斯拉夫尔公路"], ["Парк Победы", "胜利公园"], ["Щёлковское шоссе", "谢尔科沃公路"],
  ["Международный аэропорт Шереметьево", "谢列梅捷沃国际机场"], ["Улица Академика Королёва", "科罗廖夫院士街"],
  ["Москва", "莫斯科"], ["Химки", "希姆基"], ["Воробьёвы горы", "麻雀山"], ["улица Арбат", "阿尔巴特街"],
  ["Песчаная улица", "佩斯恰纳娅街"], ["Большой Козловский переулок", "大科兹洛夫斯基胡同"],
  ["МГТУ им. Н. Э. Баумана", "鲍曼莫斯科国立技术大学"],
];
const station = [["Сокол", "索科尔"], ["Тверская", "特维尔站"], ["Парк культуры", "文化公园站"], ["Китай-город", "中国城"]];
let bad = 0;
const check = (input, want, ctx) => { const got = toZh(input, ctx); if (got !== want) { bad++; console.error(`✗ ${input} → ${got}（期望 ${want}）`); } };
for (const [i, w] of cases) check(i, w, {});
for (const [i, w] of station) check(i, w, { station: true });
for (const s of ["红场", "Starbucks", "", "123"]) if (toZh(s) !== undefined) { bad++; console.error(`✗ ${s} 应返回 undefined`); }
const en = [
  ["Красная площадь", "Red Square"], ["улица Пушкина", "Pushkin Street"], ["Ленинградский проспект", "Leningradsky Prospekt"],
  ["Тверская улица", "Tverskaya Street"], ["Кутузовский проспект", "Kutuzovsky Prospekt"], ["Проспект Вернадского", "Vernadsky Prospekt"],
  ["Ярославское шоссе", "Yaroslavskoye Highway"], ["Парк Победы", "Victory Park"], ["Москва", "Moscow"], ["Химки", "Khimki"],
  ["Международный аэропорт Шереметьево", "Sheremetyevo International Airport"], ["1-я Тверская-Ямская улица", "1st Tverskaya-Yamskaya Street"],
  ["Большой Козловский переулок", "Bolshoy Kozlovsky Lane"], ["Песчаная улица", "Peschanaya Street"], ["Воробьёвы горы", "Sparrow Hills"],
  ["Московский авиационный институт", "Moscow Aviation Institute"], ["Китай-город", "Kitay-gorod"], ["Мытищи", "Mytishchi"],
];
for (const [i, w] of en) { const got = toEn(i); if (got !== w) { bad++; console.error(`✗ EN ${i} → ${got}（期望 ${w}）`); } }
for (const s of ["Starbucks", "红场", "", "123"]) if (toEn(s) !== undefined) { bad++; console.error(`✗ EN ${s} 应返回 undefined`); }
if (bad) process.exit(1);
console.log(`地名规则：汉语 ${cases.length + station.length + 4} 项、英语 ${en.length + 4} 项通过`);
