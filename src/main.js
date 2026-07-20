import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initDropzone } from './ui/dropzone.js';
import { initPreview } from './ui/preview.js';
import { initControls } from './ui/controls.js';
import { processBatch } from './core/pool.js';
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
    resize: { mode: 'none', maxLongest: 2000, percent: 75 }
  }
};

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
  }
});

const controls = initControls({
  config,
  onChange: () => preview.render(),
  onLogoFile: loadLogo,
  onLogoClear: clearLogo,
  onApply: applyToAll
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
  } catch (err) {
    alert('Could not load logo: ' + err);
  }
}

function clearLogo() {
  if (state.logo?.bitmap) state.logo.bitmap.close();
  state.logo = null;
  controls.setLogoLoaded(null);
  preview.render();
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
