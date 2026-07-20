// Worker pool for batch processing. Uses navigator.hardwareConcurrency
// workers with OffscreenCanvas; falls back to sequential main-thread
// processing when OffscreenCanvas / Worker are unavailable.

import { renderWatermarked } from './watermark.js';
import { resolveOutput, buildOutputName, targetBytesOf } from '../export/format.js';
import { encodeCanvas } from '../export/encode.js';

/**
 * Process `files` (File[]) with `config`. `logoBlob` is the raw logo blob
 * (or null for text watermarks).
 *
 * callbacks: { onProgress(done, total), onDone(results, errors) }
 *   results: [{ name, blob }] in input order (failed entries omitted)
 *   errors:  [{ name, error }]
 *
 * Returns { cancel() }.
 */
export function processBatch(files, config, logoBlob, { onProgress, onDone }) {
  const total = files.length;
  const results = new Array(total);
  const errors = [];
  let done = 0;
  let cancelled = false;

  const supportsWorkers =
    typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

  const finish = () => {
    if (cancelled) return;
    onDone(results.filter(Boolean), errors);
  };

  const record = (i, ok, blob, error) => {
    if (ok) {
      const out = resolveOutput(files[i].type, config.output);
      const name = buildOutputName(
        files[i].name,
        out.ext,
        i,
        total,
        config.output.rename
      );
      results[i] = { name, blob };
    } else {
      errors.push({ name: files[i].name, error });
    }
    done++;
    onProgress(done, total);
  };

  if (!supportsWorkers) {
    // Sequential main-thread fallback (keeps UI responsive between files).
    (async () => {
      let logoBitmap = null;
      if (config.type === 'logo' && logoBlob) {
        logoBitmap = await createImageBitmap(logoBlob);
      }
      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        try {
          const bitmap = await createImageBitmap(files[i]);
          const canvas = renderWatermarked(bitmap, config, { logo: logoBitmap });
          bitmap.close();
          const out = resolveOutput(files[i].type, config.output);
          const blob = await encodeCanvas(
            canvas,
            out.mime,
            out.quality,
            targetBytesOf(config.output)
          );
          record(i, true, blob);
        } catch (err) {
          record(i, false, null, String(err));
        }
        // Yield to the event loop so the progress bar repaints.
        await new Promise((r) => setTimeout(r, 0));
      }
      finish();
    })();
    return { cancel: () => (cancelled = true) };
  }

  const poolSize = Math.max(
    1,
    Math.min(navigator.hardwareConcurrency || 4, total, 8)
  );
  const workers = [];
  let next = 0;

  const terminateAll = () => workers.forEach((w) => w.terminate());

  const assign = (worker) => {
    if (cancelled) return;
    if (next < total) {
      const i = next++;
      worker.postMessage({ type: 'job', id: i, file: files[i] });
    } else if (done === total) {
      terminateAll();
      finish();
    }
  };

  for (let n = 0; n < poolSize; n++) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module'
    });
    workers.push(worker);
    worker.onmessage = (e) => {
      if (cancelled) return;
      const msg = e.data;
      if (msg.type === 'ready') {
        assign(worker);
        return;
      }
      if (msg.type === 'result') {
        record(msg.id, msg.ok, msg.blob, msg.error);
        assign(worker);
      }
    };
    worker.onerror = (err) => {
      // Worker crashed: fail remaining silently rather than hanging.
      if (cancelled) return;
      console.error('Worker error', err);
    };
    worker.postMessage({ type: 'init', config, logoBlob });
  }

  return {
    cancel: () => {
      cancelled = true;
      terminateAll();
    }
  };
}
