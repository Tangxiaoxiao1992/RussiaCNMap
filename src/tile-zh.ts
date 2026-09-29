import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import vtpbf from "vt-pbf";
import { toZh } from "./zh/index.ts";

type Props = Record<string, unknown>;

/**
 * 读入一张 MVT 瓦片，给每个有俄文名的要素补上 `name:zh-Hans`（以及 `name:zh`），再重新编码。
 * 已有汉语名的要素保持原样（OSM 人工标注优先）。
 * 没有任何改动时返回原始字节，避免无谓的重新编码。
 */
export function addZhNames(data: Uint8Array): Uint8Array {
  const tile = new VectorTile(new PbfReader(data));
  let changed = false;
  const layers: Record<string, unknown> = {};
  for (const [layerName, layer] of Object.entries(tile.layers)) {
    const feats: Array<{ id?: number; type: number; properties: Props; loadGeometry: () => unknown }> = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const props: Props = { ...f.properties };
      const has = props["name:zh-Hans"] ?? props["name:zh"];
      if (has) {
        props["name:zh-Hans"] = has; // 统一到样式读取的字段
        if (props["name:zh-Hans"] !== f.properties["name:zh-Hans"]) changed = true;
      } else if (typeof props.name === "string") {
        const zh = toZh(props.name, { station: props.kind === "station" || layerName === "transit" });
        if (zh) { props["name:zh-Hans"] = zh; props["name:zh"] = zh; changed = true; }
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
