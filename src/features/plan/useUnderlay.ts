import { useEffect, useState } from 'react';
import type { Project } from '@/lib/store';
import { getBlob } from '@/lib/blobStore';
import { loadImage, renderPdfPage } from '@/lib/pdf';

export interface Underlay {
  dataUrl: string;
  width: number;
  height: number;
}

/** The project's source drawing as an image, sized in drawing units (PDF points or image pixels). */
export function useUnderlay(project: Project): { underlay: Underlay | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ underlay: Underlay | null; loading: boolean; error: string | null }>({ underlay: null, loading: true, error: null });
  const u = project.spec.underlay;
  const page = u?.page ?? 1;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        if (project.sourceKey) {
          const blob = await getBlob(project.sourceKey);
          if (!blob) throw new Error('The uploaded drawing is no longer stored in this browser.');
          if (blob.type === 'application/pdf' || u?.kind === 'pdf') {
            const r = await renderPdfPage(await blob.arrayBuffer(), page, 2600, `${project.sourceKey}#${page}`);
            return { dataUrl: r.dataUrl, width: r.width, height: r.height };
          }
          return await loadImage(URL.createObjectURL(blob));
        }
        if (u?.url) {
          if (u.kind === 'pdf') {
            const r = await renderPdfPage(u.url, page);
            return { dataUrl: r.dataUrl, width: r.width, height: r.height };
          }
          return await loadImage(u.url);
        }
        return null;
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    })()
      .then((underlay) => alive && setState({ underlay, loading: false, error: null }))
      .catch((e: Error) => alive && setState({ underlay: null, loading: false, error: e.message }));
    return () => {
      alive = false;
    };
  }, [project.sourceKey, u?.url, u?.kind, page]);

  return state;
}
