// 手工别名：简称/俗称 → 地点。离线搜索时优先命中。category 是 src/services/search.ts 里 KINDS 的编号。
export interface AliasPlace { id: string; zh: string; en: string; ru: string; aliases: string[]; center: [number, number]; category: number }
export const aliasPlaces: AliasPlace[] = [
  { id: "red-square", zh: "红场", en: "Red Square", ru: "Красная площадь", aliases: ["红场", "Красная площадь", "Red Square"], center: [37.6208, 55.7539], category: 4 },
  { id: "kremlin", zh: "莫斯科克里姆林宫", en: "Moscow Kremlin", ru: "Московский Кремль", aliases: ["克里姆林宫", "克宫", "Московский Кремль", "Kremlin"], center: [37.6173, 55.7520], category: 4 },
  { id: "mai", zh: "莫斯科航空学院", en: "Moscow Aviation Institute (MAI)", ru: "Московский авиационный институт", aliases: ["莫航", "莫斯科航空学院", "МАИ", "MAI"], center: [37.5034, 55.8071], category: 10 },
  { id: "mgu", zh: "莫斯科国立大学（主楼）", en: "Moscow State University (MSU)", ru: "МГУ имени М. В. Ломоносова", aliases: ["莫大", "莫斯科大学", "莫斯科国立大学", "МГУ", "MSU", "Lomonosov"], center: [37.5335, 55.7031], category: 10 },
  { id: "bmstu", zh: "鲍曼莫斯科国立技术大学", en: "Bauman Moscow State Technical University", ru: "МГТУ имени Н. Э. Баумана", aliases: ["鲍曼", "鲍曼大学", "МГТУ", "Бауманка", "Bauman", "BMSTU"], center: [37.6849, 55.7662], category: 10 },
  { id: "rudn", zh: "俄罗斯人民友谊大学", en: "RUDN University", ru: "РУДН", aliases: ["友谊大学", "人民友谊大学", "РУДН", "RUDN"], center: [37.5051, 55.6510], category: 10 },
  { id: "svo", zh: "谢列梅捷沃国际机场", en: "Sheremetyevo International Airport", ru: "Международный аэропорт Шереметьево", aliases: ["谢列梅捷沃", "SVO", "Шереметьево", "Sheremetyevo"], center: [37.4146, 55.9726], category: 9 },
  { id: "dme", zh: "多莫杰多沃国际机场", en: "Domodedovo International Airport", ru: "Международный аэропорт Домодедово", aliases: ["多莫杰多沃", "DME", "Домодедово", "Domodedovo"], center: [37.9063, 55.4088], category: 9 },
  { id: "vko", zh: "弗努科沃国际机场", en: "Vnukovo International Airport", ru: "Международный аэропорт Внуково", aliases: ["弗努科沃", "VKO", "Внуково", "Vnukovo"], center: [37.2615, 55.5915], category: 9 },
  { id: "arbat", zh: "阿尔巴特街", en: "Arbat Street", ru: "улица Арбат", aliases: ["阿尔巴特", "老阿尔巴特", "Арбат", "Arbat"], center: [37.5912, 55.7495], category: 5 },
  { id: "vdnkh", zh: "国民经济成就展览馆", en: "VDNKh", ru: "ВДНХ", aliases: ["展览馆", "全俄展览中心", "ВДНХ", "VDNKh"], center: [37.6417, 55.8261], category: 4 },
  { id: "moscow-city", zh: "莫斯科城（国际商务中心）", en: "Moscow International Business Center", ru: "Москва-Сити", aliases: ["莫斯科城", "莫斯科国际商务中心", "Москва-Сити", "Moscow City", "MIBC"], center: [37.5395, 55.7495], category: 4 },
];
