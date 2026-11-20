import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  /** PNG data URL of the page as displayed (page rotation applied). */
  dataUrl: string;
  /** Size of the displayed page in drawing units (PDF points), i.e. at scale 1. */
  width: number;
  height: number;
  pages: number;
}

const cache = new Map<string, Promise<RenderedPage>>();

/** Render one page of a PDF (from a URL or bytes) to an image. `key` caches the result. */
export function renderPdfPage(src: string | ArrayBuffer, page = 1, pxWidth = 2600, key?: string): Promise<RenderedPage> {
  const k = key ?? (typeof src === 'string' ? `${src}#${page}@${pxWidth}` : undefined);
  if (k && cache.has(k)) return cache.get(k)!;
  const job = (async () => {
    const task = pdfjs.getDocument(typeof src === 'string' ? { url: src } : { data: new Uint8Array(src.slice(0)) });
    const doc = await task.promise;
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: pxWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvasContext: ctx, canvas, viewport }).promise;
    const out = { dataUrl: canvas.toDataURL('image/png'), width: base.width, height: base.height, pages: doc.numPages };
    await task.destroy();
    return out;
  })();
  if (k) cache.set(k, job);
  job.catch(() => k && cache.delete(k));
  return job;
}

export async function pdfPageCount(src: ArrayBuffer): Promise<number> {
  const task = pdfjs.getDocument({ data: new Uint8Array(src.slice(0)) });
  const n = (await task.promise).numPages;
  await task.destroy();
  return n;
}

/** Load an image file/URL and report its natural size (drawing units = pixels). */
export function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ dataUrl: url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

/** Open one page of a PDF and hand it to `fn` (used by the plan reader to get at the drawing's own geometry). */
export async function withPdfPage<T>(src: string | ArrayBuffer, page: number, fn: (p: pdfjs.PDFPageProxy, ops: typeof pdfjs.OPS) => Promise<T>): Promise<T> {
  const task = pdfjs.getDocument(typeof src === 'string' ? { url: src } : { data: new Uint8Array(src.slice(0)) });
  try {
    const doc = await task.promise;
    return await fn(await doc.getPage(Math.min(Math.max(1, page), doc.numPages)), pdfjs.OPS);
  } finally {
    await task.destroy();
  }
}
