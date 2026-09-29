# RussiaCNMap / 莫斯科州离线中文地图

手机上完全离线可用的莫斯科州地图：**中文 / English / Русский 三种语言的地名**，可以搜索、点选识别、GPS 定位。暂不做导航。

## 它是怎么做到的

| 需求 | 做法 |
|---|---|
| 离线 | Protomaps 每日 OSM 底图截出莫斯科州 → 打进 APK 的 `assets`；字体、图标、搜索索引也全部本地 |
| 三语地名 | 每张瓦片在手机上解码时，给每个俄文名补上汉语名和英文名：**OSM 已有的名称优先 → 人工词典 → 通名规则（улица→街 / Street）+ 音译**。地图右上方的 **中 / EN / РУ / 三语** 按钮切换标注：中文+俄文、English+俄文、俄文+中文、三语同显（选择会被记住） |
| 三语搜索 | 构建时扫描全部瓦片，生成 `places-index.json`（汉语名 + 俄文名 + 英文名 + 类别 + 坐标），手机上本地搜索，输入汉语、英文（Red Square、Kutuzov）、俄文、别名（莫航、莫大、SVO）都行 |
| 点选识别 | 点地图上的街道/车站/建筑，弹出中文、English、Русский 三种名称 |

汉语、英语名称的来源，可信度依次降低：OSM 上人工标注的名称（有就用）→ 人工词典（`src/zh/dict.ts`、`src/en/dict.ts`：地铁站、城市、地标、大学）→ 音译（如“佩斯恰纳娅街” / Peschanaya Street）。音译只是"能读出来、能对上俄文"，不是官方译名；发现译错的，往对应的 `dict.ts` 里加一行即可。

## 构建离线包

```bash
npm ci
npm run data      # 下载并截取莫斯科州、生成搜索索引、切块（需要能访问 build.protomaps.com）
npm run build
```

或者直接在 GitHub 上运行 **Actions → Build Moscow Oblast Offline APK**，产物是可以直接安装的 APK。范围（`bbox`）和最大级别（`maxzoom`）可以在手动运行时改；`maxzoom` 从 14 降到 13 能明显减小体积。

## 没有网络/没有数据时调试界面

```bash
npm run fixture   # 生成一个只有几条街、几个站的假数据（public/moscow-oblast.pmtiles）
npm run dev
```

## 为什么数据要切成小块

Android WebView 里 Capacitor 的本地服务器对 HTTP Range 请求的实现有问题（返回的是从头开始的整个文件），
而 PMTiles 依赖 Range。所以正式包把 `.pmtiles` 切成 4MB 的小文件（`public/data/`），
`src/pm-source.ts` 用普通请求整块读取并做 LRU 缓存。网页部署也因此不需要服务器支持 Range。

## 目录

- `src/zh/`、`src/en/` 汉语、英语地名：`dict.ts` 词典、`translit.ts` 音译、`index.ts` 规则；`npm run test:names` 回归测试
- `src/tile-names.ts` 瓦片解码 → 补汉语名和英文名 → 重新编码
- `src/labels.ts` 标注语言切换（中 / EN / РУ / 三语）
- `src/style.ts` 底图样式（Protomaps 图层 + 汉语优先标注）
- `scripts/` 数据构建（`build-data.sh`、`build-index.mjs`、`split-chunks.mjs`、`make-fixture.mjs`）

## 数据与许可

地图数据来自 OpenStreetMap（ODbL，需署名，地图右下角已带），底图瓦片由 Protomaps 每日构建。代码许可见 LICENSE。

## 搜索

支持中/英/俄三语、词序无关（`moscow art` 也能找到 `Art Moscow`）、容错错别字（`tretyakov galery`）。地点来自两份索引：地图瓦片里的地名，加上 `scripts/build-places.sh` 从 OSM 数据抽取的全部有名字的地点（店铺、餐饮、展览、酒店、景点、医院等，含品牌和别名）。

## 离线定位与导航

- **定位**：右侧 ◎ 按钮，用手机 GPS，完全离线。
- **路线**：点地图或搜索到一个地点 → 卡片里点「路线」→ 给出 **步行** 和 **地铁换乘** 两个方案，并估算时间和到达时刻（时间为经验估算，含进站/候车）。起点默认是当前位置，也可以「改起点」后在地图上点选。
- **导航**：跟随蓝点，顶部显示下一步（中/英/俄随标注语言），**语音播报**（用手机系统的 TTS，需要系统里有对应语言的语音包），偏离路线自动重算，可静音。
- **范围**：导航只覆盖莫斯科市区+近郊（`NAV_BBOX`，默认 `37.0,55.45,38.2,56.05`），地图仍是整个莫斯科州。
- **数据**：`bash scripts/build-nav.sh`（需要 osmium-tool）从 Geofabrik 的 OSM 数据抽出步行路网，从 Overpass 取地铁线路，生成到 `public/nav/`。CI 里这一步失败不会影响地图 APK，只是「路线」会提示没有导航数据。
- **测试**：`npm run test:nav`（算法）；`npm run fixture:nav && npm run build && npx vite preview --port 4173` 后 `npm run e2e:nav`（假数据 + 模拟 GPS 的浏览器端到端）。
