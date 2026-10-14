import type { Context } from 'hono';
import type { Env } from '../types';
import { ADMIN_AUTH_HEADER, DEFAULT_DEV_ADMIN_PASSWORD } from '../middleware/auth';

export interface McpAuthContext {
  isAuthenticated: boolean;
  isAdmin: boolean;
  authMethod?: 'x-admin-token' | 'bearer' | 'query' | 'none';
  error?: string;
}

/**
 * Extracts and verifies MCP authorization credentials from request headers or query params.
 */
export function authenticateMcpRequest(c: Context<Env>): McpAuthContext {
  const configuredPassword = c.env?.ADMIN_PASSWORD || DEFAULT_DEV_ADMIN_PASSWORD;

  // 1. Check custom admin header
  const adminHeader = c.req.header(ADMIN_AUTH_HEADER);
  if (adminHeader && adminHeader === configuredPassword) {
    return { isAuthenticated: true, isAdmin: true, authMethod: 'x-admin-token' };
  }

  // 2. Check standard Authorization: Bearer <token>
  const authHeader = c.req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken === configuredPassword) {
      return { isAuthenticated: true, isAdmin: true, authMethod: 'bearer' };
    }
  }

  // 3. Check query parameters (?token=... or ?apiKey=...)
  const queryToken = c.req.query('token') || c.req.query('apiKey');
  if (queryToken && queryToken === configuredPassword) {
    return { isAuthenticated: true, isAdmin: true, authMethod: 'query' };
  }

  // If token was supplied but invalid
  if (adminHeader || authHeader || queryToken) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      authMethod: adminHeader ? 'x-admin-token' : authHeader ? 'bearer' : 'query',
      error: 'Invalid credentials provided for MCP endpoint.'
    };
  }

  return { isAuthenticated: false, isAdmin: false, authMethod: 'none' };
}
