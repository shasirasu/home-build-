// Vercel Function: POST /api/understand (Gemini reads a plan image), GET /api/understand (is it set up?).
import { handleUnderstandRequest } from '../server/understand';

export const maxDuration = 300;

export async function GET(): Promise<Response> {
  const r = await handleUnderstandRequest('GET', null);
  return Response.json(r.json, { status: r.status });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try { body = await req.json(); } catch { return Response.json({ error: 'Body must be JSON.' }, { status: 400 }); }
  const r = await handleUnderstandRequest('POST', body);
  return Response.json(r.json, { status: r.status });
}
