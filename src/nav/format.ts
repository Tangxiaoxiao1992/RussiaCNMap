// 步行路网的二进制格式（小端）。构建脚本（Node）和手机端（浏览器）共用这一份编解码。
//
//  头  32 字节： "WLK1" | n(u32) | m(u32) | 保留 20 字节
//  coords  Int32[2n]   经纬度 ×1e6
//  off     Uint32[n+1] CSR 邻接表偏移
//  to      Uint32[m]   有向边终点
//  nameIdx Uint32[m]   边所属道路名在 names 表里的序号（0 = 无名）
//  len     Uint16[m]   边长，单位 0.1 米（补齐到 4 字节）
//  flag    Uint8[m]    边类型，见 EdgeFlag

export const EdgeFlag = { Normal: 0, Steps: 1, Underpass: 2, Bridge: 3, Crossing: 4, BusyRoad: 5 } as const;

export type WalkData = {
  n: number; m: number;
  coords: Int32Array; off: Uint32Array; to: Uint32Array; nameIdx: Uint32Array; len: Uint16Array; flag: Uint8Array;
};

const pad4 = (x: number) => (x + 3) & ~3;

export function encodeWalk(d: WalkData): Uint8Array {
  const { n, m } = d;
  const size = 32 + 8 * n + 4 * (n + 1) + 4 * m + 4 * m + pad4(2 * m) + pad4(m);
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  new Uint8Array(buf, 0, 4).set([0x57, 0x4c, 0x4b, 0x31]); // "WLK1"
  dv.setUint32(4, n, true); dv.setUint32(8, m, true);
  let p = 32;
  new Int32Array(buf, p, 2 * n).set(d.coords); p += 8 * n;
  new Uint32Array(buf, p, n + 1).set(d.off); p += 4 * (n + 1);
  new Uint32Array(buf, p, m).set(d.to); p += 4 * m;
  new Uint32Array(buf, p, m).set(d.nameIdx); p += 4 * m;
  new Uint16Array(buf, p, m).set(d.len); p += pad4(2 * m);
  new Uint8Array(buf, p, m).set(d.flag);
  return new Uint8Array(buf);
}

export function decodeWalk(input: ArrayBuffer | Uint8Array): WalkData {
  const buf = input instanceof Uint8Array ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) : input;
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "WLK1") throw new Error("不是步行路网文件（magic 不对）");
  const n = dv.getUint32(4, true), m = dv.getUint32(8, true);
  let p = 32;
  const coords = new Int32Array(buf, p, 2 * n); p += 8 * n;
  const off = new Uint32Array(buf, p, n + 1); p += 4 * (n + 1);
  const to = new Uint32Array(buf, p, m); p += 4 * m;
  const nameIdx = new Uint32Array(buf, p, m); p += 4 * m;
  const len = new Uint16Array(buf, p, m); p += pad4(2 * m);
  const flag = new Uint8Array(buf, p, m);
  return { n, m, coords, off, to, nameIdx, len, flag };
}

/** 一种边类型的步行速度（米/秒）与"代价倍率"（>1 表示不想走） */
export const WALK_SPEED = 1.3;
export const SPEED: Record<number, number> = { 0: 1.3, 1: 0.7, 2: 1.3, 3: 1.3, 4: 1.2, 5: 1.3 };
export const PENALTY: Record<number, number> = { 0: 1, 1: 1.4, 2: 1.05, 3: 1, 4: 1.15, 5: 1.6 };
