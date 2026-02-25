const summaryEl = document.getElementById("summary");
const earthquakeToggle = document.getElementById("earthquakeToggle");
const eonetToggle = document.getElementById("eonetToggle");
const radarToggle = document.getElementById("radarToggle");
const issToggle = document.getElementById("issToggle");
const refreshNowBtn = document.getElementById("refreshNow");

const state = {
  earthquakeCount: 0,
  eonetCount: 0,
  issText: "加载中...",
};

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  geocoder: false,
  homeButton: true,
  sceneModePicker: true,
  baseLayerPicker: true,
  navigationHelpButton: false,
  terrain: undefined,
  shouldAnimate: true,
});

viewer.scene.globe.enableLighting = true;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.clock.multiplier = 120;

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(110, 25, 22000000),
  duration: 2.4,
});

const earthquakeLayer = new Cesium.CustomDataSource("earthquakes");
const eonetLayer = new Cesium.CustomDataSource("eonet-events");
const issLayer = new Cesium.CustomDataSource("iss");
viewer.dataSources.add(earthquakeLayer);
viewer.dataSources.add(eonetLayer);
viewer.dataSources.add(issLayer);

let radarLayer = null;
let issPath = [];

const colorByMagnitude = (mag) => {
  if (mag >= 6) return Cesium.Color.RED.withAlpha(0.92);
  if (mag >= 5) return Cesium.Color.ORANGE.withAlpha(0.9);
  if (mag >= 4) return Cesium.Color.YELLOW.withAlpha(0.85);
  return Cesium.Color.CYAN.withAlpha(0.75);
};

async function loadEarthquakes() {
  earthquakeLayer.entities.removeAll();
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
  );
  const data = await res.json();

  data.features.forEach((feature) => {
    const [lon, lat, depth] = feature.geometry.coordinates;
    const mag = feature.properties.mag ?? 0;
    const place = feature.properties.place || "未知地点";
    const time = new Date(feature.properties.time).toLocaleString();

    earthquakeLayer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      point: {
        pixelSize: Math.min(26, Math.max(6, mag * 3.2)),
        color: colorByMagnitude(mag),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.55),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      description: `
        <h3>地震事件</h3>
        <p><b>地点:</b> ${place}</p>
        <p><b>震级:</b> M ${mag.toFixed(1)}</p>
        <p><b>深度:</b> ${depth} km</p>
        <p><b>时间:</b> ${time}</p>
      `,
    });
  });

  state.earthquakeCount = data.features.length;
}

async function loadEonetEvents() {
  eonetLayer.entities.removeAll();
  const res = await fetch(
    "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100"
  );
  const data = await res.json();

  data.events.forEach((event) => {
    const latest = event.geometry[event.geometry.length - 1];
    if (!latest || latest.type !== "Point") return;

    const [lon, lat] = latest.coordinates;
    const category = event.categories?.[0]?.title || "未分类";

    eonetLayer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      billboard: {
        image:
          "https://cdn.jsdelivr.net/gh/tabler/tabler-icons/icons/alert-triangle-filled.svg",
        width: 22,
        height: 22,
        color: Cesium.Color.fromCssColorString("#ff4d6d"),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: event.title,
        scale: 0.42,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("rgba(0,0,0,0.55)"),
      },
      description: `
      <h3>${event.title}</h3>
      <p><b>类别:</b> ${category}</p>
      <p><b>来源:</b> NASA EONET</p>
      `,
    });
  });

  state.eonetCount = eonetLayer.entities.values.length;
}

async function loadRadarLayer() {
  if (radarLayer) {
    viewer.imageryLayers.remove(radarLayer);
    radarLayer = null;
  }

  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  const data = await res.json();
  const latestRadar = data.radar?.past?.at(-1);
  if (!latestRadar) return;

  const radarUrl = `${data.host}${latestRadar.path}/256/{z}/{x}/{y}/2/1_1.png`;

  radarLayer = viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: radarUrl,
      maximumLevel: 10,
      credit: "RainViewer",
    })
  );

  radarLayer.alpha = 0.6;
}

function updateSummary() {
  summaryEl.innerHTML = `
    <li>地震：${state.earthquakeCount} 条（24h）</li>
    <li>灾害事件：${state.eonetCount} 条（开放状态）</li>
    <li>ISS 位置：${state.issText}</li>
  `;
}

async function updateISS() {
  const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
  const data = await res.json();
  const { latitude, longitude, altitude } = data;

  const now = Cesium.JulianDate.now();
  const pos = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude * 1000);

  issPath.push({ lon: longitude, lat: latitude, alt: altitude });
  if (issPath.length > 240) issPath = issPath.slice(-240);

  issLayer.entities.removeAll();

  issLayer.entities.add({
    id: "iss-live",
    position: pos,
    billboard: {
      image: "https://cdn.jsdelivr.net/gh/tabler/tabler-icons/icons/satellite.svg",
      color: Cesium.Color.fromCssColorString("#00e5ff"),
      width: 34,
      height: 34,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "ISS",
      scale: 0.6,
      pixelOffset: new Cesium.Cartesian2(0, 20),
      fillColor: Cesium.Color.CYAN,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("rgba(1, 12, 24, 0.7)"),
    },
    description: `
      <h3>国际空间站 (ISS)</h3>
      <p><b>纬度:</b> ${latitude.toFixed(3)}</p>
      <p><b>经度:</b> ${longitude.toFixed(3)}</p>
      <p><b>高度:</b> ${altitude.toFixed(2)} km</p>
      <p><b>UTC:</b> ${new Date(data.timestamp * 1000).toISOString()}</p>
    `,
  });

  if (issPath.length > 1) {
    issLayer.entities.add({
      polyline: {
        positions: issPath.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000)
        ),
        width: 2,
        material: Cesium.Color.CYAN.withAlpha(0.65),
      },
    });
  }

  viewer.clock.currentTime = now;
  state.issText = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}° / ${altitude.toFixed(
    1
  )} km`;
}

async function refreshAll() {
  try {
    await Promise.all([loadEarthquakes(), loadEonetEvents(), loadRadarLayer(), updateISS()]);
    updateSummary();
  } catch (error) {
    console.error("加载地理数据失败:", error);
    state.issText = "数据源连接失败，请稍后重试";
    updateSummary();
  }
}

earthquakeToggle.addEventListener("change", (e) => {
  earthquakeLayer.show = e.target.checked;
});

eonetToggle.addEventListener("change", (e) => {
  eonetLayer.show = e.target.checked;
});

radarToggle.addEventListener("change", (e) => {
  if (radarLayer) radarLayer.show = e.target.checked;
});

issToggle.addEventListener("change", (e) => {
  issLayer.show = e.target.checked;
});

refreshNowBtn.addEventListener("click", refreshAll);

refreshAll();
setInterval(refreshAll, 5 * 60 * 1000);
setInterval(async () => {
  try {
    await updateISS();
    updateSummary();
  } catch (error) {
    console.error("ISS 刷新失败", error);
  }
}, 10 * 1000);
