import * as THREE from 'three';

// Smart device box: body 0.15 x 0.2 x 0.15, depan berlubang + kaca + komponen dalam.
// Semua ukuran detail (kaki, baut, komponen) sudah diskalakan ke ukuran body ini.
export function createSmartDeviceBox({ position = [0, 0, 0], scale = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'smart_device_box';
  group.position.fromArray(position);
  group.scale.setScalar(scale);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, ...extra });

  // ---------- Ukuran ----------
  const W = 0.15, H = 0.2, D = 0.15;     // ukuran body
  const WIN_W = 0.11, WIN_H = 0.09;      // bukaan depan (sisakan pilar 0.02 kiri/kanan)
  const T = 0.012;                       // tebal dinding belakang
  const bodyMat = mat('#313331', { roughness: 0.4, metalness: 0.2 });

  // 1. BADAN UTAMA — 5 potongan box (sudut tajam, jadi tidak ada garis sambungan)
  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);

  const piece = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    body.add(m);
  };

  const sideW = (W - WIN_W) / 2;
  const capH = (H - WIN_H) / 2;
  piece(W, capH, D, 0, (H - capH) / 2, 0);                  // atas
  piece(W, capH, D, 0, -(H - capH) / 2, 0);                 // bawah
  piece(sideW, WIN_H, D, -(W - sideW) / 2, 0, 0);           // kiri
  piece(sideW, WIN_H, D, (W - sideW) / 2, 0, 0);            // kanan
  piece(WIN_W, WIN_H, T, 0, 0, -D / 2 + T / 2);             // belakang

  // 2. BINGKAI TIPIS di tepi lubang (masih dalam lebar body)
  const bezelMat = mat('#0b0d0b', { roughness: 0.6, metalness: 0.3 });
  const bt = 0.003;
  const bz = D / 2 + 0.0005;
  for (const [w, h, x, y] of [
    [WIN_W + bt * 2, bt, 0, WIN_H / 2 + bt / 2],
    [WIN_W + bt * 2, bt, 0, -WIN_H / 2 - bt / 2],
    [bt, WIN_H, -WIN_W / 2 - bt / 2, 0],
    [bt, WIN_H, WIN_W / 2 + bt / 2, 0],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.001), bezelMat);
    b.position.set(x, y, bz);
    group.add(b);
  }

  // 3. KACA TRANSPARAN (pas di dalam lubang)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(WIN_W, WIN_H, 0.003),
    new THREE.MeshPhysicalMaterial({
      color: '#aab8c8',
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.6,
      thickness: 0.01,
      depthWrite: false,
    }),
  );
  glass.position.set(0, 0, D / 2 - 0.005);
  glass.renderOrder = 2;
  group.add(glass);

  // baut kecil: nempel di pilar kiri/kanan (x ±0.065 < setengah lebar body 0.075)
  const screwMat = mat('#8a8f94', { metalness: 0.8, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.0015, 12), screwMat);
      s.rotation.x = Math.PI / 2;
      s.position.set(sx * 0.065, sy * 0.03, D / 2 + 0.00075);
      group.add(s);
    }
  }

  // 4. KOMPONEN DALAM (semua di dalam rongga: x ±0.055, y ±0.045, z -0.063..0.07)
  const inner = new THREE.Group();
  inner.name = 'internal_components';
  group.add(inner);

  const pcbY = -WIN_H / 2 + 0.005;
  const pcb = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.005, 0.09),
    mat('#157a3c', { roughness: 0.6, metalness: 0.1 }),
  );
  pcb.position.set(0, pcbY, -0.005);
  inner.add(pcb);

  const top = pcbY + 0.0025; // permukaan PCB

  const module_ = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.03, 0.035),
    mat('#4a4d52', { roughness: 0.5, metalness: 0.4 }),
  );
  module_.position.set(-0.015, top + 0.015, 0.0);
  inner.add(module_);

  const chip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.014), mat('#111111', { roughness: 0.4 }));
  chip.position.set(0.03, top + 0.002, 0.03);
  inner.add(chip);

  const conn = new THREE.Mesh(
    new THREE.BoxGeometry(0.013, 0.008, 0.014),
    mat('#c4c8cc', { metalness: 0.9, roughness: 0.25 }),
  );
  conn.position.set(-0.04, top + 0.004, 0.03);
  inner.add(conn);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.014, 16),
    mat('#9aa0a6', { metalness: 0.7, roughness: 0.3 }),
  );
  cap.position.set(0.035, top + 0.007, -0.03);
  inner.add(cap);

  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.01, top + 0.022, 0.0),
        new THREE.Vector3(0.03, top + 0.03, 0.0),
        new THREE.Vector3(0.04, top + 0.015, 0.0),
        new THREE.Vector3(0.04, top + 0.002, 0.005),
      ]),
      24, 0.0014, 8, false,
    ),
    mat('#f59e0b', { roughness: 0.5 }),
  );
  inner.add(cable);

  // 5. LAMPU INDIKATOR (di dalam kaca, atas-kanan)
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 16, 16),
    mat('#2261c5', { emissive: '#2261c5', emissiveIntensity: 2 }),
  );
  led.position.set(0.04, 0.025, D / 2 - 0.012);
  group.add(led);

  const ledLight = new THREE.PointLight('#2261c5', 0.1, 0.2);
  ledLight.position.copy(led.position);
  group.add(ledLight);

  // 6. KAKI-KAKI (pendek, di dalam jejak body)
  const legMat = mat('#0f172a', { roughness: 0.5 });
  const legH = 0.1;
  for (const [x, z] of [[-0.05, 0.05], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.008, legH, 16), legMat);
    leg.position.set(x, -H / 2 - legH / 2 + 0.002, z);
    leg.castShadow = true;
    group.add(leg);
  }

  // 7. ANTENA (tengah atas)
  const ant = new THREE.Group();
  ant.position.set(0, H / 2, 0);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.007, 0.08, 16),
    mat('#334155', { metalness: 0.8, roughness: 0.2 }),
  );
  rod.position.set(0, 0.04, 0);
  rod.castShadow = true;
  ant.add(rod);

  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 16), mat('#0f172a'));
  joint.position.set(0, 0.002, 0);
  ant.add(joint);

  group.add(ant);

  return group;
}