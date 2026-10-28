import * as THREE from 'three';
import { createScene } from './scene.js';
import { MODELS, registry, createEntries, loadModel, loadModelFromFile, getBoxes } from './modelLoader.js';
import { createModelControls } from './modelControls.js';
import { neutralConfig, mergeConfig, validateConfig, fetchConfig, readConfigFile, downloadConfig, saveSession, loadSession, clearSession } from './configManager.js';
import { createDeviceManager } from './deviceManager.js';

const $ = id => document.getElementById(id);
const modelKeys = Object.keys(MODELS);              // hanya model GLB yang dimuat dari file
const params = new URLSearchParams(location.search);

const view = createScene($('viewport'), { logDepth: params.has('logdepth') });
createEntries(view.scene);

let initial = neutralConfig(modelKeys);
let autosave = true;
let dm;                                             // dibuat setelah mc (saling membutuhkan)

function notify(text, kind = 'info') {
  const p = document.createElement('p');
  p.className = kind; p.textContent = text;
  $('messages').prepend(p);
  while ($('messages').children.length > 6) $('messages').lastChild.remove();
}

function gatewayDeviceId(gateway) {
  const topic = String(gateway.TOPIC ?? gateway.topic ?? '').trim();
  const topicId = topic.split('/').pop()?.match(/^GW0*(\d+)$/i)?.[1];
  const apiId = topicId ?? String(gateway.ID ?? gateway.id ?? '').match(/^\d+$/)?.[0];
  return apiId ? `GW-${apiId.padStart(3, '0')}` : null;
}

