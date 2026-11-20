import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serves /api/understand in dev with the same handler the Vercel function uses. The Gemini key is read here, on the
 * server side, from .env.local (GEMINI_API_KEY) and never reaches the browser bundle.
 */
function understandApi(env: Record<string, string>): Plugin {
  return {
    name: 'understand-api',
    configureServer(server) {
      server.middlewares.use('/api/understand', async (req, res) => {
        const { handleUnderstandRequest } = await server.ssrLoadModule('/server/understand.ts');
        let body: unknown = null;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
        }
        const r = await handleUnderstandRequest(req.method ?? 'GET', body, { ...process.env, ...env });
        res.statusCode = r.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(r.json));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), understandApi(loadEnv(mode, import.meta.dirname, ['GEMINI_']))],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { host: '127.0.0.1', port: 5180 },
  build: { chunkSizeWarningLimit: 2400 },
}));
