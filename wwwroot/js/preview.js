import * as THREE from 'three';
import { createScene } from './scene.js';
import { MODELS, registry, createEntries, loadModel } from './modelLoader.js';
import { fetchConfig, validateConfig } from './configManager.js';
import { createSmartDeviceBox } from './smartDeviceBox.js';
import { createDeviceBoxVariant } from './deviceBoxVariants.js';
import { createCalloutManager } from './mapCallout.js';

const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;
const POLL_MS = 5000;

const view = createScene($('preview-viewport'), { logDepth: false });
view.setAxes(false);
createEntries(view.scene);

// --- TIMPA MATERIAL LANTAI/GRID AGAR POLOS ---
view.scene.traverse((object) => {
    if (!object.isMesh) return;
    
    const name = (object.name || '').toLowerCase();
    // Cari objek yang terindikasi sebagai lantai, grid, atau bidang dasar pabrik
    if (name.includes('grid') || name.includes('floor') || name.includes('lantai') || name.includes('plane')) {
        // Ganti materialnya dengan material dasar berwarna gelap polos tanpa garis grid
        object.material = new THREE.MeshStandardMaterial({
            color: 0x1f242d, // Sesuaikan warna gelap industri yang diinginkan
            roughness: 0.8,
            metalness: 0.2
        });
    }
});
view.scene.background = new THREE.Color(0x1a1a1a);
// ---------------------------------------------

// Template box tidak dimasukkan ke scene. PointLight LED dibuang supaya
// scene pabrik tetap ringan, sama seperti halaman editor.
const template = createSmartDeviceBox();
const templateLights = [];
template.traverse(object => { if (object.isLight) templateLights.push(object); });
templateLights.forEach(light => light.parent.remove(light));
template.updateMatrixWorld(true);

const devices = [];
const byId = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

let gatewayInfo = {};
let callouts = null;
let gatewayApiReachable = null;
let syncInProgress = false;
let ready = false;
let alertTimer = 0;
let pointerDown = null;

// ---------- DOM helpers ----------
function updateClock() {
    const now = new Date();
    $('clock').textContent = now.toLocaleString('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function showAlert(text) {
    const el = $('preview-alert');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { el.hidden = true; }, 9000);
}

function setLoad(key, percent, text, state = '') {
    const row = document.querySelector(`[data-load="${key}"]`);
    if (!row) return;
    row.querySelector('progress').value = Number.isFinite(percent) ? percent : 0;
    row.querySelector('em').textContent = text;
    row.dataset.state = state;
}

const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------- Data manual ----------
async function fetchGatewayInfo() {
    try {
        const response = await fetch('/config/gateway-info.json', { cache: 'no-store' });
        if (!response.ok) return {};
        const data = await response.json();
        const info = data?.gateways ?? data;
        return info && typeof info === 'object' && !Array.isArray(info) ? info : {};
    } catch (error) {
        showAlert(`Info manual gateway tidak dapat dibaca: ${error.message}`);
        return {};
    }
}

function displayName(device) {
    return device.manual.name || device.api?.name || `Gateway ${device.id}`;
}

function displayLine(device) {
    return device.manual.line || '';
}

function statusInfo(device) {
    if (gatewayApiReachable === false) {
        return { label: 'Tidak terhubung', short: '—', cls: 'unknown' };
    }
    if (!device.api) {
        return { label: 'Tidak diketahui', short: '—', cls: 'unknown' };
    }
    if (device.api.status === 'ONLINE') {
        return { label: 'ONLINE', short: 'ONLINE', cls: 'online' };
    }
    if (device.api.status === 'OFFLINE') {
        return { label: 'OFFLINE', short: 'OFFLINE', cls: 'offline' };
    }
    return {
        label: device.api.status || 'Tidak diketahui',
        short: device.api.status || '—',
        cls: 'unknown',
    };
}

function calloutRows(device) {
    const rows = [];
    if (device.manual.hostname) rows.push(['Hostname', device.manual.hostname]);
    if (device.api?.ipAddress) rows.push(['IP', device.api.ipAddress]);
    if (device.api?.topic) rows.push(['Topic', device.api.topic]);
    if (device.api?.updatedAt) rows.push(['Update', formatDate(device.api.updatedAt)]);
    const extras = Array.isArray(device.manual.extra) ? device.manual.extra : [];
    for (const extra of extras) {
        if (!extra || !extra.label) continue;
        rows.push([String(extra.label), extra.value == null ? '—' : String(extra.value)]);
    }
    return rows;
}

// ---------- Box gateway read-only ----------
function buildContent(state) {
    const instance = template.clone(true);
    instance.traverse(object => {
        if (!object.isMesh) return;
        object.material = object.material.clone();
        if (object.material.isMeshPhysicalMaterial) object.material.transmission = 0;
    });
    return state === 'default' ? instance : createDeviceBoxVariant(instance, state);
}

