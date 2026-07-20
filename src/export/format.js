// Output format helpers shared by the worker and the main-thread fallback.

const SUPPORTED_INPUT = ['image/jpeg', 'image/png', 'image/webp'];

const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/**
 * Resolve the output mime/quality/extension for a given input file type and
 * output config { format: 'original'|'jpeg'|'png'|'webp', quality }.
 */
export function resolveOutput(inputType, output) {
  let mime;
  if (output.format === 'original') {
    mime = SUPPORTED_INPUT.includes(inputType) ? inputType : 'image/png';
  } else {
    mime = `image/${output.format}`;
  }
  const lossy = mime === 'image/jpeg' || mime === 'image/webp';
  return {
    mime,
    ext: EXT[mime],
    quality: lossy ? output.quality : undefined
  };
}

/** "photo.JPG" + "png" -> "photo-watermarked.png" */
export function outputName(originalName, ext) {
  const base = originalName.replace(/\.[^./\\]+$/, '');
  return `${base}-watermarked.${ext}`;
}

/**
 * Resolve the output filename, honouring optional sequential renaming.
 * rename: { enabled, pattern, start } where pattern supports {name} and {n}.
 * {n} is zero-padded to at least the width of `total` (min 2 digits).
 */
export function buildOutputName(originalName, ext, index, total, rename) {
  const base = originalName.replace(/\.[^./\\]+$/, '');
  if (!rename || !rename.enabled) return outputName(originalName, ext);
  const width = Math.max(2, String(total).length);
  const n = String((rename.start ?? 1) + index).padStart(width, '0');
  const name = (rename.pattern || '{name}-{n}')
    .replace(/\{name\}/g, base)
    .replace(/\{n\}/g, n)
    .replace(/[/\\]/g, '-'); // never let a pattern escape the ZIP folder
  return `${name || base}.${ext}`;
}

/** targetKB (0 = off) -> byte cap for the encoder. */
export function targetBytesOf(output) {
  return output && output.targetKB > 0 ? output.targetKB * 1024 : 0;
}
