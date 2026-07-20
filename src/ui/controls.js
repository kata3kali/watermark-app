// Settings panel: wires all inputs to the config object.

import { computeLayout } from '../core/watermark.js';

const $ = (id) => document.getElementById(id);

// Marketplace presets — each sets aspect + resize + format/quality in one go.
const PRESETS = {
  shopee: { ratio: '1:1', longest: 1600, format: 'jpeg', quality: 0.9 },
  tokopedia: { ratio: '1:1', longest: 1500, format: 'jpeg', quality: 0.9 },
  lazada: { ratio: '1:1', longest: 1000, format: 'jpeg', quality: 0.9 },
  tiktokshop: { ratio: '1:1', longest: 1200, format: 'jpeg', quality: 0.9 },
  'ig-post': { ratio: '1:1', longest: 1080, format: 'jpeg', quality: 0.9 },
  'ig-portrait': { ratio: '4:5', longest: 1080, format: 'jpeg', quality: 0.9 },
  'ig-story': { ratio: '9:16', longest: 1920, format: 'jpeg', quality: 0.9 }
};

/**
 * deps: {
 *   config           — live config object (mutated in place)
 *   onChange()       — called after any config mutation
 *   onLogoFile(file) — user picked a logo file
 *   onLogoClear()    — user removed the selected logo
 *   onApply()        — "Apply to all & Download" clicked
 *   onReset()        — "Reset settings" clicked
 * }
 */
