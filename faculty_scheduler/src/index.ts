import app from './server/index';
import type { Env } from './server/types';

export default {
  async fetch(request: Request, env: Env['Bindings'], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Let Hono handle all /api/* requests and MCP remote endpoints
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp') || url.pathname.startsWith('/sse')) {
      return app.fetch(request, env, ctx);
    }

    // Check if the root path / was accessed by an MCP client or AI agent
    // (e.g., OPTIONS preflight, POST JSON-RPC, SSE connection, or JSON Accept header without HTML)
    if (url.pathname === '/' || url.pathname === '') {
      const accept = request.headers.get('accept') || '';
      const isMcpHeader = request.headers.has('mcp-protocol-version') || request.headers.has('last-event-id');
      const isSse = accept.includes('text/event-stream');
      const isPostOrOptions = request.method === 'POST' || request.method === 'OPTIONS' || request.method === 'DELETE';
      const isJsonOnly = accept.includes('application/json') && !accept.includes('text/html');
      const hasMcpQuery = url.searchParams.has('mcp');

      if (isMcpHeader || isSse || isPostOrOptions || isJsonOnly || hasMcpQuery) {
        return app.fetch(request, env, ctx);
      }
    }

    // In Cloudflare Worker deployment, ASSETS binding serves React static files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Fallback to app fetch if ASSETS is not bound
    return app.fetch(request, env, ctx);
  },
};
