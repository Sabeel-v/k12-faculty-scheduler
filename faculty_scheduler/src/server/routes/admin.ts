import { Hono } from 'hono';
import type { Env } from '../types';
import { DEFAULT_DEV_ADMIN_PASSWORD } from '../middleware/auth';

export const adminRoute = new Hono<Env>();

adminRoute.post('/login', async (c) => {
  try {
    const body = await c.req.json<{ password?: string }>();
    const configuredPassword = c.env?.ADMIN_PASSWORD || DEFAULT_DEV_ADMIN_PASSWORD;

    if (!body || !body.password) {
      return c.json({ error: 'BAD_REQUEST', message: 'Password is required' }, 400);
    }

    if (body.password !== configuredPassword) {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Invalid admin password' }, 401);
    }

    return c.json({
      success: true,
      token: configuredPassword,
      message: 'Admin authentication successful'
    });
  } catch {
    return c.json({ error: 'BAD_REQUEST', message: 'Invalid JSON payload' }, 400);
  }
});
