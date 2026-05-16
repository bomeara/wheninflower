// Minimal app to query iNaturalist observations annotated with "Flowers"
// Controlled term id 12 = Flowers and Fruits; value id 13 = Flowers (from iNaturalist controlled_terms)

const term_id = 12; // Flowers and Fruits term
const term_value_id = 13; // Flowers value

const speciesInput = document.getElementById('speciesInput');
const speciesList = document.getElementById('speciesList');
const d1Input = document.getElementById('d1');
const d2Input = document.getElementById('d2');

// Phenology tab elements
const statusPhen = document.getElementById('statusPhen');
const buildPhenBtn = document.getElementById('buildPhenBtn');
const phenYearsSelect = document.getElementById('phenYears');
const dayStart = document.getElementById('dayStart');
const dayEnd = document.getElementById('dayEnd');
const chosenRange = document.getElementById('chosenRange');

// Tab controls
const tabButtons = document.querySelectorAll('.tabbtn');
const tabRecent = document.getElementById('tab-recent');
const tabPhen = document.getElementById('tab-phen');
const searchBtn = document.getElementById('searchBtn');
const statusEl = document.getElementById('status');

let map = L.map('map').setView([39, -98], 4);
// Use a dark basemap for better contrast with the dark UI
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);
let markersLayer = L.layerGroup().addTo(map);
let phenMarkersLayer = L.layerGroup().addTo(map);

function debounce(fn, wait){
  let t;
  return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

async function fetchTaxaSuggestions(q){
  const listEl = speciesList;
  if(!q || q.length < 2) return;
  try{
    const url = new URL('https://api.inaturalist.org/v1/taxa');
    url.searchParams.set('q', q);
    url.searchParams.set('per_page', '12');
    url.searchParams.set('rank', 'species');
    const resp = await fetch(url.toString());
    if(!resp.ok) return;
    const data = await resp.json();
    listEl.innerHTML = '';
    (data.results || []).forEach(t => {
      const opt = document.createElement('option');
      const sci = t.name || '';
      const common = t.preferred_common_name || '';
      opt.value = sci || common;
      opt.textContent = common ? `${common} (${sci})` : sci;
      listEl.appendChild(opt);
    });
  }catch(e){
    console.warn('taxa autocomplete error', e);
  }
}

const debouncedTaxa = debounce((q)=> fetchTaxaSuggestions(q), 300);

function setDefaultDates(){
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);
  d2Input.value = formatDate(today);
  d1Input.value = formatDate(twoWeeksAgo);
}

function initUI(){
  setDefaultDates();
  speciesInput.addEventListener('input', (e)=> debouncedTaxa(e.target.value));

  // tab switching
  tabButtons.forEach(btn => btn.addEventListener('click', ()=>{
    tabButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(btn.dataset.tab === 'recent'){
      tabRecent.style.display = '';
      tabPhen.style.display = 'none';
      // clear phen markers
      phenMarkersLayer.clearLayers();
    }else{
      tabRecent.style.display = 'none';
      tabPhen.style.display = '';
    }
  }));

  searchBtn.addEventListener('click', () => {
    const taxon = speciesInput.value && speciesInput.value.trim();
    if(!taxon){ alert('Please enter or select a species name'); return; }
    // validate dates
    const d1 = d1Input.value;
    const d2 = d2Input.value;
    if(!d1 || !d2){ alert('Please provide both start and end dates'); return; }
    if(d1 > d2){ alert('Start date must be before end date'); return; }
    fetchObservations(taxon);
  });

  // phenology build
  buildPhenBtn.addEventListener('click', ()=>{
    const taxon = speciesInput.value && speciesInput.value.trim();
    if(!taxon){ alert('Please enter or select a species name'); return; }
    fetchPhenologyData(taxon, parseInt(phenYearsSelect.value||10,10));
  });

  // play button removed — no action

  // range sliders for filtering displayed days (day-of-year)
  function onDayRangeChange(){
    let s = parseInt(dayStart.value,10);
    let e = parseInt(dayEnd.value,10);
    // allow wrapping by not forcing order; update chosen range text
    if(chosenRange) chosenRange.textContent = `Chosen range: ${dayToMonthDay(s)} to ${dayToMonthDay(e)}`;
    renderPhenologyAll(s,e);
  }
  dayStart.addEventListener('input', onDayRangeChange);
  dayEnd.addEventListener('input', onDayRangeChange);

  // Sliders are stacked; no bring-to-front needed
}

