const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = null;
let report = null;
let selectedTab = 'cockpit';
let autoReturnToResults = false;
let androidOnline = false;
let aaosActive = false;
let androidSize = {width:1024,height:768};
let toastTimer;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('visible'), 3000);
}

function tab(name) {
  selectedTab = name;
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `${name}-page`));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.tab === name));
  $('#page-title').innerHTML = name === 'cockpit' ? 'Cockpit <span>Overview</span>' : name === 'validation' ? 'Test <span>Validation</span>' : 'System <span>Telemetry</span>';
}

function time(value) {
  if (!value) return '--:--:--';
  return new Date(value).toLocaleTimeString('pt-BR', {hour12:false});
}

function renderState(s) {
  state = s;
  $('#speed-value').textContent = s.speed_kmh;
  $('#cluster-speed').textContent = s.speed_kmh;
  $('#speed-slider').value = s.speed_kmh;
  $('#speed-slider-value').textContent = `${s.speed_kmh} km/h`;
  $('#gear-value').textContent = s.gear;
  $('#cluster-gear').textContent = s.gear;
  $('#gear-text').textContent = s.gear === 'R' ? 'Reverse' : s.gear === 'D' ? 'Drive' : 'Park';
  $('#ignition-value').textContent = s.ignition ? 'ON' : 'OFF';
  $('#ignition-dot').classList.toggle('green', s.ignition);
  $('#door-value').textContent = s.door_open ? 'OPEN' : 'CLOSED';
  $('#cluster-door').textContent = s.door_open ? 'DRIVER DOOR OPEN' : 'DOORS CLOSED';
  $('#door-dot').classList.toggle('green', !s.door_open);
  $('#projection-value').textContent = s.projection;
  $('#projection-subtitle').textContent = s.phone_connected ? 'Connected and ready' : 'Connect a phone to continue';
  $('#projection-card').classList.toggle('offline', !s.phone_connected);
  for (const [id, active] of [['bt-status',s.bluetooth],['usb-status',s.usb_connected],['phone-status',s.phone_connected]]) {
    $(id.startsWith('#') ? id : `#${id}`).textContent = active ? 'ON' : 'OFF';
    $(`#${id}`).classList.toggle('off', !active);
  }
  $('#play-button').textContent = s.media_playing ? 'Ⅱ' : '▶';
  $('#play-button').dataset.event = s.media_playing ? 'pause' : 'play';
  $('#play-button').setAttribute('aria-label', s.media_playing ? 'Pausar' : 'Reproduzir');
  $('#progress-bar').style.width = s.media_playing ? '55%' : '39%';
  $('#phone-control').dataset.event = s.phone_connected ? 'phone_disconnect' : 'phone_connect';
  $('#phone-control').querySelector('strong').textContent = s.phone_connected ? 'Disconnect phone' : 'Connect phone';
  $('#fault-control').classList.toggle('active-fault', Boolean(s.fault));
  $('#event-list').innerHTML = s.events.slice(0,5).map(eventHtml).join('');
  $('#telemetry-events').innerHTML = s.events.map(eventHtml).join('');
  const signals = [
    ['VEHICLE',s.vehicle],['IGNITION',s.ignition?'ON':'OFF'],['SPEED',`${s.speed_kmh} km/h`],['GEAR',s.gear],
    ['DRIVER DOOR',s.door_open?'OPEN':'CLOSED'],['BLUETOOTH',s.bluetooth?'ON':'OFF'],['USB',s.usb_connected?'CONNECTED':'DISCONNECTED'],
    ['PHONE',s.phone_connected?'CONNECTED':'DISCONNECTED'],['PROJECTION',s.projection],['MEDIA',s.media_playing?'PLAYING':'STOPPED'],
    ['FAULT INJECTION',s.fault||'OFF'],['EVENT COUNT',s.events.length]
  ];
  $('#signal-list').innerHTML = signals.map(([label,value]) => `<div class="signal"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
}

function eventHtml(event) {
  return `<div class="event-item"><time>${esc(time(event.time))}</time><div><strong>${esc(event.source)}</strong><span>${esc(event.message)}</span></div></div>`;
}

function renderReport(r) {
  const previous = report?.status;
  report = r;
  const labels = {idle:'No run yet',running:'Validation in progress',passed:'All checks passed',failed:'Defect detected',error:'Execution error'};
  const descriptions = {idle:'Select a scenario and run the validation.',running:'Python is driving the simulated cockpit.',passed:'The observed state matched every expected value.',failed:'Open the failed step to inspect expected and actual state.',error:r.summary};
  const icon = {idle:'◇',running:'◌',passed:'✓',failed:'!',error:'!'};
  const banner = $('#run-banner');
  banner.className = `run-banner ${r.status}`;
  banner.innerHTML = `<span class="run-icon">${icon[r.status]||'◇'}</span><div><strong>${labels[r.status]||esc(r.status)}</strong><small>${esc(descriptions[r.status]||'')}</small></div>`;
  $('#test-steps').innerHTML = (r.steps||[]).map((step,index) => `<div class="step"><div><strong>${String(index+1).padStart(2,'0')} · ${esc(step.label)}</strong><small>Expected: ${esc(JSON.stringify(step.expected))}<br>Actual: ${esc(JSON.stringify(step.actual))}</small></div><b class="${esc(step.status)}">${step.status==='passed'?'PASS':'FAIL'}</b></div>`).join('');
  $('#result-summary').textContent = r.summary || (r.status === 'running' ? `${r.steps.length} steps completed` : 'Waiting for execution');
  $('#result-time').textContent = r.finished_at ? time(r.finished_at) : '—';
  $('#run-button').disabled = r.status === 'running';
  document.querySelectorAll('[data-event]').forEach((button) => { button.disabled = r.status === 'running'; });
  $('#speed-slider').disabled = r.status === 'running';
  if (autoReturnToResults && previous === 'running' && r.status !== 'running') {
    autoReturnToResults = false;
    tab('validation');
    toast(r.status === 'passed' ? 'Validation passed' : 'Validation found a defect');
  }
}

async function getJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function event(name, value) {
  try {
    renderState(await getJson('/api/events', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:name,value})}));
  } catch (error) { toast(error.message); }
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => tab(item.dataset.tab)));
document.querySelectorAll('[data-event]').forEach((item) => item.addEventListener('click', () => event(item.dataset.event)));
document.querySelectorAll('.scenario').forEach((item) => item.addEventListener('click', () => {
  document.querySelectorAll('.scenario').forEach((other) => other.classList.remove('selected'));
  item.classList.add('selected');
}));
let speedTimer;
$('#speed-slider').addEventListener('input', (e) => {
  $('#speed-slider-value').textContent = `${e.target.value} km/h`;
  clearTimeout(speedTimer);
  speedTimer = setTimeout(() => event('speed_set',Number(e.target.value)),180);
});
$('#run-button').addEventListener('click', async () => {
  try {
    const scenario = document.querySelector('input[name="scenario"]:checked').value;
    const inject_fault = $('#inject-fault').checked;
    renderReport(await getJson('/api/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,inject_fault})}));
    autoReturnToResults = true;
    tab('cockpit');
    toast('Python validation running · watch the cockpit');
  } catch (error) { toast(error.message); }
});
$('#android-mode').addEventListener('click', () => {
  if (!androidOnline) return;
  aaosActive = !aaosActive;
  $('.infotainment-panel').classList.toggle('aaos-active',aaosActive);
  $('#android-mode').classList.toggle('active',aaosActive);
  $('#android-mode').textContent = aaosActive ? 'AAOS LIVE · SWITCH TO DEMO' : 'AAOS READY · SHOW LIVE';
  if (aaosActive) $('#android-screen').src = `/api/android/screen?t=${Date.now()}`;
});
$('#android-screen').addEventListener('click', async (e) => {
  if (!aaosActive || !androidOnline) return;
  const image = e.currentTarget;
  const bounds = image.getBoundingClientRect();
  const imageRatio = androidSize.width / androidSize.height;
  const boxRatio = bounds.width / bounds.height;
  const contentWidth = boxRatio > imageRatio ? bounds.height * imageRatio : bounds.width;
  const contentHeight = boxRatio > imageRatio ? bounds.height : bounds.width / imageRatio;
  const left = bounds.left + (bounds.width-contentWidth)/2;
  const top = bounds.top + (bounds.height-contentHeight)/2;
  const x = Math.floor((e.clientX-left)/contentWidth*androidSize.width);
  const y = Math.floor((e.clientY-top)/contentHeight*androidSize.height);
  try { await getJson('/api/android/tap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x,y})}); }
  catch (error) { toast(error.message); }
});
async function refreshAndroid() {
  try {
    const status = await getJson('/api/android/status');
    androidOnline = status.online;
    androidSize = {width:status.width||1024,height:status.height||768};
    $('#android-mode').disabled = !androidOnline;
    if (!androidOnline) {
      aaosActive = false;
      $('.infotainment-panel').classList.remove('aaos-active');
      $('#android-mode').textContent = 'AAOS OFFLINE';
    } else if (!aaosActive) $('#android-mode').textContent = 'AAOS READY · SHOW LIVE';
  } catch { androidOnline = false; }
}
function updateClock() {
  const now = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false});
  $('#clock').textContent = now; $('#screen-clock').textContent = now;
}
async function refresh() {
  try {
    const [s,r] = await Promise.all([getJson('/api/state'),getJson('/api/report')]);
    renderState(s); renderReport(r);
  } catch { toast('Simulator unavailable. Run python3 server.py'); }
}
updateClock(); setInterval(updateClock,30000); refresh(); setInterval(refresh,450);
refreshAndroid(); setInterval(refreshAndroid,3000);
setInterval(() => { if (aaosActive && androidOnline) $('#android-screen').src = `/api/android/screen?t=${Date.now()}`; },1500);