let gatewaySyncInProgress = false;
async function syncGatewaysWith3D() {
  if (gatewaySyncInProgress) return;
  gatewaySyncInProgress = true;
  try {
    const response = await fetch('/Gateway/GetGatewayJson', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Gateway request failed (${response.status})`);
    const gateways = await response.json();
    if (!Array.isArray(gateways)) throw new Error('Gateway response is not a list');

    gateways.forEach(gateway => {
      const id = gatewayDeviceId(gateway);
      const key = id && `dev_${id}`;
      const entry = key && registry[key];
      if (!entry?.device) {
        console.warn(`Tidak ada box smart device untuk gateway ${id ?? gateway.TOPIC ?? gateway.ID ?? '(tanpa ID)'}.`);
        return;
      }

      const status = String(gateway.STATUS ?? gateway.status ?? '').trim().toUpperCase();
      const state = status === 'ONLINE' ? 'active' : status === 'OFFLINE' ? 'inactive' : null;
      if (!state) {
        console.warn(`Status API tidak dikenal untuk ${id}: ${status || '(kosong)'}.`);
        return;
      }

      const data = {
        id: gateway.ID ?? gateway.id,
        name: gateway.NAME ?? gateway.name ?? '',
        ipAddress: gateway.IP_ADDRESS ?? gateway.ipAddress ?? '',
        topic: gateway.TOPIC ?? gateway.topic ?? '',
        status,
        updatedAt: gateway.UPDATED_AT ?? gateway.updatedAt ?? '',
      };
      entry.root.userData.gateway = data;
      dm.setState(key, state, { persist: false });
      mc.setStatus(key, status, status === 'ONLINE' ? 'ok' : 'fail');
      mc.setGatewayData(key, data);
    });
  } catch (error) {
    console.error('Gagal mengambil data gateway:', error);
  } finally {
    gatewaySyncInProgress = false;
  }
}

// Konfigurasi lengkap = penyesuaian model GLB + semua box smart device (tata letak tersimpan di JSON).
const buildConfig = () => ({ ...mc.readAll(), devices: dm.serialize() });
function persist() { if (autosave) saveSession(buildConfig()); }

function refreshSelect() {
  $('active-model').innerHTML = mc.keys.map(k => `<option value="${k}">${registry[k].label}</option>`).join('');
  $('active-model').value = mc.getActive();
}

const mc = createModelControls({
  keys: modelKeys,
  scene: view.scene, camera: view.camera, renderer: view.renderer, orbit: view.controls,
  invalidate: view.invalidate,
  onChange: () => { updateAlign(); persist(); },
  onActive: key => { $('active-model').value = key; },
  onLoadFile: async (key, file) => { $('loading').hidden = false; await load(key, file, true); $('loading').hidden = true; updateAlign(); },
  onDevice: (key, action, value) => {
    if (action === 'state') dm.setState(key, value);
    else if (action === 'clone') dm.clone(key);
    else if (action === 'delete') dm.remove(key);
  },
});

dm = createDeviceManager({
  scene: view.scene, mc, invalidate: view.invalidate,
  onChange: () => { refreshSelect(); persist(); },
});

// ---------- Pemuatan model ----------
function setLoad(key, pct, text, st = '') {
  const row = document.querySelector(`[data-load="${key}"]`);
  row.querySelector('progress').value = pct;
  row.querySelector('em').textContent = text;
  row.dataset.state = st;
}

async function load(key, src, isFile = false) {
  setLoad(key, 0, 'memuat…'); mc.setStatus(key, 'memuat', 'busy');
  const mb = n => (n / 1048576).toFixed(1);
  const onP = (l, t) => setLoad(key, t ? (l / t) * 100 : 0, t ? `${mb(l)} / ${mb(t)} MB` : `${mb(l)} MB`);
  try {
    await (isFile ? loadModelFromFile(key, src, onP) : loadModel(key, src, onP));
    setLoad(key, 100, 'selesai', 'ok'); mc.setStatus(key, 'dimuat', 'ok'); mc.refreshAfterLoad(key);
    return true;
  } catch (err) {
    setLoad(key, 0, 'gagal', 'fail'); mc.setStatus(key, 'gagal', 'fail');
    notify(`${MODELS[key].label}: ${err.message}. Periksa ${MODELS[key].file} dan buka halaman lewat http://localhost, bukan file://.`, 'error');
    return false;
  }
}

// ---------- Pemeriksaan keselarasan ----------
function updateAlign() {
  const b = getBoxes(), el = $('align');
  if (!b.factoryBase || !b.machinery) return;
  const a = b.factoryBase.current, m = b.machinery.current, V = THREE.Vector3;
  const sa = a.getSize(new V()), sm = m.getSize(new V());
  const d = m.getCenter(new V()).sub(a.getCenter(new V()));
  const axes = ['x', 'y', 'z'];
  const inside = ['x', 'z'].every(k => m.min[k] >= a.min[k] && m.max[k] <= a.max[k]);
  const overlap = axes.every(k => m.min[k] <= a.max[k] && m.max[k] >= a.min[k]);
  const ratio = axes.map(k => sm[k] / sa[k]);
  const extreme = ratio.some(r => !Number.isFinite(r) || r > 100 || r < 0.01);
  const f = n => n.toFixed(3);
  el.innerHTML = `
    <dt>Footprint</dt><dd>${inside ? 'Mesin di dalam footprint pabrik (X, Z)' : overlap ? 'Sebagian mesin di luar footprint pabrik' : 'Tidak ada irisan dengan model dasar'}</dd>
    <dt>Selisih pusat</dt><dd>${f(d.x)}, ${f(d.y)}, ${f(d.z)} (mesin − base)</dd>
    <dt>Mesin min Y</dt><dd>${f(m.min.y - a.min.y)} di atas dasar base</dd>
    <dt>Rasio ukuran</dt><dd class="${extreme ? 'warn' : ''}">${ratio.map(r => r.toFixed(3)).join(', ')}${extreme ? ' — rasio ekstrem, kemungkinan beda satuan (mis. m vs mm)' : ''}</dd>
    <dt>Catatan</dt><dd>Berdasarkan bounding box sejajar sumbu; hanya indikasi awal.</dd>`;
}

// ---------- Kamera ----------
function fit(saveHome = false) {
  const box = getFitBox();
  if (!view.fitCamera(box, { saveHome })) notify('Tidak ada model terlihat untuk di-fit.');
  syncClip();
}
function getFitBox() {
  const box = new THREE.Box3();
  for (const [k, v] of Object.entries(getBoxes())) if (registry[k].root.visible) box.union(v.current);
  return box;
}
// Tombol F: kamera mendekat ke objek aktif (mis. satu box kecil di tengah pabrik besar).
function focusActive() {
  const b = getBoxes()[mc.getActive()];
  if (b && view.focusOn(b.current)) syncClip();
}
function syncClip() { $('near').value = +view.camera.near.toPrecision(4); $('far').value = +view.camera.far.toPrecision(4); }

// ---------- UI ----------
refreshSelect();
$('active-model').onchange = e => mc.setActive(e.target.value);
$('reset-active').onclick = () => {
  const k = mc.getActive();
  registry[k].device ? mc.resetOne(k) : mc.applyOne(k, initial.models[k]);
};
$('reset-all').onclick = () => {
  mc.applyAll(initial);
  initial.devices ? dm.replaceAll(initial.devices) : dm.resetAll();
};

function setMode(mode) {
  mc.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}
document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
$('gizmo').onchange = e => mc.setGizmo(e.target.checked);
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && placing) { setPlacing(false); return; }
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
  if (e.key.toLowerCase() === 'f') { focusActive(); return; }
  const mode = { w: 'translate', e: 'rotate', r: 'scale' }[e.key.toLowerCase()];
  if (mode) setMode(mode);
});

