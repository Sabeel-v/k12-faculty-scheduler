import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Env } from '../types';
import { authenticateMcpRequest } from '../mcp/auth';
import { createSchedulerMcpServer } from '../mcp/server';

export const mcpRoute = new Hono<Env>();

export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token, mcp-protocol-version, last-event-id, accept, cache-control',
  'Access-Control-Expose-Headers': 'Content-Type, mcp-protocol-version, location',
  'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// MCP Router handling Streamable HTTP, SSE, Handshake, and Verification Probes
mcpRoute.all('*', async (c) => {
  // 1. Explicit CORS Preflight
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: MCP_CORS_HEADERS,
    });
  }

  // 2. Validate D1 Database Binding
  const db = c.env?.DB;
  if (!db) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error: D1 database binding (DB) is unavailable.',
        },
        id: null,
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...MCP_CORS_HEADERS,
        },
      }
    );
  }

  // 3. Extract authentication context
  const authContext = authenticateMcpRequest(c);

  // If credentials were provided but are invalid, reject immediately
  if (authContext.error) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `Authentication Failed: ${authContext.error}`,
        },
        id: null,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...MCP_CORS_HEADERS,
        },
      }
    );
  }

  const rawReq = c.req.raw;
  const accept = c.req.header('accept') || '';
  const isSse = accept.includes('text/event-stream');

  // 4. Handle GET and HEAD requests:
  // - If client specifically requested SSE (Accept: text/event-stream): establish standard MCP SSE connection
  // - Otherwise (Accept: application/json, */*, or probe): return immediate JSON handshake metadata
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    if (isSse) {
      const url = new URL(c.req.url);
      const postEndpoint = `/mcp${url.search}`;
      const encoder = new TextEncoder();
      let keepAliveTimer: any = null;

      const stream = new ReadableStream({
        start(controller) {
          // Immediately emit the mandatory MCP SSE endpoint event
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

          // Periodic keepalive comment frames
          keepAliveTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': keepalive\n\n'));
            } catch {
              if (keepAliveTimer) clearInterval(keepAliveTimer);
            }
          }, 15000);
        },
        cancel() {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
        },
      });

      return new Response(c.req.method === 'HEAD' ? null : stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...MCP_CORS_HEADERS,
        },
      });
    }

    // Handshake verification probe / JSON discovery metadata
    const metadata = {
      status: 'ok',
      name: 'k12-faculty-scheduler-mcp',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      transports: ['streamable-http', 'sse'],
      endpoints: {
        mcp: '/mcp',
        sse: '/sse',
      },
    };

    return new Response(c.req.method === 'HEAD' ? null : JSON.stringify(metadata, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...MCP_CORS_HEADERS,
      },
    });
  }

  // 5. Handle POST / DELETE requests (Streamable HTTP / JSON-RPC)
  // Ensure Accept header includes both application/json and text/event-stream for MCP SDK compatibility
  const headers = new Headers(rawReq.headers);
  const clientAccept = headers.get('accept') || '';
  if (!clientAccept.includes('application/json') || !clientAccept.includes('text/event-stream')) {
    headers.set('accept', 'application/json, text/event-stream');
  }

  const normalizedRequest = new Request(rawReq, { headers });

  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for serverless Cloudflare Workers
      enableJsonResponse: true,      // Force standard application/json responses
    });

    const server = createSchedulerMcpServer(db, c.env, authContext);
    await server.connect(transport);

    const response = await transport.handleRequest(normalizedRequest);
    return withCors(response);
  } catch (error) {
    console.error('MCP Transport Error:', error);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error while processing MCP request.',
        },
        id: null,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...MCP_CORS_HEADERS,
        },
      }
    );
  }
});
