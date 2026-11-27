// The owner's own picture as a facade finish ("mapping"): read on the device, scaled down and kept in the project
// as a data URL, so it saves, exports and reopens with the house. Nothing is uploaded anywhere.

import type { ExteriorImage } from '@/types/house';

/** Longest side of a stored picture, in pixels: plenty for a wall seen from the street. */
const MAX_SIDE = 1024;
/** Above this the browser's storage for saved houses fills quickly. */
const MAX_BYTES = 450_000;

export const FACADE_IMAGE_TYPES = 'image/jpeg,image/png,image/webp';

export class FacadeImageError extends Error {}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new FacadeImageError(`“${file.name}” could not be opened as a picture. Use a JPG, PNG or WebP.`)); };
    img.src = url;
  });
}

/** Read a picture file into a stored facade image (scaled down, JPEG). */
export async function readFacadeImage(file: File): Promise<ExteriorImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new FacadeImageError(`“${file.name}” is not a JPG, PNG or WebP picture.`);
  if (file.size > 40_000_000) throw new FacadeImageError(`“${file.name}” is over 40 MB. Use a smaller picture.`);
  const img = await decode(file);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  if (!w0 || !h0) throw new FacadeImageError(`“${file.name}” has no size.`);
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const k = Math.min(1, side / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new FacadeImageError('This browser cannot read pictures.');
    // transparent parts of a PNG become white plaster rather than black
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.82);
    if (url.length * 0.75 <= MAX_BYTES || attempt === 3) {
      return { url, name: file.name.replace(/\.[^.]+$/, '') || 'Picture', aspect: w / h };
    }
    side = Math.round(side * 0.75);
  }
  throw new FacadeImageError('The picture could not be stored.');
}