$('fit').onclick = () => fit();
$('focus-active').onclick = focusActive;
$('reset-cam').onclick = () => { view.resetCamera(); syncClip(); };
$('grid').onchange = e => view.setGrid(e.target.checked);
$('axes').onchange = e => view.setAxes(e.target.checked);
$('bg').onchange = e => view.setBackground(e.target.value);

$('export').onclick = () => downloadConfig(buildConfig());
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const r = await readConfigFile(file, modelKeys);
    if (!r.ok) return notify(`Impor gagal: ${r.errors.join(' ')}`, 'error');
    mc.applyAll(r.value);
    if (r.value.devices) dm.replaceAll(r.value.devices);
    notify(`Konfigurasi diimpor (${Object.keys(r.value.models).join(', ') || 'tanpa model'}${r.value.devices ? `; ${r.value.devices.length} box` : ''}).`);
  } catch (err) { notify(err.message, 'error'); }
};

$('autosave').onchange = e => { autosave = e.target.checked; autosave ? persist() : clearSession(); };
$('logdepth').checked = params.has('logdepth');
$('logdepth').onchange = e => { e.target.checked ? params.set('logdepth', '1') : params.delete('logdepth'); location.search = params.toString(); };
const applyClip = () => { if (!view.setClip(+$('near').value, +$('far').value)) notify('Near harus > 0 dan lebih kecil dari Far.', 'error'); };
$('near').onchange = applyClip; $('far').onchange = applyClip;

view.onFrame(() => {
  const i = view.renderer.info;
  $('stats').textContent = `Draw calls ${i.render.calls} | Segitiga ${i.render.triangles.toLocaleString()} | Geometri ${i.memory.geometries} | Tekstur ${i.memory.textures}`;
  const debug = view.getFitDebug(getFitBox());
  $('camera-fit-debug').textContent = JSON.stringify(debug, null, 2);
});
$('copy-camera-fit-debug').onclick = async () => {
  const debug = view.getFitDebug(getFitBox());
  if (!debug) return notify('Model belum tersedia untuk membaca nilai fit kamera.', 'error');
  try {
    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    notify('Semua nilai fit kamera disalin. Tempelkan nilainya di chat.');
  } catch (error) {
    console.error('Gagal menyalin nilai fit kamera:', error);
    notify(`Gagal menyalin nilai fit kamera: ${error.message}`, 'error');
  }
};

// ---------- Penempatan box smart device ----------
// Skala box dihitung dari footprint factory base (sama seperti sebelumnya: min(w,d) * 0.08 / 1.2).
function factoryMetrics() {
  const g = getBoxes().factoryBase;
  if (!g) return null;
  const a = g.original, w = a.max.x - a.min.x, d = a.max.z - a.min.z;
  const s = Math.min(w, d) * 0.08 / 1.2;
  return Number.isFinite(s) && s > 0 ? { a, s, m: Math.min(w, d) } : null;
}

