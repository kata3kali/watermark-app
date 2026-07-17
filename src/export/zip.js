import JSZip from 'jszip';
import { downloadBlob } from './download.js';

/** Bundle [{ name, blob }] into a ZIP and download it. */
export async function downloadZip(items, zipName = 'watermarked.zip') {
  const zip = new JSZip();
  const used = new Set();
  for (const { name, blob } of items) {
    // Guard against duplicate filenames in the batch.
    let final = name;
    let n = 2;
    while (used.has(final)) {
      final = name.replace(/(\.[^.]+)$/, `-${n}$1`);
      n++;
    }
    used.add(final);
    zip.file(final, blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipName);
}
