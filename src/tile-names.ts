import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import vtpbf from "vt-pbf";
import { toZh } from "./zh/index.ts";
import { toEn } from "./en/index.ts";

type Props = Record<string, unknown>;

/**
 * 读入一张 MVT 瓦片，给每个有俄文名的要素补上汉语名（`name:zh-Hans`、`name:zh`）和英文名（`name:en`），再重新编码。
 * OSM 里已有的 name:zh / name:zh-Hans / name:en 保持原样（人工标注优先）。
 * 没有任何改动时返回原始字节，避免无谓的重新编码。
 */
export function addNames(data: Uint8Array): Uint8Array {
  const tile = new VectorTile(new PbfReader(data));
  let changed = false;
  const layers: Record<string, unknown> = {};
  for (const [layerName, layer] of Object.entries(tile.layers)) {
    const feats: Array<{ id?: number; type: number; properties: Props; loadGeometry: () => unknown }> = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const props: Props = { ...f.properties };
      const station = props.kind === "station" || layerName === "transit";
      const ru = typeof props.name === "string" ? props.name : undefined;

      const zhHave = props["name:zh-Hans"] ?? props["name:zh"];
      if (zhHave) {
        if (!props["name:zh-Hans"]) { props["name:zh-Hans"] = zhHave; changed = true; }
      } else if (ru) {
        const zh = toZh(ru, { station });
        if (zh) { props["name:zh-Hans"] = zh; props["name:zh"] = zh; changed = true; }
      }
      if (!props["name:en"] && ru) {
        const en = toEn(ru);
        if (en) { props["name:en"] = en; changed = true; }
      }
      feats.push({ id: f.id, type: f.type, properties: props, loadGeometry: () => f.loadGeometry() });
    }
    layers[layerName] = {
      version: layer.version, name: layerName, extent: layer.extent, length: feats.length,
      feature: (i: number) => feats[i],
    };
  }
  if (!changed) return data;
  return vtpbf.fromVectorTileJs({ layers } as never);
}
