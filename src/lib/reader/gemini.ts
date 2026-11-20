// Browser side of "understand with Gemini": send a picture of the plan to this site's own endpoint (which holds the
// key and calls Google), get back what Gemini saw, and turn it into a reading the site can build from.

import { useEffect, useState } from 'react';
import { readingFromGemini, type GeminiPlan } from './fromGemini';
import type { ReadResult } from './readPlan';

let status: Promise<boolean> | null = null;
const fetchStatus = () => (status ??= fetch('/api/understand').then((r) => (r.ok ? r.json() : { available: false })).then((j: { available?: boolean }) => !!j.available).catch(() => false));

/** True when the server has a Gemini key. Without one the site still reads CAD PDFs itself; pictures are traced by hand. */
export function useGeminiAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { let alive = true; fetchStatus().then((v) => alive && setOk(v)); return () => { alive = false; }; }, []);
  return ok;
}

/** A copy of the picture small enough to send: longest side 2000 px; PNG for drawings, JPEG when that is too heavy. */
async function prepare(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const png = c.toDataURL('image/png');
  return png.length < 3_000_000 ? png : c.toDataURL('image/jpeg', 0.9);
}

/**
 * Ask Gemini to understand a picture of a plan. `drawing` is the size of the underlay in its own units (PDF points or
 * image pixels) so the reading lines up with the drawing in the plan editor. The picture is sent to Google.
 */
export async function understandWithGemini(dataUrl: string, drawing: { width: number; height: number }): Promise<ReadResult> {
  const fail = (reason: string): ReadResult => ({ ok: false, reason, unitsPerMetre: 0, imperial: true, scaleSource: 'dimension', floors: [], north: null, notes: [], by: 'gemini' });
  try {
    const res = await fetch('/api/understand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: await prepare(dataUrl) }) });
    const json = (await res.json()) as { error?: string; result?: GeminiPlan; model?: string };
    if (!res.ok || !json.result) return fail(json.error ?? `Gemini could not be reached (${res.status}).`);
    return readingFromGemini(json.result, drawing, json.model);
  } catch (e) {
    return fail(`Gemini could not be reached (${e instanceof Error ? e.message : 'network error'}).`);
  }
}
