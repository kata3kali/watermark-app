// Live preview canvas: draws the selected image scaled to fit, applies the
// watermark via the shared pure renderer, and supports dragging the
// watermark to a custom position (stored as relative x/y fractions).

import { drawWatermark, computeLayout } from '../core/watermark.js';

/**
 * deps: {
 *   getConfig(): config object
 *   getLogo(): ImageBitmap | null
 *   onCustomPosition(x, y)  — x/y are 0..1 fractions
 * }
 */
export function initPreview({ getConfig, getLogo, onCustomPosition, onImageSize }) {
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

    const cfg = getConfig();
    const L = computeLayout(bitmap.width, bitmap.height, cfg.output);

    const rect = wrap.getBoundingClientRect();
    const maxW = Math.max(50, rect.width - 24);
    const maxH = Math.max(50, rect.height - 24);
    const scale = Math.min(maxW / L.canvasW, maxH / L.canvasH, 1);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const cssW = Math.max(1, Math.round(L.canvasW * scale));
    const cssH = Math.max(1, Math.round(L.canvasH * scale));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    // Map native output geometry -> canvas pixels.
    const s = (cssW / L.canvasW) * dpr;
    if (L.pad) {
      ctx.fillStyle = L.padColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, L.drawX * s, L.drawY * s, L.drawW * s, L.drawH * s);
    drawWatermark(ctx, canvas.width, canvas.height, cfg, {
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
    getBitmap: () => bitmap,
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
      onImageSize?.(bitmap ? { w: bitmap.width, h: bitmap.height } : null);
      render();
    }
  };
}
