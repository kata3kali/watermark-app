// Batch export worker: receives files, renders the watermark at full
// resolution on an OffscreenCanvas, posts back encoded blobs.

import { renderWatermarked } from './watermark.js';
import { resolveOutput, targetBytesOf } from '../export/format.js';
import { encodeCanvas } from '../export/encode.js';

let config = null;
let logoBitmap = null;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    config = msg.config;
    logoBitmap = null;
    if (msg.logoBlob) {
      try {
        logoBitmap = await createImageBitmap(msg.logoBlob);
      } catch (err) {
        // Jobs will fail with a clear error below if the logo is required.
      }
    }
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'job') {
    const { id, file } = msg;
    try {
      if (config.type === 'logo' && !logoBitmap) {
        throw new Error('Logo image could not be decoded');
      }
      const bitmap = await createImageBitmap(file);
      const canvas = renderWatermarked(bitmap, config, { logo: logoBitmap });
      bitmap.close();
      const out = resolveOutput(file.type, config.output);
      const blob = await encodeCanvas(
        canvas,
        out.mime,
        out.quality,
        targetBytesOf(config.output)
      );
      self.postMessage({ type: 'result', id, ok: true, blob });
    } catch (err) {
      self.postMessage({ type: 'result', id, ok: false, error: String(err) });
    }
  }
};
