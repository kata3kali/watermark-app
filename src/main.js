import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initDropzone } from './ui/dropzone.js';
import { initPreview } from './ui/preview.js';
import { initControls } from './ui/controls.js';
import { processBatch } from './core/pool.js';
import { renderWatermarked } from './core/watermark.js';
import { resolveOutput, targetBytesOf } from './export/format.js';
import { encodeCanvas } from './export/encode.js';
import { downloadBlob } from './export/download.js';
import { downloadZip } from './export/zip.js';

registerSW({ immediate: true });

// ---------- state ----------

const state = {
  items: [], // { id, file, name, url }
  selectedId: null,
  logo: null // { bitmap: ImageBitmap, blob: Blob }
};

const config = {
  type: 'text',
  text: {
    content: '© Watermark',
    font: 'Arial, Helvetica, sans-serif',
    sizePct: 6,
    color: '#ffffff',
    opacity: 0.5,
    rotation: 0,
    outline: false
  },
  logo: { scalePct: 20, opacity: 0.5, rotation: 0 },
  position: {
    mode: 'grid', // 'grid' | 'custom' | 'tile'
    grid: 'br',
    marginPct: 4,
    custom: { x: 0.5, y: 0.5 },
    gapPct: 20,
    tilePattern: 'staggered' // 'staggered' | 'grid' | 'diagonal'
  },
  output: {
    format: 'original',
    quality: 0.9,
    resize: { mode: 'none', maxLongest: 2000, percent: 75 },
    aspect: { mode: 'none', ratio: '1:1', fit: 'pad', padColor: '#ffffff' },
    targetKB: 0,
    rename: { enabled: false, pattern: '{name}-{n}', start: 1 }
  }
};

// ---------- settings persistence ----------
// Watermark/output settings are saved to localStorage so they survive reloads.
// The logo image itself is not persisted (it's a live blob).

const STORAGE_KEY = 'wm-config-v1';

function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    } else if (k in target) {
      target[k] = v;
    }
  }
  return target;
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) deepMerge(config, JSON.parse(raw));
  } catch (err) {
    console.warn('Could not restore settings', err);
  }
}

let saveTimer = null;
function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (err) {
      /* storage full / disabled — non-fatal */
    }
  }, 300);
}

loadPersisted();

// ---------- modules ----------

const preview = initPreview({
  getConfig: () => config,
  getLogo: () => state.logo?.bitmap ?? null,
  onCustomPosition(x, y) {
    config.position.mode = 'custom';
    config.position.custom = { x, y };
    controls.syncPositionUI();
  },
  onImageSize(size) {
    controls.setSelectedSize(size);
    scheduleEstimate();
  }
});

