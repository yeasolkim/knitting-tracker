import type { CompletedMark, Ruler } from './types';

/** Draws the current chart with completed marks and rulers onto a canvas and returns a JPEG blob. */
export async function buildProgressImage(args: {
  imageUrl: string;
  marks: CompletedMark[];
  rulers: Ruler[];
  activeRulerId: string;
  title: string;
  caption?: string;
}): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image'));
    el.src = args.imageUrl;
  });
  const maxEdge = 2000;
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * scale);
  const H = Math.round(img.naturalHeight * scale);
  const pad = Math.round(Math.max(40, W * 0.04));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + pad;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fdf6e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, W, H);

  const hex = (h: string, a: number) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return `rgba(74,222,128,${a})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const rulerById = new Map(args.rulers.map((r) => [r.id, r]));
  for (const m of args.marks) {
    const r = m.ruler_id ? rulerById.get(m.ruler_id) : undefined;
    const color = r && r.color !== '#b5541e' ? hex(r.color, 0.22) : 'rgba(34,197,94,0.22)';
    ctx.fillStyle = color;
    if (m.orientation === 'horizontal') ctx.fillRect((m.y / 100) * W, 0, (m.height / 100) * W, H);
    else ctx.fillRect(0, (m.y / 100) * H, W, (m.height / 100) * H);
  }
  for (const r of args.rulers) {
    const active = r.id === args.activeRulerId;
    ctx.fillStyle = hex(r.color, active ? 0.28 : 0.14);
    ctx.strokeStyle = hex(r.color, 0.9);
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.setLineDash(active ? [] : [8, 6]);
    if (r.orientation === 'horizontal') {
      const x = (r.position_x / 100) * W, w = (r.height / 100) * W;
      ctx.fillRect(x, 0, w, H); ctx.strokeRect(x, 0, w, H);
    } else {
      const y = (r.position_y / 100) * H, h = (r.height / 100) * H;
      ctx.fillRect(0, y, W, h); ctx.strokeRect(0, y, W, h);
    }
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#3d2b1f';
  ctx.font = `bold ${Math.round(pad * 0.42)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(args.title, pad * 0.4, H + pad / 2, W * 0.6);
  if (args.caption) {
    ctx.textAlign = 'right';
    ctx.font = `${Math.round(pad * 0.36)}px system-ui, sans-serif`;
    ctx.fillStyle = '#7a5c46';
    ctx.fillText(args.caption, W - pad * 0.4, H + pad / 2, W * 0.38);
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('blob');
  return blob;
}

/** Web Share with files when available, otherwise a download. Returns which path was taken. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadJson(obj: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}
