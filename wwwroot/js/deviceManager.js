import * as THREE from 'three';
import { registry } from './modelLoader.js';
import { createSmartDeviceBox } from './smartDeviceBox.js';
import { createDeviceBoxVariant } from './deviceBoxVariants.js';

export const STATES = {
  default:  { label: 'Default',             color: 0x9ca3af },
  active:   { label: 'Aktif (hijau)',       color: 0x22c55e },
  inactive: { label: 'Tidak aktif (merah)', color: 0xef4444 },
};

const keyOf = id => `dev_${id}`;
const pad = n => String(n).padStart(3, '0');

// Mengelola banyak box smart device: tambah, clone, hapus, ganti status, serialisasi ke JSON.
// Tiap box = root (grup penyesuaian yang digeser gizmo) + content (isi sesuai status).
export function createDeviceManager({ scene, mc, invalidate, onChange }) {
  // Template tidak ditaruh di scene. PointLight LED dibuang: jaraknya hanya 0.2 satuan dunia
  // (hampir tak terlihat) tapi setiap lampu menambah beban shader seluruh scene pabrik.
  const template = createSmartDeviceBox();
  const lights = []; template.traverse(o => { if (o.isLight) lights.push(o); });
  lights.forEach(l => l.parent.remove(l));
  template.updateMatrixWorld(true);
  const templateBox = new THREE.Box3().setFromObject(template);

  let defaultScale = 1;

  function buildContent(state) {
    const inst = template.clone(true);
    inst.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();                                         // material milik sendiri (wireframe per box)
      // transmission membuat three.js merender ulang SELURUH scene ke buffer tambahan tiap frame
      // selama kaca terlihat -> sangat berat untuk pabrik 7,6 juta segitiga. Kaca tetap bening via opacity.
      if (o.material.isMeshPhysicalMaterial) o.material.transmission = 0;
    });
    return state === 'default' ? inst : createDeviceBoxVariant(inst, state);
  }

  function disposeContent(content) {
    content.traverse(o => {
      if (!o.isMesh) return;
      if (o.name.startsWith('status_shell')) o.geometry.dispose();            // geometri selimut milik sendiri
      for (const m of [].concat(o.material)) m.dispose();                     // geometri lain dibagi, jangan dibuang
    });
  }

  const keys = () => Object.values(registry).filter(e => e.device).map(e => e.key);

  function nextId() {
    let max = 0;
    for (const e of Object.values(registry)) {
      const m = e.device && /^GW-(\d+)$/.exec(e.id);
      if (m) max = Math.max(max, +m[1]);
    }
    return `GW-${pad(max + 1)}`;
  }

  // transform: { position, rotation(°), scale, visible?, wireframe? }
  function add({ id, state = 'default', transform, activate = false }) {
    if (!id || registry[keyOf(id)]) id = nextId();
    const key = keyOf(id);
    const root = new THREE.Group();
    root.name = `${key}_adjustment_root`;
    const content = buildContent(state);
    root.add(content);
    scene.add(root);

    registry[key] = {
      key, id, state, device: true,
      label: `Gateway ${id}`, file: null, color: STATES[state].color,
      root, content, status: 'siap', error: null,
      original: templateBox.clone(),
      neutral: { position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] },
    };
    mc.addKey(key);
    mc.applyOne(key, transform);
    if (activate) mc.setActive(key);
    onChange?.();
    return key;
  }

  function remove(key) {
    const e = registry[key];
    if (!e?.device) return;
    mc.removeKey(key);
    scene.remove(e.root);
    disposeContent(e.content);
    delete registry[key];
    invalidate();
    onChange?.();
  }

  function setState(key, state, { persist = true } = {}) {
    const e = registry[key];
    if (!e?.device || !STATES[state] || e.state === state) return;
    e.root.remove(e.content);
    disposeContent(e.content);
    e.content = buildContent(state);
    e.root.add(e.content);
    e.state = state;
    e.color = STATES[state].color;
    mc.refreshMeta(key);
    mc.refreshAfterLoad(key);          // terapkan ulang wireframe ke material baru
    if (persist) onChange?.();
  }

  // Duplikat box: status & transformasi sama, digeser di sumbu X sejauh 1.5x lebar box.
  function clone(key) {
    const e = registry[key];
    if (!e?.device) return null;
    const t = mc.readOne(key);
    t.position[0] += (templateBox.max.x - templateBox.min.x) * Math.abs(t.scale[0]) * 1.5;
    return add({ id: nextId(), state: e.state, transform: t, activate: true });
  }

  // Box baru di titik hasil klik: dasar kaki tepat di permukaan.
  function addAt(point, state = 'default') {
    const s = defaultScale;
    return add({
      id: nextId(), state, activate: true,
      transform: { position: [point.x, point.y - templateBox.min.y * s, point.z], rotation: [0, 0, 0], scale: [s, s, s] },
    });
  }

  function replaceAll(list) {
    keys().forEach(k => remove(k));
    for (const d of list) add({ id: d.id, state: d.state, transform: d });
  }

  function resetAll() { keys().forEach(k => mc.resetOne(k)); }

  const serialize = () => keys().map(k => ({ id: registry[k].id, state: registry[k].state, ...mc.readOne(k) }));

  return {
    add, addAt, clone, remove, setState, replaceAll, resetAll, serialize, keys, nextId,
    setDefaultScale: s => { if (Number.isFinite(s) && s > 0) defaultScale = s; },
    originalBox: templateBox,
  };
}