// Box pertama (hanya kalau belum ada tata letak tersimpan): di tepi kanan footprint base.
function seedDevice() {
  const f = factoryMetrics(), ob = dm.originalBox;
  const s = f?.s ?? 1, bw = ob.max.x - ob.min.x;
  const position = f
    ? [f.a.max.x + (bw / 2) * s + f.m * 0.03, f.a.min.y - ob.min.y * s, (f.a.min.z + f.a.max.z) / 2]
    : [0, 0, 0];
  dm.add({ id: 'GW-001', state: 'default', transform: { position, rotation: [0, 0, 0], scale: [s, s, s] }, activate: true });
}

// Mode "tempatkan": klik lantai pabrik di viewport -> box baru muncul di titik itu.
let placing = false;
function setPlacing(on) {
  placing = on;
  $('place-box').setAttribute('aria-pressed', String(on));
  view.renderer.domElement.style.cursor = on ? 'crosshair' : '';
}
$('place-box').onclick = () => {
  setPlacing(!placing);
  if (placing) notify('Klik permukaan datar (lantai) di viewport untuk menaruh box. Esc untuk batal.');
};
$('clone-box').onclick = () => {
  const k = mc.getActive();
  registry[k]?.device ? dm.clone(k) : notify('Pilih sebuah box dulu (klik box di viewport atau pilih di "Model aktif").', 'error');
};

// ---------- Pemilihan objek dengan klik di viewport ----------
// Klik objek (tanpa geser) -> panel & gizmo pindah ke objek itu, tinggal drag.
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downPt = null;
view.renderer.domElement.addEventListener('pointerdown', e => { downPt = { x: e.clientX, y: e.clientY }; });
view.renderer.domElement.addEventListener('pointerup', e => {
  if (!downPt) return;
  const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
  downPt = null;
  if (moved > 5 || mc.consumeDrag()) return;   // skip kalau sedang rotate kamera / drag gizmo
  const r = view.renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, view.camera);

  if (placing) {
    const roots = modelKeys.map(k => registry[k].root).filter(o => o.visible);
    const hit = ray.intersectObjects(roots, true).find(h => h.face);
    if (!hit) return notify('Klik tepat di permukaan model pabrik.', 'error');
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.y < 0.5) return notify('Klik permukaan datar yang menghadap atas (lantai / atap mesin).', 'error');
    dm.addAt(hit.point);
    setPlacing(false);
    return;
  }

  let best = null, bestDist = Infinity;
  for (const entry of Object.values(registry)) {
    if (!entry.root.visible) continue;
    const hit = ray.intersectObject(entry.root, true)[0];
    if (hit && hit.distance < bestDist) { bestDist = hit.distance; best = entry; }
  }
  if (best && best.key !== mc.getActive()) mc.setActive(best.key);
});

// ---------- Boot ----------
(async function boot() {
  // Baca sesi lebih dulu: perubahan awal di bawah akan menimpa sessionStorage.
  const savedSession = loadSession();

  try {
    const raw = await fetchConfig('config/assembly.json');
    if (raw) {
      const r = validateConfig(raw, modelKeys);
      if (r.ok) initial = mergeConfig(initial, r.value);
      else notify(`assembly.json tidak valid: ${r.errors.join(' ')} Memakai nilai netral.`, 'error');
    }
  } catch (err) { notify(err.message, 'error'); }
  mc.applyAll(initial);

  for (const key of modelKeys) await load(key, MODELS[key].file);   // berurutan agar memori terkendali
  $('loading').hidden = true;
  updateAlign();

  const f = factoryMetrics();
  if (f) dm.setDefaultScale(f.s);

  // Sesi tersimpan menimpa assembly.json; kalau dua-duanya tidak punya box, buat satu box awal.
  let sess = null;
  if (savedSession) {
    const r = validateConfig(savedSession, modelKeys);
    if (r.ok) sess = r.value;
  }
  const list = [...(sess?.devices ?? initial.devices ?? [])];
  const configuredIds = new Set(list.map(device => device.id));
  for (const device of initial.devices ?? []) {
    if (!configuredIds.has(device.id)) list.push(device);
  }
  if (list.length) dm.replaceAll(list); else seedDevice();
  if (sess) { mc.applyAll(sess); notify('Penyesuaian dari sesi sebelumnya dipulihkan. Reset semua mengembalikan ke assembly.json.'); }

  refreshSelect();
  persist();
  fit(true);
  void syncGatewaysWith3D();
  setInterval(syncGatewaysWith3D, 5000);
})();