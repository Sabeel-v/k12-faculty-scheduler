import type { Context, Next } from 'hono';
import type { Env } from '../types';

export const ADMIN_AUTH_HEADER = 'x-admin-token';
export const DEFAULT_DEV_ADMIN_PASSWORD = 'admin';

export async function adminAuthMiddleware(c: Context<Env>, next: Next) {
  const configuredPassword = c.env?.ADMIN_PASSWORD || DEFAULT_DEV_ADMIN_PASSWORD;
  const token = c.req.header(ADMIN_AUTH_HEADER);

  if (!token || token !== configuredPassword) {
    return c.json(
      {
        error: 'UNAUTHORIZED',
        message: 'Admin authorization required. Provide valid x-admin-token header.'
      },
      401
    );
  }

  await next();
}
