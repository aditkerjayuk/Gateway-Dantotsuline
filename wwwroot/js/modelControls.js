import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { MODELS, registry } from './modelLoader.js';

const DEG = Math.PI / 180;
const FIELDS = [['position', 'Posisi', 0.1], ['rotation', 'Rotasi (°)', 0.1], ['scale', 'Skala', 0.01]];
const r6 = n => Math.round(n * 1e6) / 1e6;
const fmt = v => `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
const hex = c => '#' + c.toString(16).padStart(6, '0');

// Semua transformasi diterapkan ke root.group (parent) model, bukan ke node di dalam GLB.
// Catatan: rotasi/skala berpusat di origin dunia (0,0,0), karena posisi asli GLB dipertahankan.
// Panel bisa ditambah/dihapus saat berjalan (addKey / removeKey) untuk box smart device.
export function createModelControls({ scene, camera, renderer, orbit, invalidate, onChange, onActive, onLoadFile, onDevice, keys = Object.keys(MODELS) }) {
  const ui = {}, state = {}, helpers = {};
  const keyList = [...keys];
  const host = document.getElementById('model-panels');
  let active = keyList[0], gizmoOn = true, gizmoDragged = false;

  const tc = new TransformControls(camera, renderer.domElement);
  tc.addEventListener('change', invalidate);
  tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (e.value) gizmoDragged = true; });
  tc.addEventListener('objectChange', () => { sync(active); changed(active); });
  scene.add(tc);

  function buildPanel(key) {
    const m = registry[key];
    const sec = document.createElement('section');
    sec.className = 'panel' + (m.device ? ' device' : '');
    sec.style.setProperty('--tone', hex(m.color));
    sec.innerHTML = `
      <h2><span>${m.label}</span><span class="status" data-r="status">menunggu</span></h2>
      ${m.device ? `
      <div class="devrow">
        <label>Status
          <select data-r="state">
            <option value="default">Default</option>
            <option value="active">Aktif (hijau)</option>
            <option value="inactive">Tidak aktif (merah)</option>
          </select>
        </label>
        <button data-r="clone" title="Duplikat box ini">Clone</button>
        <button data-r="delete" class="danger" title="Hapus box ini">Hapus</button>
      </div>` : ''}
      <div class="checks">
        <label><input type="checkbox" data-r="visible" checked> Tampilkan</label>
        <label><input type="checkbox" data-r="wireframe"> Wireframe</label>
        <label><input type="checkbox" data-r="bbox"> Bounding box</label>
      </div>
      <table class="vec">
        <thead><tr><td></td><td>X</td><td>Y</td><td>Z</td></tr></thead>
        <tbody>${FIELDS.map(([f, l, s]) => `<tr><th>${l}</th>${[0, 1, 2].map(i =>
          `<td><input type="number" step="${s}" data-f="${f}" data-i="${i}" aria-label="${l} ${'XYZ'[i]}"></td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <dl class="info" data-r="info"></dl>
      ${m.device ? '<dl class="info" data-r="gateway-info"></dl>' : ''}
      <div class="btns">
        <button data-r="reset" title="Kembalikan posisi, rotasi, dan skala tambahan ke nilai netral">Reset adjustment</button>
        <label class="btn">Muat GLB lain<input type="file" accept=".glb" data-r="file" hidden></label>
      </div>`;
    host.appendChild(sec);
    if (!m.file) sec.querySelector('label.btn')?.remove();   // objek non-GLB (box) tanpa tombol muat file
    ui[key] = { sec, q: s => sec.querySelector(s), inputs: [...sec.querySelectorAll('input[data-f]')] };
    state[key] = { bbox: false, wireframe: false };
    helpers[key] = new THREE.Box3Helper(new THREE.Box3(), m.color);
    helpers[key].visible = false;
    scene.add(helpers[key]);

    if (m.device) {
      const st = ui[key].q('[data-r=status]'); st.textContent = 'siap'; st.className = 'status ok';
      const sel = ui[key].q('[data-r=state]'); sel.value = m.state;
      sel.onchange = () => onDevice?.(key, 'state', sel.value);
      ui[key].q('[data-r=clone]').onclick = () => onDevice?.(key, 'clone');
      ui[key].q('[data-r=delete]').onclick = () => onDevice?.(key, 'delete');
    }

    sec.addEventListener('input', e => { if (e.target.dataset.f) { applyInputs(key); changed(key); } });
    sec.addEventListener('change', e => {
      const t = e.target, r = t.dataset.r;
      if (r === 'visible') { registry[key].root.visible = t.checked; changed(key); }
      else if (r === 'wireframe') { state[key].wireframe = t.checked; applyWire(key); }
      else if (r === 'bbox') { state[key].bbox = t.checked; refreshInfo(key); }
      else if (r === 'file' && t.files[0]) { const f = t.files[0]; t.value = ''; onLoadFile?.(key, f); }
    });
    sec.addEventListener('focusin', () => setActive(key));
    sec.addEventListener('click', () => setActive(key));
    ui[key].q('[data-r=reset]').onclick = () => resetNeutral(key);
  }

  for (const key of keyList) buildPanel(key);

  function setT(key, c) {
    const r = registry[key].root;
    r.position.fromArray(c.position);
    r.rotation.set(c.rotation[0] * DEG, c.rotation[1] * DEG, c.rotation[2] * DEG, 'XYZ');
    r.scale.fromArray(c.scale);
  }

  function readOne(key) {
    const r = registry[key].root;
    return {
      position: r.position.toArray().map(r6),
      rotation: [r.rotation.x / DEG, r.rotation.y / DEG, r.rotation.z / DEG].map(r6),
      scale: r.scale.toArray().map(r6),
      visible: r.visible,
      wireframe: state[key].wireframe,
    };
  }

  function applyInputs(key) {
    const v = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    let ok = true;
    for (const i of ui[key].inputs) {
      const n = i.valueAsNumber;
      const bad = !Number.isFinite(n) || (i.dataset.f === 'scale' && n === 0);
      i.classList.toggle('invalid', bad);
      if (bad) ok = false; else v[i.dataset.f][i.dataset.i] = n;
    }
    if (ok) setT(key, v);
  }

  function sync(key) {
    if (!ui[key]) return;
    const r = registry[key].root;
    const vals = { position: r.position.toArray(), rotation: [r.rotation.x / DEG, r.rotation.y / DEG, r.rotation.z / DEG], scale: r.scale.toArray() };
    for (const i of ui[key].inputs) {
      if (i === document.activeElement) continue;
      i.value = r6(vals[i.dataset.f][i.dataset.i]);
      i.classList.remove('invalid');
    }
  }

  function changed(key) { refreshInfo(key); onChange?.(key); }

  function refreshInfo(key) {
    if (!ui[key]) return;
    const e = registry[key], dl = ui[key].q('[data-r=info]'), h = helpers[key];
    if (!e.original) { dl.innerHTML = '<dt>Bounding box</dt><dd>belum dimuat</dd>'; h.visible = false; invalidate(); return; }
    e.root.updateMatrix();
    const cur = e.original.clone().applyMatrix4(e.root.matrix), V = THREE.Vector3;
    dl.innerHTML = `
      <dt>Ukuran asli</dt><dd>${fmt(e.original.getSize(new V()))}</dd>
      <dt>Min asli</dt><dd>${fmt(e.original.min)}</dd>
      <dt>Maks asli</dt><dd>${fmt(e.original.max)}</dd>
      <dt>Ukuran kini</dt><dd>${fmt(cur.getSize(new V()))}</dd>
      <dt>Pusat kini</dt><dd>${fmt(cur.getCenter(new V()))}</dd>`;
    h.box.copy(cur);
    h.visible = state[key].bbox && e.root.visible;
    invalidate();
  }

  function applyWire(key) {
    if (!ui[key]) return;
    const on = state[key].wireframe;
    const target = registry[key].content || registry[key].root;   // objek non-GLB: pakai root
    target.traverse(o => {
      if (o.isMesh) for (const m of [].concat(o.material)) if (m && 'wireframe' in m) m.wireframe = on;
    });
    invalidate();
  }

  function applyOne(key, c) {
    if (!c || !ui[key]) return;
    const e = registry[key];
    setT(key, c);
    if (c.visible !== undefined) { e.root.visible = c.visible; ui[key].q('[data-r=visible]').checked = c.visible; }
    if (c.wireframe !== undefined) { state[key].wireframe = c.wireframe; ui[key].q('[data-r=wireframe]').checked = c.wireframe; applyWire(key); }
    sync(key); changed(key);
  }

  function resetNeutral(key) {
    if (!ui[key]) return;
    // Netral = posisi default (objek non-GLB seperti box menyimpan neutral sendiri).
    setT(key, registry[key].neutral || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    sync(key); changed(key);
  }

  function setActive(key) {
    if (!ui[key]) return;
    active = key;
    for (const k of keyList) ui[k].sec.classList.toggle('active', k === key);
    if (gizmoOn) tc.attach(registry[key].root);
    ui[key].sec.scrollIntoView?.({ block: 'nearest' });
    onActive?.(key);
    invalidate();
  }

  // ---------- Panel dinamis (box smart device) ----------
  function addKey(key) {
    buildPanel(key);
    keyList.push(key);
    sync(key); refreshInfo(key);
  }

  function removeKey(key) {
    const i = keyList.indexOf(key);
    if (i < 0) return;
    const wasActive = active === key;
    if (wasActive) tc.detach();
    ui[key].sec.remove();
    scene.remove(helpers[key]); helpers[key].dispose?.();
    delete ui[key]; delete state[key]; delete helpers[key];
    keyList.splice(i, 1);
    if (wasActive) setActive(keyList[Math.min(i, keyList.length - 1)] ?? keyList[0]);
    invalidate();
  }

  // Baca ulang label/warna/status dari registry (dipakai saat status box berubah).
  function refreshMeta(key) {
    if (!ui[key]) return;
    const m = registry[key], u = ui[key];
    u.q('h2 span').textContent = m.label;
    u.sec.style.setProperty('--tone', hex(m.color));
    helpers[key].material.color.setHex(m.color);
    const sel = u.q('[data-r=state]'); if (sel) sel.value = m.state;
    invalidate();
  }

  setActive(keyList[0]);
  for (const k of keyList) { sync(k); refreshInfo(k); }

  return {
    keys: keyList, setActive, getActive: () => active,
    setMode: mode => { tc.setMode(mode); invalidate(); },
    setGizmo: on => { gizmoOn = on; if (on) tc.attach(registry[active].root); else tc.detach(); invalidate(); },
    applyOne, readOne, resetOne: resetNeutral,
    addKey, removeKey, refreshMeta,
    // applyAll/readAll hanya untuk model GLB; box smart device lewat deviceManager.
    applyAll: cfg => { for (const k of keyList) if (!registry[k].device) applyOne(k, cfg.models?.[k]); },
    readAll: () => ({ version: 2, models: Object.fromEntries(keyList.filter(k => !registry[k].device).map(k => [k, readOne(k)])) }),
    setStatus: (key, text, cls = '') => { const s = ui[key]?.q('[data-r=status]'); if (s) { s.textContent = text; s.className = 'status ' + cls; } },
    setGatewayData: (key, data) => {
      if (!ui[key] || !registry[key]?.device) return;
      const dl = ui[key].q('[data-r=gateway-info]');
      dl.replaceChildren();
      for (const [label, value] of [
        ['Nama API', data.name],
        ['IP', data.ipAddress],
        ['Topic', data.topic],
        ['Status API', data.status],
        ['Update API', data.updatedAt],
      ]) {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value || '-';
        dl.append(dt, dd);
      }
      if (data.name) ui[key].q('h2 span').textContent = `${data.name} (${registry[key].id})`;
    },
    refreshAfterLoad: key => { applyWire(key); sync(key); refreshInfo(key); },
    // true sekali kalau gesture terakhir di viewport adalah drag gizmo (buat click-picker).
    consumeDrag: () => { const d = gizmoDragged; gizmoDragged = false; return d; },
  };
}