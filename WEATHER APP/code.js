const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('errorBox');
const errorText = document.getElementById('errorText');
const readout = document.getElementById('readout');
const emptyState = document.getElementById('emptyState');
const statusLine = document.getElementById('statusLine');

const weatherCodeMap = {
  0:['Clear sky','☀'], 1:['Mainly clear','🌤'], 2:['Partly cloudy','⛅'], 3:['Overcast','☁'],
  45:['Fog','🌫'], 48:['Rime fog','🌫'],
  51:['Light drizzle','🌦'], 53:['Drizzle','🌦'], 55:['Dense drizzle','🌦'],
  56:['Freezing drizzle','🌦'], 57:['Freezing drizzle','🌦'],
  61:['Slight rain','🌧'], 63:['Rain','🌧'], 65:['Heavy rain','🌧'],
  66:['Freezing rain','🌧'], 67:['Freezing rain','🌧'],
  71:['Slight snow','🌨'], 73:['Snow','🌨'], 75:['Heavy snow','🌨'], 77:['Snow grains','🌨'],
  80:['Rain showers','🌦'], 81:['Rain showers','🌦'], 82:['Violent showers','⛈'],
  85:['Snow showers','🌨'], 86:['Heavy snow showers','🌨'],
  95:['Thunderstorm','⛈'], 96:['Thunderstorm, hail','⛈'], 99:['Severe thunderstorm','⛈']
};

function codeInfo(code){ return weatherCodeMap[code] || ['Unknown', '—']; }

function showState(state){
  emptyState.style.display = state === 'empty' ? 'block' : 'none';
  loading.style.display = state === 'loading' ? 'block' : 'none';
  errorBox.style.display = state === 'error' ? 'block' : 'none';
  readout.style.display = state === 'ready' ? 'block' : 'none';
}

async function geocodeCity(city){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('GEOCODING REQUEST FAILED');
  const data = await res.json();
  if (!data.results || data.results.length === 0) throw new Error(`STATION "${city.toUpperCase()}" NOT FOUND`);
  const { latitude, longitude, name, country, admin1, timezone } = data.results[0];
  const label = [name, admin1, country].filter(Boolean).join(', ');
  return { latitude, longitude, label, timezone };
}

async function fetchWeather(latitude, longitude){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('WEATHER REQUEST FAILED');
  const data = await res.json();
  if (!data.current) throw new Error('NO DATA FOR THIS STATION');
  return data;
}

function setDial(temp){
  // map -20..45 C onto 0..1 for arc fill and needle rotation
  const min = -20, max = 45;
  const pct = Math.min(1, Math.max(0, (temp - min) / (max - min)));
  const arcLen = 2 * Math.PI * 76 * (260/360); // approx visible arc length
  document.getElementById('dialFill').setAttribute('stroke-dasharray', `${arcLen*pct} 400`);
  const angle = -130 + pct * 260; // needle sweep
  document.getElementById('dialNeedle').style.transform = `rotate(${angle}deg)`;
}

function renderHourly(hourly, tz){
  const now = new Date();
  const scroll = document.getElementById('hourlyScroll');
  scroll.innerHTML = '';
  let startIdx = hourly.time.findIndex(t => new Date(t) >= now);
  if (startIdx < 0) startIdx = 0;
  for (let i = startIdx; i < startIdx + 24 && i < hourly.time.length; i++){
    const d = new Date(hourly.time[i]);
    const hr = d.toLocaleTimeString('en-US', { hour:'numeric', hour12:true });
    const [, icon] = codeInfo(hourly.weather_code[i]);
    const el = document.createElement('div');
    el.className = 'hour-card';
    el.innerHTML = `<div class="hr">${hr}</div><div class="ic">${icon}</div><div class="t">${Math.round(hourly.temperature_2m[i])}°</div>`;
    scroll.appendChild(el);
  }
}

function renderDaily(daily){
  const list = document.getElementById('dailyList');
  list.innerHTML = '';
  const allTemps = [...daily.temperature_2m_min, ...daily.temperature_2m_max];
  const globalMin = Math.min(...allTemps), globalMax = Math.max(...allTemps);
  daily.time.forEach((t, i) => {
    const d = new Date(t);
    const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday:'short' });
    const [, icon] = codeInfo(daily.weather_code[i]);
    const lo = daily.temperature_2m_min[i], hi = daily.temperature_2m_max[i];
    const leftPct = ((lo - globalMin) / (globalMax - globalMin || 1)) * 100;
    const widthPct = ((hi - lo) / (globalMax - globalMin || 1)) * 100;
    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <div class="d">${label}</div>
      <div class="ic">${icon}</div>
      <div class="day-bar-track"><div class="day-bar-fill" style="left:${leftPct}%;width:${widthPct}%;"></div></div>
      <div class="range"><span class="lo">${Math.round(lo)}°</span> / ${Math.round(hi)}°</div>
    `;
    list.appendChild(row);
  });
}

function renderSun(daily, tz){
  const sunrise = new Date(daily.sunrise[0]);
  const sunset = new Date(daily.sunset[0]);
  document.getElementById('sunrise').textContent = sunrise.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  document.getElementById('sunset').textContent = sunset.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });

  const now = new Date();
  const total = sunset - sunrise;
  const elapsed = now - sunrise;
  const pct = Math.min(1, Math.max(0, elapsed / total));
  // Move dot along the quadratic arc path approximately
  const x = 10 + pct * 280;
  const y = 80 - Math.sin(pct * Math.PI) * 90;
  const dot = document.getElementById('sunDot');
  dot.setAttribute('cx', x);
  dot.setAttribute('cy', Math.max(0, y));
  document.getElementById('daylightMeta').textContent = pct >= 0 && pct <= 1 && now >= sunrise && now <= sunset ? 'DAYLIGHT' : 'NIGHT';
}

function compassArrow(deg){
  return `<span style="display:inline-block;transform:rotate(${deg}deg);">↑</span>`;
}

async function handleSearch(){
  const city = cityInput.value.trim();
  if (!city){
    statusLine.textContent = 'ENTER A CITY NAME TO CONTINUE';
    return;
  }
  statusLine.textContent = '';
  showState('loading');

  try{
    const { latitude, longitude, label, timezone } = await geocodeCity(city);
    const data = await fetchWeather(latitude, longitude);
    const cur = data.current;

    document.getElementById('cityName').textContent = label;
    document.getElementById('localTime').textContent = new Date(cur.time).toLocaleString('en-US', { weekday:'long', hour:'numeric', minute:'2-digit' }) + ` · ${timezone}`;
    const [desc] = codeInfo(cur.weather_code);
    document.getElementById('description').textContent = desc;
    document.getElementById('temp').textContent = Math.round(cur.temperature_2m);
    document.getElementById('feelsLike').textContent = `${Math.round(cur.apparent_temperature)}°`;
    document.getElementById('humidity').textContent = `${Math.round(cur.relative_humidity_2m)}%`;
    document.getElementById('wind').textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
    document.getElementById('windArrow').innerHTML = compassArrow(cur.wind_direction_10m);
    document.getElementById('pressure').textContent = `${Math.round(cur.surface_pressure)} hPa`;
    document.getElementById('coordsFooter').textContent = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;

    setDial(cur.temperature_2m);
    renderHourly(data.hourly, timezone);
    renderDaily(data.daily);
    renderSun(data.daily, timezone);

    showState('ready');
  } catch(err){
    errorText.textContent = err.message || 'SOMETHING WENT WRONG';
    showState('error');
  }
}

searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });

showState('empty');