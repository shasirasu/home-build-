import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileImage, FileText, PencilRuler, Upload } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/ui/button';
import { Field, Segmented, TextInput } from '@/components/ui/controls';
import { useStore } from '@/lib/store';
import { newSpec } from '@/lib/derive';
import { uid } from '@/lib/geom';
import { putBlob } from '@/lib/blobStore';
import { loadImage, pdfPageCount, renderPdfPage } from '@/lib/pdf';
import { describeReading, houseFromReading, readPdfPlan, type ReadResult } from '@/lib/reader';
import { understandWithGemini, useGeminiAvailable } from '@/lib/reader/gemini';
import { go } from '@/lib/router';
import { cn } from '@/lib/utils';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

export default function NewProject() {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'blank'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [floors, setFloors] = useState('2');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState<ReadResult | null>(null);
  const bytes = useRef<ArrayBuffer | null>(null);
  const isPdf = file?.type === 'application/pdf';
  const gemini = useGeminiAvailable();

  const take = async (f: File) => {
    setError(null);
    setReading(null);
    if (!ACCEPT.split(',').includes(f.type)) { setError('That file type is not supported. Upload a PDF, PNG, JPG or WebP of the plan.'); return; }
    if (f.size > 40 * 1024 * 1024) { setError('That file is over 40 MB. Export the plan sheet on its own, or as a smaller PDF.'); return; }
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    setPage(1);
    if (f.type === 'application/pdf') {
      setBusy('Opening the PDF…');
      try {
        const buf = await f.arrayBuffer();
        bytes.current = buf;
        const n = Math.min(await pdfPageCount(buf), 12);
        const thumbs: string[] = [];
        for (let i = 1; i <= n; i++) thumbs.push((await renderPdfPage(buf, i, 520, `${f.name}-${f.size}-thumb-${i}`)).dataUrl);
        setPages(thumbs);
      } catch {
        setError('This PDF could not be opened. If it is password-protected, export an unlocked copy.');
        setFile(null);
      }
      setBusy(null);
    } else {
      bytes.current = null;
      setPages([URL.createObjectURL(f)]);
    }
  };

  // Understand the chosen sheet as soon as it is known. A CAD PDF is read here, on this device, from its own lines.
  // Only when that is not possible (a scan, a photo) is a picture of the sheet sent to Gemini, and only to be
  // understood: the house is built by the site either way.
  useEffect(() => {
    if (!file || !pages.length) return;
    let alive = true;
    (async () => {
      let result: ReadResult | null = null;
      if (isPdf && bytes.current) {
        setBusy('Reading walls, doors and rooms from the drawing…');
        result = await readPdfPlan(bytes.current, page);
        if (!result.ok && gemini) {
          setBusy('The site could not read this sheet by itself. Asking Gemini to understand it (a minute or two)…');
          const img = await renderPdfPage(bytes.current, page, 2000, `${file.name}-${file.size}-gemini-${page}`);
          const viaGemini = await understandWithGemini(img.dataUrl, { width: img.width, height: img.height });
          result = viaGemini.ok ? viaGemini : { ...result, reason: `${result.reason} Gemini: ${viaGemini.reason}` };
        }
      } else if (!isPdf && gemini) {
        setBusy('Asking Gemini to understand the picture (a minute or two)…');
        const dataUrl = await new Promise<string>((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(fr.error); fr.readAsDataURL(file); });
        const size = await loadImage(dataUrl);
        result = await understandWithGemini(dataUrl, { width: size.width, height: size.height });
      }
      if (alive) { setReading(result); setBusy(null); }
    })().catch(() => alive && setBusy(null));
    return () => { alive = false; };
  }, [file, isPdf, page, pages.length, gemini]);

  const save = async (): Promise<{ id: string; key: string } | null> => {
    if (!file) return null;
    const id = uid('p'), key = `src-${id}`;
    await putBlob(key, file);
    return { id, key };
  };

  /** The drawing was read: build the furnished house and open it. */
  const build = async (to: '#/studio' | '#/plan') => {
    if (!file || !reading?.ok) return;
    setBusy('Building the house…');
    const saved = await save();
    if (!saved) return;
    const title = name.trim() || 'My house';
    const { spec, items } = houseFromReading(reading, title, { kind: isPdf ? 'pdf' : 'image', page });
    const st = useStore.getState();
    st.createProject({ id: saved.id, name: title, spec, items, sourceKey: saved.key, sourceName: file.name });
    st.setDisplay({ level: 'all', cutWalls: false, structure: false });
    setBusy(null);
    go(to);
  };

  /** Scan or photo: start an empty plan over the picture and trace it by hand. */
  const trace = async () => {
    if (!file) return;
    setBusy('Saving the drawing…');
    const saved = await save();
    if (!saved) return;
    const title = name.trim() || 'My house';
    const spec = newSpec(title, +floors);
    spec.underlay = { url: '', kind: isPdf ? 'pdf' : 'image', page, frames: {} };
    useStore.getState().createProject({ id: saved.id, name: title, spec, items: [], sourceKey: saved.key, sourceName: file.name });
    setBusy(null);
    go('#/plan');
  };

  const startBlank = () => {
    const title = name.trim() || 'My house';
    const spec = newSpec(title, +floors);
    spec.notes![0] = 'Drawn from scratch. Starting heights: plinth 0.45 m, floor to floor 3.05 m (10′), doors 2.1 m.';
    const st = useStore.getState();
    st.createProject({ id: uid('p'), name: title, spec, items: [] });
    st.setDisplay({ level: 'all', cutWalls: false, structure: false });
    go('#/plan');
  };

  const read = reading?.ok ? reading : null;
  const lines = read ? describeReading(read) : [];

  return (
    <div className="min-h-[100svh] bg-background bg-[linear-gradient(to_right,rgb(22_22_22/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(22_22_22/0.05)_1px,transparent_1px)] [background-size:28px_28px] dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Wordmark />
        <a href="#/studio?project=sample" className="text-sm font-medium text-muted-foreground hover:text-foreground">Open the sample house</a>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h1 className="wide text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">Your plan, in 3D</h1>
          <p className="mt-2 max-w-[58ch] text-base text-muted-foreground">
            Start from scratch without a file, or upload a floor plan. A PDF from CAD is read right here by the site (walls, doors, rooms, stairs, scale) and nothing leaves your device.
            {gemini ? ' A photo, a scan or a sheet the site cannot read is sent to Google Gemini to be understood; the house is still built here.' : ' A photo or scan is traced by hand.'}
          </p>

          <Segmented className="mt-5" label="Plan starting point" value={mode} onChange={setMode} options={[{ value: 'upload', label: 'Upload a drawing' }, { value: 'blank', label: 'Start from scratch' }]} />

          {mode === 'blank' ? (
            <div className="mt-6 flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-border-strong bg-surface/80 p-6 text-center">
              <PencilRuler className="size-8 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">A blank canvas for your house</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Draw walls, add doors and windows, mark rooms and stairs, then build your plan in 3D. No PDF or image needed.</p>
            </div>
          ) : <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) take(f); }}
            className={cn('mt-6 grid min-h-[300px] place-items-center rounded-xl border-2 border-dashed bg-surface/80 p-6 text-center transition-colors', over ? 'border-primary bg-primary-soft' : 'border-border-strong')}
          >
            {!file ? (
              <div>
                <Upload className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-[15px] font-semibold">Drop the plan here</p>
                <p className="mt-1 text-sm text-muted-foreground">PDF, PNG or JPG. A PDF exported from CAD gives the most exact house.</p>
                <Button variant="primary" className="mt-4" onClick={() => input.current?.click()}>Choose a file</Button>
              </div>
            ) : (
              <div className="w-full">
                <div className="mb-3 flex items-center justify-between gap-3 text-left">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    {isPdf ? <FileText className="size-4 shrink-0" /> : <FileImage className="size-4 shrink-0" />}
                    <span className="truncate">{file.name}</span>
                  </p>
                  <Button size="sm" variant="quiet" onClick={() => input.current?.click()}>Replace</Button>
                </div>
                {pages.length > 1 && <p className="mb-2 text-left text-xs text-muted-foreground">Pick the sheet with the floor plans.</p>}
                <div className={cn('grid gap-3', pages.length > 1 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1')}>
                  {pages.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i + 1)}
                      aria-pressed={page === i + 1}
                      className={cn('overflow-hidden rounded-md border bg-white transition-shadow', page === i + 1 ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-border-strong')}
                    >
                      <img src={src} alt={`Page ${i + 1}`} className={cn('w-full object-contain', pages.length > 1 ? 'aspect-[4/3]' : 'max-h-[420px]')} />
                      {pages.length > 1 && <span className="block border-t border-border py-1 text-xs text-muted-foreground">Page {i + 1}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); e.target.value = ''; }} />
          </div>}
          {mode === 'upload' && error && <p className="mt-3 text-sm font-medium text-primary" role="alert">{error}</p>}
          {mode === 'upload' && busy && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status"><span className="size-2 animate-pulse rounded-full bg-primary" />{busy}</p>}
        </section>

        <aside className="h-fit rounded-xl border border-border bg-surface p-5 shadow-panel lg:mt-[92px]">
          <div className="grid gap-4">
            <Field label="Name of the house"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma residence" /></Field>

            {mode === 'blank' ? (
              <>
                <div className="grid gap-1 text-[13px]">
                  <span className="text-muted-foreground">Floors on the plan</span>
                  <Segmented className="w-fit" label="Floors" value={floors} onChange={setFloors} options={[{ value: '1', label: 'G' }, { value: '2', label: 'G + 1' }, { value: '3', label: 'G + 2' }]} />
                </div>
                <p className="border-t border-border pt-4 text-[13px] text-muted-foreground">Start with the Wall tool and click each corner. Use the room and opening tools to finish your layout, then choose Build 3D.</p>
                <Button variant="primary" size="lg" onClick={startBlank}><PencilRuler /> Create blank plan <ArrowRight /></Button>
                <p className="text-xs text-muted-foreground">Your plan is saved in this browser as you work.</p>
              </>
            ) : read ? (
              <>
                {read.by === 'gemini' ? (
                  <div className="rounded-md border border-warning/50 bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning"><Check className="size-4" /> Understood by Gemini: a draft to check</p>
                    <ul className="mt-2 grid gap-2 text-[13px]">
                      {lines.map((l) => (
                        <li key={l.title}><span className="font-medium">{l.title}</span><span className="block text-xs text-muted-foreground">{l.detail}</span></li>
                      ))}
                    </ul>
                    <p className="mt-2 border-t border-warning/30 pt-2 text-xs text-muted-foreground">Read from a picture, so walls and doors are approximate{read.scaleText ? <> (scale from <b className="text-foreground">{read.scaleText}</b>)</> : ''}. Compare it with the drawing and correct it before you rely on sizes. The picture was sent to Google.</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-success/40 bg-[color-mix(in_oklab,var(--success)_9%,transparent)] p-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success"><Check className="size-4" /> Read from the drawing</p>
                    <ul className="mt-2 grid gap-2 text-[13px]">
                      {lines.map((l) => (
                        <li key={l.title}><span className="font-medium">{l.title}</span><span className="block text-xs text-muted-foreground">{l.detail}</span></li>
                      ))}
                    </ul>
                    <p className="mt-2 border-t border-success/25 pt-2 text-xs text-muted-foreground">
                      {read.scaleSource === 'dimension' ? <>Scale from the dimension <b className="text-foreground">{read.scaleText}</b> on the sheet.</> : 'No dimension line found: scale assumes 9″ walls. Check it in the plan.'}
                      {read.north ? ' North arrow found.' : ''}
                    </p>
                  </div>
                )}
                {read.by === 'gemini' ? (
                  <>
                    <Button variant="primary" size="lg" disabled={!!busy} onClick={() => build('#/plan')}><PencilRuler /> Check the plan <ArrowRight /></Button>
                    <Button variant="secondary" disabled={!!busy} onClick={() => build('#/studio')}>Build the house as it is</Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" size="lg" disabled={!!busy} onClick={() => build('#/studio')}>Build the house <ArrowRight /></Button>
                    <Button variant="secondary" disabled={!!busy} onClick={() => build('#/plan')}><PencilRuler /> Check the plan first</Button>
                  </>
                )}
                <p className="text-xs text-muted-foreground">Heights, windows and the frame are not on a 2D plan. They use standard values, marked “assumed”, and every room is furnished to start with.</p>
              </>
            ) : (
              <>
                {file && reading && !reading.ok && <p className="rounded-md bg-surface-2 p-3 text-[13px]">{reading.reason}</p>}
                {file && !isPdf && !gemini && <p className="rounded-md bg-surface-2 p-3 text-[13px]">A picture has no lines the site can read. Trace over it: set the scale with one dimension, then draw the walls, doors and rooms.</p>}
                <div className="grid gap-1 text-[13px]">
                  <span className="text-muted-foreground">Floors on the plan</span>
                  <Segmented className="w-fit" label="Floors" value={floors} onChange={setFloors} options={[{ value: '1', label: 'G' }, { value: '2', label: 'G + 1' }, { value: '3', label: 'G + 2' }]} />
                </div>
                <ol className="grid gap-2 border-t border-border pt-4 text-[13px] text-muted-foreground">
                  <li><b className="text-foreground">1 · Scale.</b> Click both ends of one dimension and type it (22′).</li>
                  <li><b className="text-foreground">2 · Trace.</b> Walls, doors, windows, rooms, stairs.</li>
                  <li><b className="text-foreground">3 · Build.</b> Walk through it, furnish it, read the quantities.</li>
                </ol>
                <Button variant="primary" size="lg" disabled={!file || !!busy} onClick={trace}>Trace it by hand <ArrowRight /></Button>
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
