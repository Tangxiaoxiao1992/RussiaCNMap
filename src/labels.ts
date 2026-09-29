import type { ExpressionSpecification, Map as MapLibre } from "maplibre-gl";

/** 标注模式：每种模式列出要显示的字段（自上而下），字段值缺失时回退到俄文原名，相同的行自动去重。 */
export type LabelMode = "zh" | "en" | "ru" | "all";
export const MODES: Record<LabelMode, { fields: string[]; short: string; title: string }> = {
  zh: { fields: ["name:zh-Hans", "name"], short: "中", title: "中文 + Русский" },
  en: { fields: ["name:en", "name"], short: "EN", title: "English + Русский" },
  ru: { fields: ["name", "name:zh-Hans"], short: "РУ", title: "Русский + 中文" },
  all: { fields: ["name:zh-Hans", "name:en", "name"], short: "三语", title: "中文 / English / Русский" },
};

const val = (field: string): ExpressionSpecification => ["coalesce", ["get", field], ["get", "name"]];

export function labelExpression(mode: LabelMode): ExpressionSpecification {
  const [a, b, c] = MODES[mode].fields;
  const p1 = val(a);
  const p2 = val(b);
  const line = (v: ExpressionSpecification, differs: ExpressionSpecification[]): ExpressionSpecification =>
    ["case", ["all", ...differs], ["concat", "\n", v], ""];
  const args: unknown[] = [p1, {}, line(p2, [["!=", p2, p1]]), { "font-scale": 0.8 }];
  if (c) {
    const p3 = val(c);
    args.push(line(p3, [["!=", p3, p1], ["!=", p3, p2]]), { "font-scale": 0.7 });
  }
  return ["format", ...args] as ExpressionSpecification;
}

/** 找出样式里显示地名的文字图层（排除门牌号、路牌数字） */
export function nameLayerIds(map: MapLibre): string[] {
  return map.getStyle().layers
    .filter((l) => l.type === "symbol" && "layout" in l && l.layout?.["text-field"] !== undefined)
    .filter((l) => {
      const tf = JSON.stringify((l as { layout: Record<string, unknown> }).layout["text-field"]);
      return tf.includes('"name"') && !tf.includes("addr_housenumber") && !tf.includes("shield_text");
    })
    .map((l) => l.id);
}

export function applyLabelMode(map: MapLibre, mode: LabelMode, ids: string[]) {
  const expr = labelExpression(mode);
  for (const id of ids) map.setLayoutProperty(id, "text-field", expr);
}
