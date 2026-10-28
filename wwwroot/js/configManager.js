const SESSION_KEY = 'factory-glb-assembly:session';
const isVec3 = v => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));

export const DEVICE_STATE_NAMES = ['default', 'active', 'inactive'];
const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
// Key lama (versi 1) -> status box. Dipakai untuk migrasi otomatis.
const LEGACY_DEVICES = { deviceBox: 'default', deviceBoxActive: 'active', deviceBoxInactive: 'inactive' };

export const neutralModel = () => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, wireframe: false });
// "devices" sengaja tidak ada di sini: undefined = belum ada info, [] = sengaja kosong.
export const neutralConfig = keys => ({ version: 2, models: Object.fromEntries(keys.map(k => [k, neutralModel()])) });
export const mergeConfig = (base, part) => {
  const out = { version: 2, models: { ...base.models, ...part.models } };
  const devices = part.devices ?? base.devices;
  if (devices) out.devices = devices;
  return out;
};

function parseTransform(m, label, errors) {
  const v = neutralModel();
  for (const f of ['position', 'rotation', 'scale']) {
    if (m[f] === undefined) continue;
    if (isVec3(m[f])) v[f] = [...m[f]]; else errors.push(`${label}.${f} harus array 3 angka.`);
  }
  if (v.scale.some(n => n === 0)) errors.push(`${label}.scale tidak boleh bernilai 0.`);
  for (const f of ['visible', 'wireframe']) {
    if (m[f] === undefined) continue;
    if (typeof m[f] === 'boolean') v[f] = m[f]; else errors.push(`${label}.${f} harus true atau false.`);
  }
  return v;
}

// Mengembalikan { ok: true, value } atau { ok: false, errors: [...] }.
// - Model yang tidak ada di file tidak dimasukkan ke value (tidak diubah saat impor).
// - value.devices: array (boleh kosong) = ganti semua box; undefined = box tidak diubah.
// - Versi 1 (box lama: deviceBox, deviceBoxActive, deviceBoxInactive) dimigrasi ke devices.
export function validateConfig(data, keys) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Isi file harus berupa objek JSON.'] };
  const errors = [], out = { version: 2, models: {} };
  if (data.version !== 1 && data.version !== 2) errors.push('"version" harus bernilai 1 atau 2.');

  const hasModels = !!data.models && typeof data.models === 'object' && !Array.isArray(data.models);
  const hasDevices = Array.isArray(data.devices);
  if (data.models !== undefined && !hasModels) errors.push('"models" harus berupa objek.');
  if (data.devices !== undefined && !hasDevices) errors.push('"devices" harus berupa array.');
  if (data.models === undefined && data.devices === undefined) errors.push('File tidak punya "models" maupun "devices".');

  if (hasModels) {
    for (const k of keys) {
      const m = data.models[k];
      if (m === undefined) continue;
      if (!m || typeof m !== 'object') { errors.push(`models.${k} harus berupa objek.`); continue; }
      out.models[k] = parseTransform(m, `models.${k}`, errors);
    }
    if (data.version === 1 && !hasDevices) {
      const legacy = [];
      for (const [k, state] of Object.entries(LEGACY_DEVICES)) {
        const m = data.models[k];
        if (!m || typeof m !== 'object') continue;
        legacy.push({ id: `GW-${String(legacy.length + 1).padStart(3, '0')}`, state, ...parseTransform(m, `models.${k}`, errors) });
      }
      if (legacy.length) out.devices = legacy;
    }
    if (!hasDevices && !out.devices && !keys.some(k => k in data.models)) errors.push(`Tidak ada model yang dikenal (${keys.join(', ')}).`);
  }

  if (hasDevices) {
    const seen = new Set();
    out.devices = [];
    data.devices.forEach((d, i) => {
      const at = `devices[${i}]`;
      if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push(`${at} harus berupa objek.`); return; }
      if (typeof d.id !== 'string' || !ID_RE.test(d.id)) { errors.push(`${at}.id harus string (huruf, angka, _ atau -, maks 32 karakter).`); return; }
      if (seen.has(d.id)) { errors.push(`${at}.id "${d.id}" duplikat.`); return; }
      seen.add(d.id);
      const state = d.state === undefined ? 'default' : d.state;
      if (!DEVICE_STATE_NAMES.includes(state)) { errors.push(`${at}.state harus salah satu dari: ${DEVICE_STATE_NAMES.join(', ')}.`); return; }
      out.devices.push({ id: d.id, state, ...parseTransform(d, at, errors) });
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

// Mengembalikan null jika file tidak ada; melempar Error jika JSON rusak.
export async function fetchConfig(url) {
  let res;
  try { res = await fetch(url, { cache: 'no-store' }); } catch { return null; }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Gagal membaca ${url} (HTTP ${res.status}).`);
  try { return await res.json(); } catch (e) { throw new Error(`${url}: JSON tidak valid (${e.message}).`); }
}

export async function readConfigFile(file, keys) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { throw new Error(`JSON tidak valid: ${e.message}`); }
  return validateConfig(data, keys);
}

// Browser tidak boleh menimpa file lokal secara langsung; ekspor lewat unduhan.
export function downloadConfig(config, filename = 'assembly.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2) + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveSession(config) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(config)); } catch { /* opsional */ } }
export function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* opsional */ } }
export function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }