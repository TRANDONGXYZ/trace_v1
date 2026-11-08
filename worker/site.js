import ai from './index.js';

// Static assets normally bypass this script. /api and /api/* always reach it,
// including browser navigations, so an API typo cannot return the SPA HTML.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/ai/')) {
      const headers = new Headers(request.headers);
      // Cloudflare supplies cf-connecting-ip on the public Worker. Never trust
      // an incoming x-trace-client-ip header as the rate-limit identity.
      headers.delete('x-trace-client-ip');
      const ip = request.headers.get('cf-connecting-ip');
      if (ip) headers.set('x-trace-client-ip', ip);
      return ai.fetch(new Request(request, { headers, signal: request.signal }), env);
    }
    if (path === '/api' || path.startsWith('/api/')) {
      return Response.json({ error: { code: 'not_found', message: 'Unknown API endpoint.' } }, {
        status: 404, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
