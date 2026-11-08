/* ---------- 1. SETTINGS ---------- */
let farm = { lat: 20.59, lng: 78.96 };           // default start point
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = [31,28,31,30,31,30,31,31,30,31,30,31];
const YEAR_END = new Date().getFullYear() - 1;   // last complete year
const YEAR_START = YEAR_END - 9;
const POWER = 'https://power.larc.nasa.gov/api/temporal';

// Sample fields (TODO: teammates can replace crop/health with real rotation results)
const zones = [
  { name:'Field A', crop:'Maize',      health:62, color:'#e8a317', dx:-.00225, dy: .00175 },
  { name:'Field B', crop:'Soybean',    health:78, color:'#4f9d4e', dx: .00225, dy: .00175 },
  { name:'Field C', crop:'Wheat',      health:55, color:'#c9b458', dx:-.00225, dy:-.00175 },
  { name:'Field D', crop:'Cover crop', health:85, color:'#0f6b66', dx: .00225, dy:-.00175 }
];

/* ---------- 2. MAP ---------- */
const map = L.map('map').setView([farm.lat, farm.lng], 14);
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

const zoneGroup = L.layerGroup().addTo(map);
const marker = L.marker([farm.lat, farm.lng]).addTo(map);
marker.bindPopup('Loading NASA data…');

function drawZones() {
  zoneGroup.clearLayers();
  const w = .0045, h = .0035;                    // field size in degrees (~500 m x 390 m)
  zones.forEach(z => {
    const cy = farm.lat + z.dy, cx = farm.lng + z.dx;
    const rect = L.rectangle([[cy + h / 2, cx - w / 2], [cy - h / 2, cx + w / 2]],
      { color: '#fff', weight: 2, fillColor: z.color, fillOpacity: .5 });
    rect.bindPopup(`<b>${z.name}</b><br>Crop: ${z.crop}<br>Soil health: ${z.health}/100`);
    rect.bindTooltip(z.name, { permanent: true, direction: 'center' });
    zoneGroup.addLayer(rect);
  });
  marker.setLatLng([farm.lat, farm.lng]);
}
drawZones();

// Main entry point: put the marker at the exact point and load the data
function showLocation(lat, lng, zoom = 14) {
  farm = { lat, lng };
  document.getElementById('latIn').value = lat.toFixed(5);
  document.getElementById('lngIn').value = lng.toFixed(5);
  drawZones();
  map.setView([lat, lng], zoom);
  marker.setPopupContent('Loading NASA data…');
  loadAll();
}

document.getElementById('coordForm').addEventListener('submit', e => {
  e.preventDefault();
  const lat = parseFloat(document.getElementById('latIn').value);
  const lng = parseFloat(document.getElementById('lngIn').value);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    setStatus('Latitude must be -90 to 90 and longitude -180 to 180.', true);
    return;
  }
  showLocation(lat, lng);
});

map.on('click', e => showLocation(e.latlng.lat, e.latlng.lng, map.getZoom()));

