declare module "vt-pbf" {
  const vtpbf: { fromVectorTileJs(tile: unknown): Uint8Array; fromGeojsonVt(layers: unknown, opts?: unknown): Uint8Array };
  export default vtpbf;
}
