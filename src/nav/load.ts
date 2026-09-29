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

/** Android 打包时会把 .gz 文件解压并去掉后缀，所以两种名字都试 */
async function fetchAny(dir: string, name: string): Promise<Response | null> {
  for (const n of [name, name + ".gz"]) {
    try { const r = await fetch(new URL(n, dir)); if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return r; } catch { /* 试下一个 */ }
  }
  return null;
}

/** 载入导航数据。步行路网缺失时返回 null；地铁数据缺失只是没有地铁方案。 */
export async function loadNav(dir: string, onProgress?: (msg: string) => void): Promise<NavData | null> {
  try {
    onProgress?.("walk");
    const r = await fetchAny(dir, "walk.bin");
    if (!r) return null;
    const nr = await fetchAny(dir, "walk-names.json");
    const names = nr ? (JSON.parse(new TextDecoder().decode(await gunzip(nr))) as NameRow[]) : ([["", "", ""]] as NameRow[]);
    const graph = new WalkGraph(decodeWalk(new Uint8Array(await gunzip(r))), names);
    let metro: Metro | null = null;
    try {
      const m = await fetchAny(dir, "metro.json");
      if (m) metro = new Metro(JSON.parse(new TextDecoder().decode(await gunzip(m))) as MetroData);
    } catch (e) { console.warn("地铁数据无法读取", e); }
    return { graph, metro };
  } catch (e) {
    console.error("载入导航数据失败", e);
    return null;
  }
}