export function initControls({
  config,
  onChange,
  onLogoFile,
  onLogoClear,
  onApply,
  onReset
}) {
  const setVal = (id, v) => {
    const el = $(id);
    if (el != null && v != null) el.value = v;
  };
  const setChk = (id, v) => {
    const el = $(id);
    if (el) el.checked = !!v;
  };
  const setOut = (id, txt) => {
    const el = $(id);
    if (el) el.textContent = txt;
  };
  const pct = (frac) => Math.round(frac * 100);

  // --- type toggle ---
  const typeText = $('type-text');
  const typeLogo = $('type-logo');
  const textOptions = $('text-options');
  const logoOptions = $('logo-options');

  const applyType = (type) => {
    config.type = type;
    typeText.classList.toggle('active', type === 'text');
    typeLogo.classList.toggle('active', type === 'logo');
    textOptions.hidden = type !== 'text';
    logoOptions.hidden = type !== 'logo';
  };
  const setType = (type) => {
    applyType(type);
    onChange();
  };
  typeText.addEventListener('click', () => setType('text'));
  typeLogo.addEventListener('click', () => setType('logo'));

  // --- generic binder for range/text/color/select inputs ---
  const bind = (id, apply, outId, fmt) => {
    const el = $(id);
    const out = outId ? $(outId) : null;
    const handler = () => {
      apply(el);
      if (out) out.textContent = fmt(el.value);
      onChange();
    };
    el.addEventListener('input', handler);
    return el;
  };

  // Text options
  bind('wm-text', (el) => (config.text.content = el.value));
  bind('wm-font', (el) => (config.text.font = el.value));
  bind('wm-size', (el) => (config.text.sizePct = +el.value), 'wm-size-out', (v) => `${v}%`);
  bind('wm-color', (el) => (config.text.color = el.value));
  bind('wm-opacity', (el) => (config.text.opacity = +el.value / 100), 'wm-opacity-out', (v) => `${v}%`);
  bind('wm-rotation', (el) => (config.text.rotation = +el.value), 'wm-rotation-out', (v) => `${v}°`);
  bind('wm-outline', (el) => (config.text.outline = el.checked));

  // Logo options
  const logoInput = $('logo-input');
  logoInput.addEventListener('change', () => {
    const file = logoInput.files[0];
    if (file) onLogoFile(file);
    logoInput.value = '';
  });
  const logoClear = $('logo-clear');
  logoClear.addEventListener('click', () => onLogoClear());
  bind('logo-scale', (el) => (config.logo.scalePct = +el.value), 'logo-scale-out', (v) => `${v}%`);
  bind('logo-opacity', (el) => (config.logo.opacity = +el.value / 100), 'logo-opacity-out', (v) => `${v}%`);
  bind('logo-rotation', (el) => (config.logo.rotation = +el.value), 'logo-rotation-out', (v) => `${v}°`);

  // --- position ---
  const gridButtons = [...document.querySelectorAll('#pos-grid button')];
  const tileCheck = $('wm-tile');
  const customNote = $('pos-custom-note');
  const tileGapLabel = $('tile-gap-label');
  const tilePatternLabel = $('tile-pattern-label');

  const syncPositionUI = () => {
    const mode = config.position.mode;
    gridButtons.forEach((b) =>
      b.classList.toggle(
        'active',
        mode === 'grid' && b.dataset.pos === config.position.grid
      )
    );
    tileCheck.checked = mode === 'tile';
    customNote.hidden = mode !== 'custom';
    tileGapLabel.hidden = mode !== 'tile';
    tilePatternLabel.hidden = mode !== 'tile';
  };

  gridButtons.forEach((b) =>
    b.addEventListener('click', () => {
      config.position.mode = 'grid';
      config.position.grid = b.dataset.pos;
      syncPositionUI();
      onChange();
    })
  );

  tileCheck.addEventListener('change', () => {
    config.position.mode = tileCheck.checked ? 'tile' : 'grid';
    syncPositionUI();
    onChange();
  });

  bind('wm-margin', (el) => (config.position.marginPct = +el.value), 'wm-margin-out', (v) => `${v}%`);
  bind('wm-gap', (el) => (config.position.gapPct = +el.value), 'wm-gap-out', (v) => `${v}%`);
  bind('wm-tile-pattern', (el) => (config.position.tilePattern = el.value));

  // --- output: preset ---
  const presetSel = $('out-preset');
  const clearPreset = () => {
    presetSel.value = '';
  };

  // --- output: format / quality ---
  const qualityLabel = $('quality-label');
  const syncQualityUI = () => {
    qualityLabel.hidden = !(
      config.output.format === 'jpeg' || config.output.format === 'webp'
    );
  };
  bind('out-format', (el) => {
    config.output.format = el.value;
    syncQualityUI();
    clearPreset();
  });
  bind('out-quality', (el) => (config.output.quality = +el.value), 'out-quality-out', (v) => v);

  // --- output: aspect ratio ---
  const aspectFitLabel = $('aspect-fit-label');
  const aspectPadLabel = $('aspect-pad-label');
  const syncAspectUI = () => {
    const on = config.output.aspect.mode === 'ratio';
    aspectFitLabel.hidden = !on;
    aspectPadLabel.hidden = !(on && config.output.aspect.fit === 'pad');
  };
  bind('out-aspect', (el) => {
    if (el.value === 'none') {
      config.output.aspect.mode = 'none';
    } else {
      config.output.aspect.mode = 'ratio';
      config.output.aspect.ratio = el.value;
    }
    syncAspectUI();
    refreshOutputDims();
    clearPreset();
  });
  bind('out-fit', (el) => {
    config.output.aspect.fit = el.value;
    syncAspectUI();
    refreshOutputDims();
  });
  bind('out-pad-color', (el) => (config.output.aspect.padColor = el.value));

  // --- output: resize ---
  const resizePxLabel = $('resize-px-label');
  const resizePctLabel = $('resize-pct-label');
  const outDims = $('out-dims');
  let selectedSize = null; // { w, h } of the currently previewed image

  const syncResizeUI = () => {
    const mode = config.output.resize.mode;
    resizePxLabel.hidden = mode !== 'longest';
    resizePctLabel.hidden = mode !== 'percent';
  };

  const refreshOutputDims = () => {
    if (!selectedSize) {
      outDims.hidden = true;
      return;
    }
    const { w, h } = selectedSize;
    const L = computeLayout(w, h, config.output);
    outDims.hidden = false;
    outDims.textContent =
      L.canvasW === w && L.canvasH === h
        ? `Output: ${w} × ${h} px (unchanged)`
        : `Output: ${w} × ${h} → ${L.canvasW} × ${L.canvasH} px`;
  };

  bind('out-resize', (el) => {
    config.output.resize.mode = el.value;
    syncResizeUI();
    refreshOutputDims();
    clearPreset();
  });
  bind('out-resize-px', (el) => {
    config.output.resize.maxLongest = +el.value;
    refreshOutputDims();
    clearPreset();
  });
  bind(
    'out-resize-pct',
    (el) => {
      config.output.resize.percent = +el.value;
      refreshOutputDims();
      clearPreset();
    },
    'out-resize-pct-out',
    (v) => `${v}%`
  );

  // --- output: target file size ---
  const targetOn = $('out-target-on');
  const targetKbLabel = $('target-kb-label');
  const targetKb = $('out-target-kb');
  const syncTargetUI = () => {
    targetKbLabel.hidden = config.output.targetKB <= 0;
  };
  targetOn.addEventListener('change', () => {
    config.output.targetKB = targetOn.checked ? +targetKb.value || 0 : 0;
    syncTargetUI();
    onChange();
  });
  bind('out-target-kb', (el) => {
    if (targetOn.checked) config.output.targetKB = +el.value;
  });

  // --- output: sequential rename ---
  const renameOn = $('out-rename-on');
  const renamePatLabel = $('rename-pat-label');
  const syncRenameUI = () => {
    renamePatLabel.hidden = !config.output.rename.enabled;
  };
  renameOn.addEventListener('change', () => {
    config.output.rename.enabled = renameOn.checked;
    syncRenameUI();
    onChange();
  });
  bind('out-rename-pat', (el) => (config.output.rename.pattern = el.value));

  // --- preset apply ---
  presetSel.addEventListener('change', () => {
    const p = PRESETS[presetSel.value];
    if (!p) return;
    config.output.aspect.mode = 'ratio';
    config.output.aspect.ratio = p.ratio;
    config.output.resize.mode = 'longest';
    config.output.resize.maxLongest = p.longest;
    config.output.format = p.format;
    config.output.quality = p.quality;
    syncAllFromConfig();
    presetSel.value = presetSel.value; // keep the chosen preset visible
    onChange();
  });

  // --- apply / reset ---
  $('apply-all').addEventListener('click', onApply);
  const resetBtn = $('reset-settings');
  if (resetBtn) resetBtn.addEventListener('click', () => onReset && onReset());

  // Push the entire config into the DOM (used on boot, restore, and presets).
  function syncAllFromConfig() {
    applyType(config.type);

    setVal('wm-text', config.text.content);
    setVal('wm-font', config.text.font);
    setVal('wm-size', config.text.sizePct);
    setOut('wm-size-out', `${config.text.sizePct}%`);
    setVal('wm-color', config.text.color);
    setVal('wm-opacity', pct(config.text.opacity));
    setOut('wm-opacity-out', `${pct(config.text.opacity)}%`);
    setVal('wm-rotation', config.text.rotation);
    setOut('wm-rotation-out', `${config.text.rotation}°`);
    setChk('wm-outline', config.text.outline);

    setVal('logo-scale', config.logo.scalePct);
    setOut('logo-scale-out', `${config.logo.scalePct}%`);
    setVal('logo-opacity', pct(config.logo.opacity));
    setOut('logo-opacity-out', `${pct(config.logo.opacity)}%`);
    setVal('logo-rotation', config.logo.rotation);
    setOut('logo-rotation-out', `${config.logo.rotation}°`);

    setVal('wm-margin', config.position.marginPct);
    setOut('wm-margin-out', `${config.position.marginPct}%`);
    setVal('wm-gap', config.position.gapPct);
    setOut('wm-gap-out', `${config.position.gapPct}%`);
    setVal('wm-tile-pattern', config.position.tilePattern);

    setVal('out-format', config.output.format);
    setVal('out-quality', config.output.quality);
    setOut('out-quality-out', config.output.quality);
    setVal(
      'out-aspect',
      config.output.aspect.mode === 'none' ? 'none' : config.output.aspect.ratio
    );
    setVal('out-fit', config.output.aspect.fit);
    setVal('out-pad-color', config.output.aspect.padColor);
    setVal('out-resize', config.output.resize.mode);
    setVal('out-resize-px', config.output.resize.maxLongest);
    setVal('out-resize-pct', config.output.resize.percent);
    setOut('out-resize-pct-out', `${config.output.resize.percent}%`);
    setChk('out-target-on', config.output.targetKB > 0);
    if (config.output.targetKB > 0) setVal('out-target-kb', config.output.targetKB);
    setChk('out-rename-on', config.output.rename.enabled);
    setVal('out-rename-pat', config.output.rename.pattern);

    syncPositionUI();
    syncQualityUI();
    syncAspectUI();
    syncResizeUI();
    syncTargetUI();
    syncRenameUI();
    refreshOutputDims();
  }

  syncAllFromConfig();

  return {
    syncPositionUI,
    syncAllFromConfig,
    setApplyEnabled(enabled) {
      $('apply-all').disabled = !enabled;
    },
    setLogoLoaded(name) {
      $('logo-name').textContent = name ?? 'Upload logo (PNG/SVG)…';
      logoClear.hidden = !name;
    },
    setSelectedSize(size) {
      selectedSize = size;
      refreshOutputDims();
    }
  };
}
