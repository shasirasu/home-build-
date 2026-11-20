import type { Kit } from './kit';

/** What a model builder receives: the size the user set (metres) and the main colour. */
export interface Spec {
  kind: string;
  w: number;
  d: number;
  h: number;
  color: string;
}
/** A model builder adds parts to the kit. Local origin = centre of the footprint at y = 0, front = +Z. */
export type Build = (k: Kit, s: Spec) => void;
export type Registry = Record<string, Build>;
