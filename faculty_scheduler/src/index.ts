import app from './server/index';
import type { Env } from './server/types';

export default {
  async fetch(request: Request, env: Env['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Let Hono handle all /api/* requests
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // In Cloudflare Worker deployment, ASSETS binding serves React static files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Fallback to app fetch if ASSETS is not bound
    return app.fetch(request, env, ctx);
  },
};
