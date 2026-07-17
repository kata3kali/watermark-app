// Live preview canvas: draws the selected image scaled to fit, applies the
// watermark via the shared pure renderer, and supports dragging the
// watermark to a custom position (stored as relative x/y fractions).

import { drawWatermark } from '../core/watermark.js';

/**
 * deps: {
 *   getConfig(): config object
 *   getLogo(): ImageBitmap | null
 *   onCustomPosition(x, y)  — x/y are 0..1 fractions
 * }
 */
export function initPreview({ getConfig, getLogo, onCustomPosition }) {
  const canvas = document.getElementById('preview-canvas');
  const empty = document.getElementById('preview-empty');
  const wrap = document.getElementById('preview-wrap');
  const ctx = canvas.getContext('2d');

  let bitmap = null; // current image ImageBitmap
  let rafPending = false;

  function draw() {
    rafPending = false;
    if (!bitmap) {
      canvas.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    canvas.hidden = false;

    const rect = wrap.getBoundingClientRect();
    const maxW = Math.max(50, rect.width - 24);
    const maxH = Math.max(50, rect.height - 24);
    const scale = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const cssW = Math.max(1, Math.round(bitmap.width * scale));
    const cssH = Math.max(1, Math.round(bitmap.height * scale));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    drawWatermark(ctx, canvas.width, canvas.height, getConfig(), {
      logo: getLogo()
    });
  }

  function render() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(draw);
  }

  // --- drag to custom position ---
  let dragging = false;

  const pointerFraction = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (getConfig().position.mode === 'tile') return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerFraction(e);
    onCustomPosition(x, y);
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const { x, y } = pointerFraction(e);
    onCustomPosition(x, y);
    render();
  });
  ['pointerup', 'pointercancel'].forEach((ev) =>
    canvas.addEventListener(ev, () => (dragging = false))
  );

  window.addEventListener('resize', render);

  return {
    render,
    async setImage(file) {
      if (bitmap) {
        bitmap.close();
        bitmap = null;
      }
      if (file) {
        try {
          bitmap = await createImageBitmap(file);
        } catch (err) {
          console.error('Failed to decode image', err);
          bitmap = null;
        }
      }
      render();
    }
  };
}
