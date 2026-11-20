export type DisplayUnit = 'ft' | 'm';

export const FT = 0.3048;
export const SQFT = FT * FT;

/** 3.581 → 11'9"  (rounded to the nearest inch, 12" carried into feet). */
export function feetInches(m: number): string {
  const totalIn = Math.round(Math.abs(m) / FT * 12);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  const sign = m < 0 ? '−' : '';
  return inch === 0 ? `${sign}${ft}'` : `${sign}${ft}'${inch}"`;
}

export function fmtLen(m: number, unit: DisplayUnit): string {
  return unit === 'ft' ? feetInches(m) : `${m.toFixed(m < 10 ? 2 : 1)} m`;
}

export function fmtDims(w: number, d: number, unit: DisplayUnit): string {
  return `${fmtLen(w, unit)} × ${fmtLen(d, unit)}`;
}

export function fmtArea(m2: number, unit: DisplayUnit): string {
  return unit === 'ft' ? `${Math.round(m2 / SQFT).toLocaleString('en-IN')} sq ft` : `${m2.toFixed(1)} m²`;
}

export function fmtINR(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

export function fmtINRRange([a, b]: [number, number]): string {
  if (!a && !b) return '—';
  return `${fmtINR(a)} – ${fmtINR(b)}`;
}

/** Parse 11'9", 11' 9", 11.75', 3.58m, 3.58 → metres. Bare numbers use `unit`. */
export function parseLen(text: string, unit: DisplayUnit): number | null {
  const t = text.trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!t) return null;
  const fi = t.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (fi) return (parseFloat(fi[1]) + (fi[2] ? parseFloat(fi[2]) / 12 : 0)) * FT;
  const inch = t.match(/^(\d+(?:\.\d+)?)\s*"$/);
  if (inch) return (parseFloat(inch[1]) / 12) * FT;
  const mm = t.match(/^(\d+(?:\.\d+)?)\s*mm$/i);
  if (mm) return parseFloat(mm[1]) / 1000;
  const metres = t.match(/^(-?\d+(?:\.\d+)?)\s*m$/i);
  if (metres) return parseFloat(metres[1]);
  const bare = t.match(/^-?\d+(?:\.\d+)?$/);
  if (bare) return unit === 'ft' ? parseFloat(t) * FT : parseFloat(t);
  return null;
}

/** A member's cross-section in the size it is built to: whole inches (9″ × 15″) or the matching 10 mm module. */
export function fmtSection(w: number, d: number, unit: DisplayUnit): string {
  const inch = (v: number) => Math.max(1, Math.round(v / 0.0254));
  if (unit === 'ft') return `${inch(w)}″ × ${inch(d)}″`;
  const mm = (v: number) => Math.round((inch(v) * 25.4) / 10) * 10;
  return `${mm(w)} × ${mm(d)} mm`;
}
