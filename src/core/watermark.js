// Pure watermark rendering — works both on the main thread (HTMLCanvasElement)
// and inside workers (OffscreenCanvas). No DOM/UI dependencies beyond canvas.

export function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality
    );
  });
}

/**
 * Resolve output pixel dimensions for a source image, honouring the optional
 * `resize` config. Only ever downscales — never enlarges past the source.
 * resize: { mode: 'none'|'longest'|'percent', maxLongest, percent }.
 */
export function targetSize(srcW, srcH, resize) {
  if (!resize || resize.mode === 'none') return { width: srcW, height: srcH };
  let scale = 1;
  if (resize.mode === 'longest') {
    const cap = resize.maxLongest || 0;
    const longest = Math.max(srcW, srcH);
    if (cap > 0 && longest > cap) scale = cap / longest;
  } else if (resize.mode === 'percent') {
    scale = Math.max(0.01, Math.min(1, (resize.percent || 100) / 100));
  }
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale))
  };
}

/** Parse a "w:h" aspect string to a numeric ratio (w/h). Falls back to 1. */
function parseRatio(str) {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(str || '');
  if (!m) return 1;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  return b > 0 ? a / b : 1;
}

/**
 * Compute the full output geometry for a source image:
 *   - aspect: { mode:'none'|'ratio', ratio:'1:1', fit:'crop'|'pad', padColor }
 *   - resize: (see targetSize)
 *
 * Returns { canvasW, canvasH, drawW, drawH, drawX, drawY, pad, padColor }
 * where the source image is drawn at (drawX,drawY) sized drawW×drawH inside a
 * canvasW×canvasH output. `pad` true means fill `padColor` first (letterbox).
 * Never upscales the canvas past the source's usable resolution.
 */
export function computeLayout(srcW, srcH, output = {}) {
  const aspect = output.aspect;
  const srcAR = srcW / srcH;

  let baseW = srcW;
  let baseH = srcH;
  let cover = true; // how the image fills the canvas (cover vs contain)
  let pad = false;

  if (aspect && aspect.mode === 'ratio') {
    const ar = parseRatio(aspect.ratio);
    if (aspect.fit === 'pad') {
      cover = false;
      pad = true;
      if (srcAR > ar) {
        baseW = srcW;
        baseH = Math.round(srcW / ar);
      } else {
        baseH = srcH;
        baseW = Math.round(srcH * ar);
      }
    } else {
      // crop / cover
      if (srcAR > ar) {
        baseH = srcH;
        baseW = Math.round(srcH * ar);
      } else {
        baseW = srcW;
        baseH = Math.round(srcW / ar);
      }
    }
  }

  const sized = targetSize(baseW, baseH, output.resize);
  const canvasW = sized.width;
  const canvasH = sized.height;

  const scale = cover
    ? Math.max(canvasW / srcW, canvasH / srcH)
    : Math.min(canvasW / srcW, canvasH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;

  return {
    canvasW,
    canvasH,
    drawW,
    drawH,
    drawX: (canvasW - drawW) / 2,
    drawY: (canvasH - drawH) / 2,
    pad,
    padColor: (aspect && aspect.padColor) || '#ffffff'
  };
}

/**
 * Render `image` (ImageBitmap or canvas) with the watermark applied, returning
 * a new canvas. Output geometry honours config.output (aspect + resize); since
 * all watermark sizes are relative, it stays proportional at any resolution.
 * assets: { logo?: ImageBitmap }
 */
export function renderWatermarked(image, config, assets = {}) {
  const L = computeLayout(image.width, image.height, config.output);
  const canvas = createCanvas(L.canvasW, L.canvasH);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (L.pad) {
    ctx.fillStyle = L.padColor;
    ctx.fillRect(0, 0, L.canvasW, L.canvasH);
  }
  ctx.drawImage(image, L.drawX, L.drawY, L.drawW, L.drawH);
  drawWatermark(ctx, L.canvasW, L.canvasH, config, assets);
  return canvas;
}

/**
 * Draw the watermark onto an existing 2d context of size w x h.
 * All sizes in config are relative (% of image width / height), so the same
 * config renders proportionally at any resolution (preview vs. export).
 */
export function drawWatermark(ctx, w, h, config, assets = {}) {
  const m = measureWatermark(ctx, w, config, assets);
  if (!m) return;

  const rad = (m.rotationDeg * Math.PI) / 180;
  const pos = config.position;

  if (pos.mode === 'tile') {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rad);
    const gap = (pos.gapPct / 100) * w;
    const stepX = m.width + gap;
    const stepY = m.height + Math.max(gap * 0.6, m.height * 0.4);
    const half = Math.hypot(w, h) / 2 + Math.max(stepX, stepY);
    const pattern = pos.tilePattern || 'staggered';
    let row = 0;
    for (let y = -half; y <= half; y += stepY, row++) {
      let offset = 0;
      if (pattern === 'staggered') offset = row % 2 === 1 ? stepX / 2 : 0;
      else if (pattern === 'diagonal') offset = (row * stepX) / 3 % stepX;
      for (let x = -half - offset; x <= half; x += stepX) {
        drawUnit(ctx, x, y, 0, config, assets, m);
      }
    }
    ctx.restore();
    return;
  }

  let cx, cy;
  if (pos.mode === 'custom') {
    cx = pos.custom.x * w;
    cy = pos.custom.y * h;
  } else {
    const margin = (pos.marginPct / 100) * Math.min(w, h);
    const col = pos.grid[1]; // l | c | r
    const rowk = pos.grid[0]; // t | m | b
    cx =
      col === 'l' ? margin + m.width / 2
      : col === 'r' ? w - margin - m.width / 2
      : w / 2;
    cy =
      rowk === 't' ? margin + m.height / 2
      : rowk === 'b' ? h - margin - m.height / 2
      : h / 2;
  }
  drawUnit(ctx, cx, cy, rad, config, assets, m);
}

