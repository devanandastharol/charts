/* ---------- 1. SETTINGS ---------- */
let farm = { lat: 20.59, lng: 78.96 };           // default start point, change freely
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const YEAR_END = new Date().getFullYear() - 1;   // last complete year
const YEAR_START = YEAR_END - 9;

// Sample fields (TODO: teammates can replace crop/health with real rotation results)
const zones = [
  { name:'Field A', crop:'Maize',     health:62, color:'#e8a317', dx:0,     dy:0 },
  { name:'Field B', crop:'Soybean',   health:78, color:'#4f9d4e', dx:.0045, dy:0 },
  { name:'Field C', crop:'Wheat',     health:55, color:'#c9b458', dx:0,     dy:-.0035 },
  { name:'Field D', crop:'Cover crop',health:85, color:'#0f6b66', dx:.0045, dy:-.0035 }
];

/* ---------- 2. MAP ---------- */
const map = L.map('map').setView([farm.lat, farm.lng], 15);
const layers = {
  sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles © Esri' }),
  street: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
};
layers.sat.addTo(map);
document.getElementById('layerSel').onchange = e => {
  Object.values(layers).forEach(l => map.removeLayer(l));
  layers[e.target.value].addTo(map);
};

let zoneGroup = L.layerGroup().addTo(map), marker = L.marker([farm.lat, farm.lng]).addTo(map);

function drawZones() {
  zoneGroup.clearLayers();
  zones.forEach(z => {
    const w = .0045, h = .0035;
    const north = farm.lat + z.dy, west = farm.lng + z.dx - w / 2;
    const rect = L.rectangle([[north, west], [north - h, west + w]],
      { color: '#fff', weight: 2, fillColor: z.color, fillOpacity: .55 });
    rect.bindPopup(`<b>${z.name}</b><br>Crop: ${z.crop}<br>Soil health: ${z.health}/100`);
    rect.bindTooltip(z.name, { permanent: true, direction: 'center' });
    zoneGroup.addLayer(rect);
  });
  marker.setLatLng([farm.lat, farm.lng]);
}
drawZones();

map.on('click', e => {
  farm = { lat: e.latlng.lat, lng: e.latlng.lng };
  drawZones(); map.panTo(e.latlng); loadClimate();
});
document.getElementById('locBtn').onclick = () => {
  navigator.geolocation?.getCurrentPosition(p => {
    farm = { lat: p.coords.latitude, lng: p.coords.longitude };
    map.setView([farm.lat, farm.lng], 15); drawZones(); loadClimate();
  }, () => setStatus('Could not get your location. Click the map instead.'));
};

/* ---------- 3. CHARTS ---------- */
const mk = (id, cfg) => new Chart(document.getElementById(id), cfg);
const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

const tempChart = mk('tempChart', { type: 'line', data: { labels: MONTHS, datasets: [
  { label: 'Average', data: [], borderColor: '#3a9bdc', backgroundColor: 'rgba(58,155,220,.15)', fill: true, tension: .35 },
  { label: String(YEAR_END), data: [], borderColor: '#d9481f', tension: .35 }
]}, options: base });

const rainChart = mk('rainChart', { type: 'bar', data: { labels: MONTHS, datasets: [
  { label: 'Average', data: [], backgroundColor: '#9ccbe8' },
  { label: String(YEAR_END), data: [], backgroundColor: '#0f6b66' }
]}, options: base });

const soilChart = mk('soilChart', { type: 'line', data: { labels: MONTHS, datasets: [
  { label: 'Average', data: [], borderColor: '#8a5a3c', backgroundColor: 'rgba(138,90,60,.18)', fill: true, tension: .35 },
  { label: String(YEAR_END), data: [], borderColor: '#4f9d4e', tension: .35 }
]}, options: { ...base, scales: { y: { min: 0, max: 1 } } } });

mk('zoneChart', { type: 'bar', data: {
  labels: zones.map(z => `${z.name} (${z.crop})`),
  datasets: [{ label: 'Soil health', data: zones.map(z => z.health), backgroundColor: zones.map(z => z.color) }]
}, options: { ...base, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } });

/* ---------- 4. NASA POWER DATA (free, no API key) ---------- */
function setStatus(t) { document.getElementById('status').textContent = t; }

function split(series) {            // series: {"201501": v, ...} -> {avg[12], last[12]}
  const avg = [], last = [];
  for (let m = 1; m <= 12; m++) {
    const vals = [];
    for (let y = YEAR_START; y < YEAR_END; y++) {
      const v = series[`${y}${String(m).padStart(2, '0')}`];
      if (v !== undefined && v > -900) vals.push(v);
    }
    avg.push(vals.length ? vals.reduce((a, b) => a + b) / vals.length : null);
    const l = series[`${YEAR_END}${String(m).padStart(2, '0')}`];
    last.push(l > -900 ? l : null);
  }
  return { avg, last };
}

function setData(chart, d, scale = 1) {
  const f = (arr) => arr.map((v, i) => v === null ? null : +(v * (typeof scale === 'function' ? scale(i) : scale)).toFixed(2));
  chart.data.datasets[0].data = f(d.avg);
  chart.data.datasets[1].data = f(d.last);
  chart.update();
}

async function loadClimate() {
  setStatus(`Fetching NASA POWER data for ${farm.lat.toFixed(3)}, ${farm.lng.toFixed(3)}…`);
  const url = 'https://power.larc.nasa.gov/api/temporal/monthly/point' +
    `?parameters=T2M,PRECTOTCORR,GWETROOT&community=AG&longitude=${farm.lng.toFixed(4)}` +
    `&latitude=${farm.lat.toFixed(4)}&start=${YEAR_START}&end=${YEAR_END}&format=JSON`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const p = (await res.json()).properties.parameter;
    setData(tempChart, split(p.T2M));
    setData(rainChart, split(p.PRECTOTCORR), i => DAYS[i]);   // mm/day -> mm/month
    setData(soilChart, split(p.GWETROOT));
    setStatus(`NASA POWER monthly data, ${YEAR_START}–${YEAR_END}. Click anywhere on the map to compare another location.`);
  } catch (err) {
    console.error(err);
    useSample();
    setStatus('Could not reach NASA POWER, showing sample data instead.');
  }
}

function useSample() {   // backup so the demo never looks empty
  const t = [24,26,29,31,32,29,27,27,27,27,25,24], r = [8,10,18,45,110,260,310,270,190,150,70,15];
  const s = [.35,.3,.28,.3,.4,.6,.75,.75,.7,.6,.5,.4];
  setData(tempChart, { avg: t, last: t.map(v => v + 1) });
  setData(rainChart, { avg: r, last: r.map(v => v * .8) });
  setData(soilChart, { avg: s, last: s.map(v => v * .85) });
}

loadClimate();
