import { decodeWalk } from "./format.ts";
import { WalkGraph, type NameRow } from "./graph.ts";
import { Metro } from "./metro.ts";
import type { MetroData } from "./metro-types.ts";

/** 有的服务器会给 .gz 加 Content-Encoding（浏览器已自动解压），有的不会——按文件头判断是否还需要解压 */
async function gunzip(res: Response): Promise<ArrayBuffer> {
  const buf = await res.arrayBuffer();
  const b = new Uint8Array(buf);
  if (!(b.length > 2 && b[0] === 0x1f && b[1] === 0x8b)) return buf;
  if (typeof DecompressionStream === "undefined") throw new Error("浏览器不支持 DecompressionStream");
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

export interface NavData { graph: WalkGraph; metro: Metro | null }

/** 载入导航数据。步行路网缺失时返回 null；地铁数据缺失只是没有地铁方案。 */
export async function loadNav(dir: string, onProgress?: (msg: string) => void): Promise<NavData | null> {
  try {
    onProgress?.("walk");
    const r = await fetch(new URL("walk.bin.gz", dir));
    if (!r.ok) return null;
    const [names, data] = await Promise.all([
      fetch(new URL("walk-names.json.gz", dir)).then(async (x) => (x.ok ? (JSON.parse(new TextDecoder().decode(await gunzip(x))) as NameRow[]) : [["", "", ""]] as NameRow[])),
      gunzip(r).then(decodeWalk),
    ]);
    const graph = new WalkGraph(data, names);
    let metro: Metro | null = null;
    try {
      const m = await fetch(new URL("metro.json.gz", dir));
      if (m.ok) metro = new Metro(JSON.parse(new TextDecoder().decode(await gunzip(m))) as MetroData);
    } catch { /* 没有地铁数据也能步行导航 */ }
    return { graph, metro };
  } catch (e) {
    console.error("载入导航数据失败", e);
    return null;
  }
}