/**
 * Measure the watermark's unrotated bounding box at image width `w`.
 * Returns { width, height, fontPx?, rotationDeg } or null if nothing to draw.
 */
export function measureWatermark(ctx, w, config, assets = {}) {
  if (config.type === 'text') {
    const t = config.text;
    if (!t.content) return null;
    const fontPx = Math.max(1, (t.sizePct / 100) * w);
    ctx.save();
    ctx.font = buildFont(fontPx, t.font);
    const metrics = ctx.measureText(t.content);
    ctx.restore();
    const height =
      metrics.actualBoundingBoxAscent !== undefined
        ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
        : fontPx;
    return {
      width: Math.max(1, metrics.width),
      height: Math.max(1, height),
      fontPx,
      rotationDeg: t.rotation
    };
  }
  // logo
  const logo = assets.logo;
  if (!logo) return null;
  const l = config.logo;
  const width = Math.max(1, (l.scalePct / 100) * w);
  const height = Math.max(1, width * (logo.height / logo.width));
  return { width, height, rotationDeg: l.rotation };
}

function buildFont(px, family) {
  return `bold ${px}px ${family}`;
}

function drawUnit(ctx, cx, cy, rad, config, assets, m) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rad) ctx.rotate(rad);

  if (config.type === 'text') {
    const t = config.text;
    ctx.globalAlpha = t.opacity;
    ctx.font = buildFont(m.fontPx, t.font);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (t.outline) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = m.fontPx * 0.15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = m.fontPx * 0.04;
      ctx.lineWidth = Math.max(1, m.fontPx * 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.content, 0, 0);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(t.content, 0, 0);
  } else if (assets.logo) {
    ctx.globalAlpha = config.logo.opacity;
    ctx.drawImage(assets.logo, -m.width / 2, -m.height / 2, m.width, m.height);
  }

  ctx.restore();
}