function disposeContent(content) {
    const disposed = new Set();
    content.traverse(object => {
        if (!object.isMesh) return;
        if (object.name.startsWith('status_shell') && !disposed.has(object.geometry)) {
            disposed.add(object.geometry);
            object.geometry.dispose();
        }
        for (const material of [].concat(object.material || [])) material.dispose();
    });
}

function updateBounds(device) {
    device.root.updateMatrixWorld(true);
    device.bounds = new THREE.Box3().setFromObject(device.root);
    device.center = device.bounds.getCenter(new THREE.Vector3());
    device.radius = device.bounds.getBoundingSphere(new THREE.Sphere()).radius;
    device.anchor = new THREE.Vector3(device.center.x, device.bounds.max.y, device.center.z);
}

function addDevice(config) {
    const root = new THREE.Group();
    root.name = `preview_${config.id}_root`;

    const content = buildContent('default');
    root.add(content);

    root.position.fromArray(config.position);
    root.rotation.set(
        config.rotation[0] * DEG,
        config.rotation[1] * DEG,
        config.rotation[2] * DEG,
        'XYZ',
    );
    root.scale.fromArray(config.scale);
    root.visible = config.visible !== false;

    view.scene.add(root);

    const device = {
        id: config.id,
        root,
        content,
        state: 'default',
        manual: gatewayInfo[config.id] ?? {},
        api: null,
        bounds: null,
        center: null,
        radius: 0,
        anchor: null,
        item: null,
        dot: null,
        statusEl: null,
    };

    updateBounds(device);
    devices.push(device);
    byId.set(device.id, device);
    return device;
}

function setDeviceState(device, state) {
    if (device.state === state) return;
    device.root.remove(device.content);
    disposeContent(device.content);
    device.content = buildContent(state);
    device.root.add(device.content);
    device.state = state;
    updateBounds(device);
}

// ---------- Daftar gateway (card) ----------
function updateSidebarItem(device) {
    if (!device.item) return;
    device.item.querySelector('[data-name]').textContent = displayName(device);
    device.item.querySelector('[data-line]').textContent = displayLine(device) || '—';
    const status = statusInfo(device);
    device.dot.className = `gateway-dot ${status.cls}`;
    device.statusEl.textContent = status.short;
    device.statusEl.title = status.label;
}

function buildSidebar() {
    const list = $('gateway-list');
    list.replaceChildren();

    if (!devices.length) {
        const empty = document.createElement('p');
        empty.className = 'gateway-empty';
        empty.textContent = 'Belum ada data gateway di assembly.json.';
        list.appendChild(empty);
    }

    for (const device of devices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gateway-item';
        button.setAttribute('role', 'listitem');

        const dot = document.createElement('span');
        dot.className = 'gateway-dot unknown';

        const copy = document.createElement('span');
        copy.className = 'gateway-copy';
        const name = document.createElement('strong');
        name.dataset.name = '';
        const line = document.createElement('small');
        line.dataset.line = '';
        copy.append(name, line);

        const status = document.createElement('span');
        status.className = 'gateway-status';
        status.dataset.status = '';

        button.append(dot, copy, status);
        button.addEventListener('click', () => {
            selectDevice(device);
            if (device.bounds) {
                view.focusOn(device.bounds);
                view.invalidate();
            }
        });

        list.appendChild(button);
        device.item = button;
        device.dot = dot;
        device.statusEl = status;
        updateSidebarItem(device);
    }

    $('gateway-count').textContent = String(devices.length);
}

function refreshDeviceUi(device) {
    updateSidebarItem(device);
    callouts?.refresh(device);
}

// ---------- Selection / picking ----------
function selectDevice(device) {
    for (const item of devices) item.item?.classList.toggle('is-active', item === device);
    callouts?.setActive(device.id);
    view.invalidate();
}

function clearSelection() {
    for (const device of devices) device.item?.classList.remove('is-active');
    callouts?.setActive(null);
    view.invalidate();
}

function pickDevice(event) {
    const canvas = view.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, view.camera);

    let best = null;
    let bestDistance = Infinity;
    for (const device of devices) {
        if (!device.root.visible) continue;
        const hit = raycaster.intersectObject(device.root, true)[0];
        if (hit && hit.distance < bestDistance) {
            bestDistance = hit.distance;
            best = device;
        }
    }
    return best;
}

function bindUi() {
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') clearSelection();
    });

    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointerdown', event => {
        pointerDown = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', event => {
        if (!pointerDown) return;
        const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
        pointerDown = null;
        if (moved > 5) return;

        const device = pickDevice(event);
        if (device) selectDevice(device);
        else clearSelection();
    });
}

// ---------- API status ----------
function gatewayDeviceId(gateway) {
    const topic = String(gateway.TOPIC ?? gateway.topic ?? '').trim();
    const topicId = topic.split('/').pop()?.match(/^GW0*(\d+)$/i)?.[1];
    const apiId = topicId ?? String(gateway.ID ?? gateway.id ?? '').match(/^\d+$/)?.[0];
    return apiId ? `GW-${apiId.padStart(3, '0')}` : null;
}

