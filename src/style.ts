import type { StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";

/** 离线样式：Protomaps 底图图层 + 汉语优先的标注（第一行汉语，第二行俄文原名）。 */
export function makeStyle(pmtilesUrl: string, base: string): StyleSpecification {
  return {
    version: 8,
    // 不能用 new URL() 拼：它会把 {fontstack} 的花括号转义掉
    glyphs: new URL("./", base).href + "fonts/{fontstack}/{range}.pbf",
    sprite: new URL("sprites/light", base).href,
    sources: {
      map: { type: "vector", url: `pmtiles://${pmtilesUrl}`, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps' },
    },
    layers: layers("map", namedFlavor("light"), { lang: "zh-Hans" }) as StyleSpecification["layers"],
  };
}
