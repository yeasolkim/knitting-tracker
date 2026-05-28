// Shared image-space ↔ screen-space coordinate conversion (pixel-based).
// PatternView.tsx has equivalent helpers in %-based units — keep both in sync.

export interface ViewTransform { scale: number; x: number; y: number; }

/** Screen px → image-relative % (0-100). */
export function screenPxToImagePct(
  sx: number, sy: number,
  vt: ViewTransform,
  cW: number, cH: number, iW: number, iH: number,
): { x: number; y: number } {
  const s = vt.scale;
  const contentX = (sx - cW / 2 - vt.x) / s + cW / 2;
  const contentY = (sy - cH / 2 - vt.y) / s + cH / 2;
  const imgLeft = iW > 0 ? (cW - iW) / 2 : 0;
  const imgTop  = iH > 0 ? (cH - iH) / 2 : 0;
  const refW = iW > 0 ? iW : cW;
  const refH = iH > 0 ? iH : cH;
  return {
    x: (contentX - imgLeft) / refW * 100,
    y: (contentY - imgTop)  / refH * 100,
  };
}

/** Image-relative % (0-100) → screen px. */
export function imagePctToScreenPx(
  ix: number, iy: number,
  vt: ViewTransform,
  cW: number, cH: number, iW: number, iH: number,
): { x: number; y: number } {
  const s = vt.scale;
  const imgLeft = iW > 0 ? (cW - iW) / 2 : 0;
  const imgTop  = iH > 0 ? (cH - iH) / 2 : 0;
  const refW = iW > 0 ? iW : cW;
  const refH = iH > 0 ? iH : cH;
  const contentX = imgLeft + (ix / 100) * refW;
  const contentY = imgTop  + (iy / 100) * refH;
  return {
    x: (contentX - cW / 2) * s + cW / 2 + vt.x,
    y: (contentY - cH / 2) * s + cH / 2 + vt.y,
  };
}
