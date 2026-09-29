// 手工别名：汉语里的简称/俗称 → 地点。离线搜索时优先命中。
export interface AliasPlace { id: string; zh: string; ru: string; en?: string; aliases: string[]; center: [number, number]; category: string }
export const aliasPlaces: AliasPlace[] = [
  { id: "red-square", zh: "红场", ru: "Красная площадь", en: "Red Square", aliases: ["红场", "Красная площадь", "Red Square"], center: [37.6208, 55.7539], category: "景点" },
  { id: "kremlin", zh: "莫斯科克里姆林宫", ru: "Московский Кремль", en: "Moscow Kremlin", aliases: ["克里姆林宫", "克宫", "Московский Кремль", "Moscow Kremlin"], center: [37.6173, 55.7520], category: "景点" },
  { id: "mai", zh: "莫斯科航空学院", ru: "Московский авиационный институт", en: "Moscow Aviation Institute", aliases: ["莫航", "莫斯科航空学院", "МАИ", "MAI"], center: [37.5034, 55.8071], category: "大学" },
  { id: "mgu", zh: "莫斯科国立大学（主楼）", ru: "МГУ имени М. В. Ломоносова", en: "Moscow State University", aliases: ["莫大", "莫斯科大学", "莫斯科国立大学", "МГУ", "MSU"], center: [37.5335, 55.7031], category: "大学" },
  { id: "bmstu", zh: "鲍曼莫斯科国立技术大学", ru: "МГТУ имени Н. Э. Баумана", aliases: ["鲍曼", "鲍曼大学", "МГТУ", "Бауманка", "Bauman"], center: [37.6849, 55.7662], category: "大学" },
  { id: "rudn", zh: "俄罗斯人民友谊大学", ru: "РУДН", aliases: ["友谊大学", "人民友谊大学", "РУДН", "RUDN"], center: [37.5051, 55.6510], category: "大学" },
  { id: "svo", zh: "谢列梅捷沃国际机场", ru: "Международный аэропорт Шереметьево", en: "Sheremetyevo", aliases: ["谢列梅捷沃", "SVO", "Шереметьево", "Sheremetyevo"], center: [37.4146, 55.9726], category: "机场" },
  { id: "dme", zh: "多莫杰多沃国际机场", ru: "Международный аэропорт Домодедово", en: "Domodedovo", aliases: ["多莫杰多沃", "DME", "Домодедово"], center: [37.9063, 55.4088], category: "机场" },
  { id: "vko", zh: "弗努科沃国际机场", ru: "Международный аэропорт Внуково", en: "Vnukovo", aliases: ["弗努科沃", "VKO", "Внуково"], center: [37.2615, 55.5915], category: "机场" },
  { id: "arbat", zh: "阿尔巴特街", ru: "улица Арбат", aliases: ["阿尔巴特", "老阿尔巴特", "Арбат", "Arbat"], center: [37.5912, 55.7495], category: "街道" },
  { id: "vdnkh", zh: "国民经济成就展览馆", ru: "ВДНХ", aliases: ["展览馆", "全俄展览中心", "ВДНХ", "VDNKh"], center: [37.6417, 55.8261], category: "景点" },
  { id: "moscow-city", zh: "莫斯科城（国际商务中心）", ru: "Москва-Сити", aliases: ["莫斯科城", "莫斯科国际商务中心", "Москва-Сити"], center: [37.5395, 55.7495], category: "景点" },
];
