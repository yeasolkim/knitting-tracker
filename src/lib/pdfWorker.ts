// Self-hosted pdf.js worker + CMaps: no third-party CDN, works offline (precached by the PWA).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const PDF_WORKER_URL: string = workerUrl;
/** CMaps are copied to /public/cmaps by scripts/copy-cmaps.mjs (predev/prebuild). */
export const PDF_CMAP_OPTIONS = { cMapUrl: '/cmaps/', cMapPacked: true } as const;

export function configurePdfWorker(globalWorkerOptions: { workerSrc: string }) {
  if (globalWorkerOptions.workerSrc !== PDF_WORKER_URL) globalWorkerOptions.workerSrc = PDF_WORKER_URL;
}
