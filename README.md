# GeoVerse - 3D 地球空间数据可视化

这是一个可直接运行的前端程序：打开后展示一个宇宙背景下的 3D 地球，并叠加多个公开 API 的实时地球空间数据。

## 功能

- **3D 地球与宇宙场景**（CesiumJS）
- **全球地震**（USGS 24 小时 GeoJSON Feed）
- **全球灾害事件**（NASA EONET Open Events）
- **实时降雨雷达图层**（RainViewer）
- **国际空间站 ISS 实时位置与轨迹**（wheretheiss.at）
- 图层开关控制与数据摘要面板
- 自动刷新（默认 5 分钟）

## 运行方式

### 方式 1：本地静态服务器（推荐）

```bash
python3 -m http.server 8080
```

然后访问：`http://localhost:8080`

### 方式 2：直接打开 `index.html`

部分浏览器安全策略下，直接打开文件可能导致某些 API 或资源加载受限，建议优先使用方式 1。

## 目录结构

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：3D 场景初始化、API 数据获取与渲染逻辑

## 数据源

- CesiumJS: https://cesium.com/platform/cesiumjs/
- USGS Earthquake Feed: https://earthquake.usgs.gov/earthquakes/feed/
- NASA EONET API: https://eonet.gsfc.nasa.gov/docs/v3
- RainViewer API: https://www.rainviewer.com/api.html
- Where The ISS At API: https://wheretheiss.at/w/developer
