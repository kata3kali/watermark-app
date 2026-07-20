// Encode a canvas to a blob, optionally searching the quality setting to keep
// the result under a target byte size. Shared by the worker and the
// main-thread fallback so both honour "target file size".

import { canvasToBlob } from '../core/watermark.js';

const MIN_QUALITY = 0.3;

/**
 * @param canvas       OffscreenCanvas | HTMLCanvasElement
 * @param mime         output mime type
 * @param quality      preferred (max) quality for lossy formats
 * @param targetBytes  soft cap; 0/undefined disables the search
 *
 * For lossless formats (PNG) or when no target is set, encodes once at
 * `quality`. Otherwise binary-searches quality in [MIN_QUALITY, quality] and
 * returns the highest-quality blob that fits — or the smallest available blob
 * if even MIN_QUALITY overshoots the target.
 */
export async function encodeCanvas(canvas, mime, quality, targetBytes) {
  const lossy = mime === 'image/jpeg' || mime === 'image/webp';
  if (!targetBytes || !lossy) {
    return canvasToBlob(canvas, mime, quality);
  }

  const hiBlob = await canvasToBlob(canvas, mime, quality);
  if (hiBlob.size <= targetBytes) return hiBlob;

  let best = await canvasToBlob(canvas, mime, MIN_QUALITY);
  if (best.size > targetBytes) return best; // cannot fit; smallest we can do

  let lo = MIN_QUALITY;
  let hi = quality;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mime, mid);
    if (blob.size <= targetBytes) {
      best = blob;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}
