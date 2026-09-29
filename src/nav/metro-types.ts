export interface Station { id: number; ru: string; zh: string; en: string; lon: number; lat: number }
export interface Line { ref: string; ru: string; zh: string; en: string; color: string }
/** 相邻两站的一段线路：[站 a, 站 b, 线路序号, 距离（米）]，无向 */
export type Segment = [number, number, number, number];
export interface MetroData { stations: Station[]; lines: Line[]; segments: Segment[] }
