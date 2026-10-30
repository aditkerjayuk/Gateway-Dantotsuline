import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Ubah nama/path file di sini jika perlu.
// Path absolut (diawali "/") supaya tetap benar walau halaman dibuka lewat /Gateway/Index.
export const MODELS = {
  factoryBase: { label: 'Factory Base', file: '/models/3d-fabrication-base.glb', color: 0x5bb0d6 },
  machinery:   { label: 'Machinery',    file: '/models/3d-fabrication-machinery.glb',    color: 0xe0a030 },
};

// key -> { key, label, file, color, root, content, status, error, original }
// root    = Group penyesuaian (diubah pengguna); content = gltf.scene asli (tidak disentuh).
export const registry = {};

const loader = new GLTFLoader();
// Decoder Draco ikut di-vendor di wwwroot/lib/draco (tidak lagi bergantung pada gstatic.com).
loader.setDRACOLoader(new DRACOLoader().setDecoderPath('/lib/draco/'));
loader.setMeshoptDecoder(MeshoptDecoder);

export function createEntries(scene) {
  for (const [key, m] of Object.entries(MODELS)) {
    const root = new THREE.Group();
    root.name = `${key}_adjustment_root`;
    scene.add(root);
    registry[key] = { key, ...m, root, content: null, status: 'idle', error: null, original: null };
  }
}

// Bounding box dalam kondisi root netral (koordinat asli GLB).
function neutralBox(root, content) {
  const p = root.position.clone(), q = root.quaternion.clone(), s = root.scale.clone();
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(content);
  root.position.copy(p); root.quaternion.copy(q); root.scale.copy(s);
  root.updateMatrixWorld(true);
  return box;
}

export function disposeContent(entry) {
  if (!entry.content) return;
  entry.root.remove(entry.content);
  entry.content.traverse(o => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
  entry.content = null; entry.original = null;
}

export function loadModel(key, url, onProgress) {
  const e = registry[key];
  e.status = 'loading';
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      disposeContent(e);
      e.content = gltf.scene;           // transformasi internal GLB tidak diubah
      e.root.add(gltf.scene);
      e.original = neutralBox(e.root, gltf.scene);
      e.status = 'loaded'; e.error = null;
      resolve(e);
    }, ev => onProgress?.(ev.loaded, ev.total), err => {
      e.error = err?.message || 'File tidak ditemukan atau tidak dapat dibaca';
      e.status = e.content ? 'loaded' : 'failed';
      reject(new Error(e.error));
    });
  });
}

export async function loadModelFromFile(key, file, onProgress) {
  const url = URL.createObjectURL(file);
  try { return await loadModel(key, url, onProgress); } finally { URL.revokeObjectURL(url); }
}

// { key: { original: Box3, current: Box3 } } untuk model yang sudah dimuat.
// current = bounding box asli ditransformasi root (AABB; konservatif jika dirotasi).
export function getBoxes() {
  const out = {};
  for (const e of Object.values(registry)) {
    if (!e.original) continue;
    e.root.updateMatrix();
    out[e.key] = { original: e.original, current: e.original.clone().applyMatrix4(e.root.matrix) };
  }
  return out;
}
