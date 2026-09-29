# RussiaCNMap / 俄罗斯中文地图

面向中文用户的俄罗斯中俄双语开源地图。目标不是复制 Yandex Maps，而是在 OpenStreetMap 生态上增加适合中文用户的名称、别名、搜索和旅行信息层。

## 当前 MVP

- MapLibre GL JS 地图，默认莫斯科视角
- 中文 / 俄文 / 英文搜索
- 内置中文别名：例如“莫航”、红场、SVO
- 俄罗斯范围 OpenStreetMap / Nominatim 搜索兜底
- 地点中俄双语详情卡
- 浏览器定位、缩放与旋转
- 移动端响应式布局

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 设计原则

名称优先级计划为：OSM/Wikidata 已验证中文名 → RussiaCNMap 人工别名库 → 俄文原名。机器翻译或音译只作为本项目自己的覆盖层，不自动写回 OpenStreetMap。

## 下一阶段

1. 对矢量瓦片中的地名做 `name:zh-Hans → name:zh → name:ru` 中文优先渲染。
2. 将搜索服务抽成可切换 provider，避免公共 Nominatim 承担生产流量。
3. 接入 Wikidata 中文名称并建立人工审核的数据管线。
4. 增加地铁、机场、大学、景点等面向中国用户的 POI 分类。
5. 后续接 Valhalla 路线规划。

## 数据与许可

地图数据来自 OpenStreetMap，使用时必须遵守 ODbL 及署名要求。当前演示底图使用 OpenFreeMap 服务；正式部署前应确认服务政策或部署自己的瓦片服务。代码许可见 LICENSE。