document.getElementById('locBtn').onclick = () => {
  if (!navigator.geolocation) return setStatus('Location is not supported in this browser.', true);
  navigator.geolocation.getCurrentPosition(
    p => showLocation(p.coords.latitude, p.coords.longitude),
    () => setStatus('Could not get your location. Type coordinates instead.', true));
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

const dailyChart = mk('dailyChart', { type: 'bar', data: { labels: [], datasets: [
  { type: 'bar',  label: 'Rainfall (mm)', data: [], backgroundColor: '#9ccbe8', yAxisID: 'y1' },
  { type: 'line', label: 'Temperature (°C)', data: [], borderColor: '#d9481f', tension: .3, yAxisID: 'y' }
]}, options: { ...base, scales: {
  y:  { position: 'left',  title: { display: true, text: '°C' } },
  y1: { position: 'right', title: { display: true, text: 'mm' }, grid: { drawOnChartArea: false }, beginAtZero: true }
}}});

mk('zoneChart', { type: 'bar', data: {
  labels: zones.map(z => `${z.name} (${z.crop})`),
  datasets: [{ label: 'Soil health', data: zones.map(z => z.health), backgroundColor: zones.map(z => z.color) }]
}, options: { ...base, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } });

/* ---------- 4. NASA POWER DATA (free, no API key) ---------- */
function setStatus(t, isError = false) {
  const el = document.getElementById('status');
  el.textContent = t;
  el.className = isError ? 'error' : '';
}

const ok = v => typeof v === 'number' && v > -900;          // NASA uses -999 for "no data"
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const pretty = s => `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
const avgOf = a => a.length ? a.reduce((x, y) => x + y) / a.length : null;
const fmt = (v, d = 1) => v === null || v === undefined ? '–' : v.toFixed(d);

function split(series) {            // {"201501": v, ...} -> {avg[12], last[12]}
  const avg = [], last = [];
  for (let m = 1; m <= 12; m++) {
    const vals = [];
    for (let y = YEAR_START; y < YEAR_END; y++) {
      const v = series[`${y}${String(m).padStart(2, '0')}`];
      if (ok(v)) vals.push(v);
    }
    avg.push(avgOf(vals));
    const l = series[`${YEAR_END}${String(m).padStart(2, '0')}`];
    last.push(ok(l) ? l : null);
  }
  return { avg, last };
}

function setData(chart, d, scale = 1) {
  const f = arr => arr.map((v, i) => v === null ? null : +(v * (typeof scale === 'function' ? scale(i) : scale)).toFixed(2));
  chart.data.datasets[0].data = f(d.avg);
  chart.data.datasets[1].data = f(d.last);
  chart.update();
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).properties.parameter;
}

// Long-term monthly data (10 years)
async function loadMonthly() {
  const p = await getJSON(`${POWER}/monthly/point?parameters=T2M,PRECTOTCORR,GWETROOT&community=AG` +
    `&longitude=${farm.lng.toFixed(4)}&latitude=${farm.lat.toFixed(4)}&start=${YEAR_START}&end=${YEAR_END}&format=JSON`);
  setData(tempChart, split(p.T2M));
  setData(rainChart, split(p.PRECTOTCORR), i => DAYS[i]);   // mm/day -> mm/month
  setData(soilChart, split(p.GWETROOT));
}

// Near-real-time daily data (last 30 days, NASA usually lags 1-3 days)
async function loadDaily() {
  const end = new Date(Date.now() - 86400000), start = new Date(end - 29 * 86400000);
  const p = await getJSON(`${POWER}/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,GWETROOT&community=AG` +
    `&longitude=${farm.lng.toFixed(4)}&latitude=${farm.lat.toFixed(4)}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`);

  const dates = Object.keys(p.T2M).filter(d => ok(p.T2M[d]));
  if (!dates.length) throw new Error('No daily data');
  dailyChart.data.labels = dates.map(d => pretty(d).slice(0, 5));
  dailyChart.data.datasets[0].data = dates.map(d => ok(p.PRECTOTCORR[d]) ? p.PRECTOTCORR[d] : null);
  dailyChart.data.datasets[1].data = dates.map(d => p.T2M[d]);
  dailyChart.update();

  const last = dates[dates.length - 1];
  const rain30 = dates.reduce((s, d) => s + (ok(p.PRECTOTCORR[d]) ? p.PRECTOTCORR[d] : 0), 0);
  const get = k => ok(p[k][last]) ? p[k][last] : null;
  const latest = {
    date: pretty(last), temp: get('T2M'), tmax: get('T2M_MAX'), tmin: get('T2M_MIN'),
    rain: get('PRECTOTCORR'), rh: get('RH2M'), soil: get('GWETROOT'),
    rain30, temp30: avgOf(dates.map(d => p.T2M[d]))
  };
  showStats(latest);
}

function showStats(s) {
  const cell = (val, label) => `<div class="stat"><b>${val}</b><span>${label}</span></div>`;
  document.getElementById('stats').innerHTML =
    cell(fmt(s.temp) + ' °C', 'Temperature') +
    cell(fmt(s.tmax) + ' / ' + fmt(s.tmin) + ' °C', 'Max / min') +
    cell(fmt(s.rain) + ' mm', 'Rain that day') +
    cell(fmt(s.rh, 0) + ' %', 'Humidity') +
    cell(fmt(s.soil, 2), 'Soil wetness (0–1)') +
    cell(fmt(s.rain30, 0) + ' mm', 'Rain, last 30 days') +
    `<div class="stats-note">NASA POWER data for ${s.date} at ${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}. ` +
    `Values describe the NASA grid cell (about 50 km wide) around this point.</div>`;

  marker.setPopupContent(
    `<b>${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}</b><br>NASA POWER, ${s.date}<br>` +
    `Temp: ${fmt(s.temp)} °C (${fmt(s.tmin)} to ${fmt(s.tmax)})<br>` +
    `Rain: ${fmt(s.rain)} mm · Humidity: ${fmt(s.rh, 0)}%<br>` +
    `Soil wetness: ${fmt(s.soil, 2)}<br>Rain, last 30 days: ${fmt(s.rain30, 0)} mm`);
  marker.openPopup();
}

async function loadAll() {
  setStatus(`Fetching NASA POWER data for ${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}…`);
  const [monthly, daily] = await Promise.allSettled([loadMonthly(), loadDaily()]);
  if (monthly.status === 'rejected') useSample();
  if (daily.status === 'rejected') {
    document.getElementById('stats').textContent = 'Live NASA readings are unavailable right now.';
    marker.setPopupContent(`<b>${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}</b><br>Live data unavailable.`);
  }
  if (monthly.status === 'fulfilled' && daily.status === 'fulfilled') {
    setStatus(`Showing NASA POWER data for ${farm.lat.toFixed(4)}, ${farm.lng.toFixed(4)}. Enter new coordinates or click the map.`);
  } else {
    console.error(monthly.reason || daily.reason);
    setStatus('Some NASA data could not be loaded (check your internet, then try again). Sample data may be shown.', true);
  }
}

function useSample() {   // backup so the monthly charts never look empty
  const t = [24,26,29,31,32,29,27,27,27,27,25,24], r = [8,10,18,45,110,260,310,270,190,150,70,15];
  const s = [.35,.3,.28,.3,.4,.6,.75,.75,.7,.6,.5,.4];
  setData(tempChart, { avg: t, last: t.map(v => v + 1) });
  setData(rainChart, { avg: r, last: r.map(v => v * .8) });
  setData(soilChart, { avg: s, last: s.map(v => v * .85) });
}

loadAll();
