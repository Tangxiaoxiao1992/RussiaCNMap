import type { Source, RangeResponse } from "pmtiles";

type Manifest = { size: number; chunk: number; count: number; prefix: string };

/**
 * PMTiles 数据源，两种模式：
 * 1. 分块模式（正式包）：数据被切成很多 4MB 小文件（data/manifest.json 描述），用普通 GET 整块读取并缓存。
 *    不依赖 HTTP Range——Capacitor/Android WebView 的本地服务器对 Range 的实现是错的（会返回从 0 开始的整个文件），
 *    所以 APK 里必须走这条路。
 * 2. 单文件模式（开发用的 fixture）：按 Range 读取单个 .pmtiles。
 */
export class ChunkedSource implements Source {
  private manifest?: Promise<Manifest | null>;
  private cache = new Map<number, Promise<ArrayBuffer>>();
  private readonly maxChunks = 16; // 16 × 4MB = 64MB 内存上限

  constructor(private url: string, private dataBase: string) {}
  getKey() { return this.url; }

  private loadManifest(): Promise<Manifest | null> {
    this.manifest ??= fetch(new URL("manifest.json", this.dataBase))
      .then(async (r) => {
        if (!r.ok) return null;
        const m = (await r.json()) as Manifest;
        return m && typeof m.size === "number" && m.chunk > 0 ? m : null;
      })
      .catch(() => null); // 404 时 SPA 服务器可能回 html，json() 会抛错，同样视为没有
    return this.manifest;
  }

  private chunk(m: Manifest, i: number): Promise<ArrayBuffer> {
    let p = this.cache.get(i);
    if (p) { this.cache.delete(i); this.cache.set(i, p); return p; } // LRU：移到队尾
    const name = `${m.prefix}${String(i).padStart(4, "0")}.bin`;
    p = fetch(new URL(name, this.dataBase)).then((r) => {
      if (!r.ok) throw new Error(`读取离线地图分块失败：${name} HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => this.cache.delete(i));
    this.cache.set(i, p);
    while (this.cache.size > this.maxChunks) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const m = await this.loadManifest();
    if (m) {
      const end = Math.min(offset + length, m.size);
      const out = new Uint8Array(Math.max(0, end - offset));
      for (let pos = offset; pos < end; ) {
        const i = Math.floor(pos / m.chunk);
        const buf = new Uint8Array(await this.chunk(m, i));
        const from = pos - i * m.chunk;
        const n = Math.min(buf.length - from, end - pos);
        if (n <= 0) throw new Error("离线地图分块长度与 manifest 不一致");
        out.set(buf.subarray(from, from + n), pos - offset);
        pos += n;
      }
      return { data: out.buffer };
    }
    // 单文件模式
    const res = await fetch(this.url, { signal, headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    if (res.status === 206) return { data: await res.arrayBuffer() };
    throw new Error(`读取离线地图失败：HTTP ${res.status}（服务器需要支持 Range，或使用分块数据）`);
  }
}