function formatDate(d){
  return d.toISOString().slice(0,10);
}

function formatTooltipDate(dateStr){
  const date = new Date(dateStr);
  if(isNaN(date)) return dateStr || '';
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

async function fetchObservations(taxonName){
  statusEl.textContent = 'Loading...';
  markersLayer.clearLayers();

  const d1 = d1Input.value;
  const d2 = d2Input.value;
  const params = new URLSearchParams({
    taxon_name: taxonName,
    term_id: String(term_id),
    term_value_id: String(term_value_id),
    d1: d1,
    d2: d2,
    per_page: '200',
    photos: 'true',
    geo: 'true'
  });

  const url = `https://api.inaturalist.org/v1/observations?${params.toString()}`;
  try{
    const resp = await fetch(url);
    if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const data = await resp.json();
    const results = data.results || [];
    statusEl.textContent = `${results.length} observations found`;

    if(results.length === 0) return;

    const bounds = [];
    results.forEach(obs => {
      if(!obs.geojson || !obs.geojson.coordinates) return;
      const coords = obs.geojson.coordinates; // [lng, lat]
      const lat = coords[1], lng = coords[0];
      bounds.push([lat,lng]);

      const tooltipDate = formatTooltipDate(obs.observed_on_string || obs.observed_on || '');
      const popupParts = [];
      popupParts.push(`<strong>${obs.taxon ? obs.taxon.preferred_common_name || obs.taxon.name : obs.species_guess}</strong>`);
      popupParts.push(`<div>${obs.observed_on_string || obs.time_observed_at || ''}</div>`);
      if(obs.photos && obs.photos.length){
        const thumb = obs.photos[0].url.replace('square','medium');
        popupParts.push(`<img src="${thumb}" style="max-width:180px;display:block;margin-top:6px">`);
      }
      popupParts.push(`<a href="${obs.uri}" target="_blank">View on iNaturalist</a>`);

      const marker = L.circleMarker([lat,lng], {radius:6, fillColor:'#ffcc00', color:'#ff8c00', weight:1, fillOpacity:0.95});
      marker.bindPopup(popupParts.join(''));
      marker.bindTooltip(tooltipDate, {direction:'top', offset:[0,-6]});
      marker.addTo(markersLayer);
    });

    if(bounds.length){
      map.fitBounds(bounds, {maxZoom:12});
    }

  }catch(err){
    console.error(err);
    statusEl.textContent = 'Error loading observations';
    alert('Error fetching observations: ' + err.message);
  }
}

// --- Phenology: fetch last N years of flowering observations for a species ---
function weekOfYear(date){
  // get ISO week number using UTC
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return weekNo; // 1..53
}

let phenologyByDay = {}; // day (1..366) -> array of {lat,lng,obs,week,day}
let isPlaying = false;
let playInterval = null;
let phenMarkersByDay = {}; // day -> array of marker objects
let highlightedDay = null;

async function fetchPhenologyData(taxonName, yearsBack=10){
  statusPhen.textContent = 'Building phenology: fetching observations...';
  phenMarkersLayer.clearLayers();
  phenologyByDay = {};
  phenMarkersByDay = {};
  highlightedDay = null;
  for(let d=1; d<=366; d++){ phenologyByDay[d]=[]; phenMarkersByDay[d]=[]; }

  const today = new Date();
  const startYear = today.getUTCFullYear() - yearsBack + 1;
  // We'll query by date range across years: d1 = startYear-01-01, d2 = today
  const d1 = `${startYear}-01-01`;
  const d2 = formatDate(today);

  const perPage = 200;
  let page = 1;
  let totalFetched = 0;
  const maxPages = 50; // safety cap (~10k records)
  try{
    while(page <= maxPages){
      statusPhen.textContent = `Fetching page ${page}...`;
      const params = new URLSearchParams({
        taxon_name: taxonName,
        term_id: String(term_id),
        term_value_id: String(term_value_id),
        d1: d1,
        d2: d2,
        per_page: String(perPage),
        page: String(page),
        geo: 'true'
      });
      const url = `https://api.inaturalist.org/v1/observations?${params.toString()}`;
      const resp = await fetch(url);
      if(!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      const results = data.results || [];
      if(results.length === 0) break;
      results.forEach(obs => {
        if(!obs.geojson || !obs.geojson.coordinates || !obs.observed_on) return;
        const coords = obs.geojson.coordinates; const lat=coords[1], lng=coords[0];
        const date = new Date(obs.observed_on);
        const wk = weekOfYear(date);
        // compute day-of-year mapped to reference leap-year 2000
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        const ref = new Date(Date.UTC(2000, month, day));
        const dayIndex = Math.floor((ref - new Date(Date.UTC(2000,0,1))) / 86400000) + 1; // 1..366
        phenologyByDay[dayIndex].push({lat,lng,obs,week:wk,day:dayIndex});
      });
      totalFetched += results.length;
      if(results.length < perPage) break;
      page++;
    }
    statusPhen.textContent = `Fetched ${totalFetched} observations. Points colored across the selected range.`;
    // update the chosen range text from current slider values
    const sVal = parseInt(dayStart.value,10);
    const eVal = parseInt(dayEnd.value,10);
    if(chosenRange) chosenRange.textContent = `Chosen range: ${dayToMonthDay(sVal)} to ${dayToMonthDay(eVal)}`;
    // render all points colored by position within the selected day range
    renderPhenologyAll(sVal, eVal);
  }catch(err){
    console.error(err);
    statusPhen.textContent = 'Error building phenology';
    alert('Error fetching phenology data: '+err.message);
  }
}

function lerp(a,b,t){ return a + (b-a) * t; }
function colorForDayInRange(day, startDay, endDay){
  const totalRange = ((endDay - startDay + 366) % 366) + 1;
  let offset;
  if(startDay <= endDay){
    offset = day - startDay;
  }else{
    offset = day >= startDay ? day - startDay : day + 366 - startDay;
  }
  if(offset < 0 || offset >= totalRange) offset = 0;
  const ratio = totalRange > 1 ? offset / (totalRange - 1) : 0;
  const r = Math.round(lerp(50, 220, ratio));
  const g = Math.round(lerp(120, 60, ratio));
  const b = Math.round(lerp(235, 75, ratio));
  return `rgb(${r},${g},${b})`;
}

function dayToMonthDay(day){
  const d = new Date(Date.UTC(2000,0,1 + (day-1)));
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function renderPhenologyAll(startDay=1,endDay=366){
  phenMarkersLayer.clearLayers();
  highlightedDay = null;
  // build list of days to include, supports wrap-around
  const days = [];
  if(startDay <= endDay){
    for(let d=startDay; d<=endDay; d++) days.push(d);
  }else{
    for(let d=startDay; d<=366; d++) days.push(d);
    for(let d=1; d<=endDay; d++) days.push(d);
  }
  const bounds = [];
  days.forEach(d => {
    const list = phenologyByDay[d] || [];
    phenMarkersByDay[d] = [];
    list.forEach(item=>{
      const col = colorForDayInRange(d, startDay, endDay);
      const tooltipDate = formatTooltipDate(item.obs.observed_on_string || item.obs.observed_on || '');
      const m = L.circleMarker([item.lat,item.lng], {radius:4, fillColor:col, color:col, weight:0.6, fillOpacity:0.35});
      m.bindPopup(`<strong>${dayToMonthDay(item.day)}</strong><div>${item.obs.observed_on_string||item.obs.observed_on||''}</div><a href="${item.obs.uri}" target="_blank">iNaturalist</a>`);
      m.bindTooltip(tooltipDate, {direction:'top', offset:[0,-6]});
      m.addTo(phenMarkersLayer);
      phenMarkersByDay[d].push(m);
      bounds.push([item.lat,item.lng]);
    });
  });
  if(bounds.length) map.fitBounds(bounds, {maxZoom:10});
}

// Play feature removed

initUI();
