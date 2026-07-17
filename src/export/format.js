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
