import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BG = { dark: 0x2a2e33, light: 0xd9dde1 };
const FIT_DIRECTION = new THREE.Vector3(0.3344410458, 0.7112552193, 0.6182759901);
const FIT_TARGET_OFFSET = new THREE.Vector3(6.7450776178, -7.8888670484, 27.2702630463);
const FIT_FOV_DIVISOR = 0.5;
const FIT_DISTANCE_MULTIPLIER = 1.2;
const FIT_NEAR_MULTIPLIER = 0.0004003135842;
const FIT_FAR_MULTIPLIER = 20;

export function createScene(container, { logDepth = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: logDepth, powerPreference: 'high-performance' });
  const MAX_PR = Math.min(window.devicePixelRatio || 1, 1.5);
  const MOVE_PR = 0.6;                       // resolusi lebih rendah selagi kamera bergerak
  renderer.setPixelRatio(MAX_PR);
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG.dark);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  const home = { pos: new THREE.Vector3(40, 30, 40), target: new THREE.Vector3(), near: 0.1, far: 5000 };
  camera.position.copy(home.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', () => invalidate());
  controls.enableZoom = false;               // zoom diganti gerak maju/mundur ke arah kursor (di bawah)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x555560, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(50, 100, 30); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-60, 40, -50); scene.add(fill);

  const grid = new THREE.GridHelper(200, 100, 0x8a939e, 0x4a5058);
  const axes = new THREE.AxesHelper(10);
  scene.add(grid, axes);

  // Satu renderer, satu animation loop; render hanya saat ada perubahan.
  let dirty = true;
  const hooks = [];
  function invalidate() { dirty = true; }
  (function loop() {
    requestAnimationFrame(loop);
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    hooks.forEach(fn => fn());
  })();

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Resolusi turun saat orbit/zoom, kembali tajam sebentar setelah berhenti.
  let settleTimer = 0;
  function setPR(v) {
    if (renderer.getPixelRatio() === v) return;
    renderer.setPixelRatio(v);
    renderer.setSize(container.clientWidth, container.clientHeight);
    invalidate();
  }
  function settleLater() { clearTimeout(settleTimer); settleTimer = setTimeout(() => setPR(MAX_PR), 200); }
  controls.addEventListener('start', () => { clearTimeout(settleTimer); setPR(MOVE_PR); });
  controls.addEventListener('end', settleLater);

  // ---------- Zoom: maju/mundur ke arah kursor ----------
  // Langkah = 10% tinggi kamera dari lantai (min 0.05), jadi makin rendah makin halus,
  // tapi tidak pernah mentok. Shift = 5x lebih cepat, Alt = 0.2x lebih halus.
  const tmp = new THREE.Vector3();
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    const r = renderer.domElement.getBoundingClientRect();
    tmp.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5)
      .unproject(camera).sub(camera.position).normalize();

    const base = Math.max(Math.abs(camera.position.y) * 0.1, 0.05);
    const mod = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
    const amt = Math.min(Math.max(Math.abs(e.deltaY) / 100, 0.05), 3);
    const move = -Math.sign(e.deltaY) * base * mod * amt;

    camera.position.addScaledVector(tmp, move);
    controls.target.addScaledVector(tmp, move);        // titik orbit ikut maju
    if (camera.near > 0.05) setClip(0.05, camera.far); // jangan memotong benda kecil di dekat kamera
    controls.update();
    setPR(MOVE_PR); settleLater();
    invalidate();
  }, { passive: false });

  function setClip(near, far) {
    if (!(near > 0) || !(far > near)) return false;
    camera.near = near; camera.far = far;
    camera.updateProjectionMatrix(); invalidate();
    return true;
  }

  function getFitDebug(box) {
    if (!box || box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    const direction = camera.position.clone().sub(controls.target);
    const distance = direction.length();
    direction.normalize();

    return {
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
      },
      fit: {
        direction: direction.toArray(),
        targetOffset: controls.target.clone().sub(center).toArray(),
        distanceMultiplier: distance * Math.sin(THREE.MathUtils.degToRad(camera.fov / FIT_FOV_DIVISOR)) / radius,
        fovDivisor: FIT_FOV_DIVISOR,
        nearMultiplier: camera.near / distance,
        farMultiplier: camera.far / distance,
        boundingRadius: radius,
      },
    };
  }

  // Hanya mengubah kamera/helper, tidak pernah menyentuh transformasi model.
  function fitCamera(box, { saveHome = false } = {}) {
    if (!box || box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    const target = c.add(FIT_TARGET_OFFSET);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / FIT_FOV_DIVISOR)) * FIT_DISTANCE_MULTIPLIER;
    camera.position.copy(target).addScaledVector(FIT_DIRECTION.clone().normalize(), dist);
    controls.target.copy(target);
    setClip(dist * FIT_NEAR_MULTIPLIER, dist * FIT_FAR_MULTIPLIER);
    grid.scale.setScalar(10 ** Math.round(Math.log10(r / 20)));
    axes.scale.setScalar(Math.max(r * 0.1, 1e-3));
    controls.update();
    if (saveHome) Object.assign(home, { pos: camera.position.clone(), target: target.clone(), near: camera.near, far: camera.far });
    invalidate();
    return true;
  }

  // Dekati satu objek (mis. box kecil) tanpa memotong pabrik di belakangnya.
  function focusOn(box) {
    if (!box || box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.4;
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, dist);
    setClip(Math.max(dist / 200, 0.005), Math.max(camera.far, dist * 20));
    controls.update(); invalidate();
    return true;
  }

  function resetCamera() {
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    setClip(home.near, home.far);
    controls.update(); invalidate();
  }

  return {
    renderer, scene, camera, controls, invalidate, setClip, fitCamera, focusOn, resetCamera, getFitDebug,
    onFrame: fn => hooks.push(fn),
    setBackground: name => { scene.background.setHex(BG[name] ?? BG.dark); invalidate(); },
    setGrid: on => { grid.visible = on; invalidate(); },
    setAxes: on => { axes.visible = on; invalidate(); },
  };
}