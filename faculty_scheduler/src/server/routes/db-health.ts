import { Hono } from 'hono';
import type { Env } from '../types';

export const dbHealthRoute = new Hono<Env>();

dbHealthRoute.get('/', async (c) => {
  const db = c.env?.DB;

  if (!db) {
    return c.json(
      {
        status: 'error',
        database: 'unbound',
        message: 'D1 DB binding is not attached in this environment. Run with wrangler dev or configure Cloudflare binding.'
      },
      503
    );
  }

  try {
    // Run simple lightweight probe to verify D1 connectivity
    await db.prepare('SELECT 1').run();
    return c.json({
      status: 'ok',
      database: 'connected'
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database query failed';
    return c.json(
      {
        status: 'error',
        database: 'error',
        message
      },
      500
    );
  }
});
