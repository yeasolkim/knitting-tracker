// Copies pdf.js CMaps into public/cmaps so PDFs with CJK fonts render offline (no CDN).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist/cmaps');
const dst = resolve(root, 'public/cmaps');
if (!existsSync(src)) { console.warn('[copy-cmaps] pdfjs-dist/cmaps not found, skipping'); process.exit(0); }
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('[copy-cmaps] copied to public/cmaps');
