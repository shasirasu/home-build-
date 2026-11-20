// Plan understanding with Google Gemini — used ONLY to understand a drawing the site cannot read by itself
// (a photo, a scan, an unusual PDF). Gemini returns what it sees as structured data; the house is still built
// by the site (src/lib/reader/buildSpec.ts). Runs server-side so the API key never reaches the browser:
// Vite dev middleware in development, api/understand.ts on Vercel. Key: GEMINI_API_KEY (.env.local / project env).

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// Tried in order; the first that answers wins. Pro understands drawings best but is not on every plan (a free-tier
// key gets "quota exceeded" at once), so the Flash models follow. Set GEMINI_MODEL to pin one model.
export const MODEL_CHAIN = ['gemini-pro-latest', 'gemini-3.8-flash', 'gemini-3-flash-preview'];

const N = { type: 'NUMBER' } as const;
const box = { x0: N, y0: N, x1: N, y1: N };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    floors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Title of this floor plan as printed, e.g. GROUND FLOOR PLAN.' },
          order: { type: 'INTEGER', description: '0 = ground floor, 1 = first floor, ...' },
          scale: { type: 'OBJECT', description: 'One long, clearly labelled dimension of this floor (prefer the overall width): its two end points and its text exactly as printed.', properties: { ...box, text: { type: 'STRING' } }, required: ['x0', 'y0', 'x1', 'y1', 'text'] },
          walls: { type: 'ARRAY', description: 'Every wall as its centre line.', items: { type: 'OBJECT', properties: { ...box, thick: { type: 'BOOLEAN', description: 'true for full-thickness (outer / 9 inch) walls, false for thin partitions.' }, exterior: { type: 'BOOLEAN' } }, required: ['x0', 'y0', 'x1', 'y1', 'thick', 'exterior'] } },
          openings: { type: 'ARRAY', description: 'Every gap in a wall: the two jamb points on the wall centre line.', items: { type: 'OBJECT', properties: { ...box, kind: { type: 'STRING', enum: ['door', 'window', 'opening'] }, label: { type: 'STRING', description: 'Text printed beside it (MAIN ENTRANCE, BACK DOOR), else empty.' } }, required: ['x0', 'y0', 'x1', 'y1', 'kind', 'label'] } },
          rooms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, size: { type: 'STRING', description: 'Size text exactly as printed in the room, else empty.' }, ...box }, required: ['name', 'size', 'x0', 'y0', 'x1', 'y1'] } },
          stairs: { type: 'ARRAY', description: 'Each straight run of treads, in walking order from the bottom of the stair to the top.', items: { type: 'OBJECT', properties: { ...box, up: { type: 'STRING', enum: ['n', 's', 'e', 'w'], description: 'Direction of travel going UP: n = toward the top of the image.' }, treads: { type: 'INTEGER' } }, required: ['x0', 'y0', 'x1', 'y1', 'up', 'treads'] } },
        },
        required: ['name', 'order', 'scale', 'walls', 'openings', 'rooms', 'stairs'],
      },
    },
  },
  required: ['floors'],
};

const PROMPT = `You are reading an architectural floor plan drawing so that software can rebuild the house in 3D. Transcribe exactly what is drawn; do not invent anything.

Coordinates: every x and y is a number from 0 to 1000, normalised to the image (x = 0 left edge, 1000 right edge; y = 0 top edge, 1000 bottom edge). Be precise: read positions from the drawn lines.

A sheet often shows several floors side by side. Return each floor plan separately, ground floor first.
For each floor:
- scale: one long dimension line with its printed text.
- walls: the centre line of every wall, from end to end. One entry per straight wall; a wall with a door in it is still one wall. Walls are drawn as two parallel lines; thick = the full-thickness walls, thin partitions are noticeably thinner.
- openings: every gap in a wall. door = a swing arc or door leaf is drawn, or it is labelled as a door / entrance; window = thin lines drawn across the gap; opening = a clear gap with nothing drawn.
- rooms: every labelled space, as the rectangle of its clear inside (between the inside faces of its walls), with its printed name and printed size.
- stairs: each straight run of treads as a rectangle, the direction you travel going up (follow the arrow), and the number of treads.
Ignore dimension lines, arrows, title text and furniture when tracing walls.`;

export function understandAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.GEMINI_API_KEY;
}

type GeminiReply = { error?: { message?: string; status?: string }; candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };

export async function handleUnderstandRequest(method: string, body: unknown, env: Record<string, string | undefined> = process.env): Promise<{ status: number; json: unknown }> {
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL] : MODEL_CHAIN;
  if (method === 'GET') return { status: 200, json: { available: understandAvailable(env), models } };
  if (method !== 'POST') return { status: 405, json: { error: 'Use POST' } };
  if (!understandAvailable(env)) return { status: 503, json: { error: 'Gemini is not set up on this server (GEMINI_API_KEY is missing).' } };
  const b = body as { image?: string };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(b?.image ?? '');
  if (!m) return { status: 400, json: { error: 'Send { image } as a PNG, JPEG or WebP data URL.' } };
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0, maxOutputTokens: 32768 },
  });
  const started = Date.now();
  let last = { status: 502, error: 'Gemini did not answer.' };
  for (const model of models) {
    const left = 285_000 - (Date.now() - started);
    if (left < 20_000) break;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
        body: payload,
        signal: AbortSignal.timeout(Math.min(left, 170_000)),
      });
      const data = (await res.json()) as GeminiReply;
      if (res.status === 401 || res.status === 403) return { status: 502, json: { error: 'Gemini rejected the API key on the server.' } };
      if (!res.ok) {
        // no quota for this model, model retired, or overloaded: the next model may still answer
        last = { status: res.status === 429 ? 429 : 502, error: res.status === 429 ? 'This Gemini key has no quota left for now. Wait a minute, or check the plan and billing of the key.' : res.status === 503 ? 'Gemini is overloaded right now. Try again in a minute.' : `Gemini error ${res.status}: ${data.error?.message ?? 'unknown'}` };
        continue;
      }
      if (data.promptFeedback?.blockReason) return { status: 422, json: { error: `Gemini declined to read this drawing (${data.promptFeedback.blockReason}).` } };
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (cand?.finishReason === 'MAX_TOKENS') return { status: 422, json: { error: 'The drawing has more detail than one pass can return. Crop it to one floor and try again.' } };
      try {
        return { status: 200, json: { result: JSON.parse(text), model } };
      } catch {
        last = { status: 502, error: 'Gemini did not return a readable plan. Try again.' };
      }
    } catch (e) {
      const timeout = e instanceof Error && e.name === 'TimeoutError';
      last = { status: 504, error: timeout ? 'Gemini took too long to answer. Try again, or crop the drawing to one floor.' : `Could not reach Gemini (${e instanceof Error ? e.message : 'network error'}).` };
    }
  }
  return { status: last.status, json: { error: last.error } };
}
