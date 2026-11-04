/**
 * Client-side image helpers used by the pattern upload forms.
 * Both functions are best-effort and never throw: on any failure they fall back
 * (original file / null) so an upload is never blocked by a decoding problem.
 */

const PNG = 'image/png';
const JPEG = 'image/jpeg';

function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name || 'image';
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // EXIF orientation is applied by default in modern browsers.
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> decoding (e.g. formats createImageBitmap rejects)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return src instanceof HTMLImageElement
    ? { w: src.naturalWidth, h: src.naturalHeight }
    : { w: src.width, h: src.height };
}

function release(src: ImageBitmap | HTMLImageElement) {
  if (!(src instanceof HTMLImageElement)) src.close?.();
}

function drawScaled(src: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Downscale an image so its longest edge is at most `maxEdge` px.
 * Returns the original file when it is not an image, already small enough,
 * or when anything goes wrong. PNG stays PNG (lossless, keeps transparency);
 * everything else is re-encoded as JPEG 0.9. The base name is preserved.
 */
export async function downscaleImage(file: File, maxEdge = 3500): Promise<File> {
  try {
    if (!file || !file.type.startsWith('image/')) return file;
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

    const src = await decode(file);
    try {
      const { w, h } = sizeOf(src);
      if (!w || !h) return file;
      const longest = Math.max(w, h);
      if (longest <= maxEdge) return file;

      const ratio = maxEdge / longest;
      const nw = Math.max(1, Math.round(w * ratio));
      const nh = Math.max(1, Math.round(h * ratio));
      const canvas = drawScaled(src, nw, nh);
      if (!canvas) return file;

      const keepPng = file.type === PNG;
      const outType = keepPng ? PNG : JPEG;
      const blob = await toBlob(canvas, outType, keepPng ? undefined : 0.9);
      if (!blob || blob.size === 0) return file;
      // Don't "optimize" into something bigger than what we had.
      if (blob.size >= file.size && blob.type === file.type) return file;

      const ext = keepPng ? 'png' : 'jpg';
      return new File([blob], `${baseName(file.name)}.${ext}`, { type: outType, lastModified: file.lastModified });
    } finally {
      release(src);
    }
  } catch {
    return file;
  }
}

/**
 * Create a JPEG thumbnail (longest edge `maxEdge` px, quality 0.8).
 * Returns null when the source cannot be decoded or encoding fails.
 */
export async function makeThumbnail(file: File | Blob, maxEdge = 480): Promise<Blob | null> {
  try {
    if (!file || !file.type.startsWith('image/')) return null;
    const src = await decode(file);
    try {
      const { w, h } = sizeOf(src);
      if (!w || !h) return null;
      const ratio = Math.min(1, maxEdge / Math.max(w, h));
      const nw = Math.max(1, Math.round(w * ratio));
      const nh = Math.max(1, Math.round(h * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = nw;
      canvas.height = nh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG has no alpha: flatten onto the app's cream background.
      ctx.fillStyle = '#fdf6e8';
      ctx.fillRect(0, 0, nw, nh);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, nw, nh);
      const blob = await toBlob(canvas, JPEG, 0.8);
      return blob && blob.size > 0 ? blob : null;
    } finally {
      release(src);
    }
  } catch {
    return null;
  }
}
