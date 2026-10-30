import * as THREE from "three";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Callout peta 3D: kartu putih dengan ekor yang menunjuk ke box gateway.
export function createCalloutManager({
  container,
  camera,
  devices,
  getName,
  getLine,
  getRows,
  getStatus,
  onSelectDevice, // <--- Tambahkan callback ini jika ingin menangani klik dari luar
  view, // <--- Masukkan objek view jika digunakan untuk focusOn
}) {
  const cards = new Map();
  const forward = new THREE.Vector3();
  const toCenter = new THREE.Vector3();
  const centerNdc = new THREE.Vector3();
  const anchorNdc = new THREE.Vector3();
  let activeId = null;

  function fill(device, card) {
    const el = card.el;
    el.querySelector(".callout-name").textContent = getName(device);

    const status = getStatus(device);
    const badge = el.querySelector(".callout-badge");
    badge.textContent = status.label;
    badge.className = `callout-badge ${status.cls || "unknown"}`;

    const line = getLine(device);
    const lineEl = el.querySelector(".callout-line");
    lineEl.textContent = line || "";
    lineEl.hidden = !line;

    const dl = el.querySelector(".callout-rows");
    dl.replaceChildren();
    for (const [label, value] of getRows(device)) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value == null || value === "" ? "—" : String(value);
      dl.append(dt, dd);
    }
    dl.hidden = dl.childElementCount === 0;

    card.w = el.offsetWidth || 280;
    card.h = el.offsetHeight || 120;
  }

  function selectDevice(device) {
    // Jalankan callback dari luar jika ada
    if (typeof onSelectDevice === "function") {
      onSelectDevice(device);
    }
    setActive(device.id);
    if (view && typeof view.invalidate === "function") {
      view.invalidate();
    }
  }

  function ensureCard(device) {
    let card = cards.get(device.id);
    if (card) return card;

    const el = document.createElement("a");
    el.className = "map-callout";
    el.dataset.id = device.id;
    el.innerHTML = `
      <div class="callout-head">
        <strong class="callout-name"></strong>
        <span class="callout-badge"></span>
      </div>
      <div class="callout-line"></div>
      <dl class="callout-rows"></dl>`;

    if (activeId === device.id) el.classList.add("is-active");

    el.addEventListener("click", (e) => {
      e.preventDefault();
      selectDevice(device);
      if (device.bounds && view && typeof view.focusOn === "function") {
        view.focusOn(device.bounds);
        view.invalidate();
      }
    });

    container.appendChild(el);
    card = { el, visible: false, w: 0, h: 0, x: -1, y: -1 };
    cards.set(device.id, card);
    fill(device, card);
    return card;
  }

  function metrics(device) {
    if (!device.center || !device.radius || !device.anchor) return null;

    camera.getWorldDirection(forward);
    toCenter.copy(device.center).sub(camera.position);
    const inFront = toCenter.dot(forward) > 0;

    const distance = camera.position.distanceTo(device.center);

    const maxDistance = 120;
    const isClose = distance <= maxDistance;

    centerNdc.copy(device.center).project(camera);

    const onScreen =
      inFront &&
      Math.abs(centerNdc.x) <= 1.2 &&
      Math.abs(centerNdc.y) <= 1.2 &&
      isClose;

    return { inFront, onScreen };
  }

  function position(device, card) {
    anchorNdc.copy(device.anchor).project(camera);
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const x = (anchorNdc.x * 0.5 + 0.5) * width;
    const y = (-anchorNdc.y * 0.5 + 0.5) * height;

    if (!card.w) card.w = card.el.offsetWidth || 280;
    if (!card.h) card.h = card.el.offsetHeight || 120;

    let left = x - card.w / 2;
    let top = y - card.h - 16;
    let below = false;

    if (top < 8) {
      below = true;
      top = y + 16;
    }

    left = clamp(left, 8, Math.max(8, width - card.w - 8));
    top = clamp(top, 8, Math.max(8, height - card.h - 8));

    if (Math.abs(left - card.x) > 0.5 || Math.abs(top - card.y) > 0.5) {
      card.x = left;
      card.y = top;
      card.el.style.left = `${left}px`;
      card.el.style.top = `${top}px`;
      // Memperbaiki baris properti CSS tail-x yang terpotong minus (-) sebelumnya:
      card.el.style.setProperty(
        "--tail-x",
        `${clamp(x - left, 16, card.w - 16)}px`,
      );
    }
    card.el.classList.toggle("is-below", below);
  }

  function show(device) {
    const card = ensureCard(device);
    card.el.classList.add("is-visible");
    card.visible = true;
    position(device, card);
  }

  function hide(id) {
    const card = cards.get(id);
    if (!card || !card.visible) return;
    card.el.classList.remove("is-visible");
    card.visible = false;
  }

  function update() {
    for (const device of devices) {
      if (metrics(device)?.onScreen) show(device);
      else hide(device.id);
    }
  }

  function setActive(id) {
    activeId = id;
    for (const [deviceId, card] of cards) {
      card.el.classList.toggle("is-active", deviceId === activeId);
    }
  }

  function refresh(device) {
    const card = cards.get(device.id);
    if (!card) return;
    fill(device, card);
    update();
  }

  return { update, setActive, refresh };
}
