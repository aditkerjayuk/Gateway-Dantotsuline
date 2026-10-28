import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Varian status untuk Smart Device Box. Tidak mengubah smartDeviceBox.js:
// box asli di-clone dengan warna & material TETAP UTUH, lalu diselimuti
// cangkang transparan yang MENGIKUTI KONTUR benda (bukan bounding box).
export const DEVICE_STATES = {
    active: { color: '#22c55e', led: '#22c55e', opacity: 0.5 },   // hijau = aktif
    inactive: { color: '#ef4444', led: '#ef4444', opacity: 0.5 },   // merah = tidak aktif
};

const INFLATE = 0.008;   // tebal selimut (satuan lokal box)
const EPS = 1e-6;

const sgn = v => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v));
const insideOf = (mesh, name) => { for (let p = mesh.parent; p; p = p.parent) if (p.name === name) return true; return false; };

// Bagian yang tidak diselimuti: isi dalam, kaca, LED, dan detail kecil/tipis
// (baut, bingkai) yang sudah tertutup selimut body.
function isShellTarget(mesh) {
    if (insideOf(mesh, 'internal_components')) return false;
    const m = mesh.material;
    if (m.isMeshPhysicalMaterial) return false;                    // kaca
    if (m.emissive && m.emissive.getHex() !== 0) return false;     // LED
    if (insideOf(mesh, 'body')) return true;                       // potongan body: selalu
    mesh.geometry.computeBoundingBox();
    const s = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
    const dims = [s.x, s.y, s.z];
    return Math.max(...dims) >= 0.012 && Math.min(...dims) >= 0.002;
}

// Body: ambil hanya sisi LUAR (segitiga yang seluruh titiknya ada di salah satu
// bidang terluar body), lalu dorong keluar. Sisi dalam/rongga dibuang sehingga
// antar potongan tidak ada bidang yang bertumpuk.
function bodyShellGeometry(mesh, rel, outer) {
    const g = mesh.geometry.clone();
    g.deleteAttribute('uv');
    g.clearGroups();
    g.applyMatrix4(rel);

    const pos = g.attributes.position;
    const on = (i, axis, val) => Math.abs(pos.getComponent(i, axis) - val) < EPS;
    const planes = [];
    for (let a = 0; a < 3; a++) planes.push([a, outer.min.getComponent(a)], [a, outer.max.getComponent(a)]);

    const idx = g.index.array, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
        const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
        if (planes.some(([a, v]) => on(i, a, v) && on(j, a, v) && on(k, a, v))) keep.push(i, j, k);
    }
    g.setIndex(keep);

    for (let i = 0; i < pos.count; i++) {
        for (let a = 0; a < 3; a++) {
            const c = pos.getComponent(i, a);
            if (Math.abs(c - outer.max.getComponent(a)) < EPS) pos.setComponent(i, a, c + INFLATE);
            else if (Math.abs(c - outer.min.getComponent(a)) < EPS) pos.setComponent(i, a, c - INFLATE);
        }
    }
    return g;
}

// Bagian lain (kaki, antena, sendi): gembungkan sesuai bentuk aslinya.
//  - Box: lurus per sumbu | Silinder: radial di sisi, lurus di tutup | Bola: radial
function partShellGeometry(mesh, rel) {
    const src = mesh.geometry;
    const g = src.clone();
    g.deleteAttribute('uv');
    g.clearGroups();

    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let dx = 0, dy = 0, dz = 0;
        if (src.type === 'BoxGeometry') {
            dx = sgn(x); dy = sgn(y); dz = sgn(z);
        } else if (src.type === 'CylinderGeometry') {
            const r = Math.hypot(x, z);
            if (r > 1e-6) { dx = x / r; dz = z / r; }
            dy = sgn(y);
        } else if (src.type === 'SphereGeometry') {
            const l = Math.hypot(x, y, z);
            if (l > 1e-9) { dx = x / l; dy = y / l; dz = z / l; }
        } else {
            dx = nor.getX(i); dy = nor.getY(i); dz = nor.getZ(i);
        }
        pos.setXYZ(i, x + dx * INFLATE, y + dy * INFLATE, z + dz * INFLATE);
    }
    g.applyMatrix4(rel);
    return g;
}

export function createDeviceBoxVariant(source, state) {
    const { color, opacity, led } = DEVICE_STATES[state];
    const tint = new THREE.Color(color);
    const ledColor = new THREE.Color(led);

    const root = source.clone(true);
    root.name = `${source.name}_${state}`;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const relOf = o => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);

    const targets = [];
    root.traverse(o => { if (o.isMesh && isShellTarget(o)) targets.push(o); });
    if (!targets.length) return root;

    const LED_DEFAULT = new THREE.Color('#3b82f6');
    root.traverse(o => {
        if (o.isMesh && o.material.emissive && o.material.emissive.getHex() !== 0) {
            o.material = o.material.clone();     // wajib: material asli dipakai bersama box default
            o.material.color.copy(ledColor);
            o.material.emissive.copy(ledColor);
        }
        if (o.isPointLight) o.color.copy(ledColor);   // cahaya LED ikut berubah
    });

    // Batas luar body (gabungan semua potongan body, di ruang lokal root)
    const outer = new THREE.Box3();
    for (const m of targets) {
        if (!insideOf(m, 'body')) continue;
        outer.union(new THREE.Box3().setFromObject(m).applyMatrix4(inv));
    }

    const parts = targets.map(m =>
        insideOf(m, 'body') ? bodyShellGeometry(m, relOf(m), outer) : partShellGeometry(m, relOf(m)));

    const geo = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());

    // Pass 1: hanya tulis depth (supaya bagian yang masih menumpuk tidak dobel)
    const depthPass = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true }),
    );
    depthPass.name = 'status_shell_depth';
    depthPass.renderOrder = 5;                              // setelah kaca (renderOrder 2)

    // Pass 2: warna selimut
    const shell = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
            color: tint,
            emissive: tint,
            emissiveIntensity: 0.35,
            transparent: true,
            opacity,
            roughness: 0.3,
            metalness: 0,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        }),
    );
    shell.name = 'status_shell';
    shell.renderOrder = 6;

    root.add(depthPass, shell);
    return root;
}