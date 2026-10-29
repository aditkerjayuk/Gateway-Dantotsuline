import * as THREE from 'three';

// Smart device box = lemari jaringan (wall-mount rack) berpintu kaca gelap, diletakkan di atas plat baja,
// di atas boks panel putih, pada tiang baja berwarna teal dengan kaki dan penguat (sesuai foto gateway).
//
// Sumbu: +Y atas, pintu kaca menghadap +Z. Titik asal ada di tengah-tinggi perangkat dan dasar kaki
// berada di y = -0.198 (sama seperti versi lama), jadi posisi di JSON tetap menempel lantai.
// Lebar lemari 0.15 (sama seperti body lama) supaya skala default tidak berubah.
//
// Konvensi untuk deviceBoxVariants.js (selimut status):
//  - group 'body' hanya berisi potongan BoxGeometry badan lemari,
//  - group 'internal_components' = isi dalam lemari (tidak diselimuti),
//  - kaca = MeshPhysicalMaterial, LED = material emissive.
export function createSmartDeviceBox({ position = [0, 0, 0], scale = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'smart_device_box';
  group.position.fromArray(position);
  group.scale.setScalar(scale);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, ...extra });
  const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  // Box dari batas min/max tiap sumbu.
  const slab = (parent, material, x0, x1, y0, y1, z0, z1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parent.add(shadow(m));
    return m;
  };

  // ---------- Layout vertikal (dari lantai ke atas) ----------
  const FLOOR = -0.198;
  const BASE_T = 0.006;                 // plat dasar kaki
  const POST_Y0 = FLOOR + BASE_T;       // tiang mulai
  const ENC_Y0 = -0.05, ENC_Y1 = 0.032; // boks panel putih
  const BRK_Y1 = 0.040;                 // penyangga di bawah plat
  const PLATE_Y1 = 0.044;               // plat baja penahan lemari
  const W = 0.15, H = 0.19, D = 0.11;   // lemari jaringan
  const CAB_Y0 = PLATE_Y1, CY = CAB_Y0 + H / 2;
  const T = 0.012;                      // tebal dinding belakang lemari

  // Jendela kaca di pintu: sedikit bergeser ke kiri (sisi engsel di kanan) dan ke atas, seperti di foto.
  const WIN_W = 0.1, WIN_H = 0.148;
  const WX = -0.005, WY = CY + 0.002;
  const x0 = WX - WIN_W / 2, x1 = WX + WIN_W / 2;
  const y0 = WY - WIN_H / 2, y1 = WY + WIN_H / 2;

  const teal = mat('#3fb6b2', { roughness: 0.65, metalness: 0.15 });
  const white = mat('#dcdfe2', { roughness: 0.6, metalness: 0.1 });
  const steel = mat('#b9bdc2', { roughness: 0.5, metalness: 0.5 });
  const metal = mat('#9aa0a6', { roughness: 0.3, metalness: 0.8 });
  const black = mat('#141516', { roughness: 0.7 });
  const bodyMat = mat('#25272a', { roughness: 0.55, metalness: 0.25 });

  // 1. BADAN LEMARI — 5 potongan box (sudut tajam, tanpa garis sambungan)
  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);
  slab(body, bodyMat, -W / 2, W / 2, y1, CAB_Y0 + H, -D / 2, D / 2);        // atas
  slab(body, bodyMat, -W / 2, W / 2, CAB_Y0, y0, -D / 2, D / 2);            // bawah
  slab(body, bodyMat, -W / 2, x0, y0, y1, -D / 2, D / 2);                   // pilar kiri (kunci)
  slab(body, bodyMat, x1, W / 2, y0, y1, -D / 2, D / 2);                    // pilar kanan (engsel)
  slab(body, bodyMat, x0, x1, y0, y1, -D / 2, -D / 2 + T);                  // dinding belakang

  // 2. BINGKAI TIPIS pintu di tepi jendela
  const bt = 0.003, bz = D / 2 + 0.0005;
  for (const [x, y, w, h] of [
    [WX, y1 + bt / 2, WIN_W + bt * 2, bt],
    [WX, y0 - bt / 2, WIN_W + bt * 2, bt],
    [x0 - bt / 2, WY, bt, WIN_H],
    [x1 + bt / 2, WY, bt, WIN_H],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.001), black);
    b.position.set(x, y, bz);
    group.add(b);
  }

  // 3. KACA GELAP (tinted) — transmission sengaja 0 supaya ringan di scene besar
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(WIN_W, WIN_H, 0.003),
    new THREE.MeshPhysicalMaterial({
      color: '#1a1d21', transparent: true, opacity: 0.55,
      roughness: 0.08, metalness: 0, transmission: 0, depthWrite: false,
    }),
  );
  glass.position.set(WX, WY, D / 2 - 0.005);
  glass.renderOrder = 2;
  group.add(glass);

  // 4. KUNCI PINTU (kiri) + engsel (kanan) + label merek (kiri bawah)
  const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 16), metal);
  lock.rotation.x = Math.PI / 2;
  lock.position.set(-W / 2 + 0.01, CAB_Y0 + 0.42 * H, D / 2 + 0.002);
  group.add(lock);
  for (const hy of [0.25, 0.75]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.005), black);
    hinge.position.set(W / 2 + 0.001, CAB_Y0 + hy * H, D / 2 - 0.004);
    group.add(hinge);
  }
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.003, 0.0008), mat('#e5e7eb', { roughness: 0.6 }));
  label.position.set(-0.05, CAB_Y0 + 0.012, D / 2 + 0.0004);
  group.add(label);

  // 5. KOMPONEN DALAM LEMARI (kelihatan samar dari balik kaca gelap)
  const inner = new THREE.Group();
  inner.name = 'internal_components';
  group.add(inner);

  const zBack = -D / 2 + T;                                      // permukaan dalam dinding belakang
  slab(inner, mat('#2b2f33', { roughness: 0.6, metalness: 0.3 }),  // plat pemasangan
    WX - 0.045, WX + 0.045, WY - 0.068, WY + 0.068, zBack, zBack + 0.004);
  const railMat = mat('#c4c8cc', { metalness: 0.9, roughness: 0.3 });
  const railY = [WY + 0.03, WY - 0.03];
  for (const ry of railY) slab(inner, railMat, WX - 0.044, WX + 0.044, ry - 0.003, ry + 0.003, zBack + 0.004, zBack + 0.007);

  // modul gateway (atas) + switch (bawah)
  const gw = slab(inner, mat('#4a4d52', { roughness: 0.5, metalness: 0.4 }),
    WX - 0.035, WX + 0.035, railY[0] - 0.015, railY[0] + 0.015, zBack + 0.007, zBack + 0.04);
  slab(inner, mat('#2f3b4a', { roughness: 0.5, metalness: 0.3 }),
    WX - 0.035, WX + 0.035, railY[1] - 0.015, railY[1] + 0.015, zBack + 0.007, zBack + 0.037);
  const gwFront = zBack + 0.04;
  for (const px of [-0.02, 0, 0.02]) {                              // port RJ45
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.004), mat('#c4c8cc', { metalness: 0.9, roughness: 0.25 }));
    port.position.set(WX + px, railY[0] - 0.007, gwFront + 0.002);
    inner.add(port);
  }
  const cable = new THREE.Mesh(                                     // kabel patch oranye
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(WX + 0.02, railY[0] - 0.01, gwFront + 0.004),
      new THREE.Vector3(WX + 0.04, railY[0] - 0.02, gwFront + 0.008),
      new THREE.Vector3(WX + 0.04, railY[1] + 0.02, gwFront + 0.006),
      new THREE.Vector3(WX + 0.02, railY[1] + 0.008, zBack + 0.037 + 0.004),
    ]), 24, 0.0013, 8, false),
    mat('#f59e0b', { roughness: 0.5 }),
  );
  inner.add(cable);

  // 6. LAMPU INDIKATOR (di muka modul gateway, terlihat dari balik kaca)
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.005, 16, 16),
    mat('#2261c5', { emissive: '#2261c5', emissiveIntensity: 2 }),
  );
  led.position.set(WX + 0.026, railY[0] + 0.008, gwFront + 0.001);
  group.add(led);

  // 7. PLAT BAJA + PENYANGGA di bawah lemari
  slab(group, steel, -0.0825, 0.0825, BRK_Y1, PLATE_Y1, -0.065, 0.065);
  slab(group, teal, -0.04, 0.04, ENC_Y1, BRK_Y1, -0.03, 0.03);

  // 8. BOKS PANEL PUTIH (kunci kiri, engsel kanan)
  slab(group, white, -0.035, 0.035, ENC_Y0, ENC_Y1, -0.025, 0.025);
  const encMid = (ENC_Y0 + ENC_Y1) / 2;
  const encLock = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.003, 14), black);
  encLock.rotation.x = Math.PI / 2;
  encLock.position.set(-0.026, encMid, 0.0265);
  group.add(encLock);
  for (const hy of [-0.028, 0.028]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.01, 0.004), black);
    hinge.position.set(0.0355, encMid + hy, 0.021);
    group.add(hinge);
  }

  // 9. TIANG TEAL: dua sayap + inti putih + plat belakang + satu palang, dan penguat miring di depan
  const postTop = ENC_Y0;
  for (const sx of [-1, 1]) slab(group, teal, sx * 0.021 - 0.004, sx * 0.021 + 0.004, POST_Y0, postTop, -0.022, 0.028);
  slab(group, white, -0.017, 0.017, POST_Y0, postTop, -0.016, 0.018);
  slab(group, teal, -0.025, 0.025, POST_Y0, postTop, -0.026, -0.022);
  slab(group, teal, -0.017, 0.017, -0.095, -0.089, 0.018, 0.026);

  // 10. KAKI: plat dasar + dua penguat miring
  slab(group, teal, -0.05, 0.05, FLOOR, POST_Y0, -0.05, 0.065);
  for (const sx of [-1, 1]) {
    const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.075, 0.008), teal);
    gusset.rotation.x = -Math.atan2(0.025, 0.07);                   // miring ke depan-bawah
    gusset.position.set(sx * 0.021, -0.153, 0.0345);
    group.add(shadow(gusset));
  }

  // 11. KABEL HITAM dari belakang tiang ke lantai
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, ENC_Y0, -0.03),
      new THREE.Vector3(0.0, -0.17, -0.032),
      new THREE.Vector3(0.02, FLOOR + 0.003, -0.01),
      new THREE.Vector3(0.07, FLOOR + 0.003, 0.04),
    ]), 32, 0.003, 8, false),
    mat('#111213', { roughness: 0.8 }),
  );
  group.add(wire);

  return group;
}