const controls = initControls({
  config,
  onChange() {
    preview.render();
    saveConfig();
    scheduleEstimate();
  },
  onLogoFile: loadLogo,
  onLogoClear: clearLogo,
  onApply: applyToAll,
  onReset() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

const dropzone = initDropzone({
  onAdd(items) {
    state.items.push(...items);
    if (state.selectedId === null) selectItem(items[0].id);
    refresh();
  },
  onSelect: selectItem,
  onRemove(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    URL.revokeObjectURL(state.items[idx].url);
    state.items.splice(idx, 1);
    if (state.selectedId === id) {
      const nextItem = state.items[Math.min(idx, state.items.length - 1)];
      selectItem(nextItem ? nextItem.id : null);
    }
    refresh();
  },
  onClear() {
    state.items.forEach((it) => URL.revokeObjectURL(it.url));
    state.items = [];
    selectItem(null);
    refresh();
  }
});

function refresh() {
  dropzone.render(state.items, state.selectedId);
  controls.setApplyEnabled(state.items.length > 0);
}

function selectItem(id) {
  state.selectedId = id;
  const item = state.items.find((it) => it.id === id);
  preview.setImage(item ? item.file : null);
  dropzone.render(state.items, state.selectedId);
}

// ---------- output size estimate ----------
// Encodes the selected image at the current output settings so the panel can
// show the real resulting file size before a full batch export.

const estimateEl = document.getElementById('out-estimate');
let estimateTimer = null;
let estimateToken = 0;

function scheduleEstimate() {
  clearTimeout(estimateTimer);
  estimateTimer = setTimeout(runEstimate, 350);
}

async function runEstimate() {
  const bitmap = preview.getBitmap?.();
  const item = state.items.find((it) => it.id === state.selectedId);
  if (!bitmap || !item) {
    estimateEl.hidden = true;
    return;
  }
  if (config.type === 'logo' && !state.logo) {
    estimateEl.hidden = true;
    return;
  }
  const token = ++estimateToken;
  try {
    const canvas = renderWatermarked(bitmap, config, {
      logo: state.logo?.bitmap ?? null
    });
    const out = resolveOutput(item.file.type, config.output);
    const blob = await encodeCanvas(
      canvas,
      out.mime,
      out.quality,
      targetBytesOf(config.output)
    );
    if (token !== estimateToken) return; // superseded by a newer run
    const kb = blob.size / 1024;
    const size = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.round(kb)} KB`;
    estimateEl.hidden = false;
    estimateEl.textContent = `Estimated size (this image): ~${size}`;
  } catch (err) {
    estimateEl.hidden = true;
  }
}

// ---------- logo loading ----------

// Rasterize the uploaded logo (PNG or SVG) once to a bitmap for previews and
// a PNG blob for the workers. SVGs are drawn via <img> so ones without an
// intrinsic size still work.
async function loadLogo(file) {
  try {
    let bitmap;
    let blob;
    if (file.type === 'image/svg+xml') {
      const img = await loadHtmlImage(file);
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      const scale = 1536 / Math.max(w, h); // normalize so tiny SVGs stay sharp
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      bitmap = await createImageBitmap(blob);
    } else {
      blob = file;
      bitmap = await createImageBitmap(file);
    }
    if (state.logo?.bitmap) state.logo.bitmap.close();
    state.logo = { bitmap, blob };
    controls.setLogoLoaded(file.name);
    preview.render();
    scheduleEstimate();
  } catch (err) {
    alert('Could not load logo: ' + err);
  }
}

function clearLogo() {
  if (state.logo?.bitmap) state.logo.bitmap.close();
  state.logo = null;
  controls.setLogoLoaded(null);
  preview.render();
  scheduleEstimate();
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('invalid image'));
    };
    img.src = url;
  });
}

// ---------- batch processing ----------

const overlay = document.getElementById('progress-overlay');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const cancelBtn = document.getElementById('progress-cancel');

let activeBatch = null;

cancelBtn.addEventListener('click', () => {
  activeBatch?.cancel();
  activeBatch = null;
  overlay.hidden = true;
});

function applyToAll() {
  if (!state.items.length || activeBatch) return;
  if (config.type === 'logo' && !state.logo) {
    alert('Upload a logo first (or switch to a text watermark).');
    return;
  }
  if (config.type === 'text' && !config.text.content.trim()) {
    alert('Enter watermark text first.');
    return;
  }

  const files = state.items.map((it) => it.file);
  const total = files.length;
  overlay.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = `0 / ${total}`;

  // Plain-data copy so it structured-clones cleanly to workers.
  const configSnapshot = JSON.parse(JSON.stringify(config));
  const logoBlob = config.type === 'logo' ? state.logo.blob : null;

  activeBatch = processBatch(files, configSnapshot, logoBlob, {
    onProgress(done, all) {
      progressFill.style.width = `${Math.round((done / all) * 100)}%`;
      progressText.textContent = `${done} / ${all}`;
    },
    async onDone(results, errors) {
      activeBatch = null;
      try {
        if (results.length === 1) {
          downloadBlob(results[0].blob, results[0].name);
        } else if (results.length > 1) {
          progressText.textContent = 'Building ZIP…';
          await downloadZip(results);
        }
      } finally {
        overlay.hidden = true;
      }
      if (errors.length) {
        alert(
          `${errors.length} image(s) failed:\n` +
            errors.map((e) => `${e.name}: ${e.error}`).join('\n')
        );
      }
    }
  });
}

refresh();
