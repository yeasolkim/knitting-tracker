// Self-hosted pdf.js worker + CMaps: no third-party CDN, works offline (precached by the PWA).
// IMPORTANT: package.json pins pdfjs-dist to the exact version react-pdf depends on.
// If they differ, pdf.js refuses to open any PDF ("API version does not match the Worker version").
// When upgrading react-pdf, update pdfjs-dist to match (`npm ls pdfjs-dist` must show one deduped copy).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const PDF_WORKER_URL: string = workerUrl;
/** CMaps are copied to /public/cmaps by scripts/copy-cmaps.mjs (predev/prebuild). */
export const PDF_CMAP_OPTIONS = { cMapUrl: '/cmaps/', cMapPacked: true } as const;

export function configurePdfWorker(globalWorkerOptions: { workerSrc: string }) {
  if (globalWorkerOptions.workerSrc !== PDF_WORKER_URL) globalWorkerOptions.workerSrc = PDF_WORKER_URL;
}
