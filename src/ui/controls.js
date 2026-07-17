// Settings panel: wires all inputs to the config object.

const $ = (id) => document.getElementById(id);

/**
 * deps: {
 *   config           — live config object (mutated in place)
 *   onChange()       — called after any config mutation
 *   onLogoFile(file) — user picked a logo file
 *   onLogoClear()    — user removed the selected logo
 *   onApply()        — "Apply to all & Download" clicked
 * }
 */
export function initControls({ config, onChange, onLogoFile, onLogoClear, onApply }) {
  // --- type toggle ---
  const typeText = $('type-text');
  const typeLogo = $('type-logo');
  const textOptions = $('text-options');
  const logoOptions = $('logo-options');

  const setType = (type) => {
    config.type = type;
    typeText.classList.toggle('active', type === 'text');
    typeLogo.classList.toggle('active', type === 'logo');
    textOptions.hidden = type !== 'text';
    logoOptions.hidden = type !== 'logo';
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

  // --- output ---
  const qualityLabel = $('quality-label');
  bind('out-format', (el) => {
    config.output.format = el.value;
    qualityLabel.hidden = !(el.value === 'jpeg' || el.value === 'webp');
  });
  bind('out-quality', (el) => (config.output.quality = +el.value), 'out-quality-out', (v) => v);

  // --- apply ---
  const applyBtn = $('apply-all');
  applyBtn.addEventListener('click', onApply);

  syncPositionUI();

  return {
    syncPositionUI,
    setApplyEnabled(enabled) {
      applyBtn.disabled = !enabled;
    },
    setLogoLoaded(name) {
      $('logo-name').textContent = name ?? 'Upload logo (PNG/SVG)…';
      logoClear.hidden = !name;
    }
  };
}