function setConnection(reachable) {
    if (gatewayApiReachable === reachable) return;
    gatewayApiReachable = reachable;
    const el = $('connection-state');
    el.textContent = reachable ? 'API terhubung' : 'API tidak terhubung';
    el.className = `conn ${reachable ? 'online' : 'offline'}`;
}

async function syncStatus() {
    if (syncInProgress) return;
    syncInProgress = true;

    try {
        const response = await fetch('/Gateway/GetGatewayJson', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const list = await response.json();
        if (!Array.isArray(list)) throw new Error('Format respons API tidak dikenali.');

        setConnection(true);
        const seen = new Set();

        for (const gateway of list) {
            const id = gatewayDeviceId(gateway);
            const device = id ? byId.get(id) : null;
            if (!device) continue;

            seen.add(id);
            const status = String(gateway.STATUS ?? gateway.status ?? '').trim().toUpperCase();
            device.api = {
                name: gateway.NAME ?? gateway.name ?? '',
                ipAddress: gateway.IP_ADDRESS ?? gateway.ipAddress ?? '',
                topic: gateway.TOPIC ?? gateway.topic ?? '',
                status,
                updatedAt: gateway.UPDATED_AT ?? gateway.updatedAt ?? '',
            };

            const online = status === 'ONLINE' || status === 'AKTIF' || status === 'ACTIVE';
            const offline = status === 'OFFLINE' || status === 'TIDAK AKTIF' || status === 'INACTIVE';
            setDeviceState(device, online ? 'active' : offline ? 'inactive' : 'default');
            refreshDeviceUi(device);
        }

        for (const device of devices) {
            if (seen.has(device.id)) continue;
            device.api = null;
            setDeviceState(device, 'default');
            refreshDeviceUi(device);
        }
    } catch {
        setConnection(false);
        for (const device of devices) {
            setDeviceState(device, 'default');
            refreshDeviceUi(device);
        }
    } finally {
        syncInProgress = false;
        view.invalidate();
    }
}

// ---------- Models ----------
async function loadAllModels() {
    const failures = [];
    for (const key of Object.keys(MODELS)) {
        const model = MODELS[key];
        setLoad(key, 0, 'memuat…');
        try {
            await loadModel(key, model.file, (loaded, total) => {
                setLoad(
                    key,
                    total > 0 ? (loaded / total) * 100 : 0,
                    total > 0 ? `${mb(loaded)} / ${mb(total)}` : mb(loaded),
                );
            });
            setLoad(key, 100, 'selesai', 'ok');
        } catch (error) {
            setLoad(key, 0, 'gagal', 'fail');
            failures.push(`${model.label}: ${error.message}`);
        }
    }
    return failures;
}

function fitAll() {
    const box = new THREE.Box3();
    for (const entry of Object.values(registry)) {
        if (entry.root?.visible) box.union(new THREE.Box3().setFromObject(entry.root));
    }
    for (const device of devices) {
        if (device.root.visible && device.bounds) box.union(device.bounds);
    }
    if (!box.isEmpty()) view.fitCamera(box, { saveHome: true });
    view.invalidate();
}

// ---------- Boot ----------
async function boot() {
    updateClock();
    setInterval(updateClock, 1000);
    bindUi();

    const modelsPromise = loadAllModels();

    const [info, rawConfig] = await Promise.all([
        fetchGatewayInfo(),
        fetchConfig('/config/assembly.json').catch(error => {
            showAlert(error.message);
            return null;
        }),
    ]);
    gatewayInfo = info;

    let config = null;
    if (rawConfig) {
        const result = validateConfig(rawConfig, Object.keys(MODELS));
        if (result.ok) {
            config = result.value;
        } else {
            showAlert(`assembly.json tidak valid: ${result.errors.join(' ')}`);
        }
    } else {
        showAlert('assembly.json tidak ditemukan; box gateway tidak ditampilkan.');
    }

    for (const deviceConfig of config?.devices ?? []) addDevice(deviceConfig);

    buildSidebar();
    callouts = createCalloutManager({
        container: $('callout-layer'),
        camera: view.camera,
        devices,
        getName: displayName,
        getLine: displayLine,
        getRows: calloutRows,
        getStatus: statusInfo,
        onSelectDevice: selectDevice,
        view: view,
    });

    view.onFrame(() => {
        if (ready) callouts.update();
    });

    void syncStatus();
    setInterval(syncStatus, POLL_MS);

    const failures = await modelsPromise;
    fitAll();
    ready = true;
    $('preview-loading').hidden = true;
    if (failures.length) showAlert(`Model gagal dimuat: ${failures.join('; ')}`);
    view.invalidate();
}

void boot();
