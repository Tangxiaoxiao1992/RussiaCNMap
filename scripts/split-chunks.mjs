// 把 .pmtiles 切成固定大小的小文件 + manifest.json，供 ChunkedSource 读取。
// 用法：node scripts/split-chunks.mjs <in.pmtiles> <outDir> [chunkBytes=4194304]
import { openSync, readSync, closeSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [, , input, outDir, chunkArg] = process.argv;
if (!input || !outDir) { console.error("用法：split-chunks.mjs <in.pmtiles> <outDir> [chunkBytes]"); process.exit(2); }
const chunk = Number(chunkArg) || 4 * 1024 * 1024;
const size = statSync(input).size;
const count = Math.ceil(size / chunk);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const fd = openSync(input, "r");
const buf = Buffer.alloc(chunk);
for (let i = 0; i < count; i++) {
  const n = readSync(fd, buf, 0, chunk, i * chunk);
  writeFileSync(join(outDir, `oblast-${String(i).padStart(4, "0")}.bin`), buf.subarray(0, n));
}
closeSync(fd);
writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ size, chunk, count, prefix: "oblast-" }));
console.log(`切分完成：${size} 字节 → ${count} 块（每块 ${chunk} 字节）→ ${outDir}`);
