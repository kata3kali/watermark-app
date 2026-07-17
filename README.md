# Watermark Tool

A free, offline, web-based image watermarking app. Add text or logo watermarks to one image or a whole batch — everything runs 100% client-side in your browser.

**Privacy: your images never leave your device.** There is no server and no upload; all processing happens locally via the Canvas API (in Web Workers for batches). Installable as a PWA — works fully offline after the first load.

## Features

- Drag & drop or pick multiple images (JPG / PNG / WebP)
- Text watermark: font, size (relative to image width), color, opacity, rotation, outline/shadow
- Logo watermark: PNG/SVG with alpha, scale, opacity, rotation
- Position: 3x3 grid + margin, tile/repeat mode, or drag freely on the preview
- Live preview; settings apply proportionally to every image in the batch
- Batch export at full resolution using a Web Worker pool (falls back to main thread on old browsers), with progress + cancel
- Output: keep original format, or force JPEG (quality slider) / PNG / WebP
- Single image downloads directly; batches download as one ZIP (`name-watermarked.ext`)

## Development

```sh
npm install
npm run dev       # dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm run icons     # regenerate placeholder PWA icons (no deps)
```

## Deploy (GitHub Pages)

The Vite config uses `base: './'`, so the built `dist/` works on GitHub Pages under any path. Build and publish `dist/` (e.g. with `actions/deploy-pages` or by pushing `dist/` to a `gh-pages` branch). No backend needed — any static host works.
