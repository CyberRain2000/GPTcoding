import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js";

const EARTH_RADIUS = 2;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("scene"), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

camera.position.set(0, 2.4, 6.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3.5;
controls.maxDistance = 14;

const lights = {
  ambient: new THREE.AmbientLight(0x7ea6ff, 0.38),
  sun: new THREE.DirectionalLight(0xffffff, 1.45),
};
lights.sun.position.set(8, 4, 5);
scene.add(lights.ambient, lights.sun);

const textureLoader = new THREE.TextureLoader();
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 128, 128),
  new THREE.MeshStandardMaterial({
    map: textureLoader.load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"),
    bumpMap: textureLoader.load("https://threejs.org/examples/textures/planets/earth_bump_2048.jpg"),
    bumpScale: 0.045,
    roughnessMap: textureLoader.load("https://threejs.org/examples/textures/planets/earth_specular_2048.jpg"),
    roughness: 0.9,
    metalness: 0.05,
  })
);
scene.add(earth);

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS * 1.01, 128, 128),
  new THREE.MeshStandardMaterial({
    map: textureLoader.load("https://threejs.org/examples/textures/planets/earth_clouds_1024.png"),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  })
);
scene.add(clouds);

const stars = new THREE.Mesh(
  new THREE.SphereGeometry(80, 64, 64),
  new THREE.MeshBasicMaterial({
    map: textureLoader.load("https://threejs.org/examples/textures/galaxy_starfield.png"),
    side: THREE.BackSide,
  })
);
scene.add(stars);

const markerGroups = {
  earthquakes: new THREE.Group(),
  events: new THREE.Group(),
  weather: new THREE.Group(),
  iss: new THREE.Group(),
};
Object.values(markerGroups).forEach((group) => scene.add(group));

function latLonToVector3(lat, lon, radius = EARTH_RADIUS * 1.015) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function buildSpikeMarker(lat, lon, color = 0xff5555, size = 0.15) {
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.33, size, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })
  );
  const point = latLonToVector3(lat, lon);
  marker.position.copy(point);
  marker.lookAt(point.clone().multiplyScalar(2));
  return marker;
}

function buildPulseMarker(lat, lon, color = 0x57b6ff, radius = 0.05) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 })
  );
  marker.position.copy(latLonToVector3(lat, lon));
  return marker;
}

function clearGroup(group) {
  group.children.forEach((child) => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((m) => m.dispose());
    } else {
      child.material?.dispose();
    }
  });
  group.clear();
}

const statusList = document.getElementById("status-list");
const summary = document.getElementById("summary");

function renderStatus(items) {
  statusList.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = `${item.name}: ${item.message}`;
    if (!item.ok) li.className = "warn";
    statusList.appendChild(li);
  }
}

function renderSummary(items) {
  summary.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    summary.appendChild(li);
  }
}

async function loadEarthquakes() {
  const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const top = data.features
    .filter((f) => Array.isArray(f.geometry?.coordinates) && typeof f.properties?.mag === "number")
    .sort((a, b) => b.properties.mag - a.properties.mag)
    .slice(0, 300);

  clearGroup(markerGroups.earthquakes);
  top.forEach((quake) => {
    const [lon, lat] = quake.geometry.coordinates;
    const mag = quake.properties.mag;
    const size = Math.min(0.68, 0.14 + mag * 0.07);
    const color = mag >= 6 ? 0xff3333 : mag >= 4 ? 0xff8844 : 0xffcc66;
    markerGroups.earthquakes.add(buildSpikeMarker(lat, lon, color, size));
  });

  const strongest = top[0]?.properties?.mag ?? 0;
  return { count: top.length, strongest };
}

async function loadNaturalEvents() {
  const res = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  clearGroup(markerGroups.events);
  let withGeo = 0;

  data.events.slice(0, 220).forEach((event) => {
    const latest = event.geometry?.[event.geometry.length - 1];
    const coords = latest?.coordinates;
    if (!Array.isArray(coords)) return;

    let lon;
    let lat;
    if (latest.type === "Point") {
      [lon, lat] = coords;
    } else {
      const first = coords[0]?.[0];
      if (!first) return;
      [lon, lat] = first;
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      withGeo += 1;
      markerGroups.events.add(buildPulseMarker(lat, lon, 0x66ddff, 0.048));
    }
  });

  return { total: data.events.length, plotted: withGeo };
}

const weatherCities = [
  { name: "北京", lat: 39.9042, lon: 116.4074 },
  { name: "上海", lat: 31.2304, lon: 121.4737 },
  { name: "伦敦", lat: 51.5074, lon: -0.1278 },
  { name: "纽约", lat: 40.7128, lon: -74.006 },
  { name: "东京", lat: 35.6762, lon: 139.6503 },
  { name: "圣保罗", lat: -23.5505, lon: -46.6333 },
  { name: "悉尼", lat: -33.8688, lon: 151.2093 },
  { name: "开普敦", lat: -33.9249, lon: 18.4241 },
];

