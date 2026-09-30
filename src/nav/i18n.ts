import type { NameRow } from "./graph.ts";
import type { Maneuver, Step } from "./steps.ts";

export type Lang = "zh" | "en" | "ru";
export const SPEECH_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en-US", ru: "ru-RU" };

const pick = <T,>(lang: Lang, zh: T, en: T, ru: T) => (lang === "zh" ? zh : lang === "en" ? en : ru);

export function fmtDist(m: number, lang: Lang): string {
  if (m < 1000) { const v = m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10; return pick(lang, `${v}米`, `${v} m`, `${v} м`); }
  const km = (m / 1000).toFixed(m < 10000 ? 1 : 0);
  return pick(lang, `${km}公里`, `${km} km`, `${km.replace(".", ",")} км`);
}

export function fmtTime(sec: number, lang: Lang): string {
  const mins = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return pick(lang, `${m}分钟`, `${m} min`, `${m} мин`);
  return pick(lang, `${h}小时${m ? m + "分" : ""}`, `${h} h${m ? " " + m + " min" : ""}`, `${h} ч${m ? " " + m + " мин" : ""}`);
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 道路名：界面显示时附上俄文原名（对照路牌），语音里不带（中文/英文语音读不了西里尔字母） */
export function nameText(n: NameRow | null, lang: Lang, speech = false): string {
  if (!n) return "";
  const [ru, zh, en] = n;
  if (lang === "ru") return ru;
  const local = lang === "zh" ? zh : en;
  return speech || !ru || local === ru ? local : `${local}（${ru}）`;
}

export const ARROW: Record<Maneuver, string> = {
  depart: "↑", straight: "↑", "slight-left": "↖", left: "←", "sharp-left": "↙", "slight-right": "↗", right: "→", "sharp-right": "↘",
  uturn: "↶", crossing: "⇅", steps: "⇅", underpass: "⇣", arrive: "⚑",
};

const T: Record<Lang, Record<Maneuver, (n: string) => string>> = {
  zh: {
    depart: (n) => (n ? `沿${n}前进` : "出发"), straight: (n) => (n ? `继续直行，进入${n}` : "继续直行"),
    left: (n) => `左转${n ? "，进入" + n : ""}`, right: (n) => `右转${n ? "，进入" + n : ""}`,
    "slight-left": (n) => `向左前方转${n ? "，进入" + n : ""}`, "slight-right": (n) => `向右前方转${n ? "，进入" + n : ""}`,
    "sharp-left": (n) => `向左后方转${n ? "，进入" + n : ""}`, "sharp-right": (n) => `向右后方转${n ? "，进入" + n : ""}`,
    uturn: () => "掉头", crossing: () => "过马路", steps: () => "走台阶", underpass: () => "走地下通道", arrive: () => "到达目的地",
  },
  en: {
    depart: (n) => (n ? `Head along ${n}` : "Start walking"), straight: (n) => (n ? `Continue onto ${n}` : "Continue straight"),
    left: (n) => `Turn left${n ? " onto " + n : ""}`, right: (n) => `Turn right${n ? " onto " + n : ""}`,
    "slight-left": (n) => `Bear left${n ? " onto " + n : ""}`, "slight-right": (n) => `Bear right${n ? " onto " + n : ""}`,
    "sharp-left": (n) => `Turn sharp left${n ? " onto " + n : ""}`, "sharp-right": (n) => `Turn sharp right${n ? " onto " + n : ""}`,
    uturn: () => "Make a U-turn", crossing: () => "Cross the street", steps: () => "Take the stairs", underpass: () => "Use the underpass", arrive: () => "You have arrived",
  },
  ru: {
    depart: (n) => (n ? `Идите по ${n}` : "Начните движение"), straight: (n) => (n ? `Продолжайте движение по ${n}` : "Продолжайте прямо"),
    left: (n) => `Поверните налево${n ? " на " + n : ""}`, right: (n) => `Поверните направо${n ? " на " + n : ""}`,
    "slight-left": (n) => `Возьмите левее${n ? " на " + n : ""}`, "slight-right": (n) => `Возьмите правее${n ? " на " + n : ""}`,
    "sharp-left": (n) => `Резко налево${n ? " на " + n : ""}`, "sharp-right": (n) => `Резко направо${n ? " на " + n : ""}`,
    uturn: () => "Развернитесь", crossing: () => "Перейдите дорогу", steps: () => "Пройдите по лестнице", underpass: () => "Пройдите по подземному переходу", arrive: () => "Вы прибыли",
  },
};

export function stepText(step: Step, lang: Lang, speech = false): string {
  return T[lang][step.type](nameText(step.name, lang, speech));
}

/** 语音：距离提示 + 动作，例如"80米后右转，进入特维尔街" */
export function speechFor(step: Step, distance: number, lang: Lang): string {
  const what = stepText(step, lang, true);
  if (step.type === "arrive" || distance <= 15) return what;
  return pick(lang, `${fmtDist(distance, lang)}后，${what}`, `In ${fmtDist(distance, lang)}, ${what.charAt(0).toLowerCase()}${what.slice(1)}`, `Через ${fmtDist(distance, lang)} ${what.charAt(0).toLowerCase()}${what.slice(1)}`);
}

export const UI = {
  directions: { zh: "路线", en: "Directions", ru: "Маршрут" },
  walk: { zh: "步行", en: "Walk", ru: "Пешком" },
  metro: { zh: "地铁", en: "Metro", ru: "Метро" },
  start: { zh: "开始导航", en: "Start", ru: "Начать" },
  end: { zh: "结束", en: "End", ru: "Завершить" },
  next: { zh: "下一步", en: "Next", ru: "Далее" },
  eta: { zh: "预计到达", en: "Arrive", ru: "Прибытие" },
  estimate: { zh: "时间为估算", en: "Times are estimates", ru: "Время приблизительное" },
  from: { zh: "起点", en: "From", ru: "Откуда" },
  myPos: { zh: "我的位置", en: "My location", ru: "Моё местоположение" },
  pickStart: { zh: "点击地图选择起点", en: "Tap the map to set the start", ru: "Нажмите на карту, чтобы выбрать старт" },
  changeStart: { zh: "改起点", en: "Change", ru: "Изменить" },
  noGps: { zh: "还没有定位。可以点“改起点”后在地图上选一个起点。", en: "No GPS fix yet. Use “Change” and tap the map to set a start.", ru: "GPS пока нет. Нажмите «Изменить» и выберите старт на карте." },
  loading: { zh: "正在载入导航数据…", en: "Loading navigation data…", ru: "Загрузка навигационных данных…" },
  noData: { zh: "这个版本没有带导航数据", en: "This build has no navigation data", ru: "В этой сборке нет навигационных данных" },
  outside: { zh: "起点或终点在导航范围外（仅支持莫斯科市区及近郊）", en: "Start or destination is outside the navigation area (Moscow and nearby suburbs only)", ru: "Старт или пункт назначения вне зоны навигации (только Москва и ближайшее Подмосковье)" },
  noRoute: { zh: "找不到路线", en: "No route found", ru: "Маршрут не найден" },
  noMetro: { zh: "附近没有合适的地铁方案", en: "No suitable metro option nearby", ru: "Подходящего маршрута на метро нет" },
  rerouting: { zh: "偏离路线，正在重新规划…", en: "Off route, recalculating…", ru: "Вы сошли с маршрута, пересчёт…" },
  arrived: { zh: "已到达目的地", en: "You have arrived", ru: "Вы прибыли" },
  walkTo: { zh: "步行", en: "Walk", ru: "Пешком" },
  transferTo: { zh: "换乘", en: "Transfer", ru: "Пересадка" },
  waitNote: { zh: "含进站与候车", en: "incl. entering & waiting", ru: "с учётом входа и ожидания" },
  stopsWord: (n: number, lang: Lang) => pick(lang, `${n}站`, `${n} stop${n > 1 ? "s" : ""}`, `${n} ост.`),
  voiceOn: { zh: "语音开", en: "Voice on", ru: "Голос вкл." },
  voiceOff: { zh: "语音关", en: "Voice off", ru: "Голос выкл." },
  gpsTip: { zh: "定位精度较差。请在手机设置里打开 Wi-Fi 和蓝牙扫描、选择“精确位置”，并尽量到室外；仍不准可长按地图手动校正。", en: "Weak location fix. Turn on Wi-Fi and Bluetooth scanning and “precise location” in phone settings, and go outdoors. Long-press the map to correct manually.", ru: "Слабый сигнал. Включите Wi-Fi, Bluetooth и «точное местоположение» в настройках, выйдите на улицу. Или удерживайте карту, чтобы поправить вручную." },
  netOn: { zh: "已切换：抗干扰模式（Wi-Fi/基站定位，精度约几十米，不依赖 GPS 卫星）。请确保已开启 Wi-Fi 和蓝牙扫描。", en: "Anti-jamming mode on (Wi-Fi/cell location, tens of metres, not relying on GPS satellites). Make sure Wi-Fi and Bluetooth scanning are on.", ru: "Режим без GPS включён (Wi-Fi/сотовые сети, точность десятки метров). Включите сканирование Wi-Fi и Bluetooth." },
  netOff: { zh: "已切换：高精度模式（GPS + Wi-Fi + 基站）", en: "High-accuracy mode on (GPS + Wi-Fi + cell)", ru: "Высокоточный режим (GPS + Wi-Fi + сотовые сети)" },
  manualAsk: { zh: "定位不准？把当前位置设在这里", en: "GPS off? Set my position here", ru: "GPS врёт? Поставить меня сюда" },
  manualHere: { zh: "我在这里", en: "I'm here", ru: "Я здесь" },
  close: { zh: "关闭", en: "Close", ru: "Закрыть" },
} as const;

export const t = (k: { zh: string; en: string; ru: string }, lang: Lang) => k[lang];