async function loadWeather() {
  clearGroup(markerGroups.weather);
  const cityResults = [];

  await Promise.all(
    weatherCities.map(async (city) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,precipitation,rain,snowfall,weather_code,wind_speed_10m&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const current = data.current || {};
      const rain = Number(current.rain ?? 0);
      const snowfall = Number(current.snowfall ?? 0);
      const precipitation = Number(current.precipitation ?? 0);
      const severe = precipitation >= 1.5 || rain >= 1 || snowfall >= 1;
      const markerColor = severe ? 0x66a8ff : 0x66ffaa;
      const markerRadius = severe ? 0.09 : 0.055;

      const cityGroup = new THREE.Group();
      cityGroup.add(buildPulseMarker(city.lat, city.lon, markerColor, markerRadius));

      if (rain > 0.2 || precipitation > 0.4) {
        const dropMaterial = new THREE.PointsMaterial({ color: 0x7ec8ff, size: 0.02 });
        const dropGeometry = new THREE.BufferGeometry();
        const drops = [];
        const center = latLonToVector3(city.lat, city.lon, EARTH_RADIUS * 1.05);

        for (let i = 0; i < 130; i++) {
          const spread = 0.15;
          drops.push(
            center.x + (Math.random() - 0.5) * spread,
            center.y + (Math.random() * spread),
            center.z + (Math.random() - 0.5) * spread
          );
        }

        dropGeometry.setAttribute("position", new THREE.Float32BufferAttribute(drops, 3));
        cityGroup.add(new THREE.Points(dropGeometry, dropMaterial));
      }

      markerGroups.weather.add(cityGroup);
      cityResults.push({ city: city.name, temp: current.temperature_2m, rain, precipitation });
    })
  );

  return cityResults;
}

async function loadISS() {
  const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  clearGroup(markerGroups.iss);

  const marker = buildSpikeMarker(data.latitude, data.longitude, 0xffff66, 0.28);
  markerGroups.iss.add(marker);

  return {
    lat: data.latitude,
    lon: data.longitude,
    velocity: data.velocity,
    altitude: data.altitude,
  };
}

function safeTask(name, task) {
  return task()
    .then((payload) => ({ name, ok: true, message: "加载成功", payload }))
    .catch((err) => ({ name, ok: false, message: `加载失败 (${err.message})`, payload: null }));
}

async function refreshData() {
  const [quakeResult, eonetResult, weatherResult, issResult] = await Promise.all([
    safeTask("USGS 地震", loadEarthquakes),
    safeTask("NASA EONET 事件", loadNaturalEvents),
    safeTask("Open-Meteo 天气", loadWeather),
    safeTask("ISS 轨道位置", loadISS),
  ]);

  renderStatus([quakeResult, eonetResult, weatherResult, issResult]);

  const lines = [];
  const now = new Date();
  lines.push(`最后刷新时间：${now.toLocaleString()}`);

  if (quakeResult.payload) {
    lines.push(`地震：展示 ${quakeResult.payload.count} 个，最大震级 M${quakeResult.payload.strongest.toFixed(1)}`);
  }
  if (eonetResult.payload) {
    lines.push(`自然事件：最近 30 天开放事件 ${eonetResult.payload.total} 个，成功定位 ${eonetResult.payload.plotted} 个`);
  }
  if (weatherResult.payload) {
    const rainy = weatherResult.payload.filter((r) => r.rain > 0 || r.precipitation > 0).map((r) => r.city);
    lines.push(`城市天气：监测 ${weatherResult.payload.length} 个城市；降水城市：${rainy.length ? rainy.join("、") : "无"}`);
  }
  if (issResult.payload) {
    lines.push(
      `ISS：纬度 ${issResult.payload.lat.toFixed(2)}，经度 ${issResult.payload.lon.toFixed(2)}，高度 ${issResult.payload.altitude.toFixed(1)} km，速度 ${issResult.payload.velocity.toFixed(1)} km/h`
    );
  }

  renderSummary(lines);
}

document.getElementById("refresh").addEventListener("click", refreshData);

function animate() {
  requestAnimationFrame(animate);
  earth.rotation.y += 0.0007;
  clouds.rotation.y += 0.0012;

  markerGroups.weather.children.forEach((group) => {
    group.children.forEach((obj) => {
      if (!(obj instanceof THREE.Points)) return;
      const pos = obj.geometry.attributes.position;
      for (let i = 1; i < pos.array.length; i += 3) {
        pos.array[i] -= 0.004;
        if (pos.array[i] < -2.3) pos.array[i] += 0.16;
      }
      pos.needsUpdate = true;
    });
  });

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

refreshData();
animate